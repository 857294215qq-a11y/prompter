// 离线缓存：页面优先走网络（拿到最新版本），网络慢或断网时用缓存
const CACHE = 'prompter-ui-v3-1';
const ASSETS = [
  './',
  './index.html',
  './ui-v3.css',
  './ui-v3.js',
  './assets/v3/panel-left-close.svg',
  './assets/v3/flip-vertical2.svg',
  './assets/v3/flip-horizontal2.svg',
  './assets/v3/panel-right-close.svg',
  './assets/v3/settings2.svg',
  './assets/v3/maximize.svg',
  './assets/v3/monitor-smartphone.svg',
  './assets/v3/redo2.svg',
  './assets/v3/undo2.svg',
  './assets/v3/type.svg',
  './assets/v3/highlighter.svg',
  './assets/v3/list.svg',
  './assets/v3/ellipsis.svg',
  './assets/v3/import.svg',
  './assets/v3/plus.svg',
  './assets/v3/align-center.svg',
  './assets/v3/align-left.svg',
  './assets/v3/x.svg',
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
      if (res.ok) caches.open(CACHE).then((c) => c.put('./index.html', copy));
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
