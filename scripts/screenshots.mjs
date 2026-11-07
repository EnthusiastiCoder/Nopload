// README screenshots of the built site (run `pnpm build` and a server first):
//   node scripts/screenshots.mjs [--base http://localhost:4321]
// Writes docs/screenshots/<page>-<theme>-<device>.png for light/dark x desktop/mobile, in Chromium.
// The remove-background shots show a real result for tests/fixtures/portrait.jpg.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const baseArg = process.argv.indexOf('--base');
const base = baseArg > -1 ? process.argv[baseArg + 1] : 'http://localhost:4321';
const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const PORTRAIT = fileURLToPath(new URL('../tests/fixtures/portrait.jpg', import.meta.url));
const DEVICES = [
  { name: 'desktop', ctx: { viewport: { width: 1280, height: 800 } } },
  { name: 'mobile', ctx: { ...devices['Pixel 5'], viewport: { width: 360, height: 780 } } },
];
const THEMES = ['light', 'dark'];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const device of DEVICES) {
  for (const theme of THEMES) {
    const context = await browser.newContext({ ...device.ctx, colorScheme: theme });
    await context.addInitScript((t) => localStorage.setItem('nopload-theme', t), theme);
    const page = await context.newPage();

    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${OUT}home-${theme}-${device.name}.png` });

    await page.goto(`${base}/remove-background`, { waitUntil: 'networkidle' });
    await page.locator('input[type=file]').first().setInputFiles(PORTRAIT);
    const result = page.getByTestId('result');
    await result.waitFor({ state: 'visible', timeout: 90_000 });
    await page.waitForTimeout(500);
    // Scroll the result to just below the sticky header.
    await result.evaluate((el) => {
      const header = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - header - 16);
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}remove-background-${theme}-${device.name}.png` });

    await context.close();
    console.log(`ok ${device.name} ${theme}`);
  }
}
await browser.close();
