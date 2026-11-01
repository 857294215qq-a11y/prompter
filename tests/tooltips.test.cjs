const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers/boot.cjs');

const DOC = { library: [{ id: 'a', text: '# 开场\n大家好欢迎回来。', updated: 1 }], current: 'a', settings: { countdown: 0 } };
const tips = (app) => app.w.prompterTooltips;
// Copy into this realm: objects built inside the jsdom window fail deepEqual on prototype alone.
const lab = (app, id) => ({ ...tips(app).label(id) });
const mac = (app) => Object.defineProperty(app.w.navigator, 'platform', { value: 'MacIntel', configurable: true });
const press = (app, target, key, mods = {}) => target.dispatchEvent(new app.w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));

test('every table entry names a real button whose accessible name matches', () => {
  const app = boot(DOC);
  assert.ok(tips(app).copy.length >= 30);
  for (const row of tips(app).copy) {
    const el = app.$('#' + row.id);
    assert.ok(el, 'missing button #' + row.id);
    if (row.name) assert.equal(el.getAttribute('aria-label'), row.name, row.id);
  }
  app.close();
});

// What each reader shortcut in the table must do: the engine function (or nav method) the key reaches.
const READER = { Escape: 'exit', Space: 'toggle', R: 'retake', G: 'voiceToggle', C: 'camToggle', '-': 'setSpeed', '+': 'setSpeed', '[': 'setFont', ']': 'setFont', B: 'addMark', L: 'openPanel', Q: 'nav.secUp', A: 'nav.paraUp', ArrowLeft: 'nav.pageUp', ArrowRight: 'nav.pageDown', D: 'nav.paraDown', E: 'nav.secDown' };
const eventKey = (k) => (k === 'Space' ? ' ' : k.length === 1 ? k.toLowerCase() : k);

test('every listed reader shortcut triggers its action', () => {
  const rows = (app) => tips(app).copy.filter((r) => r.key && !r.key.startsWith('Mod+'));
  const probe = boot(DOC), keys = rows(probe).map((r) => r.key); probe.close();
  assert.ok(keys.length >= 17);
  for (const key of keys) {
    const target = READER[key]; assert.ok(target, 'no expected action for ' + key);
    const app = boot(DOC); app.click('#start');
    if (target === 'toggle') {
      // toggle is a const arrow function, so it cannot be swapped out: check that playback state flips instead
      const before = app.w.eval('state');
      press(app, app.w.document.body, eventKey(key));
      assert.notEqual(app.w.eval('state'), before, `${key} should toggle playback`);
      app.close(); continue;
    }
    let calls = 0;
    const [obj, fn] = target.startsWith('nav.') ? [app.w.eval('nav'), target.slice(4)] : [app.w, target];
    obj[fn] = () => { calls++; };
    press(app, app.w.document.body, eventKey(key));
    assert.equal(calls, 1, `${key} should call ${target}`);
    app.close();
  }
});

test('every listed editor shortcut triggers its action', () => {
  const app = boot(DOC), rich = app.$('#richEditor'), ta = app.$('#ta');
  const original = ta.value;
  const t = rich.children[1].firstChild; app.w.getSelection().setBaseAndExtent(t, 0, t, 3);
  rich.dispatchEvent(new app.w.MouseEvent('mouseup')); app.click('[data-format="emphasis"]');
  const edited = ta.value; assert.notEqual(edited, original);
  rich.focus(); press(app, rich, 'z', { metaKey: true }); assert.equal(ta.value, original, '⌘Z undoes');
  press(app, rich, 'z', { metaKey: true, shiftKey: true }); assert.equal(ta.value, edited, '⇧⌘Z redoes');
  const calls = []; app.w.testEngine.enter = (c) => calls.push(c);
  app.w.getSelection().setBaseAndExtent(rich.children[1].firstChild, 1, rich.children[1].firstChild, 1); rich.dispatchEvent(new app.w.MouseEvent('mouseup'));
  press(app, rich, 'Enter', { metaKey: true }); assert.deepEqual(calls, [true], '⌘ 回车 starts from the caret');
  app.close();
});

test('Mac shows ⌘ glyphs and the table copy', () => {
  const app = boot(DOC); mac(app);
  assert.deepEqual(lab(app, 'undoEdit'), { name: '撤销', key: '⌘Z' });
  assert.deepEqual(lab(app, 'redoEdit'), { name: '重做', key: '⇧⌘Z' });
  assert.deepEqual(lab(app, 'startCaret'), { name: '从光标处开始', key: '⌘ 回车' });
  assert.deepEqual(lab(app, 'nPageUp'), { name: '上一页', key: '←' });
  assert.deepEqual(lab(app, 'spDn'), { name: '减慢语速', key: '−' });
  assert.deepEqual(lab(app, 'pPlay'), { name: '播放', key: '空格' }, 'play follows its current name');
  assert.deepEqual(lab(app, 'mx'), { name: '水平镜像', key: null }, 'M only works in the reader');
  app.close();
});

test('Windows shows Ctrl shortcuts', () => {
  const app = boot(DOC); Object.defineProperty(app.w.navigator, 'platform', { value: 'Win32', configurable: true });
  assert.equal(tips(app).label('undoEdit').key, 'Ctrl+Z');
  assert.equal(tips(app).label('redoEdit').key, 'Ctrl+Shift+Z');
  assert.equal(tips(app).label('startCaret').key, 'Ctrl+回车');
  app.close();
});

// Tooltip controller. setTimeout is captured so the 500ms hover delay runs on demand.
function withTimers(app) {
  const timers = [];
  app.w.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  app.w.clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].fn = () => {}; };
  app.runTimers = () => { const due = timers.splice(0); for (const t of due) t.fn(); };
  return app;
}
const tip = (app) => app.$('#tooltip');
const shown = (app) => !tip(app).hidden;
const hover = (app, el) => el.dispatchEvent(new app.w.MouseEvent('pointerover', { bubbles: true }));
const leave = (app, el) => el.dispatchEvent(new app.w.MouseEvent('pointerout', { bubbles: true }));

test('hover shows name and shortcut after 500ms and hides on leave', () => {
  const app = withTimers(boot(DOC)); mac(app);
  const undo = app.$('#undoEdit');
  hover(app, undo); assert.equal(shown(app), false, 'not before the delay');
  app.runTimers(); assert.equal(shown(app), true);
  assert.equal(tip(app).textContent, '撤销  ⌘Z');
  leave(app, undo); assert.equal(shown(app), false);
  app.close();
});

test('keyboard focus shows at once; blur hides', () => {
  const app = withTimers(boot(DOC)); app.click('#start');
  const next = app.$('#nParaDn'); next.focus();
  assert.equal(shown(app), true); assert.equal(tip(app).textContent, '下一段  D');
  next.blur(); assert.equal(shown(app), false);
  app.close();
});

test('a click cancels a pending hover tooltip', () => {
  const app = withTimers(boot(DOC));
  const undo = app.$('#undoEdit');
  hover(app, undo); undo.dispatchEvent(new app.w.MouseEvent('pointerdown', { bubbles: true })); undo.click();
  app.runTimers(); assert.equal(shown(app), false);
  app.close();
});

test('Escape hides the tooltip and still reaches the app', () => {
  const app = withTimers(boot(DOC)); app.click('#start');
  app.$('#pRetake').focus(); assert.equal(shown(app), true);
  app.w.document.body.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(shown(app), false); assert.equal(app.$('#prompter').hidden, true, 'Escape still returns to the editor');
  app.close();
});

test('no tooltip on touch-only devices', () => {
  const app = withTimers(boot(DOC, { media: (q) => q.includes('hover: none') }));
  hover(app, app.$('#undoEdit')); app.runTimers(); assert.equal(shown(app), false);
  app.$('#undoEdit').focus(); assert.equal(shown(app), false);
  app.close();
});

test('screen readers get the name once and the shortcut as a description', () => {
  const app = boot(DOC);
  const undo = app.$('#undoEdit');
  assert.equal(undo.getAttribute('aria-label'), '撤销');
  const desc = app.$('#' + undo.getAttribute('aria-describedby').split(' ').find((i) => i.startsWith('tip-key-')));
  assert.equal(desc.textContent, '快捷键 ' + tips(app).label('undoEdit').key);
  app.click('#toggleLibrary'); app.click('#focusEditor'); // labels rewritten by ui-v3
  for (const row of tips(app).copy) assert.equal(app.$('#' + row.id).hasAttribute('title'), false, row.id + ' still has a native title');
  app.close();
});

test('existing descriptions are kept', () => {
  const app = boot(DOC);
  const ids = app.$('#startCaret').getAttribute('aria-describedby').split(' ');
  assert.ok(ids.includes('startCaretHelp')); assert.ok(ids.includes('tip-key-startCaret'));
  app.close();
});

test("tooltip follows the toggle's new name", () => {
  const app = withTimers(boot(DOC));
  const t = app.$('#toggleLibrary');
  t.focus(); assert.equal(tip(app).textContent, '收起稿件栏');
  t.click(); assert.equal(shown(app), false, 'a click hides it');
  t.blur(); t.focus(); assert.equal(tip(app).textContent, '展开稿件栏');
  app.close();
});

test('hidden buttons never show a tooltip', () => {
  const app = withTimers(boot(DOC));
  const next = app.$('#nParaDn'); // the reader is hidden in the editor
  hover(app, next); app.runTimers(); assert.equal(shown(app), false);
  app.$('#newScript').hidden = true; app.$('#newScript').focus(); assert.equal(shown(app), false);
  app.close();
});
