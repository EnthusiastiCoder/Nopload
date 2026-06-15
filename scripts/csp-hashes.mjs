// Post-build step:
// 1. Hashes every inline <script> in dist/**/*.html (Astro's island bootstrap and the theme
//    no-flash script) and appends the 'sha256-...' sources to script-src in dist/_headers,
//    so script-src stays strict without 'unsafe-inline'.
// 2. Writes dist/offline-assets.json: the heavy runtime files (models, ORT, codecs) that
//    Settings -> "Make available offline" pre-caches.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const dist = 'dist';

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const hashes = new Set();
const inline = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
for (const file of walk(dist).filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(file, 'utf8');
  for (const m of html.matchAll(inline)) {
    if (/type=["']?application\/(ld\+)?json/i.test(m[1])) continue;
    if (m[2].length === 0) continue;
    hashes.add(`'sha256-${createHash('sha256').update(m[2], 'utf8').digest('base64')}'`);
  }
}

const headersFile = join(dist, '_headers');
const headers = readFileSync(headersFile, 'utf8');
const extra = [...hashes].sort().join(' ');
const patched = headers.replace(/(Content-Security-Policy:[^\n]*?script-src 'self')/, `$1${extra ? ` ${extra}` : ''}`);
if (patched === headers && extra) throw new Error('csp-hashes: script-src not found in dist/_headers');
writeFileSync(headersFile, patched);
console.log(`csp-hashes: ${hashes.size} inline script hash(es) added to script-src`);

const heavy = ['models', 'ort', 'codecs'].flatMap((d) => walk(join(dist, d)));
const assets = heavy.map((f) => `/${relative(dist, f).split(sep).join('/')}`).sort();
writeFileSync(join(dist, 'offline-assets.json'), `${JSON.stringify(assets, null, 2)}\n`);
console.log(`csp-hashes: offline-assets.json lists ${assets.length} file(s)`);
