'use strict';
// ---------- 书签与目录 ----------
function addMark() {
  const idx = Math.max(0, curIdx);
  if (marks.includes(idx)) return toast('这一句已经有书签了');
  if (marks.length >= 9) return toast('最多 9 个书签，先在目录里删掉一个');
  marks.push(idx);
  marks.sort((a, b) => a - b);
  saveMarks();
  renderTicks();
  renderPanel();
  toast('已加书签 ' + (marks.indexOf(idx) + 1));
}
function gotoMark(n) {
  if (n >= marks.length) return toast(marks.length ? `只有 ${marks.length} 个书签` : '还没有书签，按 B 添加');
  jumpTo(posOf(marks[n]));
  toast('书签 ' + (n + 1));
}
const snippet = (i) => (sents[i]?.el.textContent || '').trim().slice(0, 24);
const timeAt = (top) => (maxPos ? top / maxPos : 0) * (doc.units / S.cpm * 60);

function renderPanel() {
  const sl = $('#secList'), ml = $('#markList');
  sl.textContent = '';
  ml.textContent = '';
  if (!secs.length) sl.innerHTML = '<p class="empty">在稿子里用 # 开头写一行，就会出现在这里。</p>';
  const curSec = currentSec();
  secs.forEach((s, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'go' + (s === curSec ? ' on' : '');
    b.innerHTML = `<span class="k">${i + 1}</span><span class="t"></span><span class="tm">${fmt(timeAt(s.top))}</span>`;
    b.querySelector('.t').textContent = s.title;
    b.addEventListener('click', () => { jumpTo(s.top); closePanel(); });
    li.append(b);
    sl.append(li);
  });
  if (!marks.length) ml.innerHTML = '<p class="empty">提词时按 B 或点「书签」，在当前句加一个书签。</p>';
  marks.forEach((idx, n) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'go';
    b.innerHTML = `<span class="k">${n + 1}</span><span class="t"></span><span class="tm">${fmt(timeAt(posOf(idx)))}</span>`;
    b.querySelector('.t').textContent = snippet(idx);
    b.addEventListener('click', () => { jumpTo(posOf(idx)); closePanel(); });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'del';
    del.setAttribute('aria-label', '删除书签 ' + (n + 1));
    del.innerHTML = '<svg class="i"><use href="#i-x"/></svg>';
    del.addEventListener('click', () => v3.confirmAction('删除书签？', '这不会删除稿件正文。', '删除书签', () => { marks.splice(n, 1); saveMarks(); renderTicks(); renderPanel(); }));
    li.append(b, del);
    ml.append(li);
  });
  const tl = $('#takeList');
  tl.textContent = '';
  if (!takes.length) tl.innerHTML = '<p class="empty">打开「录像」后，每次从开始到暂停会存成一条视频，在这里保存。</p>';
  takes.forEach((t, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'go';
    b.title = '预览片段';
    b.innerHTML = `<svg class="i"><use href="#i-save"/></svg><span class="t"></span><span class="tm">${fmt(t.dur)}</span>`;
    b.querySelector('.t').textContent = `${t.label} 第${t.n}条${t.saved ? ' · 已保存' : ''}`;
    b.addEventListener('click', () => v3.previewClip(t));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'del';
    del.setAttribute('aria-label', `删除 ${t.label} 第${t.n}条`);
    del.innerHTML = '<svg class="i"><use href="#i-x"/></svg>';
    del.addEventListener('click', () => v3.confirmAction('删除录制片段？', '请先保存需要保留的视频。', '删除片段', () => { URL.revokeObjectURL(t.url); takes.splice(i, 1); renderPanel(); }));
    li.append(b, del);
    tl.append(li);
  });
}
function openPanel() { renderPanel(); panel.hidden = false; poke(); }
function closePanel() { panel.hidden = true; poke(); }

function renderTicks() {
  const box = $('#ticks');
  box.textContent = '';
  if (!maxPos) return;
  for (const s of secs) {
    const t = document.createElement('div');
    t.className = 'tick';
    t.style.left = (s.top / maxPos * 100) + '%';
    box.append(t);
  }
  for (const i of marks) {
    const t = document.createElement('div');
    t.className = 'tick mark';
    t.style.left = (posOf(i) / maxPos * 100) + '%';
    box.append(t);
  }
}

function currentSec() {
  let cur = null;
  for (const s of secs) { if (s.top <= pos + lhPx * 0.5) cur = s; else break; }
  return cur;
}

