'use strict';
// ---------- 进入 / 退出 ----------
let wakeLock = null;
async function lockScreen() {
  if (NP) { NP.keepAwake({ on: true }).catch(() => {}); return; }
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !prompter.hidden) lockScreen();
});

function enter(fromCaret) {
  if (!doc.units) { v3?.emptyDocument(); return; }
  if (dirty) { build(); dirty = false; }
  $('#editor').hidden = true;
  prompter.hidden = false;
  panel.hidden = true;
  v3?.closeSheets();
  maxPos = 0;
  layout(false);
  let idx = 0;
  if (fromCaret) {
    const c = ta.selectionStart;
    for (let i = 0; i < sents.length; i++) { if (sents[i].start <= c) idx = i; else break; }
  }
  anim = null;
  pos = fromCaret ? posOf(idx) : 0;
  elapsed = 0;
  state = 'paused';
  pauseReason = 'ready';
  played = false;
  relocate(pos);
  heardEl.hidden = !voice.on;
  syncControls();
  syncPlay();
  renderHint();
  lockScreen();
  poke();
}
function exit() {
  commitEdit();
  setEditMode(false);
  pause();
  voiceStop();
  if (cam.on) camOff();
  prompter.hidden = true;
  $('#editor').hidden = false;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
  if (NP) { NP.keepAwake({ on: false }).catch(() => {}); if (nativeFs) { nativeFs = false; NP.setFullscreen({ on: false }).catch(() => {}); } }
  // 把光标放回刚才读到的位置，方便改稿
  const s = sents[Math.max(0, curIdx)];
  if (s) { try { ta.setSelectionRange(s.start, s.start); } catch (e) {} }
  syncControls();
}
let nativeFs = false;
function toggleFullscreen() {
  if (NP) { nativeFs = !nativeFs; NP.setFullscreen({ on: nativeFs }).catch(() => {}); return; }
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  else document.documentElement.requestFullscreen?.().catch(() => toast('当前环境不支持全屏'));
}

