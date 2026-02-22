// U1.2 sniffType magic numbers, U1.3 outputName.
import { describe, expect, it } from 'vitest';
import { outputName, sniffType } from '../../src/lib/files';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...Buffer.from(p, 'latin1')] : p)));

/** ISO-BMFF header: size 0x18, "ftyp", major brand, minor version, one compatible brand. */
const ftyp = (major: string, compat = major) => bytes([0, 0, 0, 0x18], 'ftyp', major, [0, 0, 0, 0], compat, [0, 0, 0, 0]);

describe('sniffType', () => {
  it.each([
    ['jpeg', bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], 'JFIF')],
    ['png', bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d], 'IHDR')],
    ['webp', bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 ')],
    ['avif', ftyp('avif', 'mif1')],
    ['avif', ftyp('avis', 'msf1')],
    ['heic', ftyp('heic', 'mif1')],
    ['heic', ftyp('mif1', 'heic')],
    ['jxl', bytes([0xff, 0x0a, 0xfa, 0x7f, 0x01])],
    ['jxl', bytes([0, 0, 0, 0x0c], 'JXL ', [0x0d, 0x0a, 0x87, 0x0a], [0, 0, 0, 0x14], 'ftypjxl ')],
    ['gif', bytes('GIF89a', [1, 0, 1, 0])],
    ['gif', bytes('GIF87a', [1, 0, 1, 0])],
    ['bmp', bytes('BM', [0x46, 0, 0, 0, 0, 0, 0, 0, 0x36, 0, 0, 0])],
  ] as const)('identifies %s', (expected, input) => {
    expect(sniffType(input)).toBe(expected);
  });

  it('returns unknown for random bytes', () => {
    const random = new Uint8Array([0x13, 0x37, 0x42, 0x99, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c]);
    expect(sniffType(random)).toBe('unknown');
  });

  it('returns unknown for an empty or too-short buffer', () => {
    expect(sniffType(new Uint8Array(0))).toBe('unknown');
    expect(sniffType(new Uint8Array([0xff]))).toBe('unknown');
  });

  it('does not take a RIFF/WAVE file for WebP', () => {
    expect(sniffType(bytes('RIFF', [0x24, 0, 0, 0], 'WAVEfmt '))).toBe('unknown');
  });
});

describe('outputName', () => {
  it('replaces the extension', () => {
    expect(outputName('a.jpg', { ext: 'webp' })).toBe('a.webp');
  });

  it('de-duplicates names within one batch', () => {
    const taken = new Set<string>();
    expect(outputName('a.jpg', { ext: 'webp' }, taken)).toBe('a.webp');
    expect(outputName('a.png', { ext: 'webp' }, taken)).toBe('a (1).webp');
    expect(outputName('a.gif', { ext: 'webp' }, taken)).toBe('a (2).webp');
  });

  it('adds a suffix before the extension', () => {
    expect(outputName('a.jpg', { suffix: '-nobg', ext: 'png' })).toBe('a-nobg.png');
  });

  it('keeps unsafe characters as they are', () => {
    expect(outputName('my photo: v2*?.jpg', { ext: 'png' })).toBe('my photo: v2*?.png');
  });

  it('removes path separators', () => {
    const name = outputName('holiday/beach\\IMG_1.jpg', { ext: 'png' });
    expect(name).not.toMatch(/[\\/]/);
    expect(name.endsWith('IMG_1.png')).toBe(true);
  });

  it('handles a name without an extension and a dotted name', () => {
    expect(outputName('README', { ext: 'png' })).toBe('README.png');
    expect(outputName('my.holiday.photo.jpeg', { ext: 'jpg' })).toBe('my.holiday.photo.jpg');
  });
});
