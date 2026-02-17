// Synthetic, deterministic test images built in Node. No third-party image
// content is used, so these need no licence entry in tests/fixtures/README.md.
// Shared by the unit tests (tests/unit) and the e2e tests (tests/e2e).
import { deflateSync } from 'node:zlib';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

/** Deterministic RGBA: a colour gradient with a little pseudo-random noise. */
export function makeRgba(w: number, h: number, seed = 1): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s & 0xff;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const n = (rnd() & 0x1f) - 16;
      out[i] = clamp((x / Math.max(1, w - 1)) * 255 + n);
      out[i + 1] = clamp((y / Math.max(1, h - 1)) * 255 + n);
      out[i + 2] = clamp(((x + y) / Math.max(1, w + h - 2)) * 255 - n);
      out[i + 3] = 255;
    }
  }
  return out;
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

export function makeJpeg(w: number, h: number, quality = 95, seed = 1): Buffer {
  const data = Buffer.from(makeRgba(w, h, seed));
  return Buffer.from(jpeg.encode({ data, width: w, height: h }, quality).data);
}

export function makePng(
  w: number,
  h: number,
  opts: { seed?: number; transparent?: boolean; colorType?: 2 | 6 } = {},
): Buffer {
  const png = new PNG({ width: w, height: h });
  png.data = Buffer.from(makeRgba(w, h, opts.seed ?? 1));
  if (opts.transparent) {
    // Fully transparent border (outer 20%), opaque centre.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const inside = x > w * 0.2 && x < w * 0.8 && y > h * 0.2 && y < h * 0.8;
        png.data[(y * w + x) * 4 + 3] = inside ? 255 : 0;
      }
    }
  }
  return PNG.sync.write(png, { colorType: opts.colorType ?? 6 });
}

// ---------------------------------------------------------------- CRC / bytes

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const ascii = (s: string) => Buffer.from(s, 'latin1');

// ---------------------------------------------------------------- TIFF / Exif

type Entry = { tag: number; type: number; count: number; data: Buffer };

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 };

function asciiEntry(tag: number, s: string): Entry {
  const data = Buffer.concat([ascii(s), Buffer.from([0])]);
  return { tag, type: 2, count: data.length, data };
}
function shortEntry(tag: number, v: number): Entry {
  const data = Buffer.alloc(2);
  data.writeUInt16LE(v);
  return { tag, type: 3, count: 1, data };
}
function longEntry(tag: number, v: number): Entry {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(v);
  return { tag, type: 4, count: 1, data };
}
function rationalEntry(tag: number, values: [number, number][]): Entry {
  const data = Buffer.alloc(8 * values.length);
  values.forEach(([n, d], i) => {
    data.writeUInt32LE(n, i * 8);
    data.writeUInt32LE(d, i * 8 + 4);
  });
  return { tag, type: 5, count: values.length, data };
}

function ifdSize(entries: Entry[]): number {
  const extra = entries.reduce((a, e) => a + (e.data.length > 4 ? e.data.length + (e.data.length & 1) : 0), 0);
  return 2 + entries.length * 12 + 4 + extra;
}

function writeIfd(entries: Entry[], start: number): Buffer {
  const sorted = [...entries].sort((a, b) => a.tag - b.tag);
  const head = Buffer.alloc(2 + sorted.length * 12 + 4);
  head.writeUInt16LE(sorted.length, 0);
  const tail: Buffer[] = [];
  let dataOff = start + head.length;
  sorted.forEach((e, i) => {
    const p = 2 + i * 12;
    head.writeUInt16LE(e.tag, p);
    head.writeUInt16LE(e.type, p + 2);
    head.writeUInt32LE(e.count, p + 4);
    if (e.data.length <= 4) {
      e.data.copy(head, p + 8);
    } else {
      head.writeUInt32LE(dataOff, p + 8);
      const padded = e.data.length & 1 ? Buffer.concat([e.data, Buffer.from([0])]) : e.data;
      tail.push(padded);
      dataOff += padded.length;
    }
  });
  head.writeUInt32LE(0, head.length - 4); // no next IFD
  return Buffer.concat([head, ...tail]);
}

export const GPS_EXIF = {
  make: 'NoploadCam',
  model: 'Test Model 1',
  orientation: 6,
  latitude: 52.37,
  longitude: 4.89,
  dateTimeOriginal: '2026:11:01 12:34:56',
  software: 'NoploadFixtureWriter',
};

/** A little-endian TIFF block with IFD0 (Make, Model, Orientation, Software), Exif IFD and GPS IFD. */
export function buildTiff(opts: { orientation?: number; gps?: boolean } = {}): Buffer {
  const orientation = opts.orientation ?? GPS_EXIF.orientation;
  const exifEntries = [asciiEntry(0x9003, GPS_EXIF.dateTimeOriginal)];
  const gpsEntries = [
    asciiEntry(0x0001, 'N'),
    rationalEntry(0x0002, [[52, 1], [22, 1], [1200, 100]]),
    asciiEntry(0x0003, 'E'),
    rationalEntry(0x0004, [[4, 1], [53, 1], [2400, 100]]),
  ];
  const ifd0Base = [
    asciiEntry(0x010f, GPS_EXIF.make),
    asciiEntry(0x0110, GPS_EXIF.model),
    shortEntry(0x0112, orientation),
    asciiEntry(0x0131, GPS_EXIF.software),
    longEntry(0x8769, 0),
    ...(opts.gps === false ? [] : [longEntry(0x8825, 0)]),
  ];
  const ifd0Start = 8;
  const exifStart = ifd0Start + ifdSize(ifd0Base);
  const gpsStart = exifStart + ifdSize(exifEntries);
  const ifd0 = ifd0Base.map((e) =>
    e.tag === 0x8769 ? longEntry(0x8769, exifStart) : e.tag === 0x8825 ? longEntry(0x8825, gpsStart) : e,
  );
  const header = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
  return Buffer.concat([
    header,
    writeIfd(ifd0, ifd0Start),
    writeIfd(exifEntries, exifStart),
    ...(opts.gps === false ? [] : [writeIfd(gpsEntries, gpsStart)]),
  ]);
}

// ---------------------------------------------------------------- JPEG

function jpegSegment(marker: number, payload: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head[0] = 0xff;
  head[1] = marker;
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

export const FAKE_ICC = Buffer.concat([ascii('ICC_PROFILE\0'), Buffer.from([1, 1]), Buffer.alloc(128, 0x42)]);

/**
 * gps.jpg equivalent: a real (decodable) baseline JPEG with
 * APP0 JFIF, APP1 Exif (Make/Model/Orientation 6/GPS/DateTimeOriginal),
 * APP1 XMP, APP2 ICC, APP13 IPTC and a COM segment.
 */
export function buildGpsJpeg(w = 64, h = 48): Buffer {
  const base = makeJpeg(w, h, 90, 7);
  // base = SOI, APP0 (JFIF, written by jpeg-js), then the rest.
  if (base[2] !== 0xff || base[3] !== 0xe0) throw new Error('expected jpeg-js to write APP0 first');
  const app0End = 4 + base.readUInt16BE(4);
  const exif = jpegSegment(0xe1, Buffer.concat([ascii('Exif\0\0'), buildTiff()]));
  const xmp = jpegSegment(
    0xe1,
    Buffer.concat([
      ascii('http://ns.adobe.com/xap/1.0/\0'),
      ascii('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF/></x:xmpmeta>'),
    ]),
  );
  const icc = jpegSegment(0xe2, FAKE_ICC);
  const iptc = jpegSegment(
    0xed,
    Buffer.concat([ascii('Photoshop 3.0\0'), ascii('8BIM'), Buffer.from([0x04, 0x04, 0, 0, 0, 0, 0, 4]), ascii('test')]),
  );
  const com = jpegSegment(0xfe, ascii('secret fixture comment'));
  return Buffer.concat([base.subarray(0, app0End), exif, xmp, icc, iptc, com, base.subarray(app0End)]);
}

export type JpegSegment = { marker: number; offset: number; payload: Buffer };

/** Lists the marker segments before SOS (inclusive of SOS itself). */
export function jpegSegments(buf: Uint8Array): JpegSegment[] {
  const b = Buffer.from(buf);
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('not a JPEG');
  const out: JpegSegment[] = [];
  let p = 2;
  while (p < b.length) {
    if (b[p] !== 0xff) throw new Error(`bad marker at ${p}`);
    const marker = b[p + 1];
    const len = b.readUInt16BE(p + 2);
    out.push({ marker, offset: p, payload: b.subarray(p + 4, p + 2 + len) });
    if (marker === 0xda) break;
    p += 2 + len;
  }
  return out;
}

/** Bytes from the SOS marker to the end of the file (entropy-coded data + EOI). */
export function jpegScanData(buf: Uint8Array): Buffer {
  const sos = jpegSegments(buf).find((s) => s.marker === 0xda);
  if (!sos) throw new Error('no SOS');
  return Buffer.from(buf).subarray(sos.offset);
}

export function decodeJpeg(buf: Uint8Array) {
  return jpeg.decode(Buffer.from(buf), { useTArray: true, formatAsRGBA: true });
}

// ---------------------------------------------------------------- PNG

export type PngChunk = { type: string; data: Buffer; crc: number; crcValid: boolean };

export function pngChunks(buf: Uint8Array): PngChunk[] {
  const b = Buffer.from(buf);
  const out: PngChunk[] = [];
  let p = 8;
  while (p < b.length) {
    const len = b.readUInt32BE(p);
    const type = b.subarray(p + 4, p + 8).toString('latin1');
    const data = b.subarray(p + 8, p + 8 + len);
    const crc = b.readUInt32BE(p + 8 + len);
    const crcValid = crc32(b.subarray(p + 4, p + 8 + len)) === crc;
    out.push({ type, data, crc, crcValid });
    p += 12 + len;
  }
  return out;
}

export function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([ascii(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/**
 * photo.png equivalent: RGB PNG with IHDR, iCCP, tEXt, iTXt, zTXt, eXIf, tIME,
 * tRNS, IDAT, IEND (ancillary chunks placed before IDAT, tIME after it).
 */
export function buildMetaPng(w = 32, h = 24): Buffer {
  const base = makePng(w, h, { colorType: 2, seed: 3 });
  const chunks = pngChunks(base);
  const ihdr = chunks.find((c) => c.type === 'IHDR')!;
  const idats = chunks.filter((c) => c.type === 'IDAT');
  const iccp = pngChunk('iCCP', Buffer.concat([ascii('icc\0'), Buffer.from([0]), deflateSync(Buffer.alloc(64, 7))]));
  const text = pngChunk('tEXt', Buffer.concat([ascii('Author\0'), ascii('Secret Person')]));
  const itxt = pngChunk('iTXt', Buffer.concat([ascii('Description\0'), Buffer.from([0, 0]), ascii('\0\0'), ascii('hidden')]));
  const ztxt = pngChunk('zTXt', Buffer.concat([ascii('Comment\0'), Buffer.from([0]), deflateSync(ascii('zipped secret'))]));
  const exif = pngChunk('eXIf', buildTiff());
  const time = pngChunk('tIME', Buffer.from([0x07, 0xea, 11, 1, 12, 34, 56]));
  const trns = pngChunk('tRNS', Buffer.from([0, 1, 0, 2, 0, 3]));
  return Buffer.concat([
    base.subarray(0, 8),
    pngChunk('IHDR', ihdr.data),
    iccp,
    text,
    itxt,
    ztxt,
    exif,
    trns,
    ...idats.map((c) => pngChunk('IDAT', c.data)),
    time,
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- WebP

export type RiffChunk = { fourcc: string; data: Buffer };

function riffChunk(fourcc: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.write(fourcc, 0, 'latin1');
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, data.length & 1 ? Buffer.from([0]) : Buffer.alloc(0)]);
}

export const VP8X_FLAG = { ICC: 0x20, ALPHA: 0x10, EXIF: 0x08, XMP: 0x04, ANIM: 0x02 };

/**
 * photo.webp equivalent (structure only): RIFF/WEBP with VP8X (alpha+EXIF+XMP flags),
 * a VP8L image chunk, an odd-length EXIF chunk and an XMP chunk.
 */
export function buildMetaWebp(): Buffer {
  const vp8x = Buffer.alloc(10);
  vp8x[0] = VP8X_FLAG.ALPHA | VP8X_FLAG.EXIF | VP8X_FLAG.XMP;
  vp8x.writeUIntLE(16 - 1, 4, 3);
  vp8x.writeUIntLE(16 - 1, 7, 3);
  const vp8l = Buffer.concat([Buffer.from([0x2f]), Buffer.alloc(20, 0x11)]);
  const exif = buildTiff(); // even or odd, padded by riffChunk
  const exifOdd = exif.length & 1 ? exif : Buffer.concat([exif, Buffer.from([0])]);
  const xmp = ascii('<x:xmpmeta xmlns:x="adobe:ns:meta/"/>');
  const body = Buffer.concat([
    ascii('WEBP'),
    riffChunk('VP8X', vp8x),
    riffChunk('VP8L', vp8l),
    riffChunk('EXIF', exifOdd),
    riffChunk('XMP ', xmp),
  ]);
  const head = Buffer.alloc(8);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

export function riffChunks(buf: Uint8Array): RiffChunk[] {
  const b = Buffer.from(buf);
  const out: RiffChunk[] = [];
  let p = 12;
  while (p + 8 <= b.length) {
    const fourcc = b.subarray(p, p + 4).toString('latin1');
    const len = b.readUInt32LE(p + 4);
    out.push({ fourcc, data: b.subarray(p + 8, p + 8 + len) });
    p += 8 + len + (len & 1);
  }
  return out;
}
