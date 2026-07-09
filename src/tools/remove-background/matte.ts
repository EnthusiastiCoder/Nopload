// Pure image maths for the background remover: model pre-processing, matte upsampling and
// edge refinement, feathering, compositing and trimming. No DOM, no workers: unit tested in Node.

export type Background =
  | { kind: 'transparent' }
  | { kind: 'color'; rgb: readonly [number, number, number] }
  | { kind: 'blur'; radius: number }
  | { kind: 'image'; rgba: Uint8Array | Uint8ClampedArray };

export interface Dims {
  width: number;
  height: number;
}

type Pixels = Uint8Array | Uint8ClampedArray;

const MODNET_SHORT = 512;
const MODNET_LONG_MAX = 1024;
const MODNET_STEP = 32;
export const U2NET_SIZE = 320;

/** MODNet input size: shorter side 512, both sides multiples of 32, longer side <= 1024. */
export function modnetSize(w: number, h: number): { tw: number; th: number } {
  let scale = MODNET_SHORT / Math.min(w, h);
  if (Math.max(w, h) * scale > MODNET_LONG_MAX) scale = MODNET_LONG_MAX / Math.max(w, h);
  // The epsilon absorbs float error: 3336 * (512 / 3336) is 511.99..., which must still snap to 512.
  const snap = (v: number) => Math.max(MODNET_STEP, Math.floor((v * scale) / MODNET_STEP + 1e-6) * MODNET_STEP);
  return { tw: snap(w), th: snap(h) };
}

// ------------------------------------------------------------------ resampling

/** Per-output-index source taps for one axis: area averaging when shrinking, bilinear when growing. */
function axisTaps(src: number, dst: number): { idx: Int32Array; wt: Float32Array; start: Int32Array } {
  const scale = src / dst;
  const lists: { i: number; w: number }[][] = [];
  for (let o = 0; o < dst; o++) {
    const taps: { i: number; w: number }[] = [];
    if (scale > 1) {
      const a = o * scale;
      const b = a + scale;
      for (let i = Math.floor(a); i < Math.ceil(b) && i < src; i++) {
        const w = Math.min(b, i + 1) - Math.max(a, i);
        if (w > 1e-9) taps.push({ i, w });
      }
    } else {
      const c = Math.min(src - 1, Math.max(0, (o + 0.5) * scale - 0.5));
      const i0 = Math.floor(c);
      const f = c - i0;
      taps.push({ i: i0, w: 1 - f });
      if (f > 0 && i0 + 1 < src) taps.push({ i: i0 + 1, w: f });
    }
    const sum = taps.reduce((s, t) => s + t.w, 0);
    for (const t of taps) t.w /= sum;
    lists.push(taps);
  }
  const total = lists.reduce((s, l) => s + l.length, 0);
  const idx = new Int32Array(total);
  const wt = new Float32Array(total);
  const start = new Int32Array(dst + 1);
  let k = 0;
  lists.forEach((l, o) => {
    start[o] = k;
    for (const t of l) {
      idx[k] = t.i;
      wt[k] = t.w;
      k++;
    }
  });
  start[dst] = k;
  return { idx, wt, start };
}

/** Resamples RGB(A) pixels to tw x th as float RGB planes (0..255), separable, area/bilinear. */
export function resampleRgbPlanes(rgba: Pixels, w: number, h: number, tw: number, th: number): Float32Array {
  const plane = tw * th;
  const out = new Float32Array(3 * plane);
  if (w === tw && h === th) {
    for (let i = 0; i < plane; i++) {
      out[i] = rgba[i * 4];
      out[plane + i] = rgba[i * 4 + 1];
      out[2 * plane + i] = rgba[i * 4 + 2];
    }
    return out;
  }
  const xs = axisTaps(w, tw);
  const ys = axisTaps(h, th);
  // Horizontal pass: h rows x tw columns x 3 channels.
  const tmp = new Float32Array(h * tw * 3);
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < tw; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = xs.start[x]; k < xs.start[x + 1]; k++) {
        const p = row + xs.idx[k] * 4;
        const wk = xs.wt[k];
        r += rgba[p] * wk;
        g += rgba[p + 1] * wk;
        b += rgba[p + 2] * wk;
      }
      const t = (y * tw + x) * 3;
      tmp[t] = r;
      tmp[t + 1] = g;
      tmp[t + 2] = b;
    }
  }
  // Vertical pass into planes.
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = ys.start[y]; k < ys.start[y + 1]; k++) {
        const t = (ys.idx[k] * tw + x) * 3;
        const wk = ys.wt[k];
        r += tmp[t] * wk;
        g += tmp[t + 1] * wk;
        b += tmp[t + 2] * wk;
      }
      const o = y * tw + x;
      out[o] = r;
      out[plane + o] = g;
      out[2 * plane + o] = b;
    }
  }
  return out;
}

// ------------------------------------------------------------------ model inputs

/** MODNet input: RGB resized to `modnetSize`, normalised to [-1,1] ((x/255-0.5)/0.5), NCHW float32. */
export function prepModnet(rgba: Pixels, w: number, h: number): { tensor: Float32Array; tw: number; th: number } {
  const { tw, th } = modnetSize(w, h);
  const tensor = resampleRgbPlanes(rgba, w, h, tw, th);
  for (let i = 0; i < tensor.length; i++) {
    const v = tensor[i] / 127.5 - 1;
    tensor[i] = Math.max(-1, Math.min(1, v));
  }
  return { tensor, tw, th };
}

const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];

/** U2-Net input: RGB resized to 320x320, ImageNet mean/std normalised, NCHW float32. */
export function prepU2net(rgba: Pixels, w: number, h: number): { tensor: Float32Array; tw: number; th: number } {
  const tw = U2NET_SIZE;
  const th = U2NET_SIZE;
  const tensor = resampleRgbPlanes(rgba, w, h, tw, th);
  const plane = tw * th;
  for (let c = 0; c < 3; c++) {
    for (let i = c * plane; i < (c + 1) * plane; i++) tensor[i] = (tensor[i] / 255 - IMAGENET_MEAN[c]) / IMAGENET_STD[c];
  }
  return { tensor, tw, th };
}

/** Min-max normalises a raw model output in place to [0,1] (U2-Net's d1). */
export function normalizeMinMax(values: Float32Array): Float32Array {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  for (let i = 0; i < values.length; i++) values[i] = (values[i] - min) / span;
  return values;
}

// ------------------------------------------------------------------ matte upsampling

/** `matte` values are in [0,1]; the output is 0..255, bilinear, corner-aligned. */
export function upsampleMatte(matte: Float32Array, mw: number, mh: number, W: number, H: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H);
  const sx = W > 1 ? (mw - 1) / (W - 1) : 0;
  const sy = H > 1 ? (mh - 1) / (H - 1) : 0;
  const x0s = new Int32Array(W);
  const fxs = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const fx = x * sx;
    x0s[x] = Math.min(mw - 1, Math.floor(fx));
    fxs[x] = fx - x0s[x];
  }
  for (let y = 0; y < H; y++) {
    const fy = y * sy;
    const y0 = Math.min(mh - 1, Math.floor(fy));
    const y1 = Math.min(mh - 1, y0 + 1);
    const wy = fy - y0;
    const r0 = y0 * mw;
    const r1 = y1 * mw;
    const o = y * W;
    for (let x = 0; x < W; x++) {
      const x0 = x0s[x];
      const x1 = Math.min(mw - 1, x0 + 1);
      const wx = fxs[x];
      const top = matte[r0 + x0] + (matte[r0 + x1] - matte[r0 + x0]) * wx;
      const bot = matte[r1 + x0] + (matte[r1 + x1] - matte[r1 + x0]) * wx;
      out[o + x] = Math.round((top + (bot - top) * wy) * 255);
    }
  }
  return out;
}

/** Bilinear (corner-aligned) float upsample of one plane. */
function upsamplePlane(src: Float32Array, sw: number, sh: number, W: number, H: number, y: number, row: Float32Array): void {
  const sx = W > 1 ? (sw - 1) / (W - 1) : 0;
  const fy = H > 1 ? (y * (sh - 1)) / (H - 1) : 0;
  const y0 = Math.min(sh - 1, Math.floor(fy));
  const y1 = Math.min(sh - 1, y0 + 1);
  const wy = fy - y0;
  for (let x = 0; x < W; x++) {
    const fx = x * sx;
    const x0 = Math.min(sw - 1, Math.floor(fx));
    const x1 = Math.min(sw - 1, x0 + 1);
    const wx = fx - x0;
    const top = src[y0 * sw + x0] + (src[y0 * sw + x1] - src[y0 * sw + x0]) * wx;
    const bot = src[y1 * sw + x0] + (src[y1 * sw + x1] - src[y1 * sw + x0]) * wx;
    row[x] = top + (bot - top) * wy;
  }
}

/** Box mean of a float plane with radius r (edge-normalised), via running sums. */
function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let acc = 0;
    for (let x = 0; x <= Math.min(r, w - 1); x++) acc += src[o + x];
    for (let x = 0; x < w; x++) {
      const lo = Math.max(0, x - r);
      const hi = Math.min(w - 1, x + r);
      tmp[o + x] = acc / (hi - lo + 1);
      if (x + r + 1 < w) acc += src[o + x + r + 1];
      if (x - r >= 0) acc -= src[o + x - r];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = 0; y <= Math.min(r, h - 1); y++) acc += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      const lo = Math.max(0, y - r);
      const hi = Math.min(h - 1, y + r);
      out[y * w + x] = acc / (hi - lo + 1);
      if (y + r + 1 < h) acc += tmp[(y + r + 1) * w + x];
      if (y - r >= 0) acc -= tmp[(y - r) * w + x];
    }
  }
  return out;
}

/**
 * Upsamples a low-resolution matte to full resolution with a fast guided filter (He & Sun 2015):
 * the linear coefficients are fitted at matte resolution against a grey guide made from the model
 * input, then upsampled and applied to the full-resolution grey image, so fine edges (hair) follow
 * the real photo instead of a blurry bilinear ramp. Flat regions (pure 0 or 1) are unchanged.
 *
 * `guideLow` is the grey guide at matte resolution in [0,1]; `rgba` is the full-resolution image.
 */
export function refineMatte(
  matte: Float32Array,
  mw: number,
  mh: number,
  guideLow: Float32Array,
  rgba: Pixels,
  W: number,
  H: number,
  opts: { radius?: number; eps?: number } = {},
): Uint8ClampedArray {
  const r = opts.radius ?? 2;
  const eps = opts.eps ?? 1e-4;
  const n = mw * mh;
  const ip = new Float32Array(n);
  const ii = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    ip[i] = guideLow[i] * matte[i];
    ii[i] = guideLow[i] * guideLow[i];
  }
  const mI = boxMean(guideLow, mw, mh, r);
  const mP = boxMean(matte, mw, mh, r);
  const mIP = boxMean(ip, mw, mh, r);
  const mII = boxMean(ii, mw, mh, r);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const cov = mIP[i] - mI[i] * mP[i];
    const v = mII[i] - mI[i] * mI[i];
    a[i] = cov / (v + eps);
    b[i] = mP[i] - a[i] * mI[i];
  }
  const mA = boxMean(a, mw, mh, r);
  const mB = boxMean(b, mw, mh, r);
  const out = new Uint8ClampedArray(W * H);
  const rowA = new Float32Array(W);
  const rowB = new Float32Array(W);
  for (let y = 0; y < H; y++) {
    upsamplePlane(mA, mw, mh, W, H, y, rowA);
    upsamplePlane(mB, mw, mh, W, H, y, rowB);
    const o = y * W;
    for (let x = 0; x < W; x++) {
      const p = (o + x) * 4;
      const g = (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) / 255;
      out[o + x] = Math.round((rowA[x] * g + rowB[x]) * 255);
    }
  }
  return out;
}

/** Grey guide in [0,1] from a normalised MODNet tensor ([-1,1] NCHW planes). */
export function guideFromModnetTensor(tensor: Float32Array, tw: number, th: number): Float32Array {
  const plane = tw * th;
  const g = new Float32Array(plane);
  for (let i = 0; i < plane; i++) {
    g[i] = (0.299 * tensor[i] + 0.587 * tensor[plane + i] + 0.114 * tensor[2 * plane + i] + 1) / 2;
  }
  return g;
}

// ------------------------------------------------------------------ blur helpers

/** In-place box blur of one interleaved channel (stride/offset), radius r, edge-clamped, one pass. */
function boxBlurChannel(data: Pixels | Float32Array, w: number, h: number, r: number, stride: number, offset: number): void {
  if (r < 1) return;
  const line = new Float32Array(Math.max(w, h));
  const win = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const base = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += data[(base + Math.min(w - 1, Math.max(0, k))) * stride + offset];
    for (let x = 0; x < w; x++) {
      line[x] = acc / win;
      const add = Math.min(w - 1, x + r + 1);
      const sub = Math.max(0, x - r);
      acc += data[(base + add) * stride + offset] - data[(base + sub) * stride + offset];
    }
    for (let x = 0; x < w; x++) data[(base + x) * stride + offset] = line[x];
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += data[(Math.min(h - 1, Math.max(0, k)) * w + x) * stride + offset];
    for (let y = 0; y < h; y++) {
      line[y] = acc / win;
      const add = Math.min(h - 1, y + r + 1);
      const sub = Math.max(0, y - r);
      acc += data[(add * w + x) * stride + offset] - data[(sub * w + x) * stride + offset];
    }
    for (let y = 0; y < h; y++) data[(y * w + x) * stride + offset] = line[y];
  }
}

/** Approximate Gaussian blur of an RGBA image (three box passes per channel). Returns a new buffer. */
export function blurRgba(rgba: Pixels, w: number, h: number, radius: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  const r = Math.max(1, Math.round(radius / 2));
  for (let c = 0; c < 3; c++) for (let p = 0; p < 3; p++) boxBlurChannel(out, w, h, r, 4, c);
  return out;
}

// ------------------------------------------------------------------ alpha + compositing

/** Feathers (box blur, two passes) and/or hard-thresholds an alpha mask. Returns a new mask. */
export function refineAlpha(alpha: Pixels, w: number, h: number, softness: number, threshold?: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(alpha);
  if (threshold !== undefined) for (let i = 0; i < out.length; i++) out[i] = out[i] >= threshold ? 255 : 0;
  if (softness > 0) {
    const r = Math.max(1, Math.round(softness / 2));
    const f = Float32Array.from(out);
    boxBlurChannel(f, w, h, r, 1, 0);
    boxBlurChannel(f, w, h, r, 1, 0);
    for (let i = 0; i < out.length; i++) out[i] = Math.round(f[i]);
  }
  return out;
}

/** Returns a new RGBA buffer whose alpha channel is the (feathered / thresholded) matte. */
export function applyMatte(
  rgba: Uint8ClampedArray,
  alpha: Uint8ClampedArray,
  opts: Dims & { softness: number; threshold?: number },
): Uint8ClampedArray {
  const a = refineAlpha(alpha, opts.width, opts.height, opts.softness, opts.threshold);
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < a.length; i++) out[i * 4 + 3] = a[i];
  return out;
}

/** Puts the cut-out over a background. Transparent keeps the alpha; every other kind is opaque. */
export function composite(rgba: Uint8ClampedArray, alpha: Uint8ClampedArray, background: Background, dims: Dims): Uint8ClampedArray {
  const n = dims.width * dims.height;
  const out = new Uint8ClampedArray(n * 4);
  if (background.kind === 'transparent') {
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      out[p] = rgba[p];
      out[p + 1] = rgba[p + 1];
      out[p + 2] = rgba[p + 2];
      out[p + 3] = alpha[i];
    }
    return out;
  }
  let bg: Pixels | null = null;
  if (background.kind === 'blur') bg = blurRgba(rgba, dims.width, dims.height, background.radius);
  else if (background.kind === 'image') bg = background.rgba;
  const solid = background.kind === 'color' ? background.rgb : null;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const t = alpha[i] / 255;
    const u = 1 - t;
    for (let c = 0; c < 3; c++) {
      const b = solid ? solid[c] : (bg as Pixels)[p + c];
      out[p + c] = Math.round(rgba[p + c] * t + b * u);
    }
    out[p + 3] = 255;
  }
  return out;
}

/** Bounding box of alpha > 8, grown by `pad` and clamped to the image. An empty mask gives the full image. */
export function trimToContent(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  pad: number,
): { x: number; y: number; width: number; height: number } {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const o = y * width;
    for (let x = 0; x < width; x++) {
      if (alpha[o + x] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, width, height };
  const left = Math.max(0, x0 - pad);
  const top = Math.max(0, y0 - pad);
  const right = Math.min(width - 1, x1 + pad);
  const bottom = Math.min(height - 1, y1 + pad);
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** Crops an RGBA buffer to a rectangle. */
export function cropRgba(rgba: Pixels, width: number, rect: { x: number; y: number; width: number; height: number }): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) {
    const s = ((rect.y + y) * width + rect.x) * 4;
    out.set(rgba.subarray(s, s + rect.width * 4), y * rect.width * 4);
  }
  return out;
}
