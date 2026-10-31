'use strict';
// ---------- 置顶小窗（电脑上的 Chrome / Edge） ----------
const pipBtn = $('#pPip');
if ('documentPictureInPicture' in window) pipBtn.hidden = false;
async function togglePip() {
  if (pipWin) { pipWin.close(); return; }
  let w;
  try { w = await window.documentPictureInPicture.requestWindow({ width: 560, height: 340 }); }
  catch (e) { return toast('打不开小窗'); }
  pipWin = w;
  const d = w.document;
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach((st) => {
    const clone = st.cloneNode(true);
    if (st.tagName === 'LINK') clone.href = st.href;
    d.head.append(clone);
  });
  d.documentElement.dataset.appearance = document.documentElement.dataset.appearance;
  d.title = '提词器';
  d.body.style.cssText = 'margin:0;height:100vh;overflow:hidden;position:relative;background:#000';
  d.body.append(stage);
  $('#pipNote').hidden = false;
  pipBtn.setAttribute('aria-pressed', 'true');
  w.addEventListener('pagehide', () => {
    prompter.prepend(stage);
    pipWin = null;
    $('#pipNote').hidden = true;
    pipBtn.setAttribute('aria-pressed', 'false');
    layout(true);
    requestAnimationFrame(frame);
  });
  w.addEventListener('resize', () => layout(true));
  d.addEventListener('keydown', onKey);
  w.addEventListener('pointermove', onMove);
  w.addEventListener('pointerup', onUp);
  w.addEventListener('pointercancel', () => { drag = null; });
  layout(true);
}
bind('#pPip', togglePip);

