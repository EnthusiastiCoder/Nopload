// E1.2 zero third-party requests on every route, E1.4 the PrivacyBadge panel.
import { expect, test } from '@playwright/test';
import { expectOnlyLocal, recordRequests } from './helpers/network';
import { ROUTES } from './helpers/routes';

test.describe('E1.2 every request stays on localhost:4321', () => {
  for (const route of ROUTES) {
    test(`no third-party requests on ${route}`, async ({ page }) => {
      const log = recordRequests(page);
      const res = await page.goto(route);
      expect(res?.status()).toBe(200);
      await page.waitForLoadState('networkidle');
      expectOnlyLocal(log);
    });
  }
});

test('E1.4 the PrivacyBadge panel lists requests and shows 0 third-party requests', async ({ page }) => {
  await page.goto('/');
  const badge = page.getByRole('button', { name: /0 uploads/i });
  await expect(badge).toBeVisible();
  await badge.click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  expect(await panel.getByRole('listitem').count()).toBeGreaterThanOrEqual(1);
  await expect(panel).toContainText(/0 third-party requests/i);
  await expect(panel).toContainText('localhost:4321');
});
