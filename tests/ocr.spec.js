'use strict';

/**
 * OCR Robustness Tests
 *
 * Wählt bei jedem Testlauf 5 zufällige Rezepte aus der Datenbank und testet
 * die OCR-Erkennungsroutinen mit 10 verschiedenen Szenarien.
 *
 * Seed wird zu Beginn geloggt für Reproduzierbarkeit:
 *   npx playwright test --headed 2>&1 | grep "\[OCR Test\]"
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// ─── Seeded RNG (mulberry32) ──────────────────────────────────────────────────

const SEED = Date.now();

function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(SEED);

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Rezepte aus scripts/*.js einlesen ───────────────────────────────────────

function loadAllProducts() {
  const dir = path.join(__dirname, '..', 'scripts');
  const files = ['recipes-basic.js', 'recipes-intermediate.js', 'recipes-advanced.js'];
  const products = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/product:\s*"([^"]+)"/g)) {
      products.push(m[1]);
    }
  }
  return products;
}

const ALL_PRODUCTS = loadAllProducts();
const RECIPES_5 = shuffled(ALL_PRODUCTS).slice(0, 5);

// Tippfehler für T06 vorab berechnen (nutzt denselben RNG-Stream)
function addTypo(name) {
  if (name.length < 5) return name + 'x';
  const pos = 2 + Math.floor(rng() * (name.length - 4));
  const subs = { a: 'o', e: 'a', i: 'e', o: 'u', u: 'i' };
  const ch = name[pos].toLowerCase();
  const rep =
    subs[ch] ??
    (name[pos] === name[pos].toUpperCase()
      ? name[pos].toLowerCase()
      : name[pos].toUpperCase());
  return name.slice(0, pos) + rep + name.slice(pos + 1);
}

const TYPOS_5 = RECIPES_5.map(addTypo);

// ─── APP-URL ──────────────────────────────────────────────────────────────────

const APP_URL =
  'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// ─── Bild- und OCR-Hilfsfunktionen ───────────────────────────────────────────

async function makeImage(
  page,
  imageLines,
  { bg = '#f0f0f0', fg = '#000000', font = '14px Arial' } = {},
) {
  return page.evaluate(
    async ({ imageLines, bg, fg, font }) => {
      const c = document.createElement('canvas');
      c.width = 420;
      c.height = 250;
      const ctx = c.getContext('2d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = fg;
      ctx.font = font;
      imageLines.forEach((l, i) => ctx.fillText(l, 12, 28 + i * 22));
      return new Promise((r) =>
        c.toBlob((b) => {
          const fr = new FileReader();
          fr.onload = () => r(fr.result);
          fr.readAsDataURL(b);
        }, 'image/png'),
      );
    },
    { imageLines, bg, fg, font },
  );
}

async function runOcr(page, imageLines, imgOpts) {
  const matched = [];
  const handler = (msg) => {
    const m = msg.text().match(/\[OCR match\] .+ → "([^"]+)"/);
    if (m) matched.push(m[1]);
  };
  page.on('console', handler);

  const dataUrl = await makeImage(page, imageLines, imgOpts);
  await page.evaluate(async (url) => {
    const blob = await (await fetch(url)).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'test.png', { type: 'image/png' }));
    document.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }),
    );
  }, dataUrl);

  await page.waitForTimeout(14000);
  page.off('console', handler);
  return matched;
}

// ─── Zeilen-Bausteine ─────────────────────────────────────────────────────────

const HDR = ['Rank: 5 | Experience: (12 / 50)', 'Points: 1400', ''];
const FTR = ['', 'NEXT'];

function buildLines(names, fmt) {
  const slotFn = (name, i) => {
    const r = `R${i + 1}`;
    switch (fmt) {
      case 'baseline': return `${r}: (${name})`;
      case 'lc_first': return `${r}: (${name[0].toLowerCase()}${name.slice(1)})`;
      case 'no_close': return `${r}: (${name}`;
      case 'rs': return i === 4 ? `RS: (${name})` : `${r}: (${name})`;
      case '1x': return `1 x  ${name}`;
      case 'all_lc': return `${r}: (${name.toLowerCase()})`;
      case 'noise': return `~~~ ${r}: (${name}) ~~~`;
      case 'compact': return `(${name})`;
      default: return `${r}: (${name})`;
    }
  };
  const slotLines = names.map(slotFn);
  if (fmt === '1x' || fmt === 'compact') return ['', ...slotLines, ''];
  return [...HDR, ...slotLines, ...FTR];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('OCR Robustness', () => {
  test.beforeAll(() => {
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log(`║  [OCR Test] Seed    : ${SEED}`);
    console.log(`║  [OCR Test] Recipes : ${RECIPES_5.join(' | ')}`);
    console.log(`║  [OCR Test] Typos   : ${TYPOS_5.join(' | ')}`);
    console.log('╚══════════════════════════════════════════════╝\n');
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    // Session-Restore-Dialog abweisen falls sichtbar
    const newBtn = page
      .locator('button:has-text("Neue Session"), button:has-text("New Session")')
      .first();
    if (await newBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await newBtn.click();
      await page.waitForTimeout(400);
    }
  });

  // T01 ─ Baseline ─────────────────────────────────────────────────────────────
  test('T01 – Baseline: saubere Klammern', async ({ page }) => {
    const matched = await runOcr(page, buildLines(RECIPES_5, 'baseline'));
    for (const r of RECIPES_5) expect(matched).toContain(r);
  });

  // T02 ─ Lowercase erster Buchstabe nach Klammer ───────────────────────────────
  test('T02 – Kleinbuchstabe nach öffnender Klammer', async ({ page }) => {
    const matched = await runOcr(page, buildLines(RECIPES_5, 'lc_first'));
    for (const r of RECIPES_5) expect(matched).toContain(r);
  });

  // T03 ─ Fehlende schließende Klammer ─────────────────────────────────────────
  test('T03 – Fehlende schliessende Klammer', async ({ page }) => {
    const matched = await runOcr(page, buildLines(RECIPES_5, 'no_close'));
    for (const r of RECIPES_5) expect(matched).toContain(r);
  });

  // T04 ─ R5 → RS Ziffernsalat ─────────────────────────────────────────────────
  test('T04 – R5 als RS (Ziffernsalat)', async ({ page }) => {
    const matched = await runOcr(page, buildLines(RECIPES_5, 'rs'));
    for (const r of RECIPES_5) expect(matched).toContain(r);
  });

  // T05 ─ "1 x Name" ohne Klammern ─────────────────────────────────────────────
  test('T05 – Format "1 x Name" ohne Klammern', async ({ page }) => {
    const matched = await runOcr(page, buildLines(RECIPES_5, '1x'));
    for (const r of RECIPES_5) expect(matched).toContain(r);
  });

  // T06 ─ OCR-Tippfehler in Namen ───────────────────────────────────────────────
  test('T06 – OCR-Tippfehler in Namen (Fuzzy-Matching)', async ({ page }) => {
    const typoLines = [
      ...HDR,
      ...RECIPES_5.map((_, i) => `R${i + 1}: (${TYPOS_5[i]})`),
      ...FTR,
    ];
    const matched = await runOcr(page, typoLines);
    for (const r of RECIPES_5) expect(matched).toContain(r);
  });

  // T07 ─ Alles-lowercase in Klammern (≥ 4/5 akzeptiert) ───────────────────────
  test('T07 – Alles-lowercase in Klammern', async ({ page }) => {
    const matched = await runOcr(page, buildLines(RECIPES_5, 'all_lc'));
    expect(
      matched.length,
      `Nur ${matched.length}/5 erkannt. Erkannt: ${matched.join(', ')}`,
    ).toBeGreaterThanOrEqual(4);
  });

  // T08 ─ Rauschen um Namen ──────────────────────────────────────────────────────
  test('T08 – Rauschen um Namen', async ({ page }) => {
    const matched = await runOcr(page, buildLines(RECIPES_5, 'noise'));
    for (const r of RECIPES_5) expect(matched).toContain(r);
  });

  // T09 ─ Dunkler Hintergrund ───────────────────────────────────────────────────
  test('T09 – Dunkler Hintergrund (heller Text)', async ({ page }) => {
    const matched = await runOcr(page, buildLines(RECIPES_5, 'baseline'), {
      bg: '#1a1a2e',
      fg: '#e0e0ff',
    });
    for (const r of RECIPES_5) expect(matched).toContain(r);
  });

  // T10 ─ Kompaktes Format ohne Header ──────────────────────────────────────────
  test('T10 – Kompaktes Format (nur Klammern, kein Header)', async ({ page }) => {
    const matched = await runOcr(page, buildLines(RECIPES_5, 'compact'));
    for (const r of RECIPES_5) expect(matched).toContain(r);
  });
});
