import { createId } from '../utils/ids.js';

/**
 * IndexedDB-backed store for handing models off between tools without a
 * re-upload (e.g. Optimise GLB flags 4K textures -> user jumps to
 * Compress Textures with the same file already loaded).
 *
 * Models never leave the browser: nothing here touches the network, and
 * binary data is never placed in the URL, localStorage, or sessionStorage
 * (all of which are unsuitable for large binary blobs anyway).
 *
 * Each entry:
 *   {
 *     id: string,
 *     sessionId: string,
 *     file: File,
 *     filename: string,
 *     bytes: number,
 *     sourceToolId: string|null,   // which tool produced/imported this model
 *     analysis: object|null,       // last known analyseGLB() result, if any
 *     createdAt: number,
 *     updatedAt: number,
 *   }
 */

const DB_NAME = 'asset-bench';
const DB_VERSION = 1;
const STORE_NAME = 'model-sessions';

let dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function withStore(mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = callback(store);

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * The current browser session's id. Regenerated per page load — models
 * persist in IndexedDB across reloads, but are scoped by session so
 * stale sessions can be identified and cleaned up (see sessionCleanup.js).
 */
export const CURRENT_SESSION_ID = createId('session');

/**
 * Stores (or overwrites) a model in the current session.
 * @param {{ id?: string, file: File, sourceToolId?: string, analysis?: object|null }} model
 * @returns {Promise<string>} the model's id
 */
export async function putModel({ id = createId('model'), file, sourceToolId = null, analysis = null }) {
  const now = Date.now();
  await withStore('readwrite', (store) => {
    store.put({
      id,
      sessionId: CURRENT_SESSION_ID,
      file,
      filename: file.name,
      bytes: file.size,
      sourceToolId,
      analysis,
      createdAt: now,
      updatedAt: now,
    });
  });
  return id;
}

/** @param {string} id */
export async function getModel(id) {
  return withStore('readonly', (store) => requestToPromise(store.get(id)));
}

/** Returns every model, regardless of session. */
export async function getModels() {
  return withStore('readonly', (store) => requestToPromise(store.getAll()));
}

/** Returns only models belonging to the current browser session. */
export async function getSessionModels() {
  const all = await getModels();
  return all.filter((model) => model.sessionId === CURRENT_SESSION_ID);
}

/** @param {string} id */
export async function removeModel(id) {
  await withStore('readwrite', (store) => store.delete(id));
}

/** Removes every model belonging to the current session. */
export async function clearSession() {
  const sessionModels = await getSessionModels();
  await withStore('readwrite', (store) => {
    sessionModels.forEach((model) => store.delete(model.id));
  });
}
