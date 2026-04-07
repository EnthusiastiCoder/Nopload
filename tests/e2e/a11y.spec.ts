// E4.4 axe on every route; keyboard-only run through /compress-image.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { makeJpeg } from '../helpers/images';
import { jpegFile } from './helpers/files';
import { ROUTES } from './helpers/routes';

test.describe('E4.4 axe: no serious or critical violations on every route', () => {
  for (const route of ROUTES) {
    test(`axe ${route}`, async ({ page }) => {
      const res = await page.goto(route);
      expect(res?.status()).toBe(200);
      const results = await new AxeBuilder({ page }).analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }
});

test('E4.4 keyboard only: Tab to the dropzone, Enter opens the picker, Tab to Download all', async ({ page }) => {
  await page.goto('/compress-image');
  const isDropzone = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return !!el?.closest('[data-testid="dropzone"]');
    });
  let found = false;
  for (let i = 0; i < 40 && !found; i++) {
    await page.keyboard.press('Tab');
    found = await isDropzone();
  }
  expect(found, 'the dropzone is reachable with Tab').toBe(true);

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')]);
  await chooser.setFiles([jpegFile('k1.jpg', makeJpeg(120, 90, 100, 1)), jpegFile('k2.jpg', makeJpeg(120, 90, 100, 2))]);
  await expect(page.getByTestId('file-list').locator('[data-status="done"]')).toHaveCount(2, { timeout: 60_000 });

  const downloadAll = page.getByRole('button', { name: /download all/i });
  let reached = false;
  for (let i = 0; i < 60 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await downloadAll.evaluate((el) => el === document.activeElement);
  }
  expect(reached, 'Download all is reachable with Tab').toBe(true);
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
});
