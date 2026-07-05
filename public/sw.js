/* Cache-first Service Worker — Version wird beim Build ersetzt (Cache-Bust pro Deploy) */
const CACHE = 'stardust-__BUILD__';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('version.json')) return; // Update-Check geht immer ans Netz
  if (e.request.url.includes('/music/')) return;      // Audio-Streams: Range-Requests ans Netz (Browser-Cache greift)
  e.respondWith(
    caches.match(e.request).then(hit =>
      hit ||
      fetch(e.request).then(res => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => hit)
    )
  );
});
