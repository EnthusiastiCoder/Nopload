// File helpers for e2e: fixtures, synthetic files, drops, pastes and downloads.
//
// UI contract the specs rely on (implementers must keep these hooks):
// - Every Dropzone is `[data-testid="dropzone"]` (keyboard focusable), renders an
//   `input[type=file]` and an `aria-live` region that announces "<n> file(s) added".
// - FileList rows are `role=listitem` inside `[data-testid="file-list"]`, each with
//   `data-status` = queued | processing | done | error | cancelled.
// - The single-image result is `[data-testid="result"]`; the brush canvas is
//   `[data-testid="brush-canvas"]`.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Download, type Locator, type Page } from '@playwright/test';

export const FIXTURES = fileURLToPath(new URL('../../fixtures/', import.meta.url));

export type FilePayload = { name: string; mimeType: string; buffer: Buffer };

/** Reads a committed fixture; a missing one fails with a message naming the workstream that owns it. */
export function fixture(name: string, mimeType: string, owner: string): FilePayload {
  const p = FIXTURES + name;
  if (!existsSync(p)) throw new Error(`fixture tests/fixtures/${name} is missing (added by ${owner}, listed in tests/fixtures/README.md)`);
  return { name, mimeType, buffer: readFileSync(p) };
}

export function fixtureJson<T>(name: string, owner: string): T {
  return JSON.parse(fixture(name, 'application/json', owner).buffer.toString('utf8')) as T;
}

export const jpegFile = (name: string, buffer: Buffer): FilePayload => ({ name, mimeType: 'image/jpeg', buffer });
export const pngFile = (name: string, buffer: Buffer): FilePayload => ({ name, mimeType: 'image/png', buffer });

export function fileInput(page: Page): Locator {
  return page.locator('input[type=file]').first();
}

export function fileList(page: Page): Locator {
  return page.getByTestId('file-list').getByRole('listitem');
}

/** Dispatches a real `drop` (with a DataTransfer holding the files) on `target`. */
export async function dropFiles(page: Page, target: Locator, files: FilePayload[]): Promise<void> {
  const payload = files.map((f) => ({ name: f.name, type: f.mimeType, b64: f.buffer.toString('base64') }));
  const dt = await page.evaluateHandle((items) => {
    const dt = new DataTransfer();
    for (const it of items) {
      const bin = Uint8Array.from(atob(it.b64), (c) => c.charCodeAt(0));
      dt.items.add(new File([bin], it.name, { type: it.type }));
    }
    return dt;
  }, payload);
  await target.dispatchEvent('dragenter', { dataTransfer: dt });
  await target.dispatchEvent('dragover', { dataTransfer: dt });
  await target.dispatchEvent('drop', { dataTransfer: dt });
}

/** Dispatches a synthetic `paste` carrying one image file on the document. */
export async function pasteFile(page: Page, file: FilePayload): Promise<void> {
  await page.evaluate(
    ({ name, type, b64 }) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bin], name, { type }));
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      (document.activeElement ?? document.body).dispatchEvent(ev);
    },
    { name: file.name, type: file.mimeType, b64: file.buffer.toString('base64') },
  );
}

export async function downloadBytes(download: Download): Promise<Buffer> {
  const path = await download.path();
  expect(path, 'download has no path').toBeTruthy();
  return readFileSync(path!);
}

/** Clicks `button` and returns the downloaded file's name and bytes. */
export async function clickDownload(page: Page, button: Locator): Promise<{ name: string; bytes: Buffer }> {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  return { name: download.suggestedFilename(), bytes: await downloadBytes(download) };
}

/** Decodes image bytes in the page (createImageBitmap) and returns its size; throws if it does not decode. */
export async function decodeInPage(page: Page, bytes: Buffer): Promise<{ width: number; height: number }> {
  return page.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bin]));
    return { width: bmp.width, height: bmp.height };
  }, bytes.toString('base64'));
}

export function magicOf(bytes: Buffer): 'jpeg' | 'png' | 'webp' | 'avif' | 'unknown' {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (bytes.subarray(4, 8).toString('latin1') === 'ftyp' && /^avi[fs]$/.test(bytes.subarray(8, 12).toString('latin1'))) return 'avif';
  return 'unknown';
}
