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

const int = (n: number) => Math.max(1, Math.round(n));

function centreCrop(src: { w: number; h: number }, ar: number): CropRect {
  let w = src.w;
  let h = Math.round(w / ar);
  if (h > src.h) {
    h = src.h;
    w = Math.round(h * ar);
  }
  w = Math.max(1, Math.min(src.w, w));
  h = Math.max(1, Math.min(src.h, h));
  return { x: Math.floor((src.w - w) / 2), y: Math.floor((src.h - h) / 2), w, h };
}

/** Output size (integers >= 1) plus, for cover/aspect, the centred crop in source pixels. */
export function targetSize(
  src: { w: number; h: number },
  mode: ResizeMode,
  opts: { noUpscale?: boolean } = {},
): { w: number; h: number; crop?: CropRect } {
  const noUpscale = opts.noUpscale ?? true;
  const cap = (s: number) => (noUpscale ? Math.min(1, s) : s);
  switch (mode.kind) {
    case 'percent': {
      const s = cap(mode.p / 100);
      return { w: int(src.w * s), h: int(src.h * s) };
    }
    case 'width': {
      const s = cap(mode.w / src.w);
      return { w: int(src.w * s), h: mode.keepAspect ? int(src.h * s) : src.h };
    }
    case 'height': {
      const s = cap(mode.h / src.h);
      return { w: int(src.w * s), h: int(src.h * s) };
    }
    case 'fit': {
      const s = cap(Math.min(mode.w / src.w, mode.h / src.h));
      return { w: int(src.w * s), h: int(src.h * s) };
    }
    case 'cover': {
      const crop = centreCrop(src, mode.w / mode.h);
      const s = noUpscale ? Math.min(1, crop.w / mode.w) : 1;
      return { w: int(mode.w * s), h: int(mode.h * s), crop };
    }
    case 'aspect': {
      const [a, b] = mode.ratio.split(':').map(Number);
      const crop = centreCrop(src, a / b);
      return { w: crop.w, h: crop.h, crop };
    }
  }
}
