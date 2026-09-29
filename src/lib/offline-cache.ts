// Offline after first use, without a heavy service worker install.
//
// The service worker precaches only the small shell, so it activates quickly. The heavy runtime
// files (codec wasm, big JS chunks) are fetched by a tool the first time it runs, usually before
// the worker controls the page, so the worker never sees those requests. Here the page or worker
// that fetched them stores them itself, in the same caches the service worker's CacheFirst rules
// read (astro.config.mjs). Nothing is downloaded twice: wasm responses are teed into the cache as
// they stream, and JS chunks are copied from the HTTP cache (immutable /_astro/ files).

export const WASM_CACHE = 'nopload-wasm';
export const JS_CACHE = 'nopload-js';
export const HEAVY_CACHE = 'nopload-heavy';

/** The runtime cache for a same-origin path, or null if the path is not a runtime asset. */
export function cacheNameFor(path: string): string | null {
  if (/^\/_astro\/[^/]+\.wasm$/.test(path)) return WASM_CACHE;
  if (/^\/_astro\/(w\/)?[^/]+\.m?js$/.test(path)) return JS_CACHE;
  if (/^\/(models|ort|codecs)\//.test(path)) return HEAVY_CACHE;
  return null;
}

function sameOriginPath(url: string): string | null {
  try {
    const u = new URL(url, self.location.href);
    return u.origin === self.location.origin ? u.pathname : null;
  } catch {
    return null;
  }
}

async function openCache(name: string): Promise<Cache | null> {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(name);
  } catch {
    return null;
  }
}

let teeInstalled = false;

/**
 * Wraps `fetch` in this global scope: same-origin runtime assets are served from the runtime cache
 * when present, otherwise fetched and stored in it while they stream. Codec glue (Emscripten,
 * wasm-bindgen) calls the global `fetch`, so this catches its wasm without touching the libraries.
 */
export function installFetchTee(): void {
  if (teeInstalled || typeof fetch !== 'function' || typeof caches === 'undefined') return;
  teeInstalled = true;
  const original = fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = input instanceof Request ? input : new Request(input, init);
    const path = req.method === 'GET' ? sameOriginPath(req.url) : null;
    const name = path ? cacheNameFor(path) : null;
    if (!name) return original(input, init);
    const cache = await openCache(name);
    const hit = await cache?.match(req.url).catch(() => undefined);
    if (hit) return hit;
    const res = await original(input, init);
    if (res.ok && res.status === 200 && cache) void cache.put(req.url, res.clone()).catch(() => undefined);
    return res;
  };
}

const stored = new Set<string>();

/**
 * Copies the JS chunks this scope has loaded so far (Resource Timing) into the runtime cache.
 * Fire-and-forget: callers never wait for it.
 */
export function cacheLoadedModules(): void {
  if (typeof performance === 'undefined' || typeof caches === 'undefined') return;
  const urls = performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .filter((url) => {
      const path = sameOriginPath(url);
      return !!path && cacheNameFor(path) === JS_CACHE && !stored.has(url);
    });
  if (!urls.length) return;
  for (const url of urls) stored.add(url);
  void (async () => {
    const cache = await openCache(JS_CACHE);
    if (!cache) return;
    for (const url of urls) {
      try {
        if (!(await cache.match(url))) await cache.add(url);
      } catch {
        stored.delete(url); // offline or quota: try again next time
      }
    }
  })();
}

/**
 * Page side: copies the page's JS chunks into the runtime cache now and whenever more load (islands
 * and tool code are imported lazily), so a page that loaded before the service worker controlled it
 * still reloads offline. Fire-and-forget.
 */
export function cacheModulesAsLoaded(): void {
  cacheLoadedModules();
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    new PerformanceObserver(() => cacheLoadedModules()).observe({ type: 'resource', buffered: false });
  } catch {
    // Older browsers without observe({ type }): the load-time copy above still ran.
  }
}
