/**
 * IndexedDB queue for in-flight uploads.
 *
 * The File objects themselves are stored, not just their names: Blobs are
 * structured-cloneable, so a reload can pick an upload back up mid-file
 * instead of asking the guest to find the video again. If the underlying
 * file has moved since, reading it throws and we drop the record.
 */
export interface StoredUpload {
  localId: string;
  file: File;
  name: string;
  size: number;
  kind: 'image' | 'video';
  createdAt: number;
  remote?: {
    id: string;
    key: string;
    sk: string;
    uploadId?: string;
    partSize?: number;
    partCount?: number;
  };
  parts?: Array<{ partNumber: number; etag: string }>;
}

const DB = 'wedding-uploads';
const STORE = 'tasks';

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'localId' });
    };
    req.onsuccess = () => resolve(req.result);
    // Private windows and locked-down browsers refuse; uploading still works,
    // it just cannot be resumed after a reload.
    req.onerror = () => resolve(null);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    const request = fn(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => resolve(null);
  });
}

export const saveUpload = (rec: StoredUpload) => tx<void>('readwrite', (s) => s.put(rec));
export const dropUpload = (localId: string) => tx<void>('readwrite', (s) => s.delete(localId));
export const allUploads = () => tx<StoredUpload[]>('readonly', (s) => s.getAll());
