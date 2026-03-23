// E1.1 routes, E1.6 theme toggle, E1.7 axe, E1.8 Dropzone.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { makeJpeg } from '../helpers/images';
import { fileInput, jpegFile, pasteFile } from './helpers/files';
import { MISSING_ROUTE, ROUTES } from './helpers/routes';

test.describe('E1.1 every route renders with one h1, a title and a canonical', () => {
  for (const route of ROUTES) {
    test(`route ${route}`, async ({ page }) => {
      const res = await page.goto(route);
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page).toHaveTitle(/\S/);
      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveCount(1);
      const href = await canonical.getAttribute('href');
      expect(href).toMatch(/^https?:\/\//);
      expect(new URL(href!).pathname.replace(/\/$/, '') || '/').toBe(route);
    });
  }

  test('a missing route returns 404 with the custom page', async ({ page }) => {
    const res = await page.goto(MISSING_ROUTE);
    expect(res?.status()).toBe(404);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('link', { name: /home|all tools|back/i }).first()).toBeVisible();
  });
});

test('E1.6 the theme toggle switches data-theme and persists across a reload', async ({ page }) => {
  await page.goto('/');
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? '');
  const before = await theme();
  const toggle = page.getByRole('button', { name: /theme|dark|light/i }).first();
  await expect(toggle).toBeVisible();
  await toggle.click();
  const after = await theme();
  expect(['light', 'dark']).toContain(after);
  expect(after).not.toBe(before);
  await page.reload();
  expect(await theme()).toBe(after);
});

test.describe('E1.7 axe: no serious or critical violations', () => {
  for (const route of ['/', '/privacy', '/about']) {
    test(`axe ${route}`, async ({ page }) => {
      const res = await page.goto(route);
      expect(res?.status()).toBe(200);
      const results = await new AxeBuilder({ page }).analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }
});

test.describe('E1.8 the Dropzone accepts files and announces them', () => {
  const file = () => jpegFile('photo.jpg', makeJpeg(64, 48));

  test('via setInputFiles', async ({ page }) => {
    await page.goto('/');
    await expect(fileInput(page)).toBeAttached();
    await fileInput(page).setInputFiles(file());
    await expect(page.locator('[aria-live]').filter({ hasText: /1 file added/i })).toHaveCount(1);
  });

  test('via a paste event', async ({ page }) => {
    await page.goto('/');
    await expect(fileInput(page)).toBeAttached();
    await pasteFile(page, file());
    await expect(page.locator('[aria-live]').filter({ hasText: /1 file added/i })).toHaveCount(1);
  });
});
