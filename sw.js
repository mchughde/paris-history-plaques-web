const CACHE_NAME = 'plaques-v22';

const PRECACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './images/paddle-logo.svg',
  './images/pelle-starck.jpg',
  'https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Network first: always try for fresh files, fall back to the cache when offline.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Private panels: from the GitHub API with a key (website) or panels.js (Mac).
  // Never cache them here; the app keeps them itself, in IndexedDB.
  if (url.hostname === 'api.github.com' || url.pathname.endsWith('/panels.js')
      || url.pathname.includes('/data/') || url.pathname.includes('/photos/')) return;
  // Map tiles: straight from the network, never stored (they'd fill the device).
  if (url.hostname.endsWith('openfreemap.org')) return;

  event.respondWith(
    fetch(event.request).then(response => {
      if (!response || response.status !== 200) return response;
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      return response;
    }).catch(() => caches.match(event.request))
  );
});
