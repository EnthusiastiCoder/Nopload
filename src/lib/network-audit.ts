// Lists every network request the page has made (Resource Timing), for the privacy proof.
export interface RequestEntry {
  origin: string;
  url: string;
  initiatorType: string;
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return 'null';
  }
}

const toEntry = (e: PerformanceResourceTiming | PerformanceEntry): RequestEntry => ({
  origin: originOf(e.name),
  url: e.name,
  initiatorType: (e as PerformanceResourceTiming).initiatorType ?? 'other',
});

/** The document itself plus every resource entry so far. */
export function collectRequests(): RequestEntry[] {
  if (typeof performance === 'undefined') return [];
  const nav = performance.getEntriesByType('navigation').map((e) => ({ ...toEntry(e), initiatorType: 'navigation' }));
  return [...nav, ...performance.getEntriesByType('resource').map(toEntry)];
}

/** Calls `cb` with each new resource entry; returns an unsubscribe function. */
export function observeRequests(cb: (entries: RequestEntry[]) => void): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => {};
  const obs = new PerformanceObserver((list) => cb(list.getEntries().map(toEntry)));
  try {
    obs.observe({ type: 'resource', buffered: false });
  } catch {
    return () => {};
  }
  return () => obs.disconnect();
}

/** Entries whose origin differs from `selfOrigin`; `blob:` and `data:` URLs are ignored. */
export function thirdParty(entries: RequestEntry[], selfOrigin: string): RequestEntry[] {
  return entries.filter((e) => {
    if (e.url.startsWith('blob:') || e.url.startsWith('data:')) return false;
    return originOf(e.url) !== selfOrigin;
  });
}

export function groupByOrigin(entries: RequestEntry[]): Map<string, RequestEntry[]> {
  const out = new Map<string, RequestEntry[]>();
  for (const e of entries) out.set(e.origin, [...(out.get(e.origin) ?? []), e]);
  return out;
}
