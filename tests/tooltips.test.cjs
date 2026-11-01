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
