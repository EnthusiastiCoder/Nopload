// E3.4 HEIC -> JPG. E3.6 local + offline.
// Fixtures (WS3 adds them, redistributable, see tests/fixtures/README.md):
//   tests/fixtures/sample.heic
//   tests/fixtures/sample.heic.json  {"width": W, "height": H}  (after orientation)
import { expect, test } from '@playwright/test';
import { decodeJpeg } from '../helpers/images';
import { addAndWait, checkLocalAndOffline, downloadAll, openBatch } from './helpers/batch';
import { fixture, fixtureJson, magicOf } from './helpers/files';

const ROUTE = '/heic-to-jpg';
const heic = () => fixture('sample.heic', 'image/heic', 'WS3');

test('E3.4 sample.heic becomes a JPG with the expected size and a non-blank image', async ({ page }) => {
  await openBatch(page, ROUTE);
  const expected = fixtureJson<{ width: number; height: number }>('sample.heic.json', 'WS3');
  await addAndWait(page, [heic()]);
  const { name, bytes } = await downloadAll(page);
  expect(name).toBe('sample.jpg');
  expect(magicOf(bytes)).toBe('jpeg');
  const img = decodeJpeg(bytes);
  expect([img.width, img.height]).toEqual([expected.width, expected.height]);
  let sum = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    const p = i * 4;
    sum += 0.2126 * img.data[p] + 0.7152 * img.data[p + 1] + 0.0722 * img.data[p + 2];
  }
  const mean = sum / (img.width * img.height);
  expect(mean).toBeGreaterThan(5);
  expect(mean).toBeLessThan(250);
});

test('E3.6 heic: zero third-party requests; works offline after one use', async ({ page, context }) => {
  await checkLocalAndOffline(page, context, ROUTE, heic);
});
