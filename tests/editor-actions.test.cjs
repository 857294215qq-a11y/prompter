const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers/boot.cjs');

// Put the rich editor's selection on line `i`, characters a..b, and let ui-v3 read it.
function select(app, i, a, b = a) {
  const rich = app.$('#richEditor'), line = rich.children[i];
  const walker = app.w.document.createTreeWalker(line, app.w.NodeFilter.SHOW_TEXT);
  const nodes = []; let n; while ((n = walker.nextNode())) nodes.push(n);
  const at = (k) => { for (const t of nodes) { if (k <= t.length) return [t, k]; k -= t.length; } return [nodes.at(-1), nodes.at(-1).length]; };
  app.w.getSelection().setBaseAndExtent(...at(a), ...at(b));
  rich.dispatchEvent(new app.w.MouseEvent('mouseup'));
}
const source = (app) => app.$('#ta').value;
const submit = (app, id) => app.$(id).dispatchEvent(new app.w.Event('submit', { cancelable: true }));
const DOC = { library: [{ id: 'a', text: '# 开场\n大家好欢迎回来。\n**重点句**之后', updated: 1 }], current: 'a' };
const CUES = { library: [{ id: 'c', text: '开场[停顿]正文\n结尾【微笑】好', updated: 1 }], current: 'c' };

test('section tool is pressed on a heading line and not on body text', () => {
  const app = boot(DOC);
  select(app, 0, 1); assert.equal(app.$('[data-format="section"]').getAttribute('aria-pressed'), 'true');
  select(app, 1, 1); assert.equal(app.$('[data-format="section"]').getAttribute('aria-pressed'), 'false');
  app.close();
});

test('emphasis is unavailable without a selection and clicking it changes nothing', () => {
  const app = boot(DOC); select(app, 1, 2);
  const b = app.$('[data-format="emphasis"]'), before = source(app);
  assert.equal(b.getAttribute('aria-disabled'), 'true');
  b.click(); assert.equal(source(app), before);
  assert.equal(app.$('#undoEdit').disabled, true, 'no undo step was made');
  app.close();
});

test('emphasis wraps a selection, then removes it, without changing the words', () => {
  const app = boot(DOC); select(app, 1, 0, 3);
  assert.equal(app.$('[data-format="emphasis"]').getAttribute('aria-disabled'), 'false');
  app.click('[data-format="emphasis"]');
  assert.equal(source(app), '# 开场\n**大家好**欢迎回来。\n**重点句**之后');
  select(app, 1, 0, 3); // the <strong> text
  assert.equal(app.$('[data-format="emphasis"]').getAttribute('aria-pressed'), 'true');
  app.click('[data-format="emphasis"]');
  assert.equal(source(app), '# 开场\n大家好欢迎回来。\n**重点句**之后');
  app.close();
});

test('emphasis removes markers when the selection covers the whole strong text', () => {
  const app = boot(DOC); select(app, 2, 0, 3); // exactly 重点句
  app.click('[data-format="emphasis"]');
  assert.equal(source(app), '# 开场\n大家好欢迎回来。\n重点句之后');
  app.close();
});

test('each format action is one undo step', () => {
  const app = boot(DOC), original = source(app);
  select(app, 1, 0, 3); app.click('[data-format="emphasis"]');
  app.click('#undoEdit'); assert.equal(source(app), original); assert.equal(app.$('#undoEdit').disabled, true);
  select(app, 1, 1); app.click('[data-format="section"]');
  app.click('#undoEdit'); assert.equal(source(app), original);
  app.close();
});


test('cue menu inserts the chosen cue at the caret', () => {
  const app = boot(DOC); select(app, 1, 3);
  app.click('[data-format="cue"]');
  assert.equal(app.$('#cueMenu').hidden, false);
  assert.equal(app.$('[data-format="cue"]').getAttribute('aria-expanded'), 'true');
  app.click('#cueMenu [data-cue="换气"]');
  assert.equal(source(app), '# 开场\n大家好[换气]欢迎回来。\n**重点句**之后');
  assert.equal(app.$('#cueMenu').hidden, true);
  assert.equal(app.$('[data-format="cue"]').getAttribute('aria-expanded'), 'false');
  app.close();
});

test('with a selection the cue goes after it and the selected words stay', () => {
  const app = boot(DOC); select(app, 1, 0, 3);
  app.click('[data-format="cue"]'); app.click('#cueMenu [data-cue="停顿"]');
  assert.equal(source(app), '# 开场\n大家好[停顿]欢迎回来。\n**重点句**之后');
  app.close();
});

test('cue menu works from the keyboard and Escape returns focus to the tool', () => {
  const app = boot(DOC); select(app, 1, 3);
  const tool = app.$('[data-format="cue"]'); tool.focus(); tool.click();
  const key = (k) => app.w.document.activeElement.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  assert.equal(app.w.document.activeElement.dataset.cue, '停顿');
  key('ArrowDown'); assert.equal(app.w.document.activeElement.dataset.cue, '换气');
  key('ArrowUp'); key('ArrowUp'); assert.equal(app.w.document.activeElement.id, 'cueCustom', 'ArrowUp wraps');
  key('Home'); assert.equal(app.w.document.activeElement.dataset.cue, '停顿');
  key('End'); assert.equal(app.w.document.activeElement.id, 'cueCustom');
  key('Escape');
  assert.equal(app.$('#cueMenu').hidden, true); assert.equal(app.w.document.activeElement, tool);
  app.close();
});

test('custom cue strips brackets and line breaks and caps at 12', () => {
  const app = boot(DOC); select(app, 1, 3);
  app.click('[data-format="cue"]'); app.click('#cueCustom');
  const input = app.$('#cueCustomInput'); assert.equal(app.w.document.activeElement, input);
  assert.equal(input.maxLength, 12);
  input.value = '看]这\n里【一二三四五六七八九十'; submit(app, '#cueCustomForm');
  // brackets and the line break are stripped, leaving 13 characters; the first 12 are kept
  assert.equal(source(app), '# 开场\n大家好[看这里一二三四五六七八九]欢迎回来。\n**重点句**之后');
  assert.equal(app.$('#richEditor').children[1].querySelector('.editor-cue')?.textContent, '看这里一二三四五六七八九');
  app.close();
});

test('an empty custom cue inserts nothing', () => {
  const app = boot(DOC), before = source(app); select(app, 1, 3);
  app.click('[data-format="cue"]'); app.click('#cueCustom');
  app.$('#cueCustomInput').value = ' ] '; submit(app, '#cueCustomForm');
  assert.equal(source(app), before); assert.equal(app.$('#undoEdit').disabled, true);
  app.close();
});

test('clicking outside the cue menu closes it without inserting', () => {
  const app = boot(DOC), before = source(app); select(app, 1, 3);
  app.click('[data-format="cue"]'); app.click('#documentTitle');
  assert.equal(app.$('#cueMenu').hidden, true); assert.equal(source(app), before);
  app.close();
});

const cueAt = (app, line) => app.$('#richEditor').children[line].querySelector('.editor-cue');

test('clicking a cue opens its editor with the cue text', () => {
  const app = boot(CUES); cueAt(app, 0).click();
  assert.equal(app.$('#cueEditor').hidden, false);
  assert.equal(app.$('#cueEditInput').value, '停顿'); assert.equal(app.w.document.activeElement, app.$('#cueEditInput'));
  assert.equal(app.$('#cueEditInput').maxLength, 12);
  app.close();
});

test('Enter replaces the cue text in one undo step', () => {
  const app = boot(CUES), original = source(app); cueAt(app, 0).click();
  app.$('#cueEditInput').value = '换气'; submit(app, '#cueEditor');
  assert.equal(source(app), '开场[换气]正文\n结尾【微笑】好'); assert.equal(app.$('#cueEditor').hidden, true);
  app.click('#undoEdit'); assert.equal(source(app), original); assert.equal(app.$('#undoEdit').disabled, true);
  app.close();
});

test('editing a full-width cue keeps its brackets', () => {
  const app = boot(CUES); cueAt(app, 1).click();
  app.$('#cueEditInput').value = '看镜头'; submit(app, '#cueEditor');
  assert.equal(source(app), '开场[停顿]正文\n结尾【看镜头】好');
  app.close();
});

test('delete, or an emptied cue, removes the whole cue and leaves the words', () => {
  let app = boot(CUES); cueAt(app, 0).click(); app.click('#cueDelete');
  assert.equal(source(app), '开场正文\n结尾【微笑】好'); assert.equal(app.$('#cueEditor').hidden, true); app.close();
  app = boot(CUES); cueAt(app, 0).click(); app.$('#cueEditInput').value = ''; submit(app, '#cueEditor');
  assert.equal(source(app), '开场正文\n结尾【微笑】好'); app.close();
});

test('Escape closes the cue editor without changes', () => {
  const app = boot(CUES), before = source(app); cueAt(app, 0).click();
  app.$('#cueEditInput').value = '改了';
  app.$('#cueEditInput').dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(app.$('#cueEditor').hidden, true); assert.equal(source(app), before);
  app.close();
});

test('the delete control is an icon button with a name', () => {
  const app = boot(CUES);
  assert.equal(app.$('#cueDelete').getAttribute('aria-label'), '删除提示');
  assert.match(app.$('#cueDelete img').getAttribute('src'), /trash-2\.svg$/);
  app.close();
});

function startSpy(app) { const calls = []; app.w.testEngine.enter = (c) => calls.push(c); return calls; }

test('start from the top ignores the caret', () => {
  const app = boot(DOC), calls = startSpy(app); select(app, 1, 3);
  app.click('#start'); assert.deepEqual(calls, [false]);
  app.click('#mobileStart'); assert.deepEqual(calls, [false, false]);
  app.close();
});

test('start from the caret, by button or shortcut, starts once from the caret', () => {
  const app = boot(DOC), calls = startSpy(app); select(app, 1, 3);
  assert.equal(app.$('#startCaret').getAttribute('aria-disabled'), 'false');
  app.click('#startCaret'); assert.deepEqual(calls, [true]);
  const rich = app.$('#richEditor'); rich.focus();
  rich.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
  assert.deepEqual(calls, [true, true]);
  app.close();
});

test('start from the caret is unavailable after switching documents and says why', () => {
  const app = boot(), calls = startSpy(app);
  const node = app.$('#richEditor').children[1].firstChild;
  app.w.getSelection().setBaseAndExtent(node, 2, node, 2); app.$('#richEditor').dispatchEvent(new app.w.MouseEvent('mouseup'));
  assert.equal(app.$('#startCaret').getAttribute('aria-disabled'), 'false');
  app.click('[data-script-id="second"]');
  const b = app.$('#startCaret');
  assert.equal(b.getAttribute('aria-disabled'), 'true');
  assert.match(app.$('#' + b.getAttribute('aria-describedby')).textContent, /光标/);
  b.click(); assert.deepEqual(calls, []);
  app.close();
});

test('shortcut without a valid caret explains and does not start', () => {
  const app = boot(), calls = startSpy(app);
  app.w.document.body.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
  assert.deepEqual(calls, []); assert.match(app.$('#uiToast').textContent, /光标/);
  app.close();
});

test('an old saved start position is ignored and no picker remains', () => {
  const app = boot({ startPosition: 'caret', ui: { startPosition: 'caret' } }), calls = startSpy(app);
  assert.equal(app.$('#startPosition'), null);
  app.click('#start'); assert.deepEqual(calls, [false]);
  app.close();
});

test('toggle icons and names follow the sidebar state', () => {
  const app = boot();
  const check = (id, icon, label) => {
    assert.match(app.$('#' + id + ' img').getAttribute('src'), new RegExp(icon + '\\.svg$'));
    assert.equal(app.$('#' + id).getAttribute('aria-label'), label);
  };
  check('toggleLibrary', 'panel-left-close', '收起稿件栏'); check('toggleSettings', 'panel-right-close', '收起提词参数');
  app.click('#toggleLibrary'); check('toggleLibrary', 'panel-left-open', '展开稿件栏');
  app.click('#toggleSettings'); check('toggleSettings', 'panel-right-open', '展开提词参数');
  app.click('#focusEditor'); app.click('#focusEditor'); // the round trip restores both collapsed
  check('toggleLibrary', 'panel-left-open', '展开稿件栏'); check('toggleSettings', 'panel-right-open', '展开提词参数');
  app.click('#toggleLibrary'); check('toggleLibrary', 'panel-left-close', '收起稿件栏');
  app.close();
});

test('toggles keep sheet behaviour below 1200px', () => {
  const app = boot({}, { media: (q) => /max-width/.test(q) }); // phone: every max-width query matches
  app.click('#toggleSettings');
  assert.equal(app.$('#sheetBackdrop').hidden, false);
  assert.match(app.$('#toggleSettings img').getAttribute('src'), /settings2\.svg$/);
  assert.equal(app.$('#toggleSettings').getAttribute('aria-label'), '提词参数');
  app.close();
});
