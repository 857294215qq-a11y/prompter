const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..', '..');
const legacy = [
  { id: 'first', text: '# 开场\n第一份已有稿件。\n\n# 第二节\n需要保留的内容。', updated: 1000 },
  { id: 'second', text: '# 另一份稿件\n不应丢失的正文。', updated: 2000 },
];

// Promise rejections inside jsdom reach Node, not the window; route them to every app still open.
const live = new Set();
process.on('unhandledRejection', (reason) => { for (const errors of live) errors.push(String(reason?.message || reason)); });

// 安卓 App 里 Capacitor 注入的原生插件：每个方法都返回成功
const fakeLink = () => new Proxy({}, { get: (_, k) => (k === 'then' ? undefined : () => Promise.resolve({})) });

function boot(saved = {}, { native = false, url = 'https://prompter.test/' } = {}) {
  const errors = [];
  live.add(errors);
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM(readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole,
  });
  const w = dom.window;
  w.addEventListener('error', (e) => errors.push(e.message));
  w.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
  w.requestAnimationFrame = (callback) => { w.runFrame = callback; return 1; };
  w.cancelAnimationFrame = () => {};
  if (native) w.Capacitor = { isNativePlatform: () => true, Plugins: { Link: fakeLink() } };
  // jsdom has no layout engine; provide a nonzero reading surface for playback.
  Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get() { return 800; } });
  Object.defineProperty(w.HTMLElement.prototype, 'offsetHeight', { get() { return this.id === 'content' ? 1800 : 40; } });
  Object.defineProperty(w.HTMLElement.prototype, 'offsetTop', { get() { return +(this.dataset.i || 0) * 120; } });
  for (const [key, value] of Object.entries({ library: legacy, current: 'first', ...saved }))
    w.localStorage.setItem('prompter:' + key, JSON.stringify(value));
  // Run each script as a real classic script so top-level let/const are shared across files, as in a browser.
  const context = dom.getInternalVMContext();
  for (const script of w.document.scripts) {
    const src = script.getAttribute('src');
    if (src && src.includes('://')) continue;
    const code = src ? readFileSync(path.join(root, src), 'utf8') : script.textContent;
    new vm.Script(code, { filename: src || 'index.html' }).runInContext(context);
    if (src === 'ui-v3.js') {
      const init = w.initPrompterV3;
      w.initPrompterV3 = (api) => { w.testEngine = api; w.testView = init(api); return w.testView; };
    }
  }
  const $ = (s) => w.document.querySelector(s);
  const click = (s) => { const el = $(s); assert.ok(el, 'Missing control ' + s); el.click(); };
  const input = (s, value) => { $(s).value = value; $(s).dispatchEvent(new w.Event('input', { bubbles: true })); };
  // Let timers, microtasks and load handlers run, then report everything that went wrong.
  const settle = async (ms = 100) => { await new Promise((r) => setTimeout(r, ms)); return errors; };
  return { w, $, click, input, errors, settle, close: () => { live.delete(errors); w.close(); }, stored: (k) => JSON.parse(w.localStorage.getItem('prompter:' + k)) };
}

module.exports = { boot, legacy, root };
