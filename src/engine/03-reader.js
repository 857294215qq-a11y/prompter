'use strict';
// ---------- 提词页 ----------
const prompter = $('#prompter');
const stage = $('#stage');
const content = $('#content');
const guide = $('#guide');
const cd = $('#cd');
const panel = $('#panel');

let sents = [];        // { el, start, top }
let blockTops = [];    // 段落和小节标题的顶部位置，用于"上一段/下一段"
let secs = [];         // { el, title, top }
let pos = 0, maxPos = 0, speedPx = 40, lhPx = 60, guideY = 200;
let state = 'paused';  // paused | countdown | playing
let elapsed = 0, anim = null, drag = null, curIdx = -1, cdTimer = null;
let pipWin = null;     // 置顶小窗（Document Picture-in-Picture）
const pipScale = () => (pipWin ? clamp(pipWin.innerWidth / Math.max(1, window.innerWidth), 0.3, 1) : 1);
function fsEff() { return S.fontSize * pipScale(); }

function build() {
  content.textContent = '';
  sents = []; secs = [];
  const blockEls = [];
  for (const b of doc.blocks) {
    if (b.type === 'sec') {
      const h = document.createElement('h2');
      h.className = 'sec s';
      h.textContent = plain(b.title);
      h.dataset.i = sents.length;
      sents.push({ el: h, start: b.start, top: 0, sec: true, raw: b.title, plain: plain(b.title) });
      secs.push({ el: h, title: b.title, top: 0, idx: sents.length - 1 });
      content.append(h);
      blockEls.push(h);
    } else {
      const p = document.createElement('p');
      const st = { em: false };
      b.lines.forEach((ln, i) => {
        if (i) p.append(document.createElement('br'));
        for (const s of ln) {
          const sp = document.createElement('span');
          sp.className = 's';
          renderInline(sp, s.text, st);
          sp.dataset.i = sents.length;
          sents.push({ el: sp, start: s.start, top: 0, raw: s.text, plain: plain(s.text) });
          p.append(sp);
        }
      });
      content.append(p);
      blockEls.push(p);
    }
  }
  build.blockEls = blockEls;
  curIdx = -1;
  pastIdx = 0;
}

// 桌面宽度下阅读列与顶部胶囊对齐；用户设的边距更宽时以边距为准
function readerInset() {
  if (innerWidth < 1200) return 0;
  // 用排版宽度：顶栏入场动画会把它缩小一点，屏幕上的位置这时不准
  const bar = $('.topbar').offsetWidth;
  return bar ? Math.max(0, (stage.clientWidth - bar) / 2) : 0;
}

function applyStyle() {
  content.style.fontSize = fsEff() + 'px';
  content.style.lineHeight = S.lineHeight;
  const pad = Math.max(S.margin * innerWidth / 100, readerInset()) + 'px';
  content.style.paddingLeft = pad; content.style.paddingRight = pad;
  content.style.textAlign = S.align;
  content.classList.toggle('dim', S.dimRead);
  stage.className = 't-' + S.theme;
  stage.style.transform = `scale(${S.mirrorX ? -1 : 1}, ${S.mirrorY ? -1 : 1})`;
  guide.hidden = !S.showGuide;
}

function layout(keepRatio) {
  const ratio = maxPos ? pos / maxPos : 0;
  applyStyle();
  lhPx = fsEff() * S.lineHeight;
  guideY = stage.clientHeight * S.guide / 100;
  for (const s of sents) s.top = s.el.offsetTop;
  for (const s of secs) s.top = s.el.offsetTop;
  blockTops = (build.blockEls || []).map((el) => el.offsetTop);
  maxPos = Math.max(0, sents.length ? sents[sents.length - 1].top : 0, content.offsetHeight - lhPx);
  if (keepRatio) pos = ratio * maxPos;
  pos = clamp(pos, 0, maxPos);
  guide.style.top = (guideY - lhPx / 2) + 'px';
  guide.style.height = lhPx + 'px';
  computeSpeed();
  buildTokens();
  renderTicks();
  placeOverlays();
}

// 语音跟随用的逐字位置表：每个字（英文按单词）对应它在画面里的纵向位置
const TOK = new RegExp(CJK.source + "|[A-Za-z0-9]+(?:['’][A-Za-z]+)*", 'g');
const tokenize = (s) => (s.match(TOK) || []).map((t) => t.toLowerCase());
// 把阿拉伯数字换成中文读法，稿子写"3"、识别出"三"也能对上
const ZD = '零一二三四五六七八九';
function numZh(str) {
  const n = str.replace(/^0+(?=\d)/, '');
  if (n.length > 8) return [...n].map((d) => ZD[d]).join('');
  const num = +n;
  if (num === 0) return '零';
  const U = ['', '十', '百', '千'];
  const four = (x) => {
    let out = '', zero = false;
    for (let i = 3; i >= 0; i--) {
      const d = Math.floor(x / 10 ** i) % 10;
      if (d === 0) { zero = out !== ''; continue; }
      if (zero) { out += '零'; zero = false; }
      out += ZD[d] + U[i];
    }
    return out;
  };
  const hi = Math.floor(num / 10000), lo = num % 10000;
  let out = hi ? four(hi) + '万' + (lo && lo < 1000 ? '零' : '') : '';
  out += four(lo);
  return out.replace(/^一十/, '十');
}
const spoken = (s) => s
  .replace(/(\d+(?:\.\d+)?)%/g, '百分之$1')
  .replace(/\d+(?:\.\d+)?/g, (m) => { const [a, b] = m.split('.'); return numZh(a) + (b ? '点' + [...b].map((d) => ZD[d]).join('') : ''); });
const speakTokens = (s) => tokenize(spoken(s));
// 同音字也算对上：识别成"再"、稿子写"在"，拼音都是 zai
const pyCache = new Map();
const HAN = /^[\u3400-\u9fff]$/;
function keyOf(t) {
  if (!window.pinyinPro || !HAN.test(t)) return t;
  let v = pyCache.get(t);
  if (v == null) { v = window.pinyinPro.pinyin(t, { toneType: 'none' }) || t; pyCache.set(t, v); }
  return v;
}
let pinyinLoading = null;
function loadPinyin() {
  if (window.pinyinPro) return Promise.resolve();
  if (!pinyinLoading) {
    pinyinLoading = new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'vendor/pinyin-pro.js';
      sc.onload = () => { buildTokens(); res(); };
      sc.onerror = () => { pinyinLoading = null; rej(); };
      document.head.append(sc);
    });
  }
  return pinyinLoading;
}
let T = [];
function buildTokens() {
  T = [];
  for (let i = 0; i < sents.length; i++) {
    const s = sents[i];
    if (s.sec) continue;
    const toks = speakTokens(s.plain);
    const next = i + 1 < sents.length ? sents[i + 1].top : s.top + lhPx;
    const span = Math.max(0, next - s.top);
    toks.forEach((t, k) => T.push({ k: keyOf(t), px: s.top + span * k / toks.length }));
  }
}
function lowerBound(p) {
  let lo = 0, hi = T.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (T[mid].px < p) lo = mid + 1; else hi = mid; }
  return lo;
}

function placeOverlays() {
  $('#cam').style.top = ($('.topbar').offsetHeight + 12) + 'px';
  placeHint();
}

// 开始提示放在阅读线下方；会碰到底栏时改放到阅读线上方
function placeHint() {
  const h = $('#hint'), gap = 24;
  const barTop = $('.bottombar').getBoundingClientRect().top - prompter.getBoundingClientRect().top;
  let top = guideY + lhPx / 2 + gap;
  if (top + h.offsetHeight > barTop - 12) top = guideY - lhPx / 2 - gap - h.offsetHeight;
  h.style.bottom = 'auto';
  h.style.top = top + 'px';
}

function computeSpeed() {
  speedPx = doc.units && maxPos ? (S.cpm / 60) * (maxPos / doc.units) : 40;
}

const posOf = (i) => clamp(sents[clamp(i, 0, sents.length - 1)]?.top ?? 0, 0, maxPos);

// manual：用户主动跳转（翻页、点句子等），需要重新确定"本节"和语音跟随的位置
function jumpTo(target, smooth = true, manual = true) {
  target = clamp(target, 0, maxPos);
  if (manual) relocate(target);
  if (!smooth || reduceMotion) { anim = null; pos = target; return; }
  anim = { from: pos, to: target, t0: performance.now(), dur: 320 };
}
const pageSize = () => Math.max(lhPx, stage.clientHeight * 0.6);
const tol = () => lhPx * 0.6;
function nextIn(list) {
  const base = anim ? anim.to : pos;
  const t = list.find((v) => v > base + 2);
  jumpTo(t ?? maxPos);
}
function prevIn(list) {
  const base = anim ? anim.to : pos;
  let t = 0;
  for (const v of list) { if (v < base - tol()) t = v; else break; }
  jumpTo(t);
}
const nav = {
  pageDown: () => jumpTo((anim ? anim.to : pos) + pageSize()),
  pageUp: () => jumpTo((anim ? anim.to : pos) - pageSize()),
  paraDown: () => nextIn(blockTops),
  paraUp: () => prevIn(blockTops),
  secDown: () => { if (!secs.length) return toast('稿子里没有小节标题'); nextIn(secs.map((s) => s.top)); },
  secUp: () => { if (!secs.length) return toast('稿子里没有小节标题'); prevIn(secs.map((s) => s.top)); },
  nudge: (d) => jumpTo((anim ? anim.to : pos) + d * lhPx, true),
};

// 最后一个起点在 y 之上的句子
function sentAt(y) {
  let lo = 0, hi = sents.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sents[mid].top <= y) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
let pastIdx = 0;
function updateCur() {
  curIdx = sentAt(pos + lhPx * 0.5);
  // 只把已经整行读过去的句子变暗：下一句是从阅读线上方的行开始的
  const p = Math.max(0, sentAt(pos - lhPx * 0.5));
  if (p === pastIdx) return;
  const a = Math.min(p, pastIdx), b = Math.max(p, pastIdx);
  for (let i = a; i <= b && i < sents.length; i++) sents[i].el.classList.toggle('past', i < p);
  pastIdx = p;
}

