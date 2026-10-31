const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { boot, root } = require('./helpers/boot.cjs');

// Inline engine from index.html lines 662–2743 at 8021127, the last commit before the split.
// Kept as a fixture because CI checks out a shallow clone without that commit.
const ORIGINAL = path.join(root, 'tests/fixtures/engine-8021127.txt');
const engineFiles = () => readdirSync(path.join(root, 'src/engine')).filter((f) => f.endsWith('.js')).sort();
const pageScripts = () => [...readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script\b([^>]*)>/g)]
  .map((m) => (m[1].match(/\bsrc="([^"]+)"/) || [])[1] ?? null);

test('engine files reproduce the original inline script byte for byte', () => {
  const original = readFileSync(ORIGINAL, 'utf8');
  const joined = engineFiles()
    .map((f) => readFileSync(path.join(root, 'src/engine', f), 'utf8').replace(/^'use strict';\n/, ''))
    .join('')
    .replace(/\bstopPlayback\b/g, 'stop')
    .replace('stop: stop,', 'stop,');
  assert.equal(joined, original);
});

test('index.html loads every engine file once, in order, after ui-v3.js', () => {
  const scripts = pageScripts();
  assert.equal(scripts.filter((s) => s === null).length, 0, 'inline scripts remain');
  const local = scripts.filter((s) => !s.startsWith('vendor/'));
  assert.deepEqual(local, ['ui-v3.js', ...engineFiles().map((f) => 'src/engine/' + f)]);
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

test('stopPlayback does not replace window.stop', () => {
  const app = boot();
  try {
    assert.equal(typeof app.w.stopPlayback, 'function');
    assert.notEqual(app.w.stop, app.w.stopPlayback);
    assert.equal(app.w.testEngine.stop, app.w.stopPlayback);
  } finally { app.close(); }
});

test('service worker caches every local script and stylesheet the page loads', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const styles = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  const local = [...pageScripts(), ...styles].filter((s) => s && !s.includes('://'));
  const assets = readFileSync(path.join(root, 'sw.js'), 'utf8').match(/const ASSETS = \[([\s\S]*?)\];/)[1];
  for (const file of local) assert.ok(assets.includes(`'./${file}'`), 'Missing offline asset ' + file);
});

test('web build ships the engine files', () => {
  execFileSync(process.execPath, ['scripts/build-web.mjs'], { cwd: root });
  assert.deepEqual(readdirSync(path.join(root, 'www/src/engine')).sort(), engineFiles());
});
