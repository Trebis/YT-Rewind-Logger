// IndexedDB wrapper for YT Rewind Logger
const DB_NAME = 'ytRewindLogger';
const DB_VERSION = 1;

let dbInstance = null;

export function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Words store
      if (!db.objectStoreNames.contains('words')) {
        const wordStore = db.createObjectStore('words', { keyPath: 'id' });
        wordStore.createIndex('by_encounters', 'encounters', { unique: false });
        wordStore.createIndex('by_learned', 'learned', { unique: false });
        wordStore.createIndex('by_excluded', 'excluded', { unique: false });
        wordStore.createIndex('by_lastSeen', 'lastSeen', { unique: false });
        wordStore.createIndex('by_masteryLevel', 'masteryLevel', { unique: false });
      }

      // Contexts store — sentences where words appeared
      if (!db.objectStoreNames.contains('contexts')) {
        const ctxStore = db.createObjectStore('contexts', {
          keyPath: 'id',
          autoIncrement: true
        });
        ctxStore.createIndex('by_wordId', 'wordId', { unique: false });
        ctxStore.createIndex('by_videoId', 'videoId', { unique: false });
      }

      // Sessions store
      if (!db.objectStoreNames.contains('sessions')) {
        const sessStore = db.createObjectStore('sessions', {
          keyPath: 'id',
          autoIncrement: true
        });
        sessStore.createIndex('by_date', 'date', { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => reject(request.error);
  });
}

// Promisified IDB helpers
export function idbGet(store, key) {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function idbPut(store, value) {
  return new Promise((resolve, reject) => {
    const req = store.put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function idbAdd(store, value) {
  return new Promise((resolve, reject) => {
    const req = store.add(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function idbDelete(store, key) {
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function idbGetAll(source) {
  return new Promise((resolve, reject) => {
    const req = source.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function idbGetAllByIndex(store, indexName, key) {
  return new Promise((resolve, reject) => {
    const index = store.index(indexName);
    const req = index.getAll(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
