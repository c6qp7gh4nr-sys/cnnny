/* Mimari Tasarım Üretici — basit service worker (çevrimdışı önbellek) */
const CACHE = 'mimari-v1';
const CORE = ['./mimari-tasarim.html', './icon.svg', './mimari-manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE).catch(()=>{})));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(resp => {
      const cp = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, cp)).catch(()=>{});
      return resp;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./mimari-tasarim.html')))
  );
});
