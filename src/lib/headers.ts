// Cloudflare Pages `_headers` parsing and matching.
// Used by scripts/serve-dist.mjs so local e2e runs with the production headers.
// Matching follows Cloudflare: `*` is a greedy splat, `:name` matches one path
// segment, every matching block applies in file order, a header set by several
// blocks is joined with ", ", and `! Name` detaches a header set by an earlier block.

export interface Rule {
  /** URL pattern of the block, e.g. `/*`, `/models/*` or `/blog/:slug`. */
  pattern: string;
  /** Headers set by this block (name as written in the file). */
  headers: Record<string, string>;
  /** Header names detached by `! Name` lines in this block. */
  detach: string[];
}

export function parseHeadersFile(text: string): Rule[] {
  const rules: Rule[] = [];
  let current: Rule | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const indented = /^\s/.test(raw);
    if (!indented) {
      current = { pattern: trimmed, headers: {}, detach: [] };
      rules.push(current);
      continue;
    }
    if (!current) continue;
    if (trimmed.startsWith('!')) {
      const name = trimmed.slice(1).trim();
      if (name) current.detach.push(name);
      continue;
    }
    const colon = trimmed.indexOf(':');
    if (colon <= 0) continue;
    const name = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    const existing = Object.keys(current.headers).find((k) => k.toLowerCase() === name.toLowerCase());
    if (existing) current.headers[existing] = `${current.headers[existing]}, ${value}`;
    else current.headers[name] = value;
  }
  return rules;
}

function patternToRegExp(pattern: string): RegExp {
  let path = pattern;
  // Absolute-URL patterns (https://host/path) match on the path only here.
  const m = /^https?:\/\/[^/]+(\/.*)?$/.exec(pattern);
  if (m) path = m[1] ?? '/';
  let re = '';
  for (let i = 0; i < path.length; i++) {
    const c = path[i];
    if (c === '*') {
      re += '.*';
    } else if (c === ':' && /[A-Za-z]/.test(path[i + 1] ?? '')) {
      while (/[A-Za-z0-9_]/.test(path[i + 1] ?? '')) i++;
      re += '[^/]+';
    } else {
      re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

export function headersFor(path: string, rules: Rule[]): Record<string, string> {
  const out = new Map<string, { name: string; value: string }>();
  for (const rule of rules) {
    if (!patternToRegExp(rule.pattern).test(path)) continue;
    for (const [name, value] of Object.entries(rule.headers)) {
      const key = name.toLowerCase();
      const prev = out.get(key);
      out.set(key, prev ? { name: prev.name, value: `${prev.value}, ${value}` } : { name, value });
    }
    for (const name of rule.detach) out.delete(name.toLowerCase());
  }
  return Object.fromEntries([...out.values()].map((h) => [h.name, h.value]));
}
