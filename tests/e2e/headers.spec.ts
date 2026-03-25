// E1.3 production headers (served from public/_headers by scripts/serve-dist.mjs) and cross-origin isolation.
import { expect, test } from '@playwright/test';
import { ROUTES } from './helpers/routes';

test.describe('E1.3 COOP / COEP / CSP and crossOriginIsolated', () => {
  for (const route of ROUTES) {
    test(`headers on ${route}`, async ({ page }) => {
      const res = await page.goto(route);
      expect(res?.status()).toBe(200);
      const h = res!.headers();
      expect(h['cross-origin-opener-policy']).toBe('same-origin');
      expect(h['cross-origin-embedder-policy']).toBe('require-corp');
      expect(h['content-security-policy']).toContain("connect-src 'self'");
      expect(h['content-security-policy']).toContain("default-src 'self'");
      expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
    });
  }

  test('static assets carry CORP same-origin and nosniff', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('script[src]').first()).toBeAttached();
    const script = await page.locator('script[src]').first().getAttribute('src');
    expect(script, 'the home page loads at least one external script').toBeTruthy();
    const res = await request.get(script!);
    expect(res.status()).toBe(200);
    expect(res.headers()['cross-origin-resource-policy']).toBe('same-origin');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });
});
