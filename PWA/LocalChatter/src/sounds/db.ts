// Sound storage: IndexedDB on this device, with an in-memory fallback when
// IndexedDB is unavailable (some private modes).

export interface SoundEntry {
  /** A hash of the audio (or of the link, for link-only sounds). */
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob | null;
  url: string;
  /** 'library': added by you, kept until deleted. 'received': cached from others. */
  source: 'library' | 'received';
  addedAt: number;
  usedAt: number;
  linkOnly?: boolean;
}

const DB_NAME = 'localchatter';
const STORE = 'sounds';
const memory = new Map<string, SoundEntry>();
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest, fallback: () => T): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result as T);
    t.onerror = t.onabort = () => reject(t.error);
  })).catch(fallback);
}

export const get = (id: string): Promise<SoundEntry | undefined> =>
  run('readonly', (s) => s.get(id), () => memory.get(id));
export const put = (e: SoundEntry): Promise<unknown> =>
  run('readwrite', (s) => s.put(e), () => { memory.set(e.id, e); return e.id; });
export const del = (id: string): Promise<unknown> =>
  run('readwrite', (s) => s.delete(id), () => { memory.delete(id); return undefined; });
export const all = (): Promise<SoundEntry[]> =>
  run('readonly', (s) => s.getAll(), () => Array.from(memory.values()));
