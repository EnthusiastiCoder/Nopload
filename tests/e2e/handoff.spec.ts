// E4.2 hand-off between tools; E4.3 HEIC into the background remover.
import { expect, test } from '@playwright/test';
import { fileInput, fileList, fixture } from './helpers/files';

test('E4.2 after removing a background, "Next: compress" opens /compress-image with the PNG queued', async ({ page }) => {
  const res = await page.goto('/remove-background');
  expect(res?.status()).toBe(200);
  await fileInput(page).setInputFiles(fixture('portrait.jpg', 'image/jpeg', 'WS2'));
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /next: compress/i }).click();
  await expect(page).toHaveURL(/\/compress-image\/?$/);
  await expect(fileList(page)).toHaveCount(1);
  await expect(fileList(page).first()).toContainText('portrait-nobg.png');
});

test('E4.3 dropping sample.heic on /remove-background produces a result', async ({ page }) => {
  const res = await page.goto('/remove-background');
  expect(res?.status()).toBe(200);
  await fileInput(page).setInputFiles(fixture('sample.heic', 'image/heic', 'WS3'));
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/convert heic first/i)).toHaveCount(0);
});
