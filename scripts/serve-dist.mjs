// Serves dist/ with the production headers from dist/_headers (Cloudflare Pages semantics),
// so e2e runs see the same COOP/COEP/CSP as the deployed site.
// Usage: node scripts/serve-dist.mjs [--port 4321]
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { headersFor, parseHeadersFile } from '../src/lib/headers.ts';

const root = resolve('dist');
const portArg = process.argv.indexOf('--port');
const port = portArg > -1 ? Number(process.argv[portArg + 1]) : 4321;

const headersPath = existsSync(join(root, '_headers')) ? join(root, '_headers') : resolve('public/_headers');
const rules = parseHeadersFile(readFileSync(headersPath, 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Maps a URL path to a file in dist/, like Cloudflare Pages: /x -> x.html, x/index.html or x. */
function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  const base = join(root, clean);
  if (!base.startsWith(root)) return null;
  const candidates = urlPath.endsWith('/') ? [join(base, 'index.html')] : [base, `${base}.html`, join(base, 'index.html')];
  return candidates.find(isFile) ?? null;
}

createServer((req, res) => {
  const urlPath = new URL(req.url ?? '/', 'http://localhost').pathname;
  let file = resolveFile(urlPath);
  let status = 200;
  if (!file) {
    file = join(root, '404.html');
    status = 404;
  }
  const headers = headersFor(urlPath, rules);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
  if (!isFile(file)) {
    res.writeHead(404).end('Not found');
    return;
  }
  const body = readFileSync(file);
  res.writeHead(status, { 'Content-Length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
}).listen(port, () => console.log(`serving dist/ on http://localhost:${port}`));
