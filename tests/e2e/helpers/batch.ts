// Shared steps for the five batch tool pages (WS3).
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { clickDownload, fileInput, fileList, type FilePayload } from './files';
import { expectOnlyLocal, recordRequests } from './network';

export async function openBatch(page: Page, route: string): Promise<void> {
  const res = await page.goto(route);
  expect(res?.status(), route).toBe(200);
  await expect(fileInput(page)).toBeAttached();
}

export function doneRows(page: Page) {
  return page.getByTestId('file-list').locator('[data-status="done"]');
}

export async function addAndWait(page: Page, files: FilePayload[], timeout = 120_000): Promise<void> {
  await fileInput(page).setInputFiles(files);
  await expect(fileList(page)).toHaveCount(files.length);
  await expect(doneRows(page)).toHaveCount(files.length, { timeout });
}

/** "Download all": one file downloads directly, two or more come as a ZIP. */
export function downloadAll(page: Page) {
  return clickDownload(page, page.getByRole('button', { name: /download all/i }));
}

/** E3.6: zero third-party requests on the page, and it works offline after one use. */
export async function checkLocalAndOffline(
  page: Page,
  context: BrowserContext,
  route: string,
  file: () => FilePayload,
): Promise<void> {
  const log = recordRequests(page);
  await openBatch(page, route);
  await addAndWait(page, [file()]);
  expectOnlyLocal(log);

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(fileInput(page)).toBeAttached();
    await addAndWait(page, [file()]);
  } finally {
    await context.setOffline(false);
  }
}
