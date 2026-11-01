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

// Task 2: popovers from their trigger; tabs, segments and press feedback
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
function recordAnimations(app) {
  const calls = [];
  app.w.HTMLElement.prototype.animate = function (frames, options) { calls.push({ el: this, frames, options }); return { finished: new Promise(() => {}), cancel() {} }; };
  return calls;
}
const tick = () => new Promise(setImmediate);
const CUE = { library: [{ id: 'a', text: '大家好欢迎回来', updated: 1 }], current: 'a' };

test('popovers open from their trigger', async () => {
  const app = boot(CUE), calls = recordAnimations(app);
  app.$('[data-format="cue"]').getBoundingClientRect = () => rect(500, 20, 104, 32);
  app.$('#cueMenu').getBoundingClientRect = () => rect(500, 60, 220, 200);
  app.click('[data-format="cue"]'); await tick();
  const c = calls.find((x) => x.el.id === 'cueMenu');
  assert.ok(c, 'cue menu animates');
  assert.deepEqual(JSON.parse(JSON.stringify(c.frames)), [{ opacity: 0, scale: '.96' }, { opacity: 1, scale: '1' }]);
  assert.equal(c.options.duration, 200); assert.equal(c.options.easing, TOKENS['--ease']);
  assert.equal(app.$('#cueMenu').style.transformOrigin, '52px 0px', 'origin at the trigger centre, top edge');
  app.close();
});

test('popovers close faster', async () => {
  const app = boot(CUE), calls = recordAnimations(app);
  app.click('[data-format="cue"]'); await tick(); calls.length = 0;
  app.click('#documentTitle'); await tick();
  const c = calls.find((x) => x.el.id === 'cueMenu');
  assert.equal(c.options.duration, 150);
  assert.deepEqual(JSON.parse(JSON.stringify(c.frames)), [{ opacity: 1, scale: '1' }, { opacity: 0, scale: '.96' }]);
  app.close();
});

test('rapid toggles settle hidden', async () => {
  const app = boot({ settings: { countdown: 0 } });
  app.w.HTMLElement.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {} }); // animations finish, as in a browser
  app.click('#start');
  for (let i = 0; i < 5; i++) { app.click('#readerMore'); await tick(); app.click('#readerMore'); await tick(); }
  const menu = app.$('#readerOptions');
  assert.equal(menu.hidden, true); assert.equal(menu.style.display, '', 'no leftover display override');
  app.close();
});

test('the tab and segment indicators slide on the control token', () => {
  assert.match(css, /\.parameter-tabs:has\(> button:nth-child\(2\)\[aria-selected="true"\]\)[^{]*\{[^}]*--seg-i:\s*1/);
  assert.match(css, /\.seg:has\(> label:nth-child\(2\) input:checked\)[^{]*\{[^}]*--seg-i:\s*1/);
  assert.match(css, /\.seg::before, \.parameter-tabs::before \{[^}]*translate: calc\(var\(--seg-i\) \* 100%\) 0;[^}]*transition: translate var\(--dur-control\) var\(--ease\)/);
});

test('buttons press to .97', () => {
  assert.match(css, /\.icon-btn, \.text-btn, \.btn, \.ib \{ transition: scale var\(--dur-control\) var\(--ease\); \}/);
  assert.match(css, /:active:not\(:disabled\)[^{]*\{ scale: \.97; \}/);
});
