// U1.4 zipFiles round-trip and duplicate rejection.
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { zipFiles } from '../../src/lib/zip';
import { makeJpeg, makePng } from '../helpers/images';

async function unzip(blob: Blob): Promise<Record<string, Uint8Array>> {
  return unzipSync(new Uint8Array(await blob.arrayBuffer()));
}

describe('zipFiles', () => {
  it('round-trips names and bytes', async () => {
    const files = [
      { name: 'a.jpg', data: new Uint8Array(makeJpeg(32, 24)) },
      { name: 'b.png', data: new Uint8Array(makePng(16, 16)) },
      { name: 'notes.txt', data: new TextEncoder().encode('hello hello hello hello') },
      { name: 'a (1).jpg', data: new Uint8Array([1, 2, 3]) },
    ];
    const blob = await zipFiles(files);
    expect(blob).toBeInstanceOf(Blob);
    const out = await unzip(blob);
    expect(Object.keys(out).sort()).toEqual(files.map((f) => f.name).sort());
    for (const f of files) expect(Buffer.from(out[f.name]).equals(Buffer.from(f.data))).toBe(true);
  });

  it('round-trips an empty list to a valid empty ZIP', async () => {
    const out = await unzip(await zipFiles([]));
    expect(Object.keys(out)).toEqual([]);
  });

  it('rejects duplicate names', async () => {
    const dup = [
      { name: 'x.png', data: new Uint8Array([1]) },
      { name: 'x.png', data: new Uint8Array([2]) },
    ];
    await expect(async () => await zipFiles(dup)).rejects.toThrow(/duplicate/i);
  });
});
