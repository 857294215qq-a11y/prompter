const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const { boot, root } = require('./helpers/boot.cjs');

const read = (f) => readFileSync(path.join(root, f), 'utf8');
const css = read('ui-v3.css');
const TOKENS = {
  '--ease': 'cubic-bezier(.32,.72,0,1)', '--dur-surface': '240ms', '--dur-popover-in': '200ms', '--dur-popover-out': '150ms',
  '--dur-control': '180ms', '--dur-text': '160ms', '--dur-scroll': '320ms', '--dur-beat': '240ms', '--dur-tip': '120ms', '--dur-reduced': '120ms',
};
// Drop @media (prefers-reduced-motion) blocks: they are the one place allowed to set their own motion.
const withoutReduced = (src) => src.replace(/@media \(prefers-reduced-motion: reduce\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '');

test('tokens are defined once in :root', () => {
  const rootBlock = css.match(/:root\s*\{[^}]*\}/)[0];
  for (const [name, value] of Object.entries(TOKENS)) {
    assert.match(rootBlock, new RegExp(name.replace(/[-]/g, '\\-') + ':\\s*' + value.replace(/[().,]/g, '\\$&') + ';'), name);
    assert.equal(css.split(name + ':').length - 1, 1, name + ' defined more than once');
  }
});

test('no hard-coded durations or curves outside the reduced-motion branch', () => {
  const styles = [withoutReduced(css.replace(/:root\s*\{[^}]*\}/, '')), withoutReduced(read('index.html').match(/<style>([\s\S]*?)<\/style>/)[1])];
  for (const s of styles) for (const decl of s.match(/(?:transition|animation)[\w-]*\s*:[^;}]*/g) || [])
    assert.doesNotMatch(decl, /(^|[\s,:])\.?\d+(\.\d+)?m?s\b|cubic-bezier\(/, 'literal motion in CSS: ' + decl);
  const scripts = ['ui-v3.js', ...['src/engine', 'src/ui'].flatMap((d) => readdirSync(path.join(root, d)).map((f) => d + '/' + f))];
  for (const f of scripts) {
    const src = read(f).replace(/\/\/ motion fallbacks[\s\S]*?\/\/ end motion fallbacks/, '');
    // Motion durations live in animation options (duration:) and the scroll animation object (anim = { … dur: });
    // other "dur" fields, such as a recording's length, are not motion.
    const hit = src.match(/cubic-bezier\(|\bduration\s*:\s*\d|anim = \{[^}]*\bdur:\s*\d/);
    assert.equal(hit, null, `${f} writes motion itself: ${hit?.[0]}`);
  }
});

test('surfaces animate with the tokens', async () => {
  const app = boot();
  const calls = []; app.w.HTMLElement.prototype.animate = function (frames, options) { calls.push(options); return { finished: Promise.resolve(), cancel() {} }; };
  app.click('#appSettings'); await new Promise(setImmediate);
  assert.ok(calls.length);
  for (const o of calls) { assert.equal(o.duration, 240); assert.equal(o.easing, TOKENS['--ease']); }
  app.close();
});
