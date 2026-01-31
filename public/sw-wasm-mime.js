// 为 .wasm 请求强制设置 Content-Type: application/wasm，解决部分环境下 WASM 实例化失败
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const u = event.request.url;
  if (!u.endsWith('.wasm')) return;
  event.respondWith(
    fetch(event.request).then((res) => {
      if (!res.ok) return res;
      return res.arrayBuffer().then(
        (buf) =>
          new Response(buf, {
            status: res.status,
            headers: { 'Content-Type': 'application/wasm' },
          })
      );
    })
  );
});
