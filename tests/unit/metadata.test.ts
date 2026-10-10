// U3.2-U3.5 lossless metadata stripping and the metadata summary.
// Fixtures are built in tests/helpers/images.ts (gps.jpg / photo.png / photo.webp equivalents).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import exifr from 'exifr';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  exifDateOnlyApp1,
  readDateTaken,
  readSummary,
  stripJpeg,
  stripPng,
  stripWebp,
  withDateTaken,
} from '../../src/tools/batch/metadata';
import {
  GPS_EXIF,
  VP8X_FLAG,
  buildGpsJpeg,
  buildMetaPng,
  buildMetaWebp,
  decodeJpeg,
  jpegScanData,
  jpegSegments,
  makeJpeg,
  makePng,
  pngChunk,
  pngChunks,
  riffChunks,
} from '../helpers/images';

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));

const isExifApp1 = (s: { marker: number; payload: Buffer }) =>
  s.marker === 0xe1 && s.payload.subarray(0, 6).toString('latin1') === 'Exif\0\0';
const isXmpApp1 = (s: { marker: number; payload: Buffer }) =>
  s.marker === 0xe1 && s.payload.toString('latin1').startsWith('http://ns.adobe.com/xap/1.0/');

describe('stripJpeg (U3.2)', () => {
  const input = buildGpsJpeg();

  it('removes GPS, Make/Model, XMP, IPTC and comments; keeps JFIF and ICC by default', async () => {
    const out = stripJpeg(input, { keepOrientation: false });
    const parsed = await exifr.parse(Buffer.from(out), { translateValues: false }).catch(() => undefined);
    expect(parsed?.latitude).toBeUndefined();
    expect(parsed?.Make).toBeUndefined();
    expect(parsed?.Model).toBeUndefined();
    const segs = jpegSegments(out);
    expect(segs.some(isExifApp1)).toBe(false);
    expect(segs.some(isXmpApp1)).toBe(false);
    expect(segs.some((s) => s.marker === 0xed)).toBe(false); // APP13 IPTC
    expect(segs.some((s) => s.marker === 0xfe)).toBe(false); // COM
    expect(segs.some((s) => s.marker === 0xe0 && s.payload.subarray(0, 5).toString('latin1') === 'JFIF\0')).toBe(true);
    expect(segs.some((s) => s.marker === 0xe2 && s.payload.subarray(0, 12).toString('latin1') === 'ICC_PROFILE\0')).toBe(true);
    expect(out.length).toBeLessThan(input.length);
  });

  it('drops the ICC profile when keepIcc is false', () => {
    const out = stripJpeg(input, { keepIcc: false, keepOrientation: false });
    expect(jpegSegments(out).some((s) => s.marker === 0xe2)).toBe(false);
  });

  it('with keepOrientation and orientation 6, the output Exif contains only Orientation = 6', async () => {
    const out = stripJpeg(input, { keepOrientation: true });
    const parsed = await exifr.parse(Buffer.from(out), { translateValues: false, mergeOutput: true });
    expect(parsed).toEqual({ Orientation: GPS_EXIF.orientation });
  });

  it('is lossless: the scan data after SOS is byte-identical and the pixels decode identically', () => {
    const out = stripJpeg(input, { keepOrientation: true });
    expect(jpegScanData(out).equals(jpegScanData(input))).toBe(true);
    const a = decodeJpeg(input);
    const b = decodeJpeg(out);
    expect([b.width, b.height]).toEqual([a.width, a.height]);
    expect(Buffer.from(b.data).equals(Buffer.from(a.data))).toBe(true);
  });
});

describe('stripPng (U3.3)', () => {
  const input = buildMetaPng();

  it('removes tEXt/iTXt/zTXt/eXIf/tIME and keeps IHDR/iCCP/tRNS/IDAT/IEND in order', () => {
    const out = stripPng(input);
    expect(Buffer.from(out).subarray(0, 8).equals(input.subarray(0, 8))).toBe(true);
    const types = pngChunks(out).map((c) => c.type);
    for (const t of ['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME']) expect(types).not.toContain(t);
    const collapsed = types.filter((t, i) => !(t === 'IDAT' && types[i - 1] === 'IDAT'));
    expect(collapsed).toEqual(['IHDR', 'iCCP', 'tRNS', 'IDAT', 'IEND']);
  });

  it('keeps a PLTE chunk', () => {
    // Insert a suggested palette (legal for colour type 2) right after IHDR.
    const ihdrEnd = 8 + 12 + 13;
    const withPlte = Buffer.concat([
      input.subarray(0, ihdrEnd),
      pngChunk('PLTE', Buffer.from([0, 0, 0, 255, 255, 255])),
      input.subarray(ihdrEnd),
    ]);
    const types = pngChunks(stripPng(withPlte)).map((c) => c.type);
    expect(types.slice(0, 2)).toEqual(['IHDR', 'PLTE']);
  });

  it('every chunk CRC is valid and the pixels decode identically', () => {
    const out = stripPng(input);
    expect(pngChunks(out).every((c) => c.crcValid)).toBe(true);
    const a = PNG.sync.read(input);
    const b = PNG.sync.read(Buffer.from(out));
    expect([b.width, b.height]).toEqual([a.width, a.height]);
    expect(b.data.equals(a.data)).toBe(true);
  });
});

describe('stripWebp (U3.4)', () => {
  const input = buildMetaWebp();

  it('removes the EXIF and XMP chunks and keeps the image chunk bytes', () => {
    const out = stripWebp(input);
    const chunks = riffChunks(out);
    expect(chunks.map((c) => c.fourcc)).toEqual(['VP8X', 'VP8L']);
    const vp8lIn = riffChunks(input).find((c) => c.fourcc === 'VP8L')!;
    expect(chunks[1].data.equals(vp8lIn.data)).toBe(true);
  });

  it('clears the VP8X EXIF/XMP flag bits and keeps the others', () => {
    const flags = riffChunks(stripWebp(input))[0].data[0];
    expect(flags & VP8X_FLAG.EXIF).toBe(0);
    expect(flags & VP8X_FLAG.XMP).toBe(0);
    expect(flags & VP8X_FLAG.ALPHA).toBe(VP8X_FLAG.ALPHA);
  });

  it('sets the RIFF size to file length - 8', () => {
    const out = Buffer.from(stripWebp(input));
    expect(out.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(out.subarray(8, 12).toString('latin1')).toBe('WEBP');
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
  });
});

describe('readSummary (U3.5)', () => {
  it('reports GPS and the camera make for gps.jpg', async () => {
    const s = await readSummary(buildGpsJpeg());
    expect(s.hasGps).toBe(true);
    expect(s.make).toBe(GPS_EXIF.make);
    expect(s.model).toBe(GPS_EXIF.model);
    expect(s.software).toBe(GPS_EXIF.software);
    expect(s.dateTaken).toBeDefined();
  });

  it('reports hasGps false for a PNG without metadata', async () => {
    const s = await readSummary(makePng(16, 16));
    expect(s.hasGps).toBe(false);
    expect(s.make).toBeUndefined();
  });
});

describe('Keep date taken (HEIC to JPG)', () => {
  const DATE = '2024:05:06 07:08:09';

  it('readDateTaken returns the raw DateTimeOriginal, or undefined when there is none', async () => {
    expect(await readDateTaken(buildGpsJpeg())).toBe(GPS_EXIF.dateTimeOriginal);
    expect(await readDateTaken(makePng(16, 16))).toBeUndefined();
    expect(await readDateTaken(readFileSync(join(FIXTURES, 'sample.heic')))).toBeUndefined();
  });

  it('withDateTaken writes an Exif holding only DateTimeOriginal; pixels unchanged', async () => {
    const input = makeJpeg(32, 24);
    const out = withDateTaken(input, DATE);
    const exif = jpegSegments(out).filter(isExifApp1);
    expect(exif).toHaveLength(1);
    const tags = (await exifr.parse(out, { reviveValues: false, mergeOutput: true })) as Record<string, unknown>;
    expect(tags.DateTimeOriginal).toBe(DATE);
    expect(Object.keys(tags).filter((k) => k !== 'DateTimeOriginal' && k !== 'ExifIFDPointer' && k !== 'ExifOffset')).toEqual([]);
    expect(await readSummary(out)).toMatchObject({ hasGps: false, make: undefined, model: undefined, software: undefined });
    expect(decodeJpeg(out).data).toEqual(decodeJpeg(input).data);
  });

  it('rejects a malformed date', () => {
    expect(() => exifDateOnlyApp1('2024-05-06')).toThrow();
  });
});
