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
  // Options can be hidden (附近设备 is app-only): count and index visible labels only.
  assert.match(css, /\.seg:has\(> label:nth-child\(2 of :not\(\[hidden\]\)\) input:checked\)[^{]*\{[^}]*--seg-i:\s*1/);
  assert.match(css, /\.seg:has\(> label:nth-child\(3 of :not\(\[hidden\]\)\)\)[^{]*\{[^}]*--seg-n:\s*3/);
  assert.doesNotMatch(css, /\.seg:has\(> label:nth-child\(\d\)/, 'no index that counts hidden options');
  assert.match(css, /\.seg::before, \.parameter-tabs::before \{[^}]*translate: calc\(var\(--seg-i\) \* 100%\) 0;[^}]*transition: translate var\(--dur-control\) var\(--ease\)/);
});

test('buttons press to .97, and only when motion is welcome', () => {
  const block = css.match(/@media \(prefers-reduced-motion: no-preference\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/)?.[0] || '';
  assert.match(block, /\.icon-btn, \.text-btn, \.btn, \.ib \{ transition: scale var\(--dur-control\) var\(--ease\); \}/);
  assert.match(block, /:active:not\(:disabled\)[^{]*\{ scale: \.97; \}/);
  assert.doesNotMatch(css.replace(block, ''), /scale: \.97/, 'no press scale outside the no-preference block');
});

// Task 3: scroll curve, countdown beat, text flashes
test('jump scroll follows the shared curve', () => {
  const app = boot({ settings: { countdown: 0 } }); app.click('#start');
  const f = app.w.cubicBezier(.32, .72, 0, 1);
  assert.ok(Math.abs(f(0)) < 1e-3); assert.ok(Math.abs(f(.5) - 0.9548) < 1e-3); assert.ok(Math.abs(f(1) - 1) < 1e-3);
  app.w.performance.now = () => 160;
  app.w.eval('anim = { from: 0, to: 1000, t0: 0, dur: 320 }; last = 160;');
  app.w.frame();
  assert.ok(Math.abs(app.w.eval('pos') - 954.8) < 1, 'pos ' + app.w.eval('pos'));
  app.close();
});

test('voice follow never animates', () => {
  const app = boot({ settings: { countdown: 0 } }); app.click('#start');
  app.w.eval('anim = null; state = "playing"; voice.on = true; voice.target = 500; pos = 0;');
  app.w.frame();
  assert.equal(app.w.eval('anim'), null);
  app.close();
});

function countdown(app) {
  const beats = [], ticks = [];
  app.$('#cd').animate = (frames, options) => { const a = { frames, options, cancelled: false, cancel() { a.cancelled = true; }, finished: new Promise(() => {}) }; beats.push(a); return a; };
  app.w.setInterval = (fn) => { ticks.push(fn); return 1; };
  return { beats, tick: () => ticks.at(-1)() };
}

test('each countdown beat scales in', async () => {
  const app = boot({ settings: { countdown: 3 } }), { beats, tick } = countdown(app);
  app.click('#start'); app.click('#pPlay'); await tick0(); // the countdown runs when playback starts
  tick(); await tick0(); tick(); await tick0();
  assert.equal(beats.length, 3, '3, 2, 1');
  for (const b of beats) {
    assert.deepEqual(JSON.parse(JSON.stringify(b.frames)), [{ scale: 1.15, opacity: 0 }, { scale: 1, opacity: 1 }]);
    assert.equal(b.options.duration, 240); assert.equal(b.options.easing, TOKENS['--ease']);
  }
  app.close();
});
const tick0 = () => new Promise(setImmediate);

test('pausing during the countdown leaves no running beat', async () => {
  const app = boot({ settings: { countdown: 3 } }), { beats } = countdown(app);
  app.click('#start'); app.click('#pPlay'); await tick0();
  app.click('#pPlay'); await tick0(); // pause while counting down
  assert.equal(app.$('#cd').hidden, true);
  assert.ok(beats.length >= 1 && beats.every((b) => b.cancelled), 'beat cancelled when the countdown hides');
  app.close();
});

test('only the changed run flashes', async () => {
  const app = boot({ library: [{ id: 'a', text: '开场[停顿]正文[换气]结尾', updated: 1 }], current: 'a' });
  const flashes = [];
  app.w.HTMLElement.prototype.animate = function (frames, options) { if (this.closest('#richEditor')) flashes.push({ el: this, frames, options }); return { finished: Promise.resolve(), cancel() {} }; };
  const rich = app.$('#richEditor'), last = rich.children[0].lastChild; // text node "结尾"
  app.w.getSelection().setBaseAndExtent(last, 2, last, 2); rich.dispatchEvent(new app.w.MouseEvent('mouseup'));
  app.click('[data-format="cue"]'); app.click('#cueMenu [data-cue="加重"]');
  assert.equal(flashes.length, 1, 'one flash');
  assert.equal(flashes[0].el.textContent, '加重');
  assert.deepEqual(JSON.parse(JSON.stringify(flashes[0].frames)), [{ opacity: 0.4 }, { opacity: 1 }]);
  assert.equal(flashes[0].options.duration, 160);
  flashes.length = 0; rich.dispatchEvent(new app.w.FocusEvent('blur')); await tick0();
  assert.equal(flashes.length, 0, 'a re-render flashes nothing');
  app.close();
});

test('adding emphasis flashes the new bold run', () => {
  const app = boot({ library: [{ id: 'a', text: '大家好欢迎回来', updated: 1 }], current: 'a' });
  const flashes = [];
  app.w.HTMLElement.prototype.animate = function () { if (this.closest('#richEditor')) flashes.push(this); return { finished: Promise.resolve(), cancel() {} }; };
  const rich = app.$('#richEditor'), t = rich.children[0].firstChild;
  app.w.getSelection().setBaseAndExtent(t, 0, t, 3); rich.dispatchEvent(new app.w.MouseEvent('mouseup'));
  app.click('[data-format="emphasis"]');
  assert.equal(flashes.length, 1); assert.equal(flashes[0].tagName, 'STRONG'); assert.equal(flashes[0].textContent, '大家好');
  app.close();
});

// Task 4: reduced motion keeps a 120ms fade
const reduced = (q) => q.includes('prefers-reduced-motion');

test('reduced motion fades surfaces and popovers only', async () => {
  const app = boot({ library: CUE.library, current: 'a' }, { media: reduced });
  const calls = []; app.w.HTMLElement.prototype.animate = function (frames, options) { calls.push({ frames, options }); return { finished: Promise.resolve(), cancel() {} }; };
  app.click('#appSettings'); await tick(); app.click('[data-close="appDialog"]'); await tick();
  app.click('#toggleLibrary'); await tick();
  app.click('[data-format="cue"]'); await tick();
  assert.ok(calls.length >= 3, 'still animates: ' + calls.length);
  for (const c of calls) {
    for (const f of c.frames) assert.deepEqual(Object.keys(f), ['opacity'], JSON.stringify(c.frames));
    assert.equal(c.options.duration, 120);
  }
  app.close();
});

test('reduced motion is read live', () => {
  const app = boot({ settings: { countdown: 0 } }); app.click('#start');
  app.w.matchMedia = (q) => ({ matches: reduced(q), media: q, addEventListener() {}, removeEventListener() {} });
  const target = Math.round(app.w.eval('maxPos') / 2);
  app.w.jumpTo(target);
  assert.equal(app.w.eval('anim'), null); assert.equal(app.w.eval('pos'), target);
  app.close();
});

test('final states match after rapid toggles in both modes', async () => {
  const run = async (media) => {
    const app = boot({ library: CUE.library, current: 'a', settings: { countdown: 0 } }, { media });
    app.w.HTMLElement.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {} });
    for (let i = 0; i < 3; i++) { app.click('#toggleLibrary'); app.click('#toggleSettings'); }
    app.click('[data-format="cue"]'); app.click('[data-format="cue"]'); await tick();
    app.click('#start'); app.click('#readerMore'); app.click('#readerMore'); app.click('#readerMore'); await tick();
    const state = { lib: app.$('#libraryPanel').inert, set: app.$('#settingsPanel').inert, cue: app.$('#cueMenu').hidden, menu: app.$('#readerOptions').hidden, expanded: app.$('#readerMore').getAttribute('aria-expanded') };
    app.close(); return state;
  };
  assert.deepEqual(await run(reduced), await run(() => false));
});

test('reduced-motion CSS keeps a 120ms opacity fade instead of switching motion off', () => {
  const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g).join('\n');
  assert.match(block, /transition-property:\s*opacity !important/);
  assert.match(block, /transition-duration:\s*var\(--dur-reduced\) !important/);
  assert.doesNotMatch(block, /transition:\s*none/);
  assert.doesNotMatch(read('index.html'), /prefers-reduced-motion: reduce\)\s*\{\s*\.bar, #content \.s, #toast \{ transition: none; \}/);
});

test('removing emphasis fades its line in', () => {
  const app = boot({ library: [{ id: 'a', text: '开场\n**大家好**欢迎回来', updated: 1 }], current: 'a' });
  const flashes = [];
  app.w.HTMLElement.prototype.animate = function (frames, options) { if (this.closest('#richEditor')) flashes.push({ el: this, frames, options }); return { finished: Promise.resolve(), cancel() {} }; };
  const rich = app.$('#richEditor'), t = rich.children[1].querySelector('strong').firstChild;
  app.w.getSelection().setBaseAndExtent(t, 0, t, 3); rich.dispatchEvent(new app.w.MouseEvent('mouseup'));
  app.click('[data-format="emphasis"]');
  assert.equal(app.$('#ta').value, '开场\n大家好欢迎回来');
  assert.equal(flashes.length, 1); assert.equal(flashes[0].el, rich.children[1], 'the changed line, not the whole editor');
  assert.equal(flashes[0].options.duration, 160);
  app.close();
});
