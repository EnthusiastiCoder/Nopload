// U1.1 Cloudflare _headers parsing and matching.
import { describe, expect, it } from 'vitest';
import { headersFor, parseHeadersFile } from '../../src/lib/headers';

const SAMPLE = `# Global security headers
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  X-Foo: inherited

# Models: long cache, and X-Foo detached

/models/*
  Cache-Control: public, max-age=31536000, immutable
  ! X-Foo

/blog/:slug
  X-Blog: yes
`;

/** Header names are case-insensitive: compare with lower-case keys. */
function lower(h: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
}

describe('parseHeadersFile', () => {
  it('parses the /* and /models/* blocks with their headers', () => {
    const rules = parseHeadersFile(SAMPLE);
    const patterns = rules.map((r) => r.pattern);
    expect(patterns).toEqual(['/*', '/models/*', '/blog/:slug']);
    expect(lower(rules[0].headers)).toEqual({
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp',
      'x-foo': 'inherited',
    });
    expect(lower(rules[1].headers)).toEqual({
      'cache-control': 'public, max-age=31536000, immutable',
    });
    expect(rules[1].detach.map((d) => d.toLowerCase())).toEqual(['x-foo']);
  });

  it('ignores comment and blank lines', () => {
    const rules = parseHeadersFile('\n# only a comment\n\n/*\n  # indented comment\n  X-A: 1\n\n');
    expect(rules).toHaveLength(1);
    expect(lower(rules[0].headers)).toEqual({ 'x-a': '1' });
  });

  it('keeps colons inside header values (e.g. CSP)', () => {
    const rules = parseHeadersFile("/*\n  Content-Security-Policy: default-src 'self'; img-src 'self' blob: data:\n");
    expect(lower(rules[0].headers)['content-security-policy']).toBe("default-src 'self'; img-src 'self' blob: data:");
  });
});

describe('headersFor', () => {
  const rules = () => parseHeadersFile(SAMPLE);

  it('returns the global COOP/COEP and the model cache header for /models/x.onnx', () => {
    const h = lower(headersFor('/models/x.onnx', rules()));
    expect(h['cross-origin-opener-policy']).toBe('same-origin');
    expect(h['cross-origin-embedder-policy']).toBe('require-corp');
    expect(h['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('detaches an inherited header with "! X-Foo"', () => {
    expect(lower(headersFor('/models/x.onnx', rules()))).not.toHaveProperty('x-foo');
    expect(lower(headersFor('/index.html', rules()))['x-foo']).toBe('inherited');
  });

  it('does not apply /models/* to other paths', () => {
    expect(lower(headersFor('/', rules()))).not.toHaveProperty('cache-control');
  });

  it('matches :placeholder for exactly one path segment', () => {
    expect(lower(headersFor('/blog/hello', rules()))['x-blog']).toBe('yes');
    expect(lower(headersFor('/blog/hello/more', rules()))).not.toHaveProperty('x-blog');
  });

  it('merges a later rule setting the same header into one comma-joined value', () => {
    const r = parseHeadersFile('/*\n  X-Multi: a\n/a/*\n  X-Multi: b\n');
    expect(lower(headersFor('/a/b', r))['x-multi']).toBe('a, b');
  });
});
