// U4.1 SEO metadata of the production build: JSON-LD, titles, descriptions.
// Reads the built HTML in dist/ (run `pnpm build` first; `pnpm test` after a build in CI).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tools } from '../../src/tools/registry';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = path.join(root, 'dist');

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : [];
  });
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

type Page = { file: string; title: string; description: string; jsonLd: string[] };

function pages(): Page[] {
  expect(existsSync(dist), 'dist/ is missing: run `pnpm build` before the SEO unit test').toBe(true);
  return htmlFiles(dist)
    .filter((f) => !/[\\/]404\.html$|[\\/]offline(\.html|[\\/]index\.html)$/.test(f))
    .map((file) => {
      const html = readFileSync(file, 'utf8');
      const title = decode(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '');
      const description = decode(/<meta\s+name="description"\s+content="([^"]*)"/i.exec(html)?.[1] ?? '');
      const jsonLd = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
      return { file: path.relative(dist, file), title, description, jsonLd };
    });
}

describe('SEO metadata (U4.1)', () => {
  it('every page has JSON-LD that parses with @context https://schema.org', () => {
    const ps = pages();
    expect(ps.length).toBeGreaterThanOrEqual(11);
    for (const p of ps) {
      expect(p.jsonLd.length, `${p.file} has no JSON-LD`).toBeGreaterThan(0);
      for (const raw of p.jsonLd) {
        const data = JSON.parse(raw);
        const nodes = Array.isArray(data) ? data : [data];
        for (const n of nodes) expect(n['@context'], p.file).toBe('https://schema.org');
      }
    }
  });

  it('titles are <= 60 chars and unique', () => {
    const ps = pages();
    for (const p of ps) {
      expect(p.title.length, `${p.file} title`).toBeGreaterThan(0);
      expect(p.title.length, `${p.file} title "${p.title}"`).toBeLessThanOrEqual(60);
    }
    expect(new Set(ps.map((p) => p.title)).size).toBe(ps.length);
  });

  it('descriptions are <= 155 chars and unique', () => {
    const ps = pages();
    for (const p of ps) {
      expect(p.description.length, `${p.file} description`).toBeGreaterThan(0);
      expect(p.description.length, `${p.file} description`).toBeLessThanOrEqual(155);
    }
    expect(new Set(ps.map((p) => p.description)).size).toBe(ps.length);
  });

  it('registry titles and descriptions are unique and within the limits', () => {
    expect(tools.length).toBe(8);
    for (const t of tools) {
      expect(t.title.length, t.slug).toBeLessThanOrEqual(60);
      expect(t.description.length, t.slug).toBeLessThanOrEqual(155);
    }
    expect(new Set(tools.map((t) => t.title)).size).toBe(tools.length);
    expect(new Set(tools.map((t) => t.description)).size).toBe(tools.length);
  });
});
