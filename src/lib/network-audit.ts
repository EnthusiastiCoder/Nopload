// STUB written by the test-writer (WS1 replaces the bodies). See tests/unit/network-audit.test.ts.
export interface RequestEntry {
  origin: string;
  url: string;
  initiatorType: string;
}

export function collectRequests(): RequestEntry[] {
  throw new Error('not implemented: collectRequests');
}

/** Entries whose origin differs from `selfOrigin`; `blob:` and `data:` URLs are ignored. */
export function thirdParty(_entries: RequestEntry[], _selfOrigin: string): RequestEntry[] {
  throw new Error('not implemented: thirdParty');
}
