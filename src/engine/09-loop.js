'use strict';
// ---------- 渲染循环 ----------
const hud = { el: $('#tEl'), rem: $('#tRem'), pct: $('#tPct'), where: $('#where'), fill: $('#fill'), knob: $('#knob') };
const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
let last = performance.now();
function frame() {
  const now = performance.now();
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (!prompter.hidden) {
    if (anim) {
      const k = Math.min(1, (now - anim.t0) / anim.dur);
      pos = anim.from + (anim.to - anim.from) * (1 - Math.pow(1 - k, 3));
      if (k >= 1) anim = null;
    } else if (state === 'playing' && !(drag && drag.moved)) {
      elapsed += dt;
      if (voice.on) { if (voice.target != null) pos += (voice.target - pos) * Math.min(1, dt * 6); }
      else pos += speedPx * dt;
      if (stopAt != null && pos >= stopAt - 0.5) { pos = stopAt; pause('secEnd'); }
      else if (pos >= maxPos) { pos = maxPos; pause('end'); }
    }
    if (cam.rec) setText(recBadge, 'REC ' + fmt((now - cam.t0) / 1000));
    content.style.transform = `translate3d(0, ${guideY - pos - fsEff() * 0.6}px, 0)`;
    updateCur();
    const r = maxPos ? pos / maxPos : 0;
    setText(hud.el, fmt(elapsed));
    setText(hud.rem, fmt((maxPos - pos) / speedPx));
    setText(hud.pct, Math.round(r * 100) + '%');
    setText(hud.where, currentSec()?.title || '');
    hud.fill.style.width = (r * 100) + '%';
    hud.knob.style.left = (r * 100) + '%';
  }
  (pipWin || window).requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

