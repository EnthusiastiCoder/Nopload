// Fails when a production dependency (direct or transitive) has a licence outside the
// allowlist, unless listed in licenses.exceptions.json, or when a direct production
// dependency is missing from THIRD_PARTY_NOTICES.md.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ALLOW = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'Zlib', 'MPL-2.0', 'OFL-1.1', 'CC0-1.0']);
/** @type {{ name: string, license: string, reason: string }[]} */
const exceptions = JSON.parse(readFileSync('licenses.exceptions.json', 'utf8'));

/** SPDX expressions like "(MIT OR Apache-2.0)" pass if any alternative is allowed; "A AND B" needs both. */
function allowed(expr) {
  const clean = expr.replace(/[()]/g, '').trim();
  if (/\bOR\b/.test(clean)) return clean.split(/\s+OR\s+/).some(allowed);
  if (/\bAND\b/.test(clean)) return clean.split(/\s+AND\s+/).every(allowed);
  return ALLOW.has(clean);
}

const json = JSON.parse(execSync('pnpm licenses list --prod --json', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const problems = [];
let count = 0;
for (const [license, pkgs] of Object.entries(json)) {
  for (const pkg of pkgs) {
    count++;
    if (allowed(license)) continue;
    if (exceptions.some((e) => (e.name.endsWith('*') ? pkg.name.startsWith(e.name.slice(0, -1)) : e.name === pkg.name))) continue;
    problems.push(`${pkg.name}@${(pkg.versions ?? [pkg.version]).join(',')}: ${license}`);
  }
}

const notices = readFileSync('THIRD_PARTY_NOTICES.md', 'utf8');
const direct = Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).dependencies ?? {});
for (const name of direct) if (!notices.includes(name)) problems.push(`${name}: missing from THIRD_PARTY_NOTICES.md`);

if (problems.length) {
  console.error(`licenses: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`licenses: ${count} production package(s) OK, ${direct.length} direct dependencies in THIRD_PARTY_NOTICES.md`);
