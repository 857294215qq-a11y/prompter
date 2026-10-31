'use strict';
// ---------- 编辑页 ----------
const ta = $('#ta');
const scriptSel = $('#scriptSel');
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
let library = store.get('library', null);
if (!Array.isArray(library) || !library.length) library = [{ id: newId(), text: store.get('text', null) ?? SAMPLE, updated: Date.now() }];
let currentId = store.get('current', library[0].id);
if (!library.some((x) => x.id === currentId)) currentId = library[0].id;
const curScript = () => library.find((x) => x.id === currentId);
const titleOf = (txt) => (txt.split('\n').map((l) => plain(l.replace(/^#+\s*/, '')).trim()).find(Boolean) || '空白稿子').slice(0, 24);
const saveLibrary = () => { const ok = store.set('library', library); store.set('current', currentId); v3?.saved(ok); return ok; };
const scriptTitle = (x) => x.title || titleOf(x.text);
function renderLibrary() {
  scriptSel.textContent = '';
  for (const x of library) {
    const o = document.createElement('option');
    o.value = x.id;
    o.textContent = scriptTitle(x);
    scriptSel.append(o);
  }
  scriptSel.value = currentId;
  v3?.refresh();
}
ta.value = curScript().text;
let doc = parse(ta.value);
let dirty = true;
let marks = Array.isArray(curScript().marks) ? [...curScript().marks] : store.get('marks', []);
function saveMarks() { curScript().marks = [...marks]; store.set('marks', marks); saveLibrary(); }

function refreshStats() {
  $('#stUnits').textContent = doc.units;
  $('#stParas').textContent = doc.paras;
  $('#stSecs').textContent = doc.secs;
  $('#stDur').textContent = fmt(doc.units / S.cpm * 60);
  if (document.activeElement !== $('#dur')) $('#dur').value = doc.units ? fmt(doc.units / S.cpm * 60) : '';
}
let saveT;
function onTextChange() {
  doc = parse(ta.value);
  dirty = true;
  if (marks.length) { marks = []; saveMarks(); }
  refreshStats();
  const cur = curScript();
  cur.text = ta.value;
  cur.updated = Date.now();
  const opt = scriptSel.querySelector(`option[value="${cur.id}"]`);
  if (opt) opt.textContent = scriptTitle(cur);
  clearTimeout(saveT);
  v3?.refresh();
  v3?.saving();
  saveT = setTimeout(saveLibrary, 300);
}
ta.addEventListener('input', onTextChange);

function openScript(id) {
  if (!library.some((x) => x.id === id)) return;
  clearTimeout(saveT);
  curScript().marks = [...marks];
  currentId = id;
  ta.value = curScript().text;
  doc = parse(ta.value);
  dirty = true;
  marks = Array.isArray(curScript().marks) ? [...curScript().marks] : [];
  store.set('marks', marks);
  saveLibrary();
  renderLibrary();
  refreshStats();
}
scriptSel.addEventListener('change', () => openScript(scriptSel.value));
$('#newScript').addEventListener('click', () => v3?.newDocument());
$('#delScript').addEventListener('click', () => v3?.deleteDocument());
renderLibrary();

$('#file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (!/\.txt$/i.test(f.name) || f.size > 5 * 1024 * 1024) {
    v3?.notify('请选择 5 MB 以内的 .txt 文本文件。'); return;
  }
  try {
    const text = await f.text();
    if (text.includes('\0')) throw new Error('这不是文本文件');
    createDocument(text.replace(/\r\n?/g, '\n'), f.name.replace(/\.txt$/i, ''));
    v3?.notify('已导入为新稿件');
  } catch (error) { v3?.notify('导入失败，请检查文件是否为 UTF-8 文本。'); }
});
$('#sample').addEventListener('click', () => { createDocument(SAMPLE, '示例 · 分段录制'); });
function createDocument(text, title) {
  const item = { id: newId(), text, title: title?.trim() || undefined, updated: Date.now(), marks: [] };
  library.unshift(item);
  openScript(item.id);
  v3?.resetHistory();
  ta.focus();
}
window.addEventListener('pagehide', saveLibrary);

function setSpeed(cpm) {
  S.cpm = clamp(Math.round(cpm), 30, 900);
  save();
  computeSpeed();
  syncControls();
}
function setFont(px) {
  S.fontSize = clamp(Math.round(px), 20, 200);
  save();
  if (!prompter.hidden) layout(true);
  syncControls();
}
function setMirror(axis, on) {
  S[axis] = on;
  save();
  applyStyle();
  syncControls();
}

function syncControls() {
  $('#cpm').value = S.cpm;
  $('#cpmOut').textContent = S.cpm + ' 字/分';
  $('#fs').value = S.fontSize;
  $('#fsVal').textContent = S.fontSize + ' px';
  $('#lh').value = S.lineHeight;
  $('#lhVal').textContent = S.lineHeight.toFixed(2);
  $('#mg').value = S.margin;
  $('#mgVal').textContent = S.margin + '%';
  $('#gd').value = S.guide;
  $('#gdVal').textContent = S.guide + '%';
  $('#dim').checked = S.dimRead;
  $('#showGuide').checked = S.showGuide;
  $('#cdSel').value = String(S.countdown);
  document.querySelectorAll('input[name="align"]').forEach((r) => { r.checked = r.value === S.align; });
  document.querySelectorAll('input[name="theme"]').forEach((r) => { r.checked = r.value === S.theme; });
  for (const [ids, key] of [[['#mx', '#pMx'], 'mirrorX'], [['#my', '#pMy'], 'mirrorY']])
    ids.forEach((id) => $(id).setAttribute('aria-pressed', String(S[key])));
  $('#secStop').checked = S.secStop;
  $('#autoSave').checked = S.autoSave;
  $('#lang').value = S.lang;
  $('#pVoice').setAttribute('aria-pressed', String(voice.on));
  $('#pCam').setAttribute('aria-pressed', String(cam.on));
  $('#spOut').textContent = S.cpm;
  $('#fsOut').textContent = S.fontSize;
  refreshStats();
  if ($('#readerTheme')) $('#readerTheme').value = S.theme;
  v3?.sync();
}

$('#cpm').addEventListener('input', (e) => setSpeed(+e.target.value));
$('#dur').addEventListener('change', (e) => {
  const sec = parseDur(e.target.value);
  if (sec && doc.units) setSpeed(doc.units / (sec / 60));
  e.target.value = doc.units ? fmt(doc.units / S.cpm * 60) : '';
});
$('#cdSel').addEventListener('change', (e) => { S.countdown = +e.target.value; save(); });
$('#fs').addEventListener('input', (e) => setFont(+e.target.value));
$('#lh').addEventListener('input', (e) => { S.lineHeight = +e.target.value; save(); syncControls(); });
$('#mg').addEventListener('input', (e) => { S.margin = +e.target.value; save(); syncControls(); });
$('#gd').addEventListener('input', (e) => { S.guide = +e.target.value; save(); syncControls(); });
$('#dim').addEventListener('change', (e) => { S.dimRead = e.target.checked; save(); });
$('#showGuide').addEventListener('change', (e) => { S.showGuide = e.target.checked; save(); });
$('#secStop').addEventListener('change', (e) => { S.secStop = e.target.checked; save(); });
$('#autoSave').addEventListener('change', (e) => { S.autoSave = e.target.checked; save(); });
$('#lang').addEventListener('change', (e) => { S.lang = e.target.value; save(); });
document.querySelectorAll('input[name="align"]').forEach((r) => r.addEventListener('change', () => { S.align = r.value; save(); }));
document.querySelectorAll('input[name="theme"]').forEach((r) => r.addEventListener('change', () => { S.theme = r.value; save(); }));
$('#mx').addEventListener('click', () => setMirror('mirrorX', !S.mirrorX));
$('#my').addEventListener('click', () => setMirror('mirrorY', !S.mirrorY));
$('#start').addEventListener('click', () => v3 ? v3.startFromSelection() : enter(false));


