'use strict';
// ---------- 提词画面里改字 ----------
let editMode = false, editing = null, lastDragMoved = false;
function setEditMode(on) {
  editMode = on;
  if (!on) commitEdit();
  prompter.classList.toggle('editmode', on);
  $('#pEdit').setAttribute('aria-pressed', String(on));
  if (on) { if (state !== 'paused') pause(); toast('改字模式：点要改的句子'); }
}
function startEdit(i) {
  if (editing) commitEdit();
  const s = sents[i];
  if (!s) return;
  if (state !== 'paused') pause();
  editing = { i, el: s.el };
  s.el.textContent = s.raw;
  s.el.classList.add('editing');
  s.el.contentEditable = 'plaintext-only';
  if (s.el.contentEditable !== 'plaintext-only') s.el.contentEditable = 'true';
  s.el.focus();
  const r = document.createRange();
  r.selectNodeContents(s.el);
  r.collapse(false);
  const sel = s.el.ownerDocument.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  toast('改完按回车保存，Esc 取消');
}
function rerender() {
  const p = pos;
  build();
  layout(false);
  pos = clamp(p, 0, maxPos);
}
function applyText(v, keepIdx) {
  const n = sents.length;
  const keepMarks = marks.slice();
  ta.value = v;
  onTextChange();
  build();
  dirty = false;
  if (sents.length === n && keepMarks.length) { marks = keepMarks; saveMarks(); }
  layout(false);
  jumpTo(posOf(Math.min(keepIdx, sents.length - 1)), false);
}
function commitEdit(cancel) {
  if (!editing) return;
  const { i, el } = editing;
  editing = null;
  el.contentEditable = 'false';
  el.classList.remove('editing');
  const s = sents[i];
  const txt = el.textContent.replace(/[\r\n]+/g, '');
  if (cancel || txt === s.raw) { rerender(); return; }
  const v = ta.value;
  let nv;
  if (s.sec) {
    const end = v.indexOf('\n', s.start);
    nv = v.slice(0, s.start) + '# ' + txt.replace(/^#+\s*/, '') + v.slice(end < 0 ? v.length : end);
  } else {
    nv = v.slice(0, s.start) + txt + v.slice(s.start + s.raw.length);
  }
  applyText(nv, i);
  toast('已保存修改');
}

