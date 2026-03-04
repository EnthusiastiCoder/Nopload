// U1.7 tool registry integrity.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tools } from '../../src/tools/registry';

const toolsDir = fileURLToPath(new URL('../../src/tools/', import.meta.url));

const EXPECTED_SLUGS = [
  'remove-background',
  'remove-bg-alternative',
  'remove-background-without-account',
  'compress-image',
  'convert-image',
  'resize-image',
  'heic-to-jpg',
  'remove-exif',
];

describe('tool registry', () => {
  it('declares exactly the eight MVP tool pages', () => {
    expect(tools.map((t) => t.slug).sort()).toEqual([...EXPECTED_SLUGS].sort());
  });

  it('has unique slugs and unique ids', () => {
    expect(tools.length).toBeGreaterThan(0);
    expect(new Set(tools.map((t) => t.slug)).size).toBe(tools.length);
    expect(new Set(tools.map((t) => t.id)).size).toBe(tools.length);
  });

  it('every non-alias tool has a meta.ts', () => {
    const real = tools.filter((t) => !t.alias);
    expect(real.length).toBe(6);
    for (const t of real) expect(existsSync(`${toolsDir}${t.id}/meta.ts`), `${t.id}/meta.ts`).toBe(true);
  });

  it('every alias points to an existing non-alias tool', () => {
    const aliases = tools.filter((t) => t.alias);
    expect(aliases.map((t) => t.slug).sort()).toEqual(['remove-background-without-account', 'remove-bg-alternative']);
    const realIds = new Set(tools.filter((t) => !t.alias).map((t) => t.id));
    for (const a of aliases) expect(realIds.has(a.alias!), `${a.slug} -> ${a.alias}`).toBe(true);
  });

  it('every entry has a title, description, status and icon', () => {
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(t.title.length, t.slug).toBeGreaterThan(0);
      expect(t.description.length, t.slug).toBeGreaterThan(0);
      expect(['live', 'soon']).toContain(t.status);
      expect(t.icon.length, t.slug).toBeGreaterThan(0);
    }
  });
});
