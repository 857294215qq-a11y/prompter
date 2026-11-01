// 离线缓存：每个版本整套装进自己的缓存。页面加载的脚本和样式地址带版本号，新旧版本互不顶替
const VERSION = 'c9e01ecb1a';
const CACHE = 'prompter-' + VERSION;
// 页面加载的本地脚本和样式（地址与 index.html 一致，缓存时加上 ?v=VERSION）
const VERSIONED = [
  './ui-v3.css',
  './src/boot/guard.js',
  './ui-v3.js',
  './src/engine/00-core.js',
  './src/engine/01-script.js',
  './src/engine/02-editor.js',
  './src/engine/03-reader.js',
  './src/engine/04-playback.js',
  './src/engine/05-voice.js',
  './src/engine/06-recorder.js',
  './src/engine/07-controls.js',
  './src/engine/08-marks.js',
  './src/engine/09-loop.js',
  './src/engine/10-inline-edit.js',
  './src/engine/11-session.js',
  './src/engine/12-reader-input.js',
  './src/engine/13-pip.js',
  './src/engine/14-remote.js',
  './src/engine/15-remote-lan.js',
  './src/engine/16-nearby.js',
  './src/engine/17-install.js',
  './src/ui/tooltips.js',
  './src/boot/ready.js',
];
const ASSETS = [
  './',
  './index.html',
  ...VERSIONED.map((f) => f + '?v=' + VERSION),
  './assets/v3/panel-left-close.svg',
  './assets/v3/flip-vertical2.svg',
  './assets/v3/flip-horizontal2.svg',
  './assets/v3/panel-right-close.svg',
  './assets/v3/panel-left-open.svg',
  './assets/v3/panel-right-open.svg',
  './assets/v3/settings2.svg',
  './assets/v3/settings.svg',
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
  './assets/v3/trash-2.svg',
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

// 页面先走网络；断网、超时（连着没有网络的热点时可能很久才失败）或服务器出错时，用安装时缓存的页面。
// 页面不写回缓存：缓存里的页面只随整套版本一起更新，离线打开时页面和脚本才是同一版本
function page(req) {
  const net = fetch(req);
  const good = net.then((res) => (res.ok ? res : null), () => null);
  const timeout = new Promise((r) => setTimeout(() => r(null), 2500));
  return Promise.race([good, timeout]).then((res) => res || caches.match('./index.html').then((hit) => hit || net));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate' || req.destination === 'document') e.respondWith(page(req));
  // 带版本号的地址按完整地址查缓存，别的版本不会命中
  else e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
