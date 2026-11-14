// Tiny promise wrapper around a single IndexedDB key/value store.

const DB_NAME = 'lockbox';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const tx = (await db()).transaction(STORE, mode);
  const req = fn(tx.objectStore(STORE));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? req.error);
  });
}

export const idbGet = <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key));
export const idbSet = (key: string, value: unknown) => run('readwrite', (s) => s.put(value, key));
/** Writes several keys in one transaction: either all land or none do. */
export const idbSetMany = (values: Record<string, unknown>) =>
  run('readwrite', (s) => {
    let last!: IDBRequest;
    for (const [key, value] of Object.entries(values)) last = s.put(value, key);
    return last;
  });
export const idbDelete =(key: string) => run('readwrite', (s) => s.delete(key));
