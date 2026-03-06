// U2.1-U2.5 MODNet pre-processing, matte upsampling, feathering, compositing and trimming.
import { describe, expect, it } from 'vitest';
import { applyMatte, composite, prepModnet, trimToContent, upsampleMatte } from '../../src/tools/remove-background/matte';
import { makeRgba } from '../helpers/images';

function solid(w: number, h: number, rgb: [number, number, number]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) out.set([...rgb, 255], i * 4);
  return out;
}

describe('prepModnet (U2.1)', () => {
  it('sizes a 4000x3000 input to 672x512 (short side 512, multiples of 32, long side <= 1024)', () => {
    const rgba = makeRgba(4000, 3000);
    const { tensor, tw, th } = prepModnet(rgba, 4000, 3000);
    expect(Math.min(tw, th)).toBe(512);
    expect(tw % 32).toBe(0);
    expect(th % 32).toBe(0);
    expect(Math.max(tw, th)).toBeLessThanOrEqual(1024);
    expect([tw, th]).toEqual([672, 512]);
    expect(tensor).toBeInstanceOf(Float32Array);
    expect(tensor.length).toBe(3 * tw * th);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < tensor.length; i++) {
      if (tensor[i] < min) min = tensor[i];
      if (tensor[i] > max) max = tensor[i];
    }
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThanOrEqual(1);
  });

  it('caps the longer side at 1024 for a very wide input', () => {
    const { tw, th } = prepModnet(makeRgba(4000, 1000), 4000, 1000);
    expect(Math.max(tw, th)).toBeLessThanOrEqual(1024);
    expect(tw % 32).toBe(0);
    expect(th % 32).toBe(0);
  });

  it('maps a white pixel to 1 and a black pixel to -1', () => {
    const white = prepModnet(solid(64, 64, [255, 255, 255]), 64, 64).tensor;
    const black = prepModnet(solid(64, 64, [0, 0, 0]), 64, 64).tensor;
    expect(white.every((v) => Math.abs(v - 1) < 1e-6)).toBe(true);
    expect(black.every((v) => Math.abs(v + 1) < 1e-6)).toBe(true);
  });

  it('lays the tensor out as NCHW (all R, then all G, then all B)', () => {
    const { tensor, tw, th } = prepModnet(solid(64, 64, [255, 0, 0]), 64, 64);
    const plane = tw * th;
    expect(tensor[0]).toBeCloseTo(1, 5);
    expect(tensor[plane - 1]).toBeCloseTo(1, 5);
    expect(tensor[plane]).toBeCloseTo(-1, 5);
    expect(tensor[2 * plane]).toBeCloseTo(-1, 5);
  });
});

describe('upsampleMatte (U2.2)', () => {
  it('upsamples [0,1;0,1] to 4x4 monotonically left to right with exact 0/255 corners', () => {
    const out = upsampleMatte(new Float32Array([0, 1, 0, 1]), 2, 2, 4, 4);
    expect(out).toBeInstanceOf(Uint8ClampedArray);
    expect(out.length).toBe(16);
    for (let y = 0; y < 4; y++) {
      for (let x = 1; x < 4; x++) expect(out[y * 4 + x]).toBeGreaterThanOrEqual(out[y * 4 + x - 1]);
    }
    expect(out[0]).toBe(0);
    expect(out[3]).toBe(255);
    expect(out[12]).toBe(0);
    expect(out[15]).toBe(255);
  });

  it('keeps a uniform matte uniform at any size', () => {
    const out = upsampleMatte(new Float32Array(4).fill(1), 2, 2, 7, 5);
    expect(out.length).toBe(35);
    expect(out.every((v) => v === 255)).toBe(true);
  });
});

describe('applyMatte (U2.3)', () => {
  const W = 40;
  const H = 40;
  const rgba = new Uint8ClampedArray(makeRgba(W, H));
  const alpha = new Uint8ClampedArray(W * H).map((_, i) => (i % W < 20 ? 255 : 0));

  it('with softness 0 copies the alpha exactly and keeps RGB', () => {
    const out = applyMatte(rgba, alpha, { width: W, height: H, softness: 0 });
    expect(out.length).toBe(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      expect(out[i * 4 + 3]).toBe(alpha[i]);
      expect(out[i * 4]).toBe(rgba[i * 4]);
      expect(out[i * 4 + 1]).toBe(rgba[i * 4 + 1]);
      expect(out[i * 4 + 2]).toBe(rgba[i * 4 + 2]);
    }
  });

  it('with softness > 0 makes edge pixels intermediate; interior stays 255 and far background 0', () => {
    const out = applyMatte(rgba, alpha, { width: W, height: H, softness: 3 });
    const a = (x: number, y: number) => out[(y * W + x) * 4 + 3];
    expect(a(19, 20)).toBeGreaterThan(0);
    expect(a(19, 20)).toBeLessThan(255);
    expect(a(20, 20)).toBeGreaterThan(0);
    expect(a(20, 20)).toBeLessThan(255);
    expect(a(5, 20)).toBe(255);
    expect(a(35, 20)).toBe(0);
  });

  it('with a threshold cuts the alpha to 0 or 255', () => {
    const ramp = new Uint8ClampedArray(W * H).map((_, i) => Math.round(((i % W) / (W - 1)) * 255));
    const out = applyMatte(rgba, ramp, { width: W, height: H, softness: 0, threshold: 128 });
    for (let i = 0; i < W * H; i++) expect(out[i * 4 + 3]).toBe(ramp[i] >= 128 ? 255 : 0);
  });
});

describe('composite (U2.4)', () => {
  const px: [number, number, number] = [10, 200, 60];
  const one = () => new Uint8ClampedArray([...px, 255]);
  const red = { kind: 'color', rgb: [255, 0, 0] } as const;
  const dims = { width: 1, height: 1 };

  it('alpha 0 over red gives pure red', () => {
    const out = composite(one(), new Uint8ClampedArray([0]), red, dims);
    expect(Array.from(out)).toEqual([255, 0, 0, 255]);
  });

  it('alpha 255 gives the original pixel', () => {
    const out = composite(one(), new Uint8ClampedArray([255]), red, dims);
    expect(Array.from(out)).toEqual([...px, 255]);
  });

  it('alpha 128 gives a 50% blend (+-1)', () => {
    const out = composite(one(), new Uint8ClampedArray([128]), red, dims);
    const t = 128 / 255;
    const expected = [px[0] * t + 255 * (1 - t), px[1] * t, px[2] * t];
    for (let c = 0; c < 3; c++) expect(Math.abs(out[c] - expected[c])).toBeLessThanOrEqual(1);
    expect(out[3]).toBe(255);
  });

  it('transparent background keeps the alpha as the output alpha', () => {
    const out = composite(one(), new Uint8ClampedArray([77]), { kind: 'transparent' }, dims);
    expect(out[3]).toBe(77);
  });
});

describe('trimToContent (U2.5)', () => {
  const W = 100;
  const H = 80;
  function alphaWithBox(x0: number, y0: number, x1: number, y1: number): Uint8ClampedArray {
    const a = new Uint8ClampedArray(W * H);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a[y * W + x] = 200;
    return a;
  }

  it('returns the bounding box of alpha > 8 plus the padding', () => {
    const a = alphaWithBox(20, 10, 39, 29);
    a[70 * W + 90] = 8; // not > 8: ignored
    expect(trimToContent(a, W, H, 5)).toEqual({ x: 15, y: 5, width: 30, height: 30 });
  });

  it('counts a pixel with alpha 9', () => {
    const a = alphaWithBox(20, 10, 39, 29);
    a[70 * W + 90] = 9;
    expect(trimToContent(a, W, H, 0)).toEqual({ x: 20, y: 10, width: 71, height: 61 });
  });

  it('clamps the padded box to the image', () => {
    const a = alphaWithBox(2, 3, 97, 78);
    expect(trimToContent(a, W, H, 10)).toEqual({ x: 0, y: 0, width: W, height: H });
  });
});
