const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const legacy = [
  { id: 'first', text: '# 开场\n第一份已有稿件。\n\n# 第二节\n需要保留的内容。', updated: 1000 },
  { id: 'second', text: '# 另一份稿件\n不应丢失的正文。', updated: 2000 },
];

function boot(saved = {}) {
  const dom = new JSDOM(readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://prompter.test/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  w.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
  w.requestAnimationFrame = (callback) => { w.runFrame = callback; return 1; };
  w.cancelAnimationFrame = () => {};
  // jsdom has no layout engine; provide a nonzero reading surface for playback.
  Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get() { return 800; } });
  Object.defineProperty(w.HTMLElement.prototype, 'offsetHeight', { get() { return this.id === 'content' ? 1800 : 40; } });
  Object.defineProperty(w.HTMLElement.prototype, 'offsetTop', { get() { return +(this.dataset.i || 0) * 120; } });
  for (const [key, value] of Object.entries({ library: legacy, current: 'first', ...saved }))
    w.localStorage.setItem('prompter:' + key, JSON.stringify(value));
  for (const script of w.document.scripts) {
    const src = script.getAttribute('src');
    if (!src || !src.includes('://')) w.eval(src ? readFileSync(path.join(root, src), 'utf8') : script.textContent);
    if (src === 'ui-v3.js') {
      const init = w.initPrompterV3;
      w.initPrompterV3 = (api) => { w.testEngine = api; w.testView = init(api); return w.testView; };
    }
  }
  const $ = (s) => w.document.querySelector(s);
  const click = (s) => { const el = $(s); assert.ok(el, 'Missing control ' + s); el.click(); };
  const input = (s, value) => { $(s).value = value; $(s).dispatchEvent(new w.Event('input', { bubbles: true })); };
  return { w, $, click, input, close: () => w.close(), stored: (k) => JSON.parse(w.localStorage.getItem('prompter:' + k)) };
}

test('legacy documents load unchanged and the V3 library can switch documents', () => {
  const app = boot();
  try {
    assert.equal(app.$('#ta').value, legacy[0].text);
    assert.equal(app.$('#scriptList').children.length, 2);
    app.click('[data-script-id="second"]');
    assert.equal(app.$('#ta').value, legacy[1].text);
    assert.equal(app.stored('library')[0].text, legacy[0].text);
  } finally { app.close(); }
});

test('search filters documents without changing the current document or storage', () => {
  const app = boot();
  try {
    app.input('#scriptSearch', '另一份');
    assert.equal(app.$('#scriptList').children.length, 1);
    assert.equal(app.$('#ta').value, legacy[0].text);
    assert.deepEqual(app.stored('library'), legacy);
    app.input('#scriptSearch', '<script>');
    assert.match(app.$('#scriptList').textContent, /没有找到/);
  } finally { app.close(); }
});

test('parameter tabs expose only the chosen panel and keep start actions available', () => {
  const app = boot();
  try {
    app.click('#tabText');
    assert.equal(app.$('#tabText').getAttribute('aria-selected'), 'true');
    assert.equal(app.$('#paneText').hidden, false);
    assert.equal(app.$('#panePlay').hidden, true);
    assert.equal(app.$('#start').closest('[hidden]'), null);
  } finally { app.close(); }
});

test('renaming changes metadata without rewriting the script and survives reload', () => {
  const app = boot();
  try {
    app.click('#docMore'); app.click('#renameScript');
    app.input('#dialogInput', '我的新标题');
    app.click('#dialogConfirm');
    const doc = app.stored('library').find((x) => x.id === 'first');
    assert.equal(doc.title, '我的新标题');
    assert.equal(doc.text, legacy[0].text);
    assert.equal(app.$('#documentTitle').textContent, '我的新标题');
    const next = boot({ library: app.stored('library') });
    try { assert.equal(next.$('#documentTitle').textContent, '我的新标题'); } finally { next.close(); }
  } finally { app.close(); }
});

test('deleting the current script can be cancelled and deleting the last creates a blank script', () => {
  const app = boot({ library: [legacy[0]] });
  try {
    app.click('#docMore'); app.click('#delScript'); app.click('#dialogCancel');
    assert.equal(app.stored('library').length, 1);
    app.click('#docMore'); app.click('#delScript'); app.click('#dialogConfirm');
    assert.equal(app.stored('library').length, 1);
    assert.equal(app.$('#ta').value, '');
    assert.notEqual(app.stored('library')[0].id, 'first');
  } finally { app.close(); }
});

test('focus mode restores the exact previous sidebar combination', () => {
  const app = boot();
  try {
    app.click('#toggleLibrary');
    assert.equal(app.$('#editor').classList.contains('library-collapsed'), true);
    app.click('#focusEditor'); app.click('#focusEditor');
    assert.equal(app.$('#editor').classList.contains('library-collapsed'), true);
    assert.equal(app.$('#editor').classList.contains('settings-collapsed'), false);
  } finally { app.close(); }
});

test('appearance is independent of reader colors and persists', () => {
  const app = boot({ settings: { theme: 'amber', cpm: 310 } });
  try {
    app.$('#appearance').value = 'dark';
    app.$('#appearance').dispatchEvent(new app.w.Event('change', { bubbles: true }));
    assert.equal(app.w.document.documentElement.dataset.appearance, 'dark');
    assert.equal(app.stored('settings').theme, 'amber');
    assert.equal(app.stored('settings').cpm, 310);
    assert.equal(app.stored('ui').appearance, 'dark');
  } finally { app.close(); }
});

test('begin, pause and return retain editor content and current settings', () => {
  const app = boot({ settings: { countdown: 0 } });
  try {
    app.click('#start');
    assert.equal(app.$('#prompter').hidden, false);
    assert.equal(app.$('#pPlay').getAttribute('aria-label'), '播放');
    app.click('#pPlay');
    assert.equal(app.$('#pPlay').getAttribute('aria-label'), '暂停');
    app.click('#pPlay'); app.click('#pBack');
    assert.equal(app.$('#editor').hidden, false);
    assert.equal(app.$('#ta').value, legacy[0].text);
  } finally { app.close(); }
});

test('Android build and offline cache include every V3 application asset', () => {
  const { execFileSync } = require('node:child_process');
  execFileSync(process.execPath, ['scripts/build-web.mjs'], { cwd: root });
  const sw = readFileSync(path.join(root, 'sw.js'), 'utf8');
  for (const file of ['ui-v3.css', 'ui-v3.js', 'assets/v3/panel-left-close.svg']) {
    assert.ok(existsSync(path.join(root, 'www', file)), 'Missing Android asset ' + file);
    assert.ok(sw.includes(file), 'Missing offline asset ' + file);
  }
});

test('rich editing preserves markdown, bracket types and consecutive empty lines', () => {
  const source = '# 标题\n有 **重点** 与【微笑】和[停顿]。\n\n\n第二段。\n';
  const app = boot({ library: [{ id: 'first', text: source, updated: 1 }] });
  try {
    app.$('#richEditor').dispatchEvent(new app.w.Event('input', { bubbles: true }));
    assert.equal(app.$('#ta').value, source);
  } finally { app.close(); }
});

test('bookmarks stay with the document when switching away and back', () => {
  const app = boot({ marks: [2] });
  try {
    app.click('[data-script-id="second"]');
    assert.deepEqual(app.stored('marks'), []);
    app.click('[data-script-id="first"]');
    assert.deepEqual(app.stored('marks'), [2]);
    assert.deepEqual(app.stored('library').find(x => x.id === 'first').marks, [2]);
  } finally { app.close(); }
});

test('phone document menu exposes app settings and device pairing', () => {
  const app = boot();
  try {
    app.click('#mobileDocMore'); app.click('#menuSettings');
    assert.equal(app.$('#appDialog').hidden, false);
    app.click('[data-close="appDialog"]');
    app.click('#mobileDocMore'); app.click('#menuDevices');
    assert.equal(app.$('#rdlg').hidden, false);
  } finally { app.close(); }
});

test('remote lock and disconnect suppress commands before transport listeners', async () => {
  const app = boot();
  try {
    const view = app.w.testView;
    let commands = 0;
    app.$('#rPlay').addEventListener('click', () => commands++);
    app.$('#rconn').classList.add('ok');
    view.remote({ mode: 'prompter', cpm: 220, fs: 56, context: [] });
    app.click('#rPlay'); assert.equal(commands, 1);
    app.click('#remoteLock'); app.click('#rPlay'); assert.equal(commands, 1);
    app.click('#remoteLock'); app.click('#rPlay'); assert.equal(commands, 2);
    app.$('#rconn').classList.remove('ok');
    await Promise.resolve();
    app.click('#rPlay'); assert.equal(commands, 2);
  } finally { app.close(); }
});

test('reader parameters have an explicit close action and return to the editor', () => {
  const app = boot();
  try {
    app.click('#start'); app.click('#readerMore'); app.click('#readerParameters');
    assert.equal(app.$('#settingsPanel').parentNode.id, 'prompter');
    app.click('#readerSettingsClose');
    assert.equal(app.$('#settingsPanel').parentNode.id, 'editor');
    app.click('#pBack'); assert.equal(app.$('#editor').hidden, false);
  } finally { app.close(); }
});

test('Enter places subsequent typing on the new empty line', () => {
  const app = boot({ library: [{ id: 'first', text: '第一行', updated: 1 }] });
  try {
    const rich = app.$('#richEditor'), selection = app.w.getSelection(), range = app.w.document.createRange();
    range.setStart(rich.firstChild.firstChild, 3); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); rich.focus();
    rich.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const typed = app.w.document.createTextNode('第二行');
    const insertion = selection.getRangeAt(0); insertion.insertNode(typed); insertion.setStartAfter(typed); insertion.collapse(true); selection.removeAllRanges(); selection.addRange(insertion);
    rich.dispatchEvent(new app.w.Event('input', { bubbles: true }));
    assert.equal(app.$('#ta').value, '第一行\n第二行');
  } finally { app.close(); }
});

test('the section tool can turn a heading back into normal reading text', () => {
  const app = boot({ library: [{ id: 'first', text: '# 标题\n正文', updated: 1 }] });
  try {
    app.$('#ta').setSelectionRange(2, 4);
    app.click('[data-format="section"]');
    assert.equal(app.$('#ta').value, '标题\n正文');
    assert.equal(app.$('#stUnits').textContent, '4');
  } finally { app.close(); }
});

test('import creates a separate document and leaves the existing draft untouched', async () => {
  const app = boot();
  try {
    Object.defineProperty(app.$('#file'), 'files', { value: [{ name: '导入稿件.txt', size: 30, text: async () => '# 导入\r\n新的正文。' }], configurable: true });
    app.$('#file').dispatchEvent(new app.w.Event('change', { bubbles: true }));
    await new Promise(setImmediate);
    assert.equal(app.stored('library').length, 3);
    assert.equal(app.stored('library').find(x => x.id === 'first').text, legacy[0].text);
    assert.equal(app.$('#ta').value, '# 导入\n新的正文。');
    assert.equal(app.$('#documentTitle').textContent, '导入稿件');
  } finally { app.close(); }
});

test('select-all paste replaces the whole rich document instead of appending', () => {
  const app = boot();
  try {
    const rich = app.$('#richEditor'); rich.focus(); app.w.getSelection().selectAllChildren(rich);
    const paste = new app.w.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => '新正文' } });
    rich.dispatchEvent(paste);
    assert.equal(app.$('#ta').value, '新正文');
  } finally { app.close(); }
});

test('reader tab navigation does not also jump the reading position', () => {
  const app = boot();
  try {
    app.click('#start'); app.click('#readerMore'); app.click('#readerParameters');
    app.w.runFrame(); const position = app.$('#content').style.transform;
    app.$('#tabText').dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    app.w.runFrame();
    assert.equal(app.$('#tabRecord').getAttribute('aria-selected'), 'true');
    assert.equal(app.$('#content').style.transform, position);
  } finally { app.close(); }
});

test('bookmark deletion requires confirmation and cancellation keeps the bookmark', () => {
  const app = boot();
  try {
    app.click('#start'); app.click('#pMark'); app.click('#pList');
    app.click('[aria-label="删除书签 1"]');
    assert.equal(app.$('#actionDialog').hidden, false);
    assert.deepEqual(app.stored('marks'), [0]);
    app.click('#dialogCancel'); assert.deepEqual(app.stored('marks'), [0]);
    app.click('[aria-label="删除书签 1"]'); app.click('#dialogConfirm');
    assert.deepEqual(app.stored('marks'), []);
  } finally { app.close(); }
});

test('recorded clip preview provides real video controls and a save action', () => {
  const app = boot();
  try {
    app.w.testView.previewClip({ url: 'blob:test-clip', label: '第一节', n: 1, dur: 5 });
    assert.equal(app.$('#helpDialog').hidden, false);
    assert.equal(app.$('#helpContent video').controls, true);
    assert.equal(app.$('#helpContent video').getAttribute('src'), 'blob:test-clip');
    assert.match(app.$('#helpContent').textContent, /保存到本机/);
  } finally { app.close(); }
});

test('picture-in-picture carries external V3 styles into the reading window', async () => {
  const app = boot();
  const pip = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://prompter.test/', pretendToBeVisual: true });
  try {
    app.w.documentPictureInPicture = { requestWindow: async () => pip.window };
    app.click('#start'); await app.w.testEngine.togglePip();
    const style = pip.window.document.querySelector('link[rel="stylesheet"]');
    assert.ok(style, 'PiP must include the new external stylesheet');
    assert.equal(style.href, 'https://prompter.test/ui-v3.css');
    assert.ok(pip.window.document.querySelector('#stage'));
  } finally { pip.window.close(); app.close(); }
});

test('dialogs animate both directions with the specified ease and respect reduced motion', async () => {
  const app = boot();
  try {
    const calls = [];
    app.w.HTMLElement.prototype.animate = function(frames, options) { calls.push({ frames, options }); return { finished: Promise.resolve(), cancel() {} }; };
    app.click('#appSettings'); await new Promise(setImmediate);
    assert.ok(calls.some(x => x.options.easing === 'cubic-bezier(.32,.72,0,1)'));
    calls.length = 0;
    app.click('[data-close="appDialog"]'); await new Promise(setImmediate);
    assert.ok(calls.length > 0, 'closing must animate too');
    assert.equal(app.$('#appDialog').hidden, true);
    assert.equal(app.$('#appDialog').style.display, '');
    calls.length = 0;
    app.w.matchMedia = q => ({ matches: q.includes('prefers-reduced-motion'), addEventListener() {} });
    app.click('#appSettings'); await new Promise(setImmediate);
    assert.equal(calls.length, 0);
    assert.equal(app.$('#appDialog').hidden, false);
  } finally { app.close(); }
});

test('sidebar reflow keeps the visible paragraph anchored without replacing selection or IME nodes', () => {
  const app = boot();
  try {
    const rich = app.$('#richEditor'), line = rich.children[1], node = line.firstChild;
    const sel = app.w.getSelection(); sel.setBaseAndExtent(node, 1, node, 4);
    const content = app.$('.document-content'); content.scrollTop = 300;
    content.getBoundingClientRect = () => ({top: 40, bottom: 700});
    line.getBoundingClientRect = () => ({top: app.$('#editor').classList.contains('library-collapsed') ? 80 : 140, bottom: 180});
    const value = app.$('#ta').value;
    rich.dispatchEvent(new app.w.CompositionEvent('compositionstart', {bubbles:true}));
    app.click('#toggleLibrary');
    assert.equal(content.scrollTop, 240);
    assert.equal(rich.children[1], line);
    assert.equal(sel.anchorNode, node); assert.equal(sel.anchorOffset, 1);
    assert.equal(sel.focusNode, node); assert.equal(sel.focusOffset, 4);
    assert.equal(app.$('#ta').value, value);
  } finally { app.close(); }
});

test('layout motion animates tools rather than scaling editable text and rapid toggles settle correctly', async () => {
  const app = boot();
  try {
    const calls=[];
    app.w.HTMLElement.prototype.animate=function(frames,options){calls.push({el:this,frames,options});return {cancel(){},finished:Promise.resolve()};};
    const tools=app.$('.document-toolbar');
    tools.getBoundingClientRect=()=>({left:app.$('#editor').classList.contains('library-collapsed')?64:264,top:8});
    app.click('#toggleLibrary'); app.click('#toggleLibrary'); app.click('#toggleLibrary');
    app.click('#toggleSettings'); app.click('#toggleSettings');
    await Promise.resolve(); await Promise.resolve();
    assert.ok(calls.some(c=>c.el===tools&&c.options.easing==='cubic-bezier(.32,.72,0,1)'&&c.options.duration===240));
    assert.ok(!calls.some(c=>c.el===app.$('#richEditor')));
    assert.equal(app.$('#toggleLibrary').getAttribute('aria-expanded'),'false');
    assert.equal(app.$('#libraryPanel').inert,true);
    assert.equal(app.$('#toggleSettings').getAttribute('aria-expanded'),'true');
    assert.equal(app.$('#settingsPanel').inert,false);
  } finally {app.close();}
});

test('start position routes desktop mobile and shortcut once and rejects a caret from another document', () => {
  const app=boot({settings:{countdown:0}});
  try {
    const calls=[]; app.w.testEngine.enter=(fromCaret)=>calls.push(fromCaret);
    const select=app.$('#startPosition'); assert.ok(select,'a visible start position choice is available');
    const rich=app.$('#richEditor'), node=rich.children[1].firstChild;
    app.w.getSelection().setBaseAndExtent(node,2,node,2); rich.dispatchEvent(new app.w.MouseEvent('mouseup'));
    select.value='caret'; app.click('#start'); assert.deepEqual(calls,[true]);
    app.click('#mobileStart'); assert.deepEqual(calls,[true,true]);
    rich.focus(); rich.dispatchEvent(new app.w.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));
    assert.deepEqual(calls,[true,true,true]);
    app.click('[data-script-id="second"]'); select.value='caret'; app.click('#start');
    assert.equal(calls.at(-1),false); assert.match(app.$('#uiToast').textContent,/光标/);
    select.value='start'; app.click('#start'); assert.equal(calls.at(-1),false);
  } finally {app.close();}
});

test('format tools explain their scope to keyboard users and focus has an explicit exit name', () => {
  const app=boot();
  try {
    for(const [format,label] of [['section','小节标题'],['emphasis','标记重点'],['cue','插入提示']]){
      const b=app.$('[data-format="'+format+'"]'); assert.equal(b.getAttribute('aria-label'),label);
      const hint=app.w.document.getElementById(b.getAttribute('aria-describedby'));assert.ok(hint?.textContent);
      b.focus();assert.equal(app.w.document.activeElement,b);
    }
    assert.match(app.$('#paneText').textContent,/仅影响提词画面/);
    app.click('#focusEditor');assert.match(app.$('#focusEditor').getAttribute('aria-label'),/退出/);
  }finally{app.close();}
});

test('reduced motion skips sidebar and tool animations while changing accessible state', () => {
 const app=boot();try {
   app.w.matchMedia=q=>({matches:q.includes('prefers-reduced-motion'),addEventListener(){}});
   let animations=0;app.w.HTMLElement.prototype.animate=()=>{animations++;return {cancel(){},finished:Promise.resolve()};};
   app.click('#toggleLibrary');app.click('#toggleSettings');
   assert.equal(animations,0);assert.equal(app.$('#libraryPanel').inert,true);assert.equal(app.$('#settingsPanel').inert,true);
 }finally{app.close();}
});

test('direct contenteditable text nodes do not break sidebar reflow',()=>{
 const app=boot();try{
  const rich=app.$('#richEditor');rich.textContent='直接输入的新正文';
  app.w.getSelection().setBaseAndExtent(rich.firstChild,2,rich.firstChild,2);
  rich.dispatchEvent(new app.w.Event('input',{bubbles:true}));
  const errors=[];app.w.addEventListener('error',e=>{errors.push(e.message);e.preventDefault();});
  app.click('#toggleLibrary');
  assert.equal(errors.length,0);assert.equal(app.$('#editor').classList.contains('library-collapsed'),true);
 }finally{app.close();}
});

test('typed markdown formats on ordinary blur but layout controls preserve raw editing nodes',()=>{
 const app=boot();try{
  const rich=app.$('#richEditor');rich.innerHTML='<div class="editor-line">**新重点**</div>';
  app.w.getSelection().setBaseAndExtent(rich.firstChild.firstChild,3,rich.firstChild.firstChild,3);
  rich.dispatchEvent(new app.w.Event('input',{bubbles:true}));
  const line=rich.firstChild;rich.dispatchEvent(new app.w.FocusEvent('blur',{relatedTarget:app.$('#toggleSettings')}));
  assert.equal(rich.firstChild,line);
  rich.dispatchEvent(new app.w.FocusEvent('blur',{relatedTarget:app.$('#scriptSearch')}));
  assert.equal(rich.querySelector('strong')?.textContent,'新重点');assert.equal(app.$('#ta').value,'**新重点**');
 }finally{app.close();}
});
