// E4.5 sitemap-index.xml lists every live route; robots.txt references it.
import { expect, test } from '@playwright/test';
import { ROUTES } from './helpers/routes';

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

test('E4.5 sitemap-index.xml lists every live route and robots.txt references it', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toMatch(/^Sitemap:\s*https?:\/\/\S+\/sitemap-index\.xml\s*$/im);

  const index = await request.get('/sitemap-index.xml');
  expect(index.status()).toBe(200);
  const sitemaps = locs(await index.text());
  expect(sitemaps.length).toBeGreaterThan(0);

  const paths = new Set<string>();
  for (const sm of sitemaps) {
    const res = await request.get(new URL(sm).pathname);
    expect(res.status(), sm).toBe(200);
    for (const loc of locs(await res.text())) paths.add(new URL(loc).pathname.replace(/\/$/, '') || '/');
  }
  for (const route of ROUTES) expect(paths.has(route), `${route} in the sitemap`).toBe(true);
  expect(paths.has('/404')).toBe(false);
});
