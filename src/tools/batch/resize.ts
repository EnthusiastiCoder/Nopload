// STUB written by the test-writer (WS3 replaces the bodies). See tests/unit/resize.test.ts.
export type ResizeMode =
  | { kind: 'percent'; p: number }
  | { kind: 'width'; w: number; keepAspect: boolean }
  | { kind: 'height'; h: number }
  | { kind: 'fit'; w: number; h: number }
  | { kind: 'cover'; w: number; h: number }
  | { kind: 'aspect'; ratio: '1:1' | '4:5' | '16:9' | '3:2' };

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Output size (integers >= 1) plus, for cover/aspect, the centred crop in source pixels. */
export function targetSize(
  _src: { w: number; h: number },
  _mode: ResizeMode,
  _opts?: { noUpscale?: boolean },
): { w: number; h: number; crop?: CropRect } {
  throw new Error('not implemented: targetSize');
}
