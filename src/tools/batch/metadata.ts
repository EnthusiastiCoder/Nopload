// STUB written by the test-writer (WS3 replaces the bodies). See tests/unit/metadata.test.ts.
export interface MetadataSummary {
  hasGps: boolean;
  make?: string;
  model?: string;
  dateTaken?: Date | string;
  software?: string;
}

export function stripJpeg(_bytes: Uint8Array, _opts?: { keepIcc?: boolean; keepOrientation?: boolean }): Uint8Array {
  throw new Error('not implemented: stripJpeg');
}

export function stripPng(_bytes: Uint8Array): Uint8Array {
  throw new Error('not implemented: stripPng');
}

export function stripWebp(_bytes: Uint8Array): Uint8Array {
  throw new Error('not implemented: stripWebp');
}

export function readSummary(_bytes: Uint8Array): Promise<MetadataSummary> {
  throw new Error('not implemented: readSummary');
}
