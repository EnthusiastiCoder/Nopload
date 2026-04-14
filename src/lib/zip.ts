// ZIP packaging (fflate) and "save all" (single download, ZIP, or a folder).
import { zip, type AsyncZippable } from 'fflate';

export interface NamedFile {
  name: string;
  data: Uint8Array;
}

/** Formats that are already compressed: stored as-is (level 0) to save time. */
const STORED = /\.(jpe?g|png|webp|avif|jxl|heic|heif|gif|zip)$/i;

/** Throws (or rejects) on duplicate names: the caller must de-duplicate first. */
export function zipFiles(files: NamedFile[]): Promise<Blob> {
  const entries: AsyncZippable = {};
  for (const f of files) {
    if (Object.hasOwn(entries, f.name)) return Promise.reject(new Error(`duplicate file name in ZIP: ${f.name}`));
    entries[f.name] = [f.data, { level: STORED.test(f.name) ? 0 : 6 }];
  }
  return new Promise((resolve, reject) => {
    zip(entries, (err, out) => (err ? reject(err) : resolve(new Blob([out as Uint8Array<ArrayBuffer>], { type: 'application/zip' }))));
  });
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  jxl: 'image/jxl',
};

const mimeOf = (name: string) => MIME_BY_EXT[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

export const canSaveToFolder = (): boolean => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

type DirHandle = { getFileHandle(name: string, o: { create: boolean }): Promise<{ createWritable(): Promise<{ write(d: BufferSource): Promise<void>; close(): Promise<void> }> }> };

/** One file: a direct download. Two or more: a ZIP. `toFolder`: write each file into a folder the user picks. */
export async function saveAll(files: NamedFile[], opts: { toFolder?: boolean; zipName?: string } = {}): Promise<void> {
  if (files.length === 0) return;
  if (opts.toFolder && canSaveToFolder()) {
    const dir = (await (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandle> }).showDirectoryPicker({ mode: 'readwrite' }));
    for (const f of files) {
      const handle = await dir.getFileHandle(f.name, { create: true });
      const w = await handle.createWritable();
      await w.write(f.data as Uint8Array<ArrayBuffer>);
      await w.close();
    }
    return;
  }
  if (files.length === 1) {
    const [f] = files;
    downloadBlob(new Blob([f.data as Uint8Array<ArrayBuffer>], { type: mimeOf(f.name) }), f.name);
    return;
  }
  downloadBlob(await zipFiles(files), opts.zipName ?? 'nopload.zip');
}
