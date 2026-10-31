'use strict';
// ---------- 播放 / 分段 ----------
let takeStart = 0;      // "重录本节"要回到的位置
let takeSec = null;     // 当前这一条属于哪一节
let stopAt = null;      // 本节结束的位置（下一个小节标题），读到这里自动暂停
let stopTok = 0;        // 同上，换算成语音跟随的字序号
let pauseReason = 'ready';
let played = false;

const secAt = (p) => { let c = null; for (const s of secs) { if (s.top <= p + tol()) c = s; else break; } return c; };
function arm(base) {
  takeSec = secAt(base);
  takeStart = takeSec ? takeSec.top : base;
  stopAt = S.secStop ? (secs.find((s) => s.top > base + tol())?.top ?? null) : null;
  stopTok = stopAt != null ? lowerBound(stopAt) : T.length;
}
function relocate(p) {
  if (state === 'playing') arm(p);
  else { takeSec = secAt(p); takeStart = takeSec ? takeSec.top : p; renderHint(); }
  if (voice.on) voiceSync(p);
}

function begin() {
  const base = anim ? anim.to : pos;
  arm(base);
  state = 'playing';
  played = true;
  if (voice.on) { voiceSync(base); voiceStart(); }
  if (cam.on) camStartTake();
  syncPlay();
  renderHint();
  poke();
}
function play() {
  if (state !== 'paused' || !maxPos) return;
  if (pos >= maxPos - 1) jumpTo(0, false);
  if (S.countdown > 0) {
    state = 'countdown';
    let n = S.countdown;
    cd.textContent = n;
    cd.hidden = false;
    cdTimer = setInterval(() => {
      n--;
      if (n <= 0) { clearInterval(cdTimer); cd.hidden = true; begin(); }
      else cd.textContent = n;
    }, 1000);
  } else begin();
  syncPlay();
  renderHint();
  poke();
}
function pause(reason = 'paused') {
  if (state === 'countdown') { clearInterval(cdTimer); cd.hidden = true; }
  const was = state;
  state = 'paused';
  pauseReason = reason;
  clearTimeout(voice.endT);
  voice.endT = null;
  if (was === 'playing') { voiceStop(); camStopTake(); }
  syncPlay();
  renderHint();
  poke();
}
const toggle = () => (state === 'paused' ? play() : pause());
function stopPlayback() { pause('ready'); elapsed = 0; jumpTo(0); }
function retake() {
  const sec = played ? takeSec : secAt(pos);
  const target = played ? takeStart : (sec ? sec.top : 0);
  if (state !== 'paused') pause();
  jumpTo(target, true, false);
  takeSec = sec;
  elapsed = 0;
  toast(sec ? `重录「${sec.title}」` : '从头重录');
  play();
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function renderHint() {
  const h = $('#hint');
  if (state !== 'paused') { h.hidden = true; return; }
  const k = (key, txt, touchTxt) => (isTouch ? `<span>${touchTxt || txt}</span>` : `<span><kbd>${key}</kbd>${txt}</span>`);
  const t = takeSec ? `「${esc(takeSec.title)}」` : '';
  const html = {
    ready: `<strong>准备好了</strong>${k('空格', '开始', '点 ▶ 开始')}<span>点任意一句，就从那一句开始</span>`,
    paused: `<strong>已暂停</strong>${k('空格', '继续', '点 ▶ 继续')}${k('R', '重录' + (t || '本节'), '点「重录本节」重来')}`,
    secEnd: `<strong>${t || '本节'}读完了</strong>${k('空格', '继续下一节', '点 ▶ 继续下一节')}${k('R', '重录这一节', '点「重录本节」重来')}`,
    end: `<strong>全文读完了</strong>${k('R', '重录' + (t || '最后一节'), '点「重录本节」重来')}${k('Home', '回到开头', '点 ■ 回到开头')}`,
  }[pauseReason] || '';
  h.innerHTML = html;
  h.hidden = !html;
}

