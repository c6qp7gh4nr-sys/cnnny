/* CANAN NY · Service Worker
 * Offline-first PWA support for the trip planner.
 * The app shell (index.html + manifest) is cached so the itinerary,
 * notes and completed state work fully offline. Cross-origin calls
 * (weather, exchange rate, Google Maps) are left to the network — the
 * app already handles their offline fallbacks gracefully.
 */
const CACHE = 'canan-ny-v1';
const APP_SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only manage same-origin assets; let weather/rate/maps requests hit the network.
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first (so updates land) with cached shell as offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // Other same-origin assets: cache-first, then populate cache on first network hit.
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
