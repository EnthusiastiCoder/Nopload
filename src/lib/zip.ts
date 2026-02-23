// STUB written by the test-writer (WS1 replaces the bodies). See tests/unit/zip.test.ts.
export interface NamedFile {
  name: string;
  data: Uint8Array;
}

/** Throws (or rejects) on duplicate names: the caller must de-duplicate first. */
export function zipFiles(_files: NamedFile[]): Blob | Promise<Blob> {
  throw new Error('not implemented: zipFiles');
}

export function saveAll(_files: NamedFile[], _opts?: { toFolder?: boolean }): Promise<void> {
  throw new Error('not implemented: saveAll');
}
