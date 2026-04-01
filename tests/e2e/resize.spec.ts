// E3.3 resize fit 800x800 of a 12 MP (4000x3000) JPEG gives 800x600 (U3.1). E3.6 local + offline.
import { expect, test } from '@playwright/test';
import { decodeJpeg, makeJpeg } from '../helpers/images';
import { addAndWait, checkLocalAndOffline, downloadAll, openBatch } from './helpers/batch';
import { jpegFile, magicOf } from './helpers/files';

const ROUTE = '/resize-image';

test('E3.3 fit 800x800 on large-12mp.jpg gives 800x600, same format', async ({ page }) => {
  test.setTimeout(180_000);
  await openBatch(page, ROUTE);
  await page.getByRole('radio', { name: /^fit/i }).check();
  await page.getByLabel(/^width/i).fill('800');
  await page.getByLabel(/^height/i).fill('800');
  await addAndWait(page, [jpegFile('large-12mp.jpg', makeJpeg(4000, 3000, 90, 5))]);
  const { name, bytes } = await downloadAll(page);
  expect(name).toBe('large-12mp.jpg');
  expect(magicOf(bytes)).toBe('jpeg');
  const img = decodeJpeg(bytes);
  expect([img.width, img.height]).toEqual([800, 600]);
});

test('E3.6 resize: zero third-party requests; works offline after one use', async ({ page, context }) => {
  await checkLocalAndOffline(page, context, ROUTE, () => jpegFile('one.jpg', makeJpeg(400, 300)));
});
