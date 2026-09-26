// Offline queue — used for actions that don't require a photo upload,
// so they can still be tapped with zero signal and sent automatically
// once the connection comes back. Uses IndexedDB directly, no library.

const DB_NAME = "egg-offline";
const STORE = "queue";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
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
// validation error, only on things that look like "couldn't reach the server"
export function looksOffline(error) {
  if (!navigator.onLine) return true;
  const msg = (error && error.message) || "";
  return /fetch|network|failed to fetch|NetworkError/i.test(msg);
}

// ---- Pending photo blobs ----
// When offline, photos are stored here as raw binary data keyed by a
// pending:// URL. processQueue in App.jsx uploads them and swaps the
// pending:// references for real URLs before replaying queued actions.
const PHOTO_STORE = "pendingPhotos";

function openPhotoDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("offlinePhotoQueue", 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(PHOTO_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePendingPhoto(file) {
  const id = `pending://${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const buffer = await file.arrayBuffer();
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).put({ id, buffer, type: file.type, name: file.name || "photo.jpg" });
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingPhotos() {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readonly");
    const req = tx.objectStore(PHOTO_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function removePendingPhoto(id) {
  const db = await openPhotoDB();
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
