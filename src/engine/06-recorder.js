'use strict';
// ---------- 录像 ----------
const cam = { on: false, stream: null, rec: null, chunks: [], t0: 0, sec: null, dur: 0 };
const takes = [];
const camBox = $('#cam');
const recBadge = $('#recBadge');

async function camToggle() {
  if (cam.on) { camOff(); toast('录像已关闭'); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('这个浏览器不支持网页录像');
  try {
    cam.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    return toast(e.name === 'NotAllowedError' ? '没有摄像头或麦克风权限' : '打不开摄像头');
  }
  cam.on = true;
  $('#camVideo').srcObject = cam.stream;
  camBox.hidden = false;
  syncControls();
  placeOverlays();
  toast('录像已开启：每次开始到暂停，存成一条视频');
}
function camOff() {
  camStopTake();
  cam.stream?.getTracks().forEach((t) => t.stop());
  cam.stream = null;
  cam.on = false;
  $('#camVideo').srcObject = null;
  camBox.hidden = true;
  syncControls();
}
function pickMime() {
  const list = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return list.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
}
function camStartTake() {
  if (!cam.stream || cam.rec) return;
  const mime = pickMime();
  let r;
  try { r = new MediaRecorder(cam.stream, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : undefined); }
  catch (e) { return toast('无法开始录像'); }
  const chunks = [];
  const sec = takeSec;
  const t0 = performance.now();
  r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  r.onstop = () => saveTake(chunks, r.mimeType || mime, sec, (performance.now() - t0) / 1000);
  r.start(1000);
  cam.rec = r;
  cam.t0 = t0;
  camBox.classList.add('rec');
  recBadge.hidden = false;
}
function camStopTake() {
  const r = cam.rec;
  cam.rec = null;
  if (r && r.state !== 'inactive') r.stop();
  camBox.classList.remove('rec');
  recBadge.hidden = true;
}
function saveTake(chunks, mime, sec, dur) {
  const type = (mime || 'video/webm').split(';')[0];
  const blob = new Blob(chunks, { type });
  if (!blob.size) return;
  const secNo = sec ? secs.indexOf(sec) + 1 : 0;
  const label = sec ? `第${secNo}节` : (secs.length ? '开头' : '全文');
  const n = takes.filter((t) => t.label === label).length + 1;
  const safe = sec ? '-' + sec.title.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 20) : '';
  const t = { label, n, dur, blob, url: URL.createObjectURL(blob), name: `${label}${safe}-第${n}条.${type.includes('mp4') ? 'mp4' : 'webm'}`, saved: false };
  takes.push(t);
  toast(`已录好 ${label} 第${n}条（${fmt(dur)}）`);
  if (S.autoSave) downloadTake(t);
  renderPanel();
}
// 安卓 App 里没有"下载"，分块交给原生写进相册（Movies/提词器）
async function nativeSave(t) {
  let id = null;
  try {
    id = (await NP.saveBegin({ name: t.name, mime: t.blob.type || 'video/mp4' })).id;
    const CH = 768 * 1024;
    for (let off = 0; off < t.blob.size; off += CH) {
      const u8 = new Uint8Array(await t.blob.slice(off, off + CH).arrayBuffer());
      let bin = '';
      for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      await NP.saveChunk({ id, data: btoa(bin) });
    }
    await NP.saveEnd({ id });
    t.saved = true;
    toast('已保存到相册：视频 / 提词器');
  } catch (e) {
    if (id) NP.saveAbort({ id }).catch(() => {});
    toast('保存失败，可以在「目录」里再点一次保存');
  }
  renderPanel();
}
function downloadTake(t) {
  if (NP) { nativeSave(t); return; }
  const a = document.createElement('a');
  a.href = t.url;
  a.download = t.name;
  document.body.append(a);
  a.click();
  a.remove();
  t.saved = true;
}
async function saveTakeManually(t) {
  if (NP) { await nativeSave(t); return; }
  const file = new File([t.blob], t.name, { type: t.blob.type });
  // 手机上用系统分享面板，可以直接"存储视频"到相册
  if (isTouch && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); t.saved = true; } catch (e) {}
  } else downloadTake(t);
  renderPanel();
}
camBox.addEventListener('click', () => camBox.classList.toggle('mini'));
window.addEventListener('beforeunload', (e) => {
  if (takes.some((t) => !t.saved)) { e.preventDefault(); e.returnValue = ''; }
});

function syncPlay() {
  const playing = state !== 'paused';
  prompter.classList.toggle('playing', state === 'playing');
  const btn = $('#pPlay');
  btn.querySelector('use').setAttribute('href', playing ? '#i-pause' : '#i-play');
  btn.setAttribute('aria-label', playing ? '暂停' : '播放');
  v3?.sync();
}

