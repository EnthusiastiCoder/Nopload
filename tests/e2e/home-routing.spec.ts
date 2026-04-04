// E4.1 dropping images on / shows the action chooser and routes to the chosen tool with the files queued.
import { expect, test } from '@playwright/test';
import { makeJpeg } from '../helpers/images';
import { dropFiles, fileList, jpegFile } from './helpers/files';

test('E4.1 dropping 3 JPGs on / then choosing Compress lands on /compress-image with 3 files queued', async ({ page }) => {
  await page.goto('/');
  const files = [1, 2, 3].map((s) => jpegFile(`img-${s}.jpg`, makeJpeg(120, 90, 90, s)));
  await dropFiles(page, page.locator('body'), files);
  await expect(page.getByText(/what do you want to do with 3 images\?/i)).toBeVisible();
  await page.getByRole('button', { name: /^compress/i }).click();
  await expect(page).toHaveURL(/\/compress-image\/?$/);
  await expect(fileList(page)).toHaveCount(3);
  const names = await fileList(page).allInnerTexts();
  for (const f of files) expect(names.some((t) => t.includes(f.name)), f.name).toBe(true);
});
