// Downloads the background-removal models pinned in models.lock.json into public/models/ and
// verifies each file's size and sha256. The lock is the source of truth: URLs carry the pinned
// revision, so a re-run always fetches the exact same bytes. Files that already match are skipped.
//
//   node scripts/fetch-models.mjs          fetch missing or mismatched models, verify all
//   node scripts/fetch-models.mjs --check  verify only (exit 1 on any mismatch), no network
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(readFileSync(join(root, 'models.lock.json'), 'utf8'));
const checkOnly = process.argv.includes('--check');
const MAX_BYTES = 25 * 1024 * 1024; // Cloudflare Pages per-file cap

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function matches(file, m) {
  if (!existsSync(file)) return false;
  const buf = readFileSync(file);
  return buf.length === m.bytes && sha256(buf) === m.sha256;
}

let failed = 0;
for (const m of lock.models) {
  const file = join(root, m.path);
  if (m.bytes >= MAX_BYTES) {
    console.error(`${m.id}: ${m.bytes} bytes is over the 25 MiB per-file cap`);
    failed++;
    continue;
  }
  if (matches(file, m)) {
    console.log(`${m.id}: ok (${m.bytes} bytes)`);
    continue;
  }
  if (checkOnly) {
    console.error(`${m.id}: missing or sha256 mismatch at ${m.path}`);
    failed++;
    continue;
  }
  console.log(`${m.id}: downloading ${m.url}`);
  const res = await fetch(m.url, { redirect: 'follow' });
  if (!res.ok) {
    console.error(`${m.id}: HTTP ${res.status}`);
    failed++;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha256(buf);
  if (buf.length !== m.bytes || got !== m.sha256) {
    console.error(`${m.id}: expected ${m.bytes} bytes sha256 ${m.sha256}, got ${buf.length} bytes sha256 ${got}`);
    failed++;
    continue;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.part`, buf);
  renameSync(`${file}.part`, file);
  console.log(`${m.id}: saved ${m.path}`);
}

if (failed) {
  console.error(`fetch-models: ${failed} model(s) failed`);
  process.exit(1);
}
