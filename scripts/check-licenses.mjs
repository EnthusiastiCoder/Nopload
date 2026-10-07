// Fails when a production dependency (direct or transitive) has a licence outside the
// allowlist, unless listed in licenses.exceptions.json, or when a direct production
// dependency is missing from THIRD_PARTY_NOTICES.md.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

const run = (cmd) => execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

/** `pnpm licenses` output: { [license]: [{ name, versions }] }, or null when the command fails. */
function fromPnpmLicenses() {
  try {
    const json = JSON.parse(run('pnpm licenses list --prod --json'));
    return json && !json.error ? json : null;
  } catch {
    // pnpm 11 exits non-zero with a JSON error (e.g. ERR_PNPM_MISSING_PACKAGE_INDEX_FILE) when its
    // store index lacks a package, even though node_modules is complete.
    return null;
  }
}

/** Same shape, built from the installed production tree and each package.json "license". */
function fromInstalledTree() {
  const byLicense = {};
  const seen = new Set();
  const licenseOf = (dir) => {
    const file = join(dir, 'package.json');
    if (!existsSync(file)) return null; // optional dependency for another platform, not installed
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    const l = pkg.license ?? pkg.licenses;
    if (typeof l === 'string') return l;
    if (Array.isArray(l)) return l.map((x) => x.type ?? x).join(' OR ') || 'Unknown';
    return l?.type ?? 'Unknown';
  };
  const walk = (deps) => {
    for (const [name, dep] of Object.entries(deps ?? {})) {
      const key = `${name}@${dep.version}`;
      if (seen.has(key) || !dep.path) continue;
      seen.add(key);
      const license = licenseOf(dep.path);
      if (license === null) continue;
      byLicense[license] ??= [];
      const list = byLicense[license];
      const entry = list.find((p) => p.name === name);
      if (entry) entry.versions.push(dep.version);
      else list.push({ name, versions: [dep.version] });
      walk(dep.dependencies);
      walk(dep.optionalDependencies);
    }
  };
  for (const project of JSON.parse(run('pnpm list --prod --json --depth Infinity'))) {
    walk(project.dependencies);
    walk(project.optionalDependencies);
  }
  return byLicense;
}

const json = fromPnpmLicenses() ?? fromInstalledTree();
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
