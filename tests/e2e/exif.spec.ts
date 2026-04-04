// E3.5 remove EXIF: GPS chip, output has no GPS and is smaller. E3.6 local + offline.
import exifr from 'exifr';
import { expect, test } from '@playwright/test';
import { buildGpsJpeg, makeJpeg } from '../helpers/images';
import { addAndWait, checkLocalAndOffline, downloadAll, openBatch } from './helpers/batch';
import { fileInput, jpegFile } from './helpers/files';

const ROUTE = '/remove-exif';

test('E3.5 gps.jpg shows the GPS chip; the download has no GPS and is smaller', async ({ page }) => {
  await openBatch(page, ROUTE);
  const input = jpegFile('gps.jpg', buildGpsJpeg(640, 480));
  await fileInput(page).setInputFiles(input);
  await expect(page.getByText('GPS location found')).toBeVisible();
  await expect(page.getByTestId('file-list').locator('[data-status="done"]')).toHaveCount(1, { timeout: 60_000 });
  const { name, bytes } = await downloadAll(page);
  expect(name).toBe('gps.jpg');
  const parsed = await exifr.parse(bytes, { translateValues: false }).catch(() => undefined);
  expect(parsed?.latitude).toBeUndefined();
  expect(parsed?.longitude).toBeUndefined();
  expect(parsed?.Make).toBeUndefined();
  expect(parsed?.Model).toBeUndefined();
  // "Keep orientation" is on by default.
  expect(parsed?.Orientation).toBe(6);
  expect(bytes.length).toBeLessThan(input.buffer.length);
});

test('E3.5 a JPEG without GPS shows no GPS chip', async ({ page }) => {
  await openBatch(page, ROUTE);
  await addAndWait(page, [jpegFile('clean.jpg', makeJpeg(64, 48))]);
  await expect(page.getByText('GPS location found')).toHaveCount(0);
});

test('E3.6 remove-exif: zero third-party requests; works offline after one use', async ({ page, context }) => {
  await checkLocalAndOffline(page, context, ROUTE, () => jpegFile('gps.jpg', buildGpsJpeg()));
});
