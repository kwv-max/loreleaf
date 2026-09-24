// 오프라인에서도 열리도록. 네트워크를 먼저 쓰고, 안 되면 캐시로.
// 호스팅(GitHub Pages)이 파일을 10분씩 캐시하라고 해서, 업데이트 때 옛 파일이 섞이지 않게
// 매번 서버에 "바뀌었나"를 물어본다 (안 바뀌었으면 짧은 304 응답이라 거의 공짜).
const CACHE = 'loreleaf-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
