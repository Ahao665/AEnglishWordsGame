// 1) 为 .wasm 强制设置 Content-Type: application/wasm
// 2) 若 SIMD 版实例化失败，改为返回非 SIMD 版（部分环境 SIMD 不可用）
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

function fixWasmMime(res) {
  if (!res.ok) return res;
  return res.arrayBuffer().then(
    (buf) =>
      new Response(buf, {
        status: res.status,
        headers: { 'Content-Type': 'application/wasm' },
      })
  );
}

self.addEventListener('fetch', (event) => {
  const u = event.request.url;
  const base = new URL(u).origin + new URL(u).pathname.replace(/\/[^/]+$/, '/');

  // SIMD 版 .wasm：改为请求非 SIMD 版并修正 MIME（部分环境 SIMD 实例化失败）
  if (u.endsWith('hands_solution_simd_wasm_bin.wasm')) {
    event.respondWith(
      fetch(base + 'hands_solution_wasm_bin.wasm').then(fixWasmMime)
    );
    return;
  }
  // SIMD 版 .js：改为请求非 SIMD 版（与上面的 .wasm 成对使用）
  if (u.endsWith('hands_solution_simd_wasm_bin.js')) {
    event.respondWith(fetch(base + 'hands_solution_wasm_bin.js'));
    return;
  }

  // 其它 .wasm：只修正 MIME
  if (u.endsWith('.wasm')) {
    event.respondWith(
      fetch(event.request).then(fixWasmMime)
    );
  }
});
