/* Mimari Tasarım Üretici — service worker (yalnız kendi dosyalarını önbellekler) */
const CACHE = 'mimari-v2';
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
  let url;
  try { url = new URL(e.request.url); } catch(_) { return; }
  // Çapraz-köken istekleri (TKGM, proxy'ler, harita/3D CDN) SW'ye hiç uğramasın
  if (url.origin !== self.location.origin) return;
  // Kendi dosyalar: ağ-öncelikli, çevrimdışıysa önbellek
  e.respondWith(
    fetch(e.request).then(resp => {
      const cp = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, cp)).catch(()=>{});
      return resp;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./mimari-tasarim.html')))
  );
});
