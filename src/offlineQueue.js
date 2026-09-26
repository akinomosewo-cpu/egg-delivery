// Offline queue — used for actions that don't require a photo upload,
// so they can still be tapped with zero signal and sent automatically
// once the connection comes back. Uses IndexedDB directly, no library.

const DB_NAME = "egg-offline";
const STORE = "queue";
const PHOTO_STORE = "pendingPhotos";
const DB_VERSION = 2; // bumped once to add PHOTO_STORE — keep this the single source of truth for
                       // the "egg-offline" DB version. Both stores are created here so every code
                       // path opens the DB at the same version; opening the same IndexedDB database
                       // at two different versions from two different places causes every open at
                       // the lower version to fail forever with "requested version is less than the
                       // existing version", since the on-disk version only ever goes up.

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueAction(actionName, args) {
  const db = await openDB();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id, actionName, args, createdAt: Date.now() });
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueuedActions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.createdAt - b.createdAt));
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueuedAction(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function queueCount() {
  try {
    const all = await getQueuedActions();
    return all.length;
  } catch {
    return 0;
  }
}

// True network-ish failure detection — don't queue on things like a
// validation error, only on things that look like "couldn't reach the server".
// Covers both Chrome desktop ("Failed to fetch") and Android WebView
// ("ERR_INTERNET_DISCONNECTED", "ERR_NETWORK_CHANGED", etc.)
export function looksOffline(error) {
  if (!navigator.onLine) return true;
  const msg = (error && error.message) || "";
  return /fetch|network|failed to fetch|NetworkError|DISCONNECTED|ERR_INTERNET|ERR_NETWORK/i.test(msg);
}

// ---- Pending photo blobs ----
// When signal is too weak for an upload, we store the raw file here
// (keyed by a temp pending://id URL) and upload it for real on reconnect.
// Shares the same "egg-offline" database/openDB() as the action queue above —
// see the DB_VERSION comment for why that matters.

export async function savePendingPhoto(file) {
  const id = `pending://${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const db = await openDB();
  const arrayBuffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).put({ id, buffer: arrayBuffer, type: file.type, name: file.name });
    tx.oncomplete = () => resolve(id); // returns the pending:// URL
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingPhotos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readonly");
    const req = tx.objectStore(PHOTO_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function removePendingPhoto(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function isPendingUrl(url) {
  return typeof url === "string" && url.startsWith("pending://");
}
