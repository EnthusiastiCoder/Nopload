// E3.2 convert PNG to WebP / AVIF / JPG; transparent PNG to JPG on white. E3.6 local + offline.
import { expect, test } from '@playwright/test';
import { decodeJpeg, makePng } from '../helpers/images';
import { addAndWait, checkLocalAndOffline, downloadAll, openBatch } from './helpers/batch';
import { decodeInPage, magicOf, pngFile } from './helpers/files';

const ROUTE = '/convert-image';

for (const [label, magic, ext] of [
  ['WebP', 'webp', 'webp'],
  ['AVIF', 'avif', 'avif'],
  ['JPG', 'jpeg', 'jpg'],
] as const) {
  test(`E3.2 PNG -> ${label} has the right magic bytes`, async ({ page }) => {
    await openBatch(page, ROUTE);
    await page.getByRole('radio', { name: new RegExp(`^${label}`, 'i') }).check();
    await addAndWait(page, [pngFile('pic.png', makePng(64, 48))]);
    const { name, bytes } = await downloadAll(page);
    expect(name).toBe(`pic.${ext}`);
    expect(magicOf(bytes)).toBe(magic);
    expect(await decodeInPage(page, bytes)).toEqual({ width: 64, height: 48 });
  });
}

test('E3.2 transparent PNG -> JPG with a white background has white corners', async ({ page }) => {
  await openBatch(page, ROUTE);
  await page.getByRole('radio', { name: /^JPG/i }).check();
  await page.getByLabel(/background colou?r/i).fill('#ffffff');
  await addAndWait(page, [pngFile('logo.png', makePng(80, 60, { transparent: true }))]);
  const { bytes } = await downloadAll(page);
  const img = decodeJpeg(bytes);
  for (const [x, y] of [
    [1, 1],
    [img.width - 2, 1],
    [1, img.height - 2],
    [img.width - 2, img.height - 2],
  ]) {
    const i = (y * img.width + x) * 4;
    for (let c = 0; c < 3; c++) expect(img.data[i + c], `corner ${x},${y}`).toBeGreaterThanOrEqual(245);
  }
});

test('E3.6 convert: zero third-party requests; works offline after one use', async ({ page, context }) => {
  await checkLocalAndOffline(page, context, ROUTE, () => pngFile('one.png', makePng(64, 48)));
});
