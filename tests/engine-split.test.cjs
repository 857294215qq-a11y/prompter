const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { boot, root } = require('./helpers/boot.cjs');

const engineFiles = () => readdirSync(path.join(root, 'src/engine')).filter((f) => f.endsWith('.js')).sort();
const pageScripts = () => [...readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script\b([^>]*)>/g)]
  .map((m) => (m[1].match(/\bsrc="([^"]+)"/) || [])[1] ?? null);

test('index.html loads the input guard, ui-v3.js, every engine file in order, then the ready script', () => {
  const scripts = pageScripts();
  assert.equal(scripts.filter((s) => s === null).length, 0, 'inline scripts remain');
  const local = scripts.map((s) => s.replace(/\?.*$/, ''));
  assert.deepEqual(local, ['src/boot/guard.js', 'ui-v3.js', ...engineFiles().map((f) => 'src/engine/' + f), 'src/boot/ready.js']);
});

test('boots in the browser without errors', async () => {
  const app = boot();
  try {
    assert.deepEqual(await app.settle(), []);
    assert.ok(app.$('#ta').value.length > 0);
  } finally { app.close(); }
});

test('boots as the Android app without errors', async () => {
  const app = boot({}, { native: true });
  try {
    assert.deepEqual(await app.settle(), []);
    const appOnly = [...app.w.document.querySelectorAll('.app-only')];
    assert.ok(appOnly.length > 0);
    assert.ok(appOnly.every((el) => el.hidden === false));
  } finally { app.close(); }
});

test('boots as the Android app with nearby devices on without errors', async () => {
  const app = boot({ settings: { nearOn: true } }, { native: true });
  try { assert.deepEqual(await app.settle(), []); } finally { app.close(); }
});

test('boots with the relay remote already on without errors', async () => {
  const app = boot({ settings: { remoteOn: true } });
  try { assert.deepEqual(await app.settle(), []); } finally { app.close(); }
});

test('boots from a direct remote link without errors', async () => {
  const app = boot({}, { url: 'https://prompter.test/#d=abc' });
  try { assert.deepEqual(await app.settle(), []); } finally { app.close(); }
});

test('boots from a relay remote link without errors', async () => {
  const app = boot({}, { url: 'https://prompter.test/?r=room#key' });
  try { assert.deepEqual(await app.settle(), []); } finally { app.close(); }
});

test('input and frames while later scripts are still loading throw nothing', async () => {
  const failed = [];
  const app = boot({}, {
    between: ({ w, $, errors }, src) => {
      if (src === 'src/boot/ready.js') return;
      const before = errors.length;
      for (const b of w.document.querySelectorAll('button')) b.click();
      for (const key of [' ', 'Enter', 'Escape', 'ArrowDown', 'Home', 'd', 'm']) w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true }));
      w.runFrame?.(0);
      if (errors.length > before) failed.push(src + ': ' + errors.slice(before).join(' | '));
    },
  });
  assert.deepEqual(failed, []);
  assert.deepEqual(await app.settle(), []);
  app.close();
});

test('input is accepted again once every script has loaded', () => {
  const app = boot({}, { between: ({ w }, src) => { if (src !== 'src/boot/ready.js') w.document.querySelector('#start').click(); } });
  assert.equal(app.$('#prompter').hidden, true, 'clicks during loading must not start the reader');
  app.click('#start');
  assert.equal(app.$('#prompter').hidden, false);
  app.close();
});

test('stopPlayback does not replace window.stop', () => {
  const app = boot();
  try {
    assert.equal(typeof app.w.stopPlayback, 'function');
    assert.notEqual(app.w.stop, app.w.stopPlayback);
    assert.equal(app.w.testEngine.stop, app.w.stopPlayback);
  } finally { app.close(); }
});

// Every local script and stylesheet the page loads, as written in index.html.
const pageAssets = () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const styles = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  return [...pageScripts(), ...styles].filter((s) => s && !s.includes('://'));
};
const swVersion = () => readFileSync(path.join(root, 'sw.js'), 'utf8').match(/const VERSION = '([0-9a-f]+)';/)[1];

test('page loads every local script and stylesheet at the current version', () => {
  const version = swVersion();
  for (const file of pageAssets()) assert.match(file, new RegExp(`\\?v=${version}$`), file + ' is not versioned');
});

test('version matches the files it covers', () => {
  // Fails when a file changed without re-stamping; run npm run stamp.
  execFileSync(process.execPath, ['scripts/stamp.mjs', '--check'], { cwd: root, stdio: 'pipe' });
});

test('service worker installs every local script and stylesheet the page loads', () => {
  const ctx = { self: { addEventListener() {} }, location: { origin: 'https://prompter.test' } };
  require('node:vm').runInNewContext(readFileSync(path.join(root, 'sw.js'), 'utf8') + ';this.ASSETS = ASSETS;', ctx);
  for (const file of pageAssets()) assert.ok(ctx.ASSETS.includes('./' + file), 'Missing offline asset ' + file);
});

test('web build ships the engine files', () => {
  execFileSync(process.execPath, ['scripts/build-web.mjs'], { cwd: root });
  assert.deepEqual(readdirSync(path.join(root, 'www/src/engine')).sort(), engineFiles());
});

// Load sw.js against fake browser APIs and return its fetch handler. Cache keys are path plus query.
function serviceWorker({ cached, network }) {
  const handlers = {};
  const key = (req) => { const u = new URL(req.url || req, 'https://prompter.test/'); return u.pathname + u.search; };
  const store = new Map(Object.entries(cached));
  const cache = { put: async (req, res) => store.set(key(req), res), addAll: async () => {} };
  const sandbox = {
    self: { addEventListener: (type, fn) => { handlers[type] = fn; }, skipWaiting() {}, clients: { claim() {} } },
    caches: { open: async () => cache, keys: async () => [], match: async (req) => store.get(key(req)) },
    fetch: network, location: { origin: 'https://prompter.test' }, URL, setTimeout, Promise,
  };
  require('node:vm').runInNewContext(readFileSync(path.join(root, 'sw.js'), 'utf8'), sandbox);
  return async (url, destination, mode = 'no-cors') => {
    let reply;
    handlers.fetch({ request: { method: 'GET', url, mode, destination }, respondWith: (p) => { reply = p; } });
    return { reply: await reply, store };
  };
}
const res = (body, status = 200) => ({ ok: status < 300, status, body, clone() { return this; } });
const offline = async () => { throw new TypeError('offline'); };
const page = (fetchFrom) => fetchFrom('https://prompter.test/', 'document', 'navigate');

test('service worker serves the fresh page when the network answers', async () => {
  const { reply } = await page(serviceWorker({ cached: { '/index.html': res('old') }, network: async () => res('new') }));
  assert.equal(reply.body, 'new');
});

test('service worker falls back to the cached page offline', async () => {
  const { reply } = await page(serviceWorker({ cached: { '/index.html': res('old') }, network: offline }));
  assert.equal(reply.body, 'old');
});

test('service worker falls back to the cached page when the server answers with an error', async () => {
  const { reply } = await page(serviceWorker({ cached: { '/index.html': res('old') }, network: async () => res('busy', 503) }));
  assert.equal(reply.body, 'old');
});

test('service worker does not write a fresh page over the installed one', async () => {
  const { store } = await page(serviceWorker({ cached: { '/index.html': res('old') }, network: async () => res('new') }));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(store.get('/index.html').body, 'old');
});

test('service worker serves a script at the installed version from cache', async () => {
  const fetchFrom = serviceWorker({ cached: { '/src/engine/00-core.js?v=aaa': res('installed') }, network: async () => res('busy', 503) });
  const { reply } = await fetchFrom('https://prompter.test/src/engine/00-core.js?v=aaa', 'script');
  assert.equal(reply.body, 'installed');
});

test('service worker never serves a cached script from another version', async () => {
  const fetchFrom = serviceWorker({ cached: { '/src/engine/00-core.js?v=aaa': res('old') }, network: async () => res('new') });
  const { reply } = await fetchFrom('https://prompter.test/src/engine/00-core.js?v=bbb', 'script');
  assert.equal(reply.body, 'new');
});
