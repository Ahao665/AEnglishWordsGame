// Cache WASM and model files so second visit loads from cache (no 10-min wait)
const CACHE_NAME = 'mediapipe-assets-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const u = e.request.url;
  if (!u.includes('/wasm/') && !u.includes('/models/')) return;
  e.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          if (res.ok && res.status === 200) cache.put(e.request, res.clone());
          return res;
        });
      });
    })
  );
});
