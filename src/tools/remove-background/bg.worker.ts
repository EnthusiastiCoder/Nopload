/// <reference lib="webworker" />
// Background-removal worker: decodes the image, runs the matting model with onnxruntime-web and
// returns the full-resolution RGBA plus a full-resolution alpha matte. One ORT module and one
// session per model are kept warm for batch use.
//
// Backends: the CPU path uses ORT's plain SIMD/threaded WASM build. WebGPU uses the JSPI build
// (Chromium), only when an adapter exists and the engine supports JSPI: ORT's JSEP and asyncify
// builds are over the Cloudflare Pages 25 MiB per-file cap, so they are not shipped.
import * as Comlink from 'comlink';
import type * as OrtNs from 'onnxruntime-web';
import { cacheLoadedModules } from '../../lib/offline-cache';
import { guideFromModnetTensor, modnetSize, normalizeMinMax, prepModnet, prepU2net, refineMatte, U2NET_SIZE } from './matte';

export type ModelKind = 'person' | 'object';
export type Backend = 'webgpu' | 'wasm';

export type Progress =
  | { stage: 'loading-model'; loaded: number; total: number }
  | { stage: 'decoding' }
  | { stage: 'inference' }
  | { stage: 'compositing' };

export interface BgResult {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  alpha: Uint8ClampedArray;
  backend: Backend;
}

type Ort = typeof OrtNs;

/** Inference never runs on more than this many pixels; output always stays at full resolution. */
const MAX_INFER_PIXELS = 40_000_000;

const MODELS: Record<ModelKind, Record<Backend, string>> = {
  person: { wasm: '/models/modnet/model_quantized.onnx', webgpu: '/models/modnet/model_fp16.onnx' },
  object: { wasm: '/models/u2netp/u2netp.onnx', webgpu: '/models/u2netp/u2netp.onnx' },
};

let ortPromise: Promise<{ ort: Ort; backend: Backend }> | null = null;
let forceWasm = false;
const sessions = new Map<ModelKind, Promise<OrtNs.InferenceSession>>();

async function webgpuUsable(): Promise<boolean> {
  if (forceWasm) return false;
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu || !('Suspending' in WebAssembly)) return false;
  try {
    return (await gpu.requestAdapter()) != null;
  } catch {
    return false;
  }
}

function loadOrt(): Promise<{ ort: Ort; backend: Backend }> {
  ortPromise ??= (async () => {
    const backend: Backend = (await webgpuUsable()) ? 'webgpu' : 'wasm';
    const ort: Ort = backend === 'webgpu' ? await import('onnxruntime-web/jspi') : await import('onnxruntime-web/wasm');
    ort.env.wasm.wasmPaths = '/ort/';
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1)) : 1;
    ort.env.wasm.proxy = false;
    const base = backend === 'webgpu' ? '/ort/ort-wasm-simd-threaded.jspi' : '/ort/ort-wasm-simd-threaded';
    void cacheRuntime([`${base}.mjs`, `${base}.wasm`]);
    cacheLoadedModules(); // the ORT JS chunk is worker-only, so it is not precached; not awaited
    return { ort, backend };
  })();
  return ortPromise;
}

/** Same cache the service worker's CacheFirst rule reads for /models/ and /ort/ (astro.config.mjs). */
const HEAVY_CACHE = 'nopload-heavy';

async function heavyCache(): Promise<Cache | null> {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(HEAVY_CACHE);
  } catch {
    return null;
  }
}

/**
 * The first visit runs before the service worker controls the page, so nothing would be cached
 * for offline use. Store the runtime files ourselves (the service worker reads the same cache).
 */
async function cacheRuntime(urls: string[]): Promise<void> {
  const cache = await heavyCache();
  if (!cache) return;
  for (const url of urls) {
    try {
      if (!(await cache.match(url))) await cache.add(url);
    } catch {
      // Offline or quota: the app still works online.
    }
  }
}

/** Fetches a model with streaming progress, from the offline cache when it is there. */
async function fetchModel(url: string, onProgress?: (p: Progress) => void): Promise<Uint8Array> {
  const cache = await heavyCache();
  let res = (await cache?.match(url).catch(() => undefined)) ?? null;
  if (!res) {
    res = await fetch(url);
    if (res.ok && cache) void cache.put(url, res.clone()).catch(() => undefined);
  }
  if (!res.ok || !res.body) throw new Error(`Could not load the model (${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  onProgress?.({ stage: 'loading-model', loaded, total });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.({ stage: 'loading-model', loaded, total });
  }
  const out = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

let backendInUse: Backend = 'wasm';

function getSession(kind: ModelKind, onProgress?: (p: Progress) => void): Promise<OrtNs.InferenceSession> {
  let s = sessions.get(kind);
  if (!s) {
    s = (async () => {
      const { ort, backend } = await loadOrt();
      if (backend === 'webgpu') {
        try {
          const bytes = await fetchModel(MODELS[kind].webgpu, onProgress);
          const session = await ort.InferenceSession.create(bytes, { executionProviders: ['webgpu'], graphOptimizationLevel: 'all' });
          backendInUse = 'webgpu';
          return session;
        } catch (err) {
          console.warn('WebGPU session failed, falling back to WASM', err);
        }
      }
      const bytes = await fetchModel(MODELS[kind].wasm, onProgress);
      const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      backendInUse = 'wasm';
      return session;
    })();
    sessions.set(kind, s);
    s.catch(() => sessions.delete(kind));
  }
  return s;
}

/** Draws `bitmap` resized to tw x th (browser high-quality resampling) and returns its RGBA. */
function resized(bitmap: ImageBitmap, tw: number, th: number): Uint8ClampedArray {
  const c = new OffscreenCanvas(tw, th);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is not available in this browser.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, tw, th);
  return ctx.getImageData(0, 0, tw, th).data;
}

function fullPixels(bitmap: ImageBitmap): Uint8ClampedArray {
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is not available in this browser.');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
}

/** Grey guide in [0,1] from small RGBA pixels. */
function greyGuide(rgba: Uint8ClampedArray, n: number): Float32Array {
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) g[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255;
  return g;
}

/** Guided-filter settings: a wider window when the matte is stretched further. */
function refineOpts(W: number, mw: number): { radius: number; eps: number } {
  return W / mw > 3 ? { radius: 4, eps: 1e-3 } : { radius: 2, eps: 1e-4 };
}

const api = {
  /** Loads the runtime and the model ahead of time. Returns the backend that will be used. */
  async warm(kind: ModelKind, onProgress?: (p: Progress) => void): Promise<Backend> {
    await getSession(kind, onProgress);
    return backendInUse;
  },

  async process(blob: Blob, kind: ModelKind, onProgress?: (p: Progress) => void): Promise<BgResult> {
    const sessionP = getSession(kind, onProgress);
    onProgress?.({ stage: 'decoding' });
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    try {
      const W = bitmap.width;
      const H = bitmap.height;
      const session = await sessionP;
      const { ort } = await loadOrt();
      onProgress?.({ stage: 'inference' });

      let small: Uint8ClampedArray;
      let tw: number;
      let th: number;
      let tensorData: Float32Array;
      if (kind === 'person') {
        // Very large inputs are first shrunk for inference only (modnetSize caps the side anyway).
        const scale = W * H > MAX_INFER_PIXELS ? Math.sqrt(MAX_INFER_PIXELS / (W * H)) : 1;
        ({ tw, th } = modnetSize(Math.round(W * scale), Math.round(H * scale)));
        small = resized(bitmap, tw, th);
        tensorData = prepModnet(small, tw, th).tensor; // identity resample: already tw x th
      } else {
        tw = U2NET_SIZE;
        th = U2NET_SIZE;
        small = resized(bitmap, tw, th);
        tensorData = prepU2net(small, tw, th).tensor;
      }

      const input = new ort.Tensor('float32', tensorData, [1, 3, th, tw]);
      const out = await session.run({ [session.inputNames[0]]: input });
      const o = out[session.outputNames[0]];
      const [mh, mw] = o.dims.slice(-2) as [number, number];
      let matte = o.data instanceof Float32Array ? o.data : Float32Array.from(o.data as ArrayLike<number>);
      if (kind === 'object') matte = normalizeMinMax(matte);
      input.dispose();
      for (const t of Object.values(out)) t.dispose?.();

      const rgba = fullPixels(bitmap);
      const guide = kind === 'person' ? guideFromModnetTensor(tensorData, tw, th) : greyGuide(small, tw * th);
      const alpha = refineMatte(matte, mw, mh, guide, rgba, W, H, refineOpts(W, mw));
      const result: BgResult = { width: W, height: H, rgba, alpha, backend: backendInUse };
      return Comlink.transfer(result, [rgba.buffer, alpha.buffer]);
    } finally {
      bitmap.close();
    }
  },

  /** Drops every session and forces the WASM path (used when WebGPU misbehaves). */
  useWasmOnly(): void {
    forceWasm = true;
    ortPromise = null;
    sessions.clear();
  },
};

export type BgApi = typeof api;

Comlink.expose(api);
