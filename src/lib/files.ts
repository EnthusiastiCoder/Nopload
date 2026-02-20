// STUB written by the test-writer (WS1 replaces the bodies). See tests/unit/files.test.ts.
export type SniffedType = 'jpeg' | 'png' | 'webp' | 'avif' | 'heic' | 'jxl' | 'gif' | 'bmp' | 'unknown';

export function sniffType(_bytes: Uint8Array): SniffedType {
  throw new Error('not implemented: sniffType');
}

/**
 * Builds an output file name. `taken` holds the names already used in the same
 * batch; the function adds the returned name to it and de-duplicates with " (n)".
 */
export function outputName(
  _inputName: string,
  _opts: { suffix?: string; ext: string },
  _taken?: Set<string>,
): string {
  throw new Error('not implemented: outputName');
}

export function formatBytes(_n: number): string {
  throw new Error('not implemented: formatBytes');
}
