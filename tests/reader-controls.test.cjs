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
  app.$('#stage').getBoundingClientRect = () => rect(0, 0, 1440, 900);
  app.$('.topbar').getBoundingClientRect = () => rect(311, 28, 818, 60);
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

test('below 1200px the column keeps the user margin', () => {
  const app = boot({ settings: { countdown: 0 } });
  Object.defineProperty(app.w, 'innerWidth', { value: 1000, configurable: true });
  app.click('#start');
  assert.deepEqual(padding(app), ['100px', '100px']);
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
