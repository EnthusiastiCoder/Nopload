// File naming, size formatting and magic-number type sniffing.
export type SniffedType = 'jpeg' | 'png' | 'webp' | 'avif' | 'heic' | 'jxl' | 'gif' | 'bmp' | 'unknown';

export const MIME: Record<Exclude<SniffedType, 'unknown'>, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  jxl: 'image/jxl',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

const ascii = (b: Uint8Array, start: number, len: number): string =>
  b.length < start + len ? '' : String.fromCharCode(...b.subarray(start, start + len));

const AVIF_BRANDS = new Set(['avif', 'avis']);
const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

/** Brands listed in an ISO-BMFF `ftyp` box: the major brand first, then the compatible ones. */
function ftypBrands(b: Uint8Array): string[] {
  if (ascii(b, 4, 4) !== 'ftyp') return [];
  const size = Math.min(((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0, b.length);
  const brands = [ascii(b, 8, 4)];
  for (let off = 16; off + 4 <= size; off += 4) brands.push(ascii(b, off, 4));
  return brands.filter(Boolean);
}

export function sniffType(bytes: Uint8Array): SniffedType {
  const b = bytes;
  if (b.length < 2) return 'unknown';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0xff && b[1] === 0x0a) return 'jxl';
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return 'png';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (ascii(b, 0, 4) === 'GIF8' && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'gif';
  if (ascii(b, 0, 2) === 'BM' && b.length >= 14) return 'bmp';
  if (ascii(b, 4, 4) === 'JXL ' && b[0] === 0 && b[1] === 0 && b[2] === 0 && b[3] === 0x0c) return 'jxl';
  const brands = ftypBrands(b);
  if (brands.length) {
    // AVIF wins when either brand says AVIF; otherwise any HEIF/HEVC brand means HEIC.
    if (brands.some((x) => AVIF_BRANDS.has(x))) return 'avif';
    if (brands.some((x) => HEIC_BRANDS.has(x))) return 'heic';
    if (brands[0] === 'jxl ') return 'jxl';
  }
  return 'unknown';
}

/**
 * Builds an output file name. `taken` holds the names already used in the same
 * batch; the function adds the returned name to it and de-duplicates with " (n)".
 */
export function outputName(inputName: string, opts: { suffix?: string; ext: string }, taken?: Set<string>): string {
  const base = inputName.split(/[\\/]/).pop() || 'image';
  const dot = base.lastIndexOf('.');
  const stem = (dot > 0 ? base.slice(0, dot) : base) + (opts.suffix ?? '');
  const ext = opts.ext.replace(/^\./, '');
  let name = `${stem}.${ext}`;
  if (taken) {
    for (let n = 1; taken.has(name); n++) name = `${stem} (${n}).${ext}`;
    taken.add(name);
  }
  return name;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  if (n < 1000) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = -1;
  do {
    v /= 1000;
    i++;
  } while (v >= 1000 && i < units.length - 1);
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}
