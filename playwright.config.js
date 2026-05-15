'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 40000,        // 40 s pro Test (OCR ~14 s + Seitenlade + Puffer)
  retries: 1,            // 1 Wiederholung bei OCR-Flakiness (Tesseract-Rauschen)
  workers: 1,            // sequenziell – Tesseract-State soll sauber sein
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
