/**
 * The object bank — the user's own isometric PNGs, kept in IndexedDB on this
 * device so they are still there next visit. The current scene is autosaved
 * in the same database. Nothing is uploaded.
 */

const DB_NAME = 'assetbench-iso-scene';
const DB_VERSION = 1;
const OBJECTS = 'objects';
const SCENES = 'scenes';

let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(OBJECTS)) db.createObjectStore(OBJECTS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(SCENES)) db.createObjectStore(SCENES);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => { dbPromise = null; throw error; });
  }
  return dbPromise;
}

async function run(store, mode, work) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = work(tx.objectStore(store));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** { id, name, blob, width, height, anchorX, anchorY, added } */
export const listObjects = () => run(OBJECTS, 'readonly', (s) => s.getAll());
export const putObject = (record) => run(OBJECTS, 'readwrite', (s) => s.put(record));
export const deleteObject = (id) => run(OBJECTS, 'readwrite', (s) => s.delete(id));

export const loadScene = () => run(SCENES, 'readonly', (s) => s.get('current'));
export const saveScene = (scene) => run(SCENES, 'readwrite', (s) => s.put(scene, 'current'));
