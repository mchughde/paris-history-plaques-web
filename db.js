// IndexedDB store for Paris History Plaques (adapted from Philosophy Wiki).
// Keeps the panels on the device so the wiki also opens offline.

const DB_NAME = 'plaqueswiki';
const DB_VERSION = 1;
const STORE = 'panels';

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'slug' });
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = e => reject(e.target.error);
  });
}

// Replace the stored panels with the given list: new and changed panels are written,
// and panels no longer in the list are removed.
async function syncPanels(panels) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const keep = new Set(panels.map(p => p.slug));
    store.getAll().onsuccess = e => {
      const existing = new Map(e.target.result.map(p => [p.slug, p]));
      for (const old of existing.keys()) if (!keep.has(old)) store.delete(old);
      for (const p of panels) {
        const prev = existing.get(p.slug);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(p)) store.put(p);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = e => reject(e.target.error);
  });
}

async function getPanel(slug) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(slug);
    req.onsuccess = e => resolve(e.target.result || null);
    req.onerror = e => reject(e.target.error);
  });
}

// All panels, in book order: arrondissement, then panel number.
async function getAllPanels() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = e => resolve(e.target.result.sort(
      (a, b) => a.arrondissement - b.arrondissement || a.number - b.number));
    req.onerror = e => reject(e.target.error);
  });
}

// Search the published text only: title, location, English and background.
async function searchPanels(query) {
  const q = query.toLowerCase();
  return (await getAllPanels()).filter(p =>
    [p.title, p.location, p.english, p.background].some(t => (t || '').toLowerCase().includes(q)));
}

export { syncPanels, getPanel, getAllPanels, searchPanels };
