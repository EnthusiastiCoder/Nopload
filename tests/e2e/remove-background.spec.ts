// E2.1-E2.7 remove background.
// Fixtures (WS2 adds them, see tests/fixtures/README.md):
//   tests/fixtures/portrait.jpg       CC0/permissive portrait photo
//   tests/fixtures/portrait.mask.json {"subject": {"x":..,"y":..,"w":..,"h":..}} in portrait.jpg pixels
//   tests/fixtures/product.jpg        CC0/permissive product photo
// UI hooks: see tests/e2e/helpers/files.ts.
import { unzipSync } from 'fflate';
import { PNG } from 'pngjs';
import { expect, test, type Page } from '@playwright/test';
import { decodeJpeg, makeJpeg } from '../helpers/images';
import { clickDownload, fileInput, fileList, fixture, fixtureJson, jpegFile, type FilePayload } from './helpers/files';
import { expectOnlyLocal, recordRequests } from './helpers/network';
import { BG_ROUTES } from './helpers/routes';

const WS2 = 'WS2';
type Box = { x: number; y: number; w: number; h: number };

const portrait = () => fixture('portrait.jpg', 'image/jpeg', WS2);
const product = () => fixture('product.jpg', 'image/jpeg', WS2);
const subjectBox = () => fixtureJson<{ subject: Box }>('portrait.mask.json', WS2).subject;

async function openTool(page: Page): Promise<void> {
  const res = await page.goto('/remove-background');
  expect(res?.status()).toBe(200);
  await expect(fileInput(page)).toBeAttached();
}

async function processOne(page: Page, file: FilePayload): Promise<void> {
  await fileInput(page).setInputFiles(file);
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 60_000 });
}

function meanAlpha(png: PNG, box: Box): number {
  let sum = 0;
  let n = 0;
  for (let y = Math.floor(box.y); y < Math.floor(box.y + box.h); y++) {
    for (let x = Math.floor(box.x); x < Math.floor(box.x + box.w); x++) {
      sum += png.data[(y * png.width + x) * 4 + 3];
      n++;
    }
  }
  return sum / n / 255;
}

function alphaChannel(png: PNG): Buffer {
  const a = Buffer.alloc(png.width * png.height);
  for (let i = 0; i < a.length; i++) a[i] = png.data[i * 4 + 3];
  return a;
}

function inputSize(file: FilePayload): { width: number; height: number } {
  const d = decodeJpeg(file.buffer);
  return { width: d.width, height: d.height };
}

test('E2.1 portrait: full-resolution PNG, subject kept, corners removed', async ({ page }) => {
  await openTool(page);
  const file = portrait();
  await processOne(page, file);
  await expect(page.getByText(/using your (gpu|cpu)/i)).toBeVisible();
  const { name, bytes } = await clickDownload(page, page.getByRole('button', { name: /download png/i }));
  expect(name).toBe('portrait-nobg.png');
  const png = PNG.sync.read(bytes);
  const { width, height } = inputSize(file);
  expect([png.width, png.height]).toEqual([width, height]);
  expect(meanAlpha(png, subjectBox())).toBeGreaterThanOrEqual(0.9);
  const cw = Math.floor(width * 0.1);
  const ch = Math.floor(height * 0.1);
  for (const corner of [
    { x: 0, y: 0, w: cw, h: ch },
    { x: width - cw, y: 0, w: cw, h: ch },
    { x: 0, y: height - ch, w: cw, h: ch },
    { x: width - cw, y: height - ch, w: cw, h: ch },
  ]) {
    expect(meanAlpha(png, corner), JSON.stringify(corner)).toBeLessThanOrEqual(0.1);
  }
});

test('E2.2 red background + JPG download gives red corners', async ({ page }) => {
  await openTool(page);
  await processOne(page, portrait());
  await page.getByLabel(/custom colou?r/i).fill('#ff0000');
  const { name, bytes } = await clickDownload(page, page.getByRole('button', { name: /download jpg/i }));
  expect(name).toBe('portrait-nobg.jpg');
  const img = decodeJpeg(bytes);
  const px = (x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  };
  for (const [x, y] of [
    [2, 2],
    [img.width - 3, 2],
    [2, img.height - 3],
    [img.width - 3, img.height - 3],
  ]) {
    const [r, g, b] = px(x, y);
    expect(r, `corner ${x},${y}`).toBeGreaterThanOrEqual(245);
    expect(g, `corner ${x},${y}`).toBeLessThanOrEqual(10);
    expect(b, `corner ${x},${y}`).toBeLessThanOrEqual(10);
  }
});

test('E2.3 an Erase stroke clears alpha; undo restores the exact mask', async ({ page }) => {
  await openTool(page);
  await processOne(page, portrait());
  const download = () => page.getByRole('button', { name: /download png/i });
  const original = PNG.sync.read((await clickDownload(page, download())).bytes);

  await page.getByRole('radio', { name: /erase/i }).or(page.getByRole('button', { name: /^erase$/i })).first().click();
  await page.getByLabel(/brush size/i).fill('60');
  const canvas = page.getByTestId('brush-canvas');
  const box = (await canvas.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.3, y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + box.width * (0.3 + (0.4 * i) / 20), y);
  await page.mouse.up();

  const erased = PNG.sync.read((await clickDownload(page, download())).bytes);
  const row = Math.floor(erased.height / 2);
  const strip = { x: erased.width * 0.35, y: row, w: erased.width * 0.3, h: 1 };
  expect(meanAlpha(erased, strip)).toBeLessThan(0.1);
  expect(meanAlpha(original, strip)).toBeGreaterThan(0.5); // the stroke really crossed the subject

  await page.keyboard.press('ControlOrMeta+z');
  const restored = PNG.sync.read((await clickDownload(page, download())).bytes);
  expect(alphaChannel(restored).equals(alphaChannel(original))).toBe(true);
});

test('E2.4 a batch of 5 gives a ZIP of 5 *-nobg.png files', async ({ page }) => {
  await openTool(page);
  const src = portrait().buffer;
  const names = ['one', 'two', 'three', 'four', 'five'];
  await fileInput(page).setInputFiles(names.map((n) => jpegFile(`${n}.jpg`, src)));
  await expect(fileList(page)).toHaveCount(5);
  await expect(page.getByTestId('file-list').locator('[data-status="done"]')).toHaveCount(5, { timeout: 120_000 });
  const { name, bytes } = await clickDownload(page, page.getByRole('button', { name: /download all/i }));
  expect(name).toMatch(/\.zip$/);
  const entries = Object.keys(unzipSync(new Uint8Array(bytes))).sort();
  expect(entries).toEqual(names.map((n) => `${n}-nobg.png`).sort());
});

test('E2.5 no request leaves localhost during model load and inference; works offline after one run', async ({
  page,
  context,
}) => {
  const log = recordRequests(page);
  await openTool(page);
  await processOne(page, portrait());
  expectOnlyLocal(log);
  expect(log.urls.some((u) => /\/models\/.+\.onnx$/.test(u)), 'the model was fetched from /models/').toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(fileInput(page)).toBeAttached();
  await processOne(page, product());
  await context.setOffline(false);
});

test('E2.6 the three BG pages have unique titles/H1s and a FAQPage with >= 5 Q&As', async ({ page }) => {
  const titles: string[] = [];
  const h1s: string[] = [];
  for (const route of BG_ROUTES) {
    const res = await page.goto(route);
    expect(res?.status(), route).toBe(200);
    titles.push(await page.title());
    h1s.push((await page.locator('h1').innerText()).trim());
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const nodes = blocks.flatMap((b) => {
      const d = JSON.parse(b);
      const arr = Array.isArray(d) ? d : [d];
      return arr.flatMap((n) => (n['@graph'] ? n['@graph'] : [n]));
    });
    const faq = nodes.find((n) => n['@type'] === 'FAQPage');
    expect(faq, `${route} FAQPage JSON-LD`).toBeTruthy();
    expect(faq.mainEntity.length, route).toBeGreaterThanOrEqual(5);
    for (const q of faq.mainEntity) {
      expect(q['@type']).toBe('Question');
      expect(q.acceptedAnswer?.text?.length ?? 0).toBeGreaterThan(0);
    }
  }
  expect(new Set(titles).size).toBe(3);
  expect(new Set(h1s).size).toBe(3);
});

test('E2.7 a 12 MP image completes in <= 15 s cold and <= 6 s warm @perf', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'perf budget is defined for chromium');
  test.setTimeout(240_000);
  const big = jpegFile('big-12mp.jpg', makeJpeg(4000, 3000, 90, 11));
  const big2 = jpegFile('big-12mp-2.jpg', makeJpeg(4000, 3000, 90, 12));

  // Warm the HTTP / service-worker cache with the model (not timed).
  await openTool(page);
  await processOne(page, jpegFile('tiny.jpg', makeJpeg(256, 256)));

  // Cold: a fresh page (new ORT session), model served from cache.
  await openTool(page);
  let t0 = Date.now();
  await processOne(page, big);
  const cold = Date.now() - t0;

  // Warm: same page, warm session.
  await page.getByRole('button', { name: /new image|start over|clear/i }).first().click();
  t0 = Date.now();
  await processOne(page, big2);
  const warm = Date.now() - t0;

  console.log(`E2.7 perf: cold ${cold} ms, warm ${warm} ms`);
  test.info().annotations.push({ type: 'perf', description: `cold=${cold}ms warm=${warm}ms` });
  expect(cold).toBeLessThanOrEqual(15_000);
  expect(warm).toBeLessThanOrEqual(6_000);
});
