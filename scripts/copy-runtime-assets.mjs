// Pre-build step: copies self-hosted runtime files from node_modules into public/
// (gitignored), so nothing is ever loaded from a CDN.
// Only the ORT builds the background remover uses are copied: the plain SIMD/threaded
// WASM build (CPU path) and the JSPI build (WebGPU path). The JSEP and asyncify builds
// are over the Cloudflare Pages 25 MiB per-file cap, so they are never shipped.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX_BYTES = 25 * 1024 * 1024;

const copies = [
  {
    from: 'node_modules/onnxruntime-web/dist',
    to: 'public/ort',
    match: /^ort-wasm-simd-threaded(\.jspi)?\.(wasm|mjs)$/,
  },
];

let failed = false;
for (const { from, to, match } of copies) {
  if (!existsSync(from)) {
    console.log(`copy-runtime-assets: ${from} not installed, skipping`);
    continue;
  }
  // Start clean so stale files from older copy rules never linger in public/.
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  const files = readdirSync(from).filter((f) => match.test(f));
  for (const f of files) {
    const size = statSync(join(from, f)).size;
    if (size >= MAX_BYTES) {
      console.error(`copy-runtime-assets: ${f} is ${size} bytes, over the 25 MiB per-file cap`);
      failed = true;
      continue;
    }
    cpSync(join(from, f), join(to, f));
  }
  console.log(`copy-runtime-assets: ${files.length} file(s) ${from} -> ${to}`);
}
if (failed) process.exit(1);
