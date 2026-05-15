'use strict';

/**
 * Settings Export / Import Tests
 *
 * Testet den Export und Import von Einstellungen per JSON-Datei im Settings-Modal.
 *
 * Szenarien:
 *   T01 – Export: Datei enthält die gesetzten localStorage-Keys
 *   T02 – Import: Überschreibt localStorage und lädt Seite neu
 *   T03 – Import ungültig: Alert bei Key der nicht mit "alchemy" beginnt
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const APP_URL =
  'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// Gear-Button öffnet das Settings-Modal
async function openSettings(page) {
  // title ist der übersetzter settingsTitle – in DE "Zutaten verwalten"
  const btn = page.locator('button[title]').filter({ hasText: '' }).and(
    page.locator('button i.fa-solid.fa-gear').locator('..')
  );
  await btn.click();
  await page.waitForSelector('text=Exportieren', { timeout: 5000 });
}

test.describe('Settings Export / Import', () => {
  // ─── T01: Export ───────────────────────────────────────────────────────────
  test('T01 – Export erstellt JSON-Datei mit gesetzten Keys', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForLoadState('domcontentloaded');

    // Bekannte Testwerte setzen
    await page.evaluate(() => {
      localStorage.setItem('alchemyLowStockThreshold', '42');
      localStorage.setItem('alchemySimplifiedDelivery', '1');
      localStorage.setItem('alchemyFocusMode', '1');
    });

    // Seite neu laden damit React die Werte einliest
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await openSettings(page);

    // Download abfangen + Export-Button klicken
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button', { hasText: /Exportieren|Export/ }).click(),
    ]);

    const filePath = await download.path();
    expect(filePath).toBeTruthy();

    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);

    // Gesetzte Werte müssen enthalten sein
    expect(data.alchemyLowStockThreshold).toBe('42');
    expect(data.alchemySimplifiedDelivery).toBe('1');
    expect(data.alchemyFocusMode).toBe('1');

    // Alle Keys müssen mit "alchemy" beginnen
    for (const k of Object.keys(data)) {
      expect(k).toMatch(/^alchemy/);
    }
  });

  // ─── T02: Import ───────────────────────────────────────────────────────────
  test('T02 – Import überschreibt localStorage und lädt Seite neu', async ({ page }) => {
    const importData = {
      alchemyLowStockThreshold: '77',
      alchemySimplifiedDelivery: '1',
      alchemyFocusMode: '0',
    };

    const tmpFile = path.join(os.tmpdir(), 'alchemia-test-import.json');
    fs.writeFileSync(tmpFile, JSON.stringify(importData, null, 2), 'utf8');

    try {
      await page.goto(APP_URL);
      await page.waitForLoadState('domcontentloaded');

      // Abweichende Ausgangswerte setzen
      await page.evaluate(() => {
        localStorage.setItem('alchemyLowStockThreshold', '5');
        localStorage.setItem('alchemySimplifiedDelivery', '0');
        localStorage.setItem('alchemyFocusMode', '1');
      });

      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      await openSettings(page);

      // Confirm-Dialog akzeptieren, sobald er erscheint
      page.once('dialog', (dialog) => dialog.accept());

      // FileChooser abfangen + Import-Button klicken
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.locator('button', { hasText: /Importieren|Import/ }).click(),
      ]);

      // Datei setzen – löst FileReader + confirm + reload aus
      // waitForNavigation fängt den Reload ab (waitForLoadState würde sofort resolven)
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        fileChooser.setFiles(tmpFile),
      ]);

      // Werte nach dem Reload prüfen
      const threshold = await page.evaluate(() =>
        localStorage.getItem('alchemyLowStockThreshold')
      );
      const delivery = await page.evaluate(() =>
        localStorage.getItem('alchemySimplifiedDelivery')
      );
      const focus = await page.evaluate(() =>
        localStorage.getItem('alchemyFocusMode')
      );

      expect(threshold).toBe('77');
      expect(delivery).toBe('1');
      expect(focus).toBe('0');
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  // ─── T03: Import – ungültige Datei ─────────────────────────────────────────
  test('T03 – Import mit fremdem Key zeigt Fehler-Alert', async ({ page }) => {
    // Enthält einen Key der nicht mit "alchemy" beginnt → wird abgelehnt
    const tmpFile = path.join(os.tmpdir(), 'alchemia-invalid.json');
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({ someOtherKey: 'value', alchemyLowStockThreshold: '5' }),
      'utf8'
    );

    try {
      await page.goto(APP_URL);
      await page.waitForLoadState('domcontentloaded');

      await openSettings(page);

      // Alert abfangen
      const dialogPromise = page.waitForEvent('dialog');

      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.locator('button', { hasText: /Importieren|Import/ }).click(),
      ]);
      await fileChooser.setFiles(tmpFile);

      const dialog = await dialogPromise;
      expect(dialog.type()).toBe('alert');
      // DE: "Ungültige Datei – Import abgebrochen." / EN: "Invalid file – import aborted."
      expect(dialog.message()).toMatch(/[Uu]ng.ltige|[Ii]nvalid|[Ii]mport/);
      await dialog.dismiss();

      // Seite darf NICHT neu geladen werden – localStorage unverändert
      const val = await page.evaluate(() =>
        localStorage.getItem('alchemyLowStockThreshold')
      );
      // Der fremde Key darf nicht geschrieben worden sein
      const foreign = await page.evaluate(() =>
        localStorage.getItem('someOtherKey')
      );
      expect(foreign).toBeNull();
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });
});
