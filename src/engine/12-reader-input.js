'use strict';
// ---------- 提词页交互 ----------
const bind = (id, fn) => $(id).addEventListener('click', fn);
bind('#pBack', exit);
bind('#pPlay', toggle);
bind('#pStop', () => v3.confirmReset(stopPlayback));
bind('#pRetake', retake);
bind('#pVoice', voiceToggle);
bind('#pCam', camToggle);
bind('#spDn', () => setSpeed(S.cpm - 10));
bind('#spUp', () => setSpeed(S.cpm + 10));
bind('#fsDn', () => setFont(S.fontSize - 4));
bind('#fsUp', () => setFont(S.fontSize + 4));
bind('#pMx', () => setMirror('mirrorX', !S.mirrorX));
bind('#pMy', () => setMirror('mirrorY', !S.mirrorY));
bind('#pMark', addMark);
bind('#pList', () => (panel.hidden ? openPanel() : closePanel()));
bind('#panelClose', closePanel);
bind('#pFs', toggleFullscreen);
bind('#pEdit', () => setEditMode(!editMode));
bind('#nPageUp', nav.pageUp);
bind('#nPageDn', nav.pageDown);
bind('#nParaUp', nav.paraUp);
bind('#nParaDn', nav.paraDown);
bind('#nSecUp', nav.secUp);
bind('#nSecDn', nav.secDown);
// 点过按钮后让出焦点，避免空格键既触发按钮又触发播放/暂停
prompter.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && e.detail) b.blur(); });

stage.addEventListener('pointerdown', (e) => {
  poke();
  if (e.button) return;
  if (!panel.hidden) { closePanel(); return; }
  if (editing) { if (!editing.el.contains(e.target)) commitEdit(); return; }
  drag = { y: e.clientY, pos, moved: false, id: e.pointerId };
});
function onMove(e) {
  if (!prompter.hidden && e.pointerType === 'mouse') poke();
  if (!drag) return;
  const dy = e.clientY - drag.y;
  if (!drag.moved && Math.abs(dy) > 6) { drag.moved = true; anim = null; try { stage.setPointerCapture(drag.id); } catch (err) {} }
  if (drag.moved) pos = clamp(drag.pos + (S.mirrorY ? dy : -dy), 0, maxPos);
}
function onUp(e) {
  if (!drag) return;
  const d = drag;
  drag = null;
  lastDragMoved = d.moved;
  if (d.moved) { relocate(pos); return; }
  const s = e.target.closest?.('.s');
  if (s && content.contains(s) && !editMode) jumpTo(posOf(+s.dataset.i));
}
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup', onUp);
stage.addEventListener('click', (e) => {
  if (!editMode || lastDragMoved || editing) return;
  const s = e.target.closest('.s');
  if (s && content.contains(s)) startEdit(+s.dataset.i);
});
stage.addEventListener('dblclick', (e) => {
  const s = e.target.closest('.s');
  if (s && content.contains(s) && !editing) startEdit(+s.dataset.i);
});
window.addEventListener('pointercancel', () => { drag = null; });
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  anim = null;
  pos = clamp(pos + e.deltaY * (e.deltaMode === 1 ? lhPx / 3 : 1), 0, maxPos);
  relocate(pos);
  poke();
}, { passive: false });

// 进度条：点击或拖动跳转
const track = $('#track');
let seeking = false;
function seek(e) {
  const r = track.getBoundingClientRect();
  anim = null;
  pos = clamp((e.clientX - r.left) / r.width, 0, 1) * maxPos;
  relocate(pos);
}
track.addEventListener('pointerdown', (e) => { seeking = true; try { track.setPointerCapture(e.pointerId); } catch (err) {} seek(e); poke(); });
track.addEventListener('pointermove', (e) => { if (seeking) seek(e); });
track.addEventListener('pointerup', () => { seeking = false; });
track.addEventListener('pointercancel', () => { seeking = false; });

window.addEventListener('resize', () => { if (!prompter.hidden) layout(true); });

function onKey(e) {
  if (e.defaultPrevented) return;
  if (!rdlg.hidden) { if (e.key === 'Escape') closeRemoteDlg(); return; }
  if (prompter.hidden) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); v3 ? v3.startFromSelection() : enter(false); }
    return;
  }
  if (editing) {
    if (e.isComposing || e.keyCode === 229) return; // 中文输入法正在选字
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    else if (e.key === 'Escape') { e.preventDefault(); commitEdit(true); }
    return;
  }
  if (e.target.closest?.('input, select, textarea')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  let handled = true;
  switch (k) {
    case ' ': case 'Spacebar': if (!e.repeat) toggle(); break;
    case 'Escape': panel.hidden ? exit() : closePanel(); break;
    case 'ArrowLeft': case 'PageUp': nav.pageUp(); break;
    case 'ArrowRight': case 'PageDown': nav.pageDown(); break;
    case 'ArrowUp': nav.nudge(-1); break;
    case 'ArrowDown': nav.nudge(1); break;
    case 'Home': jumpTo(0); break;
    case 'End': jumpTo(maxPos); break;
    case 'a': nav.paraUp(); break;
    case 'd': nav.paraDown(); break;
    case 'q': nav.secUp(); break;
    case 'e': nav.secDown(); break;
    case 'r': retake(); break;
    case 'g': voiceToggle(); break;
    case 'c': camToggle(); break;
    case '+': case '=': setSpeed(S.cpm + 10); toast('语速 ' + S.cpm + ' 字/分'); break;
    case '-': case '_': setSpeed(S.cpm - 10); toast('语速 ' + S.cpm + ' 字/分'); break;
    case ']': setFont(S.fontSize + 4); break;
    case '[': setFont(S.fontSize - 4); break;
    case 'm': setMirror('mirrorX', !S.mirrorX); break;
    case 'v': setMirror('mirrorY', !S.mirrorY); break;
    case 'b': addMark(); break;
    case 'l': panel.hidden ? openPanel() : closePanel(); break;
    case 'f': toggleFullscreen(); break;
    default:
      if (/^[1-9]$/.test(k)) gotoMark(+k - 1);
      else handled = false;
  }
  if (handled) { e.preventDefault(); poke(); }
}
document.addEventListener('keydown', onKey);

