// Pre-build step: copies self-hosted runtime files from node_modules into public/
// (gitignored), so nothing is ever loaded from a CDN.
// onnxruntime-web is installed by the background remover workstream; until then this skips.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const copies = [{ from: 'node_modules/onnxruntime-web/dist', to: 'public/ort', match: /\.(wasm|mjs)$/ }];

for (const { from, to, match } of copies) {
  if (!existsSync(from)) {
    console.log(`copy-runtime-assets: ${from} not installed, skipping`);
    continue;
  }
  mkdirSync(to, { recursive: true });
  const files = readdirSync(from).filter((f) => match.test(f));
  for (const f of files) cpSync(join(from, f), join(to, f));
  console.log(`copy-runtime-assets: ${files.length} file(s) ${from} -> ${to}`);
}
