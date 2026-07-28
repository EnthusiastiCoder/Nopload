// Turns an image + alpha matte + editor settings into final pixels and encoded files.
// Used for the full-resolution downloads and for the batch queue.
import type { BgChoice } from './BackgroundPicker';
import { hexToRgb } from './BackgroundPicker';
import { type Background, composite, cropRgba, refineAlpha, trimToContent } from './matte';

export interface RenderSettings {
  background: BgChoice;
  /** Edge softness in full-resolution pixels (0-10). */
  softness: number;
  /** Crop to the subject (alpha > 8) plus a small margin. */
  trim: boolean;
}

export type OutputFormat = 'png' | 'jpg' | 'webp';

export const MIME_OF: Record<OutputFormat, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** Draws `bitmap` cover-fit into w x h and returns its RGBA. */
export function coverPixels(bitmap: ImageBitmap, w: number, h: number): Uint8ClampedArray {
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available.');
  const s = Math.max(w / bitmap.width, h / bitmap.height);
  const dw = bitmap.width * s;
  const dh = bitmap.height * s;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return ctx.getImageData(0, 0, w, h).data;
}

/** The background for `composite` at w x h. The blur radius scales with the image. */
export function toBackground(choice: BgChoice, w: number, h: number): Background {
  switch (choice.kind) {
    case 'transparent':
      return { kind: 'transparent' };
    case 'color':
      return { kind: 'color', rgb: hexToRgb(choice.hex) };
    case 'blur':
      return { kind: 'blur', radius: Math.max(4, Math.round(Math.max(w, h) / 80)) };
    case 'image':
      return { kind: 'image', rgba: coverPixels(choice.bitmap, w, h) };
  }
}

export interface Rendered {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Full pipeline: soften the matte, composite over the background, optionally crop to the subject. */
export function render(rgba: Uint8ClampedArray, alpha: Uint8ClampedArray, width: number, height: number, s: RenderSettings): Rendered {
  const a = s.softness > 0 ? refineAlpha(alpha, width, height, s.softness) : alpha;
  const data = composite(rgba, a, toBackground(s.background, width, height), { width, height });
  if (!s.trim) return { data, width, height };
  const pad = Math.round(Math.max(width, height) * 0.02);
  const rect = trimToContent(a, width, height, pad);
  return { data: cropRgba(data, width, rect), width: rect.width, height: rect.height };
}

export async function encode(img: Rendered, format: OutputFormat): Promise<Blob> {
  const c = new OffscreenCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available.');
  ctx.putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0);
  const quality = format === 'png' ? undefined : format === 'webp' ? 0.9 : 0.92;
  const blob = await c.convertToBlob({ type: MIME_OF[format], quality });
  if (blob.type !== MIME_OF[format]) throw new Error(`This browser cannot save ${format.toUpperCase()} files.`);
  return blob;
}

/** Decodes a file to full-resolution RGBA (EXIF orientation applied). */
export async function decodeFile(file: Blob): Promise<Rendered> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available.');
    ctx.drawImage(bitmap, 0, 0);
    return { data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}
