// Per-file pipeline worker: decode, resize, encode and strip. Codec modules are imported lazily,
// so a job only loads the wasm it needs. All wasm is bundled by Vite and served from this origin.
import * as Comlink from 'comlink';
import { type SniffedType, sniffType } from '../../lib/files';
import { cacheLoadedModules, installFetchTee } from '../../lib/offline-cache';
import type { OutputFormat, Step } from './engine';
import { jpegOrientation, stripJpeg, stripPng, stripWebp } from './metadata';
import { targetSize } from './resize';

// Codec wasm fetched here is stored for offline use as it streams (see lib/offline-cache.ts).
installFetchTee();

export interface WorkerTask {
  name: string;
  data: Uint8Array;
  pipeline: Step[];
}
export interface WorkerResult {
  data: Uint8Array;
  width: number;
  height: number;
  format: OutputFormat;
}

interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const toBuf = (d: Uint8Array): ArrayBuffer => d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) as ArrayBuffer;

async function decode(data: Uint8Array, type: SniffedType): Promise<Pixels> {
  switch (type) {
    case 'jpeg': {
      const img = await (await import('@jsquash/jpeg/decode.js')).default(toBuf(data));
      return orient(img, jpegOrientation(data));
    }
    case 'png':
      return (await import('@jsquash/png/decode.js')).default(toBuf(data));
    case 'webp':
      return (await import('@jsquash/webp/decode.js')).default(toBuf(data));
    case 'avif': {
      const img = await (await import('@jsquash/avif/decode.js')).default(toBuf(data));
      if (!img) throw new Error('Could not decode this AVIF');
      return img;
    }
    case 'jxl': {
      const img = await (await import('@jsquash/jxl/decode.js')).default(toBuf(data));
      if (!img) throw new Error('Could not decode this JXL');
      return img;
    }
    case 'heic':
      return decodeHeic(data);
    case 'gif':
    case 'bmp': {
      const bmp = await createImageBitmap(new Blob([toBuf(data)]));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      return ctx.getImageData(0, 0, c.width, c.height);
    }
    default:
      throw new Error('Unsupported file type');
  }
}

async function decodeHeic(data: Uint8Array): Promise<Pixels> {
  const libheif = await (await import('libheif-js/libheif-wasm/libheif-bundle.mjs')).default();
  cacheLoadedModules(); // the 2 MB libheif chunk is not precached; store it now, not awaited
  const images = new libheif.HeifDecoder().decode(data);
  if (!images?.length) throw new Error('Could not read this HEIC file');
  const img = images[0]; // primary image only; libheif applies the rotation/mirror transforms
  const width = img.get_width();
  const height = img.get_height();
  return new Promise<Pixels>((resolve, reject) => {
    img.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (res) => {
      if (!res) reject(new Error('Could not decode this HEIC image'));
      else resolve({ data: res.data, width, height });
    });
  });
}

/** Applies an EXIF orientation (1-8) to RGBA pixels. */
function orient(img: Pixels, o: number): Pixels {
  if (o <= 1 || o > 8) return img;
  const { width: w, height: h, data: src } = img;
  const nw = o >= 5 ? h : w;
  const out = new Uint8ClampedArray(src.length);
  const s32 = new Uint32Array(src.buffer, src.byteOffset, w * h);
  const d32 = new Uint32Array(out.buffer);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let dx: number;
      let dy: number;
      switch (o) {
        case 2:
          dx = w - 1 - x;
          dy = y;
          break;
        case 3:
          dx = w - 1 - x;
          dy = h - 1 - y;
          break;
        case 4:
          dx = x;
          dy = h - 1 - y;
          break;
        case 5:
          dx = y;
          dy = x;
          break;
        case 6:
          dx = h - 1 - y;
          dy = x;
          break;
        case 7:
          dx = h - 1 - y;
          dy = w - 1 - x;
          break;
        default:
          dx = y;
          dy = w - 1 - x;
          break;
      }
      d32[dy * nw + dx] = s32[y * w + x];
    }
  }
  return { data: out, width: nw, height: o >= 5 ? w : h };
}

const toImageData = (p: Pixels) => new ImageData(p.data as Uint8ClampedArray<ArrayBuffer>, p.width, p.height);

function resize(img: Pixels, step: Extract<Step, { kind: 'resize' }>): Pixels {
  const t = targetSize({ w: img.width, h: img.height }, step.mode, { noUpscale: step.noUpscale ?? true });
  if (!t.crop && t.w === img.width && t.h === img.height) return img;
  const crop = t.crop ?? { x: 0, y: 0, w: img.width, h: img.height };
  const src = new OffscreenCanvas(img.width, img.height);
  (src.getContext('2d') as OffscreenCanvasRenderingContext2D).putImageData(toImageData(img), 0, 0);
  const dst = new OffscreenCanvas(t.w, t.h);
  const ctx = dst.getContext('2d') as OffscreenCanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, t.w, t.h);
  return ctx.getImageData(0, 0, t.w, t.h);
}

function flatten(img: Pixels, bg: [number, number, number]): Pixels {
  const d = new Uint8ClampedArray(img.data);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    if (a === 1) continue;
    for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] * a + bg[c] * (1 - a));
    d[i + 3] = 255;
  }
  return { data: d, width: img.width, height: img.height };
}

async function encode(img: Pixels, format: OutputFormat, quality: number, bg: [number, number, number]): Promise<Uint8Array> {
  const q = Math.max(1, Math.min(100, Math.round(quality)));
  switch (format) {
    case 'jpeg':
      return new Uint8Array(await (await import('@jsquash/jpeg/encode.js')).default(toImageData(flatten(img, bg)), { quality: q }));
    case 'png':
      return new Uint8Array(await (await import('@jsquash/png/encode.js')).default(toImageData(img)));
    case 'webp':
      return new Uint8Array(await (await import('@jsquash/webp/encode.js')).default(toImageData(img), { quality: q }));
    case 'avif':
      return new Uint8Array(await (await import('@jsquash/avif/encode.js')).default(toImageData(img), { quality: q }));
    case 'jxl':
      return new Uint8Array(await (await import('@jsquash/jxl/encode.js')).default(toImageData(img), { quality: q }));
  }
}

const SAME: Partial<Record<SniffedType, OutputFormat>> = { jpeg: 'jpeg', png: 'png', webp: 'webp', avif: 'avif', jxl: 'jxl' };

async function run(task: WorkerTask): Promise<WorkerResult> {
  const type = sniffType(task.data);
  if (type === 'unknown') throw new Error('Unsupported file type');
  const steps = task.pipeline;
  const hasPixels = steps.some((s) => s.kind === 'decode' || s.kind === 'resize' || s.kind === 'encode');
  const strip = steps.find((s): s is Extract<Step, { kind: 'stripMetadata' }> => s.kind === 'stripMetadata');

  if (!hasPixels) {
    // Lossless strip: no re-encode.
    let out: Uint8Array;
    if (type === 'jpeg') out = stripJpeg(task.data, { keepIcc: strip?.keepIcc, keepOrientation: strip?.keepOrientation });
    else if (type === 'png') out = stripPng(task.data);
    else if (type === 'webp') out = stripWebp(task.data);
    else throw new Error('Metadata removal supports JPEG, PNG and WebP');
    const bmp = await createImageBitmap(new Blob([toBuf(out)]));
    const { width, height } = bmp;
    bmp.close();
    return { data: out, width, height, format: type };
  }

  let img = await decode(task.data, type);
  cacheLoadedModules(); // big decoder chunks (libheif) are not precached; not awaited
  for (const s of steps) if (s.kind === 'resize') img = resize(img, s);
  const enc = steps.find((s): s is Extract<Step, { kind: 'encode' }> => s.kind === 'encode');
  const format: OutputFormat = !enc || enc.format === 'same' ? (SAME[type] ?? 'jpeg') : enc.format;
  const out = await encode(img, format, enc?.quality ?? 80, enc?.background ?? [255, 255, 255]);
  return { data: out, width: img.width, height: img.height, format };
}

Comlink.expose({
  run(task: WorkerTask) {
    return run(task).then((r) => Comlink.transfer(r, [r.data.buffer]));
  },
});
