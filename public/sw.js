// Minimal offline support: network-first for same-origin GETs, falling back to cache.
// Vault data lives in IndexedDB, never in this cache.
const CACHE = 'lockbox-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      // Offline fallback: the app shell at the service worker's own folder (works under a sub-path).
      .catch(() => caches.match(request).then((hit) => hit || caches.match(new URL('./', location.href)))),
  );
});
