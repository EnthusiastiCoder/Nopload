// E3.1 compress 30 files, E3.6 local + offline, E3.7 cancel.
import { unzipSync } from 'fflate';
import { expect, test } from '@playwright/test';
import { makeJpeg, makePng } from '../helpers/images';
import { addAndWait, checkLocalAndOffline, doneRows, downloadAll, openBatch } from './helpers/batch';
import { decodeInPage, fileInput, fileList, jpegFile, pngFile, type FilePayload } from './helpers/files';

const ROUTE = '/compress-image';

function mixedFixtures(): FilePayload[] {
  const out: FilePayload[] = [];
  for (let i = 0; i < 15; i++) out.push(jpegFile(`photo-${i}.jpg`, makeJpeg(320, 240, 100, i + 1)));
  for (let i = 0; i < 15; i++) out.push(pngFile(`shot-${i}.png`, makePng(320, 240, { seed: i + 100 })));
  return out;
}

test('E3.1 30 mixed files give a ZIP of 30 smaller-or-equal, decodable entries', async ({ page }) => {
  test.setTimeout(180_000);
  await openBatch(page, ROUTE);
  await expect(page.getByLabel(/quality/i)).toHaveValue('75');
  const inputs = mixedFixtures();
  await addAndWait(page, inputs);
  await expect(page.getByText(/30 files/i)).toBeVisible();

  const { name, bytes } = await downloadAll(page);
  expect(name).toMatch(/\.zip$/);
  const entries = unzipSync(new Uint8Array(bytes));
  expect(Object.keys(entries).sort()).toEqual(inputs.map((f) => f.name).sort());

  const totalIn = inputs.reduce((a, f) => a + f.buffer.length, 0);
  const totalOut = Object.values(entries).reduce((a, d) => a + d.length, 0);
  expect(totalOut).toBeLessThan(totalIn);

  for (const f of inputs) {
    const out = Buffer.from(entries[f.name]);
    expect(out.length, f.name).toBeLessThanOrEqual(f.buffer.length);
    expect(await decodeInPage(page, out), f.name).toEqual({ width: 320, height: 240 });
  }
});

test('E3.6 compress: zero third-party requests; works offline after one use', async ({ page, context }) => {
  await checkLocalAndOffline(page, context, ROUTE, () => jpegFile('one.jpg', makeJpeg(200, 150, 100)));
});

test('E3.7 Cancel during a 30-file batch stops processing; completed items stay downloadable', async ({ page }) => {
  test.setTimeout(180_000);
  await openBatch(page, ROUTE);
  const big = [1, 2, 3].map((s) => makeJpeg(3000, 2000, 95, s));
  const files = Array.from({ length: 30 }, (_, i) => jpegFile(`big-${i}.jpg`, big[i % 3]));
  await fileInput(page).setInputFiles(files);
  await expect(fileList(page)).toHaveCount(30);

  await expect.poll(() => doneRows(page).count(), { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: /^cancel$/i }).click();

  const doneAtCancel = await doneRows(page).count();
  await page.waitForTimeout(3_000);
  const doneLater = await doneRows(page).count();
  // Items already in flight may finish, but nothing new starts.
  expect(doneLater - doneAtCancel).toBeLessThanOrEqual(4);
  expect(doneLater).toBeLessThan(30);
  await expect(page.getByTestId('file-list').locator('[data-status="cancelled"]')).not.toHaveCount(0);

  const { name, bytes } = await downloadAll(page);
  expect(name).toMatch(/\.zip$/);
  expect(Object.keys(unzipSync(new Uint8Array(bytes)))).toHaveLength(doneLater);
});
