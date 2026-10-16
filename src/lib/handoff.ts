// Hand-off of files from one tool page to the next ("Next: compress these") without a re-drop.
// Tool pages are separate documents, so the files are parked in this origin's IndexedDB for the
// navigation and read back once by the target page, which deletes them. Nothing leaves the device.

const DB = 'nopload-handoff';
const STORE = 'handoff';
const KEY = 'pending';
/** A parked hand-off older than this is ignored (e.g. the user navigated elsewhere first). */
const MAX_AGE_MS = 5 * 60_000;

interface Parked {
  to: string;
  at: number;
  files: { name: string; type: string; blob: Blob }[];
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const norm = (path: string) => path.replace(/\/+$/, '') || '/';

/** Parks `files` for the tool at `to` (a path such as "/compress-image") and navigates there. */
export async function handOff(files: (File | { name: string; blob: Blob })[], to: string): Promise<void> {
  const parked: Parked = {
    to: norm(to),
    at: Date.now(),
    files: files.map((f) =>
      f instanceof File ? { name: f.name, type: f.type, blob: f } : { name: f.name, type: f.blob.type, blob: f.blob },
    ),
  };
  try {
    const db = await open();
    await tx(db, 'readwrite', (s) => s.put(parked, KEY));
    db.close();
  } catch (err) {
    // Storage blocked (rare private modes): open the tool anyway, the user can drop the files again.
    console.warn('Could not hand the files over', err);
  }
  location.assign(to);
}

/** Returns (and deletes) the files parked for the current page; an empty list if there are none. */
export async function takeHandoff(path = location.pathname): Promise<File[]> {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const db = await open();
    const parked = await tx<Parked | undefined>(db, 'readonly', (s) => s.get(KEY) as IDBRequest<Parked | undefined>);
    if (!parked || parked.to !== norm(path)) {
      db.close();
      return [];
    }
    await tx(db, 'readwrite', (s) => s.delete(KEY));
    db.close();
    if (Date.now() - parked.at > MAX_AGE_MS) return [];
    return parked.files.map((f) => new File([f.blob], f.name, { type: f.type }));
  } catch {
    return [];
  }
}
