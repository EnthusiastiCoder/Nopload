// Privacy of the tool-to-tool hand-off: the files parked in IndexedDB are deleted on pickup,
// so nothing outlives a single hand-off.
import { expect, test, type Page } from '@playwright/test';
import { makeJpeg } from '../helpers/images';
import { dropFiles, fileList, jpegFile } from './helpers/files';

/** Number of entries left in the hand-off store (0 when the DB has none). */
function handoffEntries(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('nopload-handoff');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('handoff')) {
            db.close();
            resolve(0);
            return;
          }
          const count = db.transaction('handoff').objectStore('handoff').count();
          count.onerror = () => reject(count.error);
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
        };
      }),
  );
}

test('hand-off entries are deleted after pickup and do not survive a reload or a second hand-off', async ({ page }) => {
  await page.goto('/');
  await dropFiles(page, page.locator('body'), [jpegFile('private-1.jpg', makeJpeg(120, 90, 90, 1))]);
  await page.getByRole('button', { name: /^compress/i }).click();
  await expect(page).toHaveURL(/\/compress-image\/?$/);
  await expect(fileList(page)).toHaveCount(1);
  await expect.poll(() => handoffEntries(page)).toBe(0);

  // A reload must not bring the handed-over file back.
  await page.reload();
  await expect(page.getByTestId('dropzone')).toBeVisible();
  await expect(fileList(page)).toHaveCount(0);
  expect(await handoffEntries(page)).toBe(0);

  // A second hand-off leaves only its own file, and the store is empty again after pickup.
  await page.goto('/');
  await dropFiles(page, page.locator('body'), [jpegFile('private-2.jpg', makeJpeg(120, 90, 90, 2))]);
  await page.getByRole('button', { name: /^compress/i }).click();
  await expect(page).toHaveURL(/\/compress-image\/?$/);
  await expect(fileList(page)).toHaveCount(1);
  await expect(fileList(page).first()).toContainText('private-2.jpg');
  await expect.poll(() => handoffEntries(page)).toBe(0);
});
