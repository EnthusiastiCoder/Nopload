// STUB written by the test-writer (WS1 replaces the bodies). See tests/unit/headers.test.ts.
export interface Rule {
  /** URL pattern of the block, e.g. `/*`, `/models/*` or `/blog/:slug`. */
  pattern: string;
  /** Headers set by this block (name as written in the file). */
  headers: Record<string, string>;
  /** Header names detached by `! Name` lines in this block. */
  detach: string[];
}

export function parseHeadersFile(_text: string): Rule[] {
  throw new Error('not implemented: parseHeadersFile');
}

export function headersFor(_path: string, _rules: Rule[]): Record<string, string> {
  throw new Error('not implemented: headersFor');
}
