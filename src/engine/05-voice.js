'use strict';
// ---------- 语音跟随 ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const voice = { on: false, rec: null, want: false, idx: 0, target: null, endT: null, fails: 0 };
const heardEl = $('#heard');

function voiceToggle() {
  if (!SR) return toast(IS_NATIVE ? '安卓 App 里暂时用不了语音跟随，之后会加离线识别' : '这个浏览器不支持语音识别，请用 Safari、Edge 或 Chrome');
  voice.on = !voice.on;
  if (voice.on) {
    loadPinyin().catch(() => {});
    voice.fails = 0;
    if (state === 'playing') { voiceSync(pos); voiceStart(); }
    toast('语音跟随已开启：字幕会跟着你说话的进度走');
  } else {
    voiceStop();
    voice.target = null;
    toast('语音跟随已关闭，恢复匀速滚动');
  }
  heardEl.hidden = !voice.on;
  heardEl.textContent = '';
  syncControls();
}
function voiceSync(p) {
  voice.idx = lowerBound(p - 1);
  voice.target = p;
  clearTimeout(voice.endT);
  voice.endT = null;
}
function voiceStart() {
  voice.want = true;
  if (voice.rec) return;
  const r = new SR();
  r.lang = S.lang;
  r.continuous = true;
  r.interimResults = true;
  r.onresult = (e) => {
    voice.fails = 0;
    let s = '';
    for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
    heardEl.textContent = '听到：' + s.slice(-12);
    voiceMatch(speakTokens(s).map(keyOf));
  };
  r.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    voice.fails++;
    const fatal = {
      'not-allowed': '没有麦克风权限，语音跟随已关闭',
      'service-not-allowed': '浏览器不允许语音识别，语音跟随已关闭',
      'network': '连不上语音识别服务，换 Safari 或 Edge 试试',
      'language-not-supported': '浏览器不支持这个识别语言',
    }[e.error];
    if (fatal || voice.fails > 3) {
      voice.on = false;
      voiceStop();
      heardEl.hidden = true;
      syncControls();
      toast(fatal || '语音识别出错，已切回匀速滚动');
    }
  };
  // 浏览器听一会儿没声音会自己停，播放中就自动重新开始听
  r.onend = () => {
    if (voice.rec === r) voice.rec = null;
    if (voice.want && state === 'playing') setTimeout(() => { if (voice.want && state === 'playing' && !voice.rec) voiceStart(); }, 200);
  };
  try { r.start(); voice.rec = r; } catch (err) {}
}
function voiceStop() {
  voice.want = false;
  const r = voice.rec;
  voice.rec = null;
  if (r) { try { r.abort(); } catch (e) {} }
}
function lcs(a, b) {
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}
// 拿最近听到的几个字，在当前位置附近的稿子里找最像的一段，容忍识别错一两个字
function voiceMatch(heard) {
  if (state !== 'playing' || !T.length) return;
  const L = Math.min(8, heard.length);
  if (L < 2) return;
  const tail = heard.slice(-L);
  const lo = Math.max(0, voice.idx - 25), hi = Math.min(T.length - 1, voice.idx + 120);
  let best = -1, bestScore = -Infinity;
  for (let j = lo; j <= hi; j++) {
    const tj = T[j].k;
    if (tj !== tail[L - 1] && tj !== tail[L - 2]) continue;
    const seg = [];
    for (let q = Math.max(0, j - L - 2); q <= j; q++) seg.push(T[q].k);
    let sc = lcs(tail, seg);
    if (sc < Math.max(2, Math.ceil(L * 0.6))) continue;
    sc -= Math.abs(j - voice.idx) * 0.004 + (j < voice.idx - 2 ? 1.5 : 0);
    if (sc > bestScore) { bestScore = sc; best = j; }
  }
  if (best < 0) return;
  voice.idx = best + 1;
  voice.target = stopAt != null ? Math.min(T[best].px, stopAt) : T[best].px;
  if (voice.idx >= stopTok - 1 && !voice.endT) {
    voice.endT = setTimeout(() => {
      voice.endT = null;
      if (state !== 'playing') return;
      if (stopAt != null) { anim = null; pos = stopAt; pause('secEnd'); } else pause('end');
    }, 900);
  }
}

