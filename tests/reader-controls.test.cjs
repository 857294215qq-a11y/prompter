const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { boot, root } = require('./helpers/boot.cjs');

const css = readFileSync(path.join(root, 'ui-v3.css'), 'utf8');
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });

// A 1440×900 desktop reader whose top pill spans 311–1129, as in the Figma reader frames.
function desktopReader(saved = {}) {
  const app = boot({ settings: { countdown: 0, ...saved } });
  Object.defineProperty(app.w, 'innerWidth', { value: 1440, configurable: true });
  app.$('.topbar').getBoundingClientRect = () => rect(311, 28, 818, 60);
  // The pill is centred, so its layout width fixes the inset: (1440 − 818) / 2 = 311.
  Object.defineProperty(app.$('#stage'), 'clientWidth', { value: 1440 });
  Object.defineProperty(app.$('.topbar'), 'offsetWidth', { value: 818 });
  app.click('#start');
  return app;
}
const padding = (app) => [app.$('#content').style.paddingLeft, app.$('#content').style.paddingRight];

test('reading column lines up with the top pill on desktop', () => {
  const app = desktopReader();
  assert.deepEqual(padding(app), ['311px', '311px']);
  app.close();
});

test('column padding is symmetric when mirrored', () => {
  const app = desktopReader({ mirrorX: true });
  assert.deepEqual(padding(app), ['311px', '311px']);
  app.close();
});

test('user margin wins when wider than the pill inset', () => {
  const app = desktopReader({ margin: 30 }); // 30vw of 1440 = 432px
  assert.deepEqual(padding(app), ['432px', '432px']);
  app.close();
});

test('below 768px (phones) the column keeps the user margin', () => {
  const app = boot({ settings: { countdown: 0 } });
  Object.defineProperty(app.w, 'innerWidth', { value: 700, configurable: true });
  Object.defineProperty(app.$('#stage'), 'clientWidth', { value: 700 });
  Object.defineProperty(app.$('.topbar'), 'offsetWidth', { value: 500 }); // would give a 100px inset if it applied
  app.click('#start');
  assert.deepEqual(padding(app), ['70px', '70px'], '10vw of 700');
  app.close();
});

test('timer labels are 12px secondary text', () => {
  const rules = css.match(/[^{}]*(?:\.times > span:not|#tPct::before)[^{}]*\{[^}]*\}/g);
  assert.ok(rules.length >= 3);
  for (const r of rules) {
    assert.doesNotMatch(r, /font-size:\s*10px/, r);
    if (/font-size/.test(r.split('{')[1])) assert.match(r, /font-size:\s*12px/, r);
    assert.match(r, /color:\s*var\(--muted\)/, r);
  }
});

const menuNames = (app) => [...app.$('#readerOptions').querySelectorAll('[role^="menuitem"]')].filter((b) => !b.hidden).map((b) => b.getAttribute('aria-label'));

test('more menu holds only the agreed items, in groups', () => {
  const app = desktopReader(); app.$('#pPip').hidden = false;
  app.click('#readerMore');
  assert.equal(app.$('#readerOptions').getAttribute('role'), 'menu');
  assert.deepEqual(menuNames(app), ['水平镜像', '垂直镜像', '打开置顶小窗', '连接遥控器', '全屏', '阅读参数', '改字']);
  assert.equal(app.$('#readerOptions').querySelectorAll('hr[role="separator"]').length, 2);
  for (const id of ['pVoice', 'pCam', 'nParaUp', 'nSecUp', 'pMark', 'pList']) assert.equal(app.$('#readerOptions #' + id), null, id);
  app.close();
});

test('vertical mirror toggles, shows a check, closes the menu, and stays checked', () => {
  const app = desktopReader();
  app.click('#readerMore');
  const item = app.$('#pMy');
  assert.equal(item.getAttribute('role'), 'menuitemcheckbox'); assert.equal(item.getAttribute('aria-checked'), 'false');
  item.click();
  assert.equal(app.w.testEngine.settings.mirrorY, true);
  assert.equal(item.getAttribute('aria-checked'), 'true'); assert.equal(item.hasAttribute('aria-pressed'), false);
  assert.equal(app.$('#readerOptions').hidden, true);
  app.click('#readerMore'); assert.equal(app.$('#pMy').getAttribute('aria-checked'), 'true');
  app.close();
});

test('menu shows shortcuts M, V and F', () => {
  const app = desktopReader();
  const key = (id) => app.$('#' + id + ' .menu-key')?.textContent;
  assert.deepEqual([key('pMx'), key('pMy'), key('pFs')], ['M', 'V', 'F']);
  assert.equal(app.$('#pMx').getAttribute('aria-keyshortcuts'), 'M');
  app.close();
});

test('menu opens below the pill, right-aligned, and works from the keyboard', () => {
  const app = desktopReader();
  const more = app.$('#readerMore'); more.focus(); more.click();
  const menu = app.$('#readerOptions');
  assert.equal(menu.style.top, '96px'); assert.equal(menu.style.right, '311px');
  const key = (k) => app.w.document.activeElement.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  assert.equal(app.w.document.activeElement.id, 'pMx');
  key('ArrowDown'); assert.equal(app.w.document.activeElement.id, 'pMy');
  key('End'); assert.equal(app.w.document.activeElement.id, 'pEdit');
  key('ArrowDown'); assert.equal(app.w.document.activeElement.id, 'pMx', 'wraps');
  key('Escape'); assert.equal(menu.hidden, true); assert.equal(app.w.document.activeElement, more);
  app.close();
});

test('tablet menu contains no voice or camera', () => {
  const app = boot({ settings: { countdown: 0 } }, { media: (q) => /max-width:\s*1199px/.test(q) });
  app.click('#start'); app.click('#readerMore');
  assert.ok(app.$('.topbar #pVoice')); assert.ok(app.$('.topbar #pCam'));
  assert.equal(app.$('#readerOptions #pVoice'), null);
  app.close();
});

test('retake uses the same rotate-ccw icon in the reader and the phone remote', () => {
  const app = boot();
  const href = (sel) => app.$(sel)?.getAttribute('href');
  assert.equal(href('#pRetake use'), '#i-rotate-ccw');
  assert.equal(href('#remote [data-c="retake"] use'), '#i-rotate-ccw');
  assert.notEqual(href('#remote [data-c="home"] use'), '#i-rotate-ccw', '回到开头 keeps its own icon');
  assert.match(app.$('#i-rotate-ccw').innerHTML, /M3 12a9 9 0 1 0 9-9 9\.75 9\.75 0 0 0-6\.74 2\.74L3 8/);
  app.close();
});

// The guide element marks the reading line: its top and height are set by the engine's layout().
const guideBox = (app) => { const g = app.$('#guide').style; return { top: parseFloat(g.top), height: parseFloat(g.height) }; };

test('hint sits just below the reading line', () => {
  const app = boot({ settings: { countdown: 0 } });
  app.$('.bottombar').getBoundingClientRect = () => rect(200, 820, 1040, 60);
  app.$('#prompter').getBoundingClientRect = () => rect(0, 0, 1440, 900);
  app.click('#start');
  const hint = app.$('#hint'), g = guideBox(app);
  assert.equal(hint.hidden, false, 'ready hint shows before playing');
  assert.equal(parseFloat(hint.style.top), g.top + g.height + 24);
  assert.equal(hint.style.bottom, 'auto');
  app.close();
});

test('hint flips above a low reading line', () => {
  const app = boot({ settings: { countdown: 0, guide: 80 } });
  app.$('.bottombar').getBoundingClientRect = () => rect(200, 700, 1040, 60);
  app.$('#prompter').getBoundingClientRect = () => rect(0, 0, 1440, 900);
  app.click('#start');
  const hint = app.$('#hint'), g = guideBox(app);
  assert.equal(parseFloat(hint.style.top), g.top - 24 - hint.offsetHeight);
  app.close();
});

// Play with the engine's idle timer under test control: setTimeout calls are collected, not scheduled.
function playing() {
  const app = boot({ settings: { countdown: 0 } });
  app.click('#start'); app.click('#pPlay');
  const timers = [];
  app.w.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  app.runIdle = () => { const t = timers.filter((x) => x.ms === 2500).at(-1); timers.length = 0; t?.fn(); };
  return app;
}
const idle = (app) => app.$('#prompter').classList.contains('idle');

test('bars hide after 2.5s of playing', () => {
  const app = playing();
  app.w.testEngine.poke(); app.runIdle();
  assert.equal(idle(app), true);
  app.close();
});

test('bars stay while the menu is open', () => {
  const app = playing();
  app.click('#readerMore'); app.runIdle();
  assert.equal(idle(app), false);
  app.close();
});

test('bars stay while focus is inside, and hide 2.5s after it leaves', () => {
  const app = playing();
  app.$('#pRetake').focus(); app.w.testEngine.poke(); app.runIdle();
  assert.equal(idle(app), false, 'focus on a bar button keeps the bars');
  app.$('#pRetake').blur(); app.runIdle();
  assert.equal(idle(app), true, 'leaving the bar restarts the timer');
  app.close();
});

test('idle bars move 8px on the shared curve: 240ms out, 200ms back', () => {
  assert.match(css, /#prompter\.idle \.topbar \{ translate: 0 -8px; \}/);
  assert.match(css, /#prompter\.idle \.bottombar \{ translate: 0 8px; \}/);
  assert.match(css, /#prompter \.bar \{ transition: opacity var\(--dur-popover-in\) var\(--ease\), translate var\(--dur-popover-in\) var\(--ease\)/);
  assert.match(css, /#prompter\.idle \.bar \{ transition-duration: var\(--dur-surface\); \}/);
});

// Final review fixes
const { JSDOM } = require('jsdom');

test('picture-in-picture margin follows the small window, not the main one', async () => {
  const app = desktopReader();
  const pip = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://prompter.test/', pretendToBeVisual: true });
  Object.defineProperty(pip.window, 'innerWidth', { value: 560, configurable: true });
  app.w.documentPictureInPicture = { requestWindow: async () => pip.window };
  const content = app.$('#content'); // the stage moves into the PiP document
  await app.w.testEngine.togglePip(); app.w.testEngine.layout(true);
  assert.deepEqual([content.style.paddingLeft, content.style.paddingRight], ['56px', '56px'], '10% of the 560px window, no pill inset');
  pip.window.close(); app.close();
});

test('speed and font values keep a fixed width so the pill does not change size', () => {
  const rule = css.match(/\.bar \.stepper output \{[^}]*\}/g).at(-1);
  assert.match(rule, /width:\s*3ch/); assert.match(rule, /font-variant-numeric:\s*tabular-nums/);
  assert.doesNotMatch(rule, /min-width:\s*0/);
});

test('a mouse trip through the menu leaves no focus on the bars', () => {
  const app = playing();
  app.$('#readerMore').dispatchEvent(new app.w.MouseEvent('click', { bubbles: true, detail: 1 }));
  app.$('#pMy').dispatchEvent(new app.w.MouseEvent('click', { bubbles: true, detail: 1 }));
  assert.equal(app.$('#readerOptions').hidden, true);
  assert.equal(app.w.document.activeElement?.closest?.('#prompter .bar') ?? null, null);
  app.runIdle(); assert.equal(idle(app), true);
  app.close();
});

test('keys inside the menu stay in the menu: Space toggles the item, not playback', () => {
  const app = desktopReader();
  const more = app.$('#readerMore'); more.focus(); more.click();
  const state = app.$('#pPlay').getAttribute('aria-label');
  const key = (k) => app.w.document.activeElement.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  key(' ');
  assert.equal(app.w.testEngine.settings.mirrorX, true, 'Space activates the focused item');
  assert.equal(app.$('#pPlay').getAttribute('aria-label'), state, 'playback untouched');
  assert.equal(app.w.document.activeElement, more, 'keyboard activation returns focus to 更多');
  more.click(); key('m');
  assert.equal(app.w.testEngine.settings.mirrorX, true, 'M inside the menu is not the mirror shortcut');
  app.close();
});
