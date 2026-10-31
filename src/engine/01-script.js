'use strict';
// ---------- 文稿解析 ----------
const CJK = /[㐀-鿿豈-﫿぀-ヿ가-힯]/g;
function countUnits(s) {
  const c = (s.match(CJK) || []).length;
  const w = (s.replace(CJK, ' ').match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)*/g) || []).length;
  return c + w;
}
const fmt = (sec) => {
  sec = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
};
function parseDur(str) {
  const m = String(str).trim().replace('：', ':').match(/^(\d+)(?::(\d{1,2}))?$/);
  if (!m) return null;
  return m[2] != null ? +m[1] * 60 + +m[2] : +m[1] * 60;
}

const SENT = /[^。！？!?…]+[。！？!?…]*[”’"'」』）)]*/g;
// **重点**、[停顿] / 【停顿】
const MARK = /\*\*|\[[^\]\n]{1,12}\]|【[^】\n]{1,12}】/g;
const plain = (s) => s.replace(MARK, '');
function renderInline(el, text, st) {
  let last = 0, m;
  const push = (str) => {
    if (!str) return;
    if (st.em) { const b = document.createElement('strong'); b.className = 'em'; b.textContent = str; el.append(b); }
    else el.append(str);
  };
  MARK.lastIndex = 0;
  while ((m = MARK.exec(text))) {
    push(text.slice(last, m.index));
    if (m[0] === '**') st.em = !st.em;
    else { const c = document.createElement('span'); c.className = 'cue'; c.textContent = m[0].slice(1, -1); el.append(c); }
    last = m.index + m[0].length;
  }
  push(text.slice(last));
}
function parse(src) {
  const blocks = [];
  let para = null, off = 0, units = 0, paras = 0, secs = 0;
  for (const line of src.split('\n')) {
    const start = off;
    off += line.length + 1;
    const t = line.trim();
    if (!t) { para = null; continue; }
    const h = t.match(/^#+\s*(.*)$/);
    if (h) { blocks.push({ type: 'sec', title: h[1] || '未命名小节', start }); secs++; para = null; continue; }
    if (!para) { para = { type: 'para', lines: [] }; blocks.push(para); paras++; }
    const sents = [];
    let m;
    SENT.lastIndex = 0;
    while ((m = SENT.exec(line))) if (m[0].trim()) sents.push({ text: m[0], start: start + m.index });
    para.lines.push(sents);
    units += countUnits(plain(t));
  }
  return { blocks, units, paras, secs };
}

