// Lossless metadata handling: strip from JPEG/PNG/WebP without re-encoding, and summarise what a file carries.
import exifr from 'exifr';

export interface MetadataSummary {
  hasGps: boolean;
  make?: string;
  model?: string;
  dateTaken?: Date | string;
  software?: string;
}

const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Reads the Orientation tag (IFD0) from a TIFF block, or undefined. */
function tiffOrientation(t: Uint8Array): number | undefined {
  if (t.length < 14) return undefined;
  const le = t[0] === 0x49;
  const v = dv(t);
  const ifd = v.getUint32(4, le);
  if (ifd + 2 > t.length) return undefined;
  const n = v.getUint16(ifd, le);
  for (let i = 0; i < n; i++) {
    const p = ifd + 2 + i * 12;
    if (p + 12 > t.length) break;
    if (v.getUint16(p, le) === 0x0112) return v.getUint16(p + 8, le);
  }
  return undefined;
}

function orientationOnlyExif(orientation: number): Uint8Array {
  const tiff = new Uint8Array(8 + 2 + 12 + 4);
  const v = dv(tiff);
  tiff.set([0x4d, 0x4d, 0x00, 0x2a], 0);
  v.setUint32(4, 8);
  v.setUint16(8, 1);
  v.setUint16(10, 0x0112);
  v.setUint16(12, 3);
  v.setUint32(14, 1);
  v.setUint16(18, orientation);
  const payload = concat([new TextEncoder().encode('Exif\0\0'), tiff]);
  const seg = new Uint8Array(4 + payload.length);
  seg.set([0xff, 0xe1], 0);
  dv(seg).setUint16(2, payload.length + 2);
  seg.set(payload, 4);
  return seg;
}

/** EXIF orientation (1-8) of a JPEG, or 1 when absent. */
export function jpegOrientation(bytes: Uint8Array): number {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  const v = dv(bytes);
  let p = 2;
  while (p + 4 <= bytes.length && bytes[p] === 0xff) {
    const marker = bytes[p + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const len = v.getUint16(p + 2);
    if (marker === 0xe1 && ascii(bytes, p + 4, p + 10) === 'Exif\0\0') {
      return tiffOrientation(bytes.subarray(p + 10, p + 2 + len)) ?? 1;
    }
    p += 2 + len;
  }
  return 1;
}

const ascii = (b: Uint8Array, s: number, e: number) => String.fromCharCode(...b.subarray(s, e));

export function stripJpeg(bytes: Uint8Array, opts: { keepIcc?: boolean; keepOrientation?: boolean } = {}): Uint8Array {
  const keepIcc = opts.keepIcc ?? true;
  const keepOrientation = opts.keepOrientation ?? true;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('not a JPEG');
  const v = dv(bytes);
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let orientation: number | undefined;
  let p = 2;
  let rest = bytes.length;
  while (p + 4 <= bytes.length) {
    if (bytes[p] !== 0xff) throw new Error('bad JPEG marker');
    const marker = bytes[p + 1];
    if (marker === 0xff) {
      p++;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(bytes.subarray(p, p + 2));
      p += 2;
      continue;
    }
    const len = v.getUint16(p + 2);
    const end = p + 2 + len;
    const seg = bytes.subarray(p, end);
    if (marker === 0xda) {
      rest = p;
      break;
    }
    let keep = true;
    if (marker === 0xe1) {
      if (ascii(bytes, p + 4, p + 10) === 'Exif\0\0') orientation = tiffOrientation(bytes.subarray(p + 10, end));
      keep = false;
    } else if (marker === 0xe2) keep = keepIcc && ascii(bytes, p + 4, p + 16) === 'ICC_PROFILE\0';
    else if (marker === 0xed || marker === 0xfe) keep = false;
    else if (marker >= 0xe3 && marker <= 0xef && marker !== 0xee) keep = false;
    if (keep) parts.push(seg);
    p = end;
  }
  if (keepOrientation && orientation && orientation > 1 && orientation <= 8) {
    // Place right after SOI/JFIF so decoders find it early.
    parts.splice(parts.length > 1 && bytes[2] === 0xff && bytes[3] === 0xe0 ? 2 : 1, 0, orientationOnlyExif(orientation));
  }
  parts.push(bytes.subarray(rest));
  return concat(parts);
}

const PNG_DROP = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME']);

export function stripPng(bytes: Uint8Array): Uint8Array {
  const v = dv(bytes);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let p = 8;
  while (p + 12 <= bytes.length) {
    const len = v.getUint32(p);
    const type = ascii(bytes, p + 4, p + 8);
    const end = p + 12 + len;
    if (!PNG_DROP.has(type)) parts.push(bytes.subarray(p, end));
    p = end;
  }
  return concat(parts);
}

export function stripWebp(bytes: Uint8Array): Uint8Array {
  const v = dv(bytes);
  const parts: Uint8Array[] = [bytes.subarray(0, 12)];
  let p = 12;
  while (p + 8 <= bytes.length) {
    const fourcc = ascii(bytes, p, p + 4);
    const len = v.getUint32(p + 4, true);
    const end = Math.min(bytes.length, p + 8 + len + (len & 1));
    if (fourcc !== 'EXIF' && fourcc !== 'XMP ') {
      const chunk = bytes.slice(p, end);
      if (fourcc === 'VP8X') chunk[8] &= ~(0x08 | 0x04);
      parts.push(chunk);
    }
    p = end;
  }
  const out = concat(parts);
  dv(out).setUint32(4, out.length - 8, true);
  return out;
}

export async function readSummary(bytes: Uint8Array): Promise<MetadataSummary> {
  let t: Record<string, unknown> | undefined;
  try {
    t = (await exifr.parse(bytes, {
      gps: true,
      tiff: true,
      exif: true,
      xmp: false,
      icc: false,
      iptc: false,
    })) as Record<string, unknown> | undefined;
  } catch {
    t = undefined;
  }
  const str = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : undefined);
  return {
    hasGps: typeof t?.latitude === 'number' && typeof t?.longitude === 'number',
    make: str(t?.Make),
    model: str(t?.Model),
    dateTaken: (t?.DateTimeOriginal ?? t?.CreateDate) as Date | string | undefined,
    software: str(t?.Software),
  };
}

const EXIF_DATE = /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/;

/** The raw DateTimeOriginal ("YYYY:MM:DD HH:MM:SS") of a JPEG/HEIC/etc., or undefined. */
export async function readDateTaken(bytes: Uint8Array): Promise<string | undefined> {
  try {
    const t = (await exifr.parse(bytes, { pick: ['DateTimeOriginal'], reviveValues: false })) as { DateTimeOriginal?: unknown } | undefined;
    const d = typeof t?.DateTimeOriginal === 'string' ? t.DateTimeOriginal.trim() : '';
    return EXIF_DATE.test(d) ? d : undefined;
  } catch {
    return undefined;
  }
}

/**
 * An Exif APP1 segment holding only DateTimeOriginal (big-endian TIFF: IFD0 with the Exif IFD
 * pointer, Exif IFD with tag 0x9003). Nothing else: no camera, GPS or software.
 */
export function exifDateOnlyApp1(dateTimeOriginal: string): Uint8Array {
  if (!EXIF_DATE.test(dateTimeOriginal)) throw new Error('DateTimeOriginal must be "YYYY:MM:DD HH:MM:SS"');
  const tiff = new Uint8Array(64);
  const v = dv(tiff);
  tiff.set([0x4d, 0x4d], 0); // "MM"
  v.setUint16(2, 42);
  v.setUint32(4, 8); // IFD0
  v.setUint16(8, 1);
  v.setUint16(10, 0x8769); // ExifIFDPointer
  v.setUint16(12, 4); // LONG
  v.setUint32(14, 1);
  v.setUint32(18, 26);
  v.setUint32(22, 0); // no IFD1
  v.setUint16(26, 1);
  v.setUint16(28, 0x9003); // DateTimeOriginal
  v.setUint16(30, 2); // ASCII
  v.setUint32(32, 20);
  v.setUint32(36, 44);
  v.setUint32(40, 0);
  for (let i = 0; i < 19; i++) tiff[44 + i] = dateTimeOriginal.charCodeAt(i); // byte 63 stays NUL
  const seg = new Uint8Array(4 + 6 + tiff.length);
  seg.set([0xff, 0xe1], 0);
  dv(seg).setUint16(2, seg.length - 2);
  seg.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4); // "Exif\0\0"
  seg.set(tiff, 10);
  return seg;
}

/** Inserts the DateTimeOriginal-only Exif into a JPEG (after SOI and a JFIF APP0, if any). */
export function withDateTaken(jpeg: Uint8Array, dateTimeOriginal: string): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Not a JPEG');
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + dv(jpeg).getUint16(4);
  const app1 = exifDateOnlyApp1(dateTimeOriginal);
  const out = new Uint8Array(jpeg.length + app1.length);
  out.set(jpeg.subarray(0, at), 0);
  out.set(app1, at);
  out.set(jpeg.subarray(at), at + app1.length);
  return out;
}
