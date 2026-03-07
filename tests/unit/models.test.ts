// U2.6 models.lock.json pins every committed model by sha256; no RMBG / briaai anywhere.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const lockPath = path.join(root, 'models.lock.json');

type LockEntry = {
  id: string;
  path: string; // repo-relative, e.g. public/models/modnet/model_quantized.onnx
  url: string;
  revision: string; // HF revision commit SHA
  sha256: string;
  bytes: number;
  license: string;
  licenseSource: string;
};

function readLock(): LockEntry[] {
  expect(existsSync(lockPath), 'models.lock.json must exist at the repo root').toBe(true);
  const json = JSON.parse(readFileSync(lockPath, 'utf8'));
  expect(Array.isArray(json.models), 'models.lock.json must have a "models" array').toBe(true);
  return json.models as LockEntry[];
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('models.lock.json (U2.6)', () => {
  it('lists the MODNet quantized and fp16 models with full provenance', () => {
    const models = readLock();
    const paths = models.map((m) => m.path.replace(/\\/g, '/'));
    expect(paths).toContain('public/models/modnet/model_quantized.onnx');
    expect(paths).toContain('public/models/modnet/model_fp16.onnx');
    for (const m of models) {
      expect(m.sha256, m.path).toMatch(/^[0-9a-f]{64}$/);
      expect(m.revision, m.path).toMatch(/^[0-9a-f]{40}$/);
      expect(m.url, m.path).toMatch(/^https:\/\//);
      expect(m.bytes, m.path).toBeGreaterThan(0);
      expect(m.license.length, m.path).toBeGreaterThan(0);
      expect(m.licenseSource, m.path).toMatch(/^https:\/\//);
    }
  });

  it('the sha256 and size of each committed model match the lock', () => {
    for (const m of readLock()) {
      const file = path.join(root, m.path);
      expect(existsSync(file), `${m.path} must be committed`).toBe(true);
      const buf = readFileSync(file);
      expect(buf.length, m.path).toBe(m.bytes);
      expect(createHash('sha256').update(buf).digest('hex'), m.path).toBe(m.sha256);
      expect(buf.length, `${m.path} must be under the 25 MiB Cloudflare Pages cap`).toBeLessThan(25 * 1024 * 1024);
    }
  });

  it('no path or URL in src/, public/, scripts/ or the lock mentions RMBG or briaai', () => {
    expect(existsSync(path.join(root, 'public/models')), 'public/models must exist (models fetched)').toBe(true);
    const offenders: string[] = [];
    const banned = /rmbg|briaai/i;
    const files = [...walk(path.join(root, 'src')), ...walk(path.join(root, 'public')), ...walk(path.join(root, 'scripts'))];
    for (const f of files) {
      const rel = path.relative(root, f);
      if (banned.test(rel)) offenders.push(rel);
      if (/\.(m?[jt]sx?|json|astro|md|html|css|txt|webmanifest)$/.test(f) && banned.test(readFileSync(f, 'utf8'))) {
        offenders.push(`${rel} (content)`);
      }
    }
    if (existsSync(lockPath) && banned.test(readFileSync(lockPath, 'utf8'))) offenders.push('models.lock.json');
    expect(offenders).toEqual([]);
  });
});
