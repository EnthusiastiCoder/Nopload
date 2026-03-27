// E1.5 the service worker registers and the home page works offline after the first load.
import { expect, test } from '@playwright/test';

test('E1.5 service worker registers; offline reload of / still renders the home page', async ({ page, context }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  const state = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((r) => setTimeout(() => r(null), 15_000)),
    ]);
    return reg?.active?.state ?? 'none';
  });
  expect(state).toBe('activated');
  // Make sure the page is controlled before going offline.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/edit images without uploading them/i);
  await context.setOffline(false);
});

test('E1.5 the web manifest is linked and names the app Nopload', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const res = await request.get(href!);
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest.name).toBe('Nopload');
  expect(manifest.display).toBe('standalone');
  const sizes = (manifest.icons ?? []).map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
});
