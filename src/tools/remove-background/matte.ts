// STUB written by the test-writer (WS2 replaces the bodies). See tests/unit/matte.test.ts.
export type Background =
  | { kind: 'transparent' }
  | { kind: 'color'; rgb: [number, number, number] }
  | { kind: 'blur'; radius: number }
  | { kind: 'image'; rgba: Uint8ClampedArray };

export interface Dims {
  width: number;
  height: number;
}

export function prepModnet(
  _rgba: Uint8Array | Uint8ClampedArray,
  _w: number,
  _h: number,
): { tensor: Float32Array; tw: number; th: number } {
  throw new Error('not implemented: prepModnet');
}

export function prepU2net(_rgba: Uint8Array | Uint8ClampedArray, _w: number, _h: number): { tensor: Float32Array; tw: number; th: number } {
  throw new Error('not implemented: prepU2net');
}

/** `matte` values are in [0,1]; the output is 0..255, bilinear, corner-aligned. */
export function upsampleMatte(_matte: Float32Array, _mw: number, _mh: number, _W: number, _H: number): Uint8ClampedArray {
  throw new Error('not implemented: upsampleMatte');
}

/** Returns a new RGBA buffer whose alpha channel is the (feathered / thresholded) matte. */
export function applyMatte(
  _rgba: Uint8ClampedArray,
  _alpha: Uint8ClampedArray,
  _opts: Dims & { softness: number; threshold?: number },
): Uint8ClampedArray {
  throw new Error('not implemented: applyMatte');
}

export function composite(_rgba: Uint8ClampedArray, _alpha: Uint8ClampedArray, _background: Background, _dims: Dims): Uint8ClampedArray {
  throw new Error('not implemented: composite');
}

export function trimToContent(
  _alpha: Uint8ClampedArray,
  _width: number,
  _height: number,
  _pad: number,
): { x: number; y: number; width: number; height: number } {
  throw new Error('not implemented: trimToContent');
}
