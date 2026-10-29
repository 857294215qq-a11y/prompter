// 离线缓存：页面优先走网络（拿到最新版本），网络慢或断网时用缓存
const CACHE = 'prompter-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './vendor/pinyin-pro.js',
  './vendor/qrcode.js',
  './vendor/jsqr.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isPage = req.mode === 'navigate' || req.destination === 'document';
  if (isPage) {
    // 连着没有网络的热点时，网络请求可能很久才失败，所以最多等 2.5 秒就改用缓存
    const net = fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put('./index.html', copy));
      return res;
    });
    const timeout = new Promise((r) => setTimeout(() => r(null), 2500));
    e.respondWith(
      Promise.race([net, timeout])
        .catch(() => null)
        .then((res) => res || caches.match('./index.html').then((hit) => hit || net))
    );
  } else {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});
