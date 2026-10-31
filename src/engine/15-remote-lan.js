'use strict';
// ----- 同一网络直连（WebRTC，扫两次码配对，之后不经过任何服务器） -----
const RTC_CFG = { iceServers: [] };
const packOf = async (obj) => {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (!window.CompressionStream) return 'r' + b64u.enc(raw);
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter();
  w.write(raw); w.close();
  return 'z' + b64u.enc(new Uint8Array(await new Response(cs.readable).arrayBuffer()));
};
const unpackOf = async (str) => {
  str = str.trim();
  const bin = b64u.dec(str.slice(1));
  if (str[0] === 'r') return JSON.parse(new TextDecoder().decode(bin));
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  w.write(bin); w.close();
  return JSON.parse(new TextDecoder().decode(await new Response(ds.readable).arrayBuffer()));
};
function iceDone(pc, ms = 3000) {
  return new Promise((res) => {
    if (pc.iceGatheringState === 'complete') return res();
    const done = () => { pc.removeEventListener('icegatheringstatechange', chk); clearTimeout(t); res(); };
    const chk = () => { if (pc.iceGatheringState === 'complete') done(); };
    const t = setTimeout(done, ms);
    pc.addEventListener('icegatheringstatechange', chk);
  });
}
async function drawQr(box, text) {
  if (!window.qrcode) await loadScript('vendor/qrcode.js');
  const q = window.qrcode(0, 'L');
  q.addData(text);
  q.make();
  box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}
const pageBase = () => { const u = new URL(location.href); u.search = ''; u.hash = ''; return u.toString(); };

// ----- 提词设备（主机）这一端 -----
const rdlg = $('#rdlg');
const host = { on: false, cli: null, key: null, pair: null, net: 'offline', remotes: new Map(), lastSent: '', lastSentAt: 0, timer: null };
function newPair() {
  const A = 'abcdefghjkmnpqrstuvwxyz23456789';
  return {
    room: [...crypto.getRandomValues(new Uint8Array(10))].map((x) => A[x % A.length]).join(''),
    key: b64u.enc(crypto.getRandomValues(new Uint8Array(16))),
  };
}
function remoteUrl() {
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
  u.searchParams.set('r', host.pair.room);
  if (qs.get('broker')) u.searchParams.set('broker', qs.get('broker'));
  return u.toString() + '#' + host.pair.key;
}
async function hostStart(fresh) {
  if (!window.crypto?.subtle) { toast('遥控需要用 https 打开页面'); return false; }
  host.pair = (!fresh && store.get('pair', null)) || newPair();
  store.set('pair', host.pair);
  host.key = await importKey(b64u.dec(host.pair.key));
  host.cli?.close();
  host.remotes.clear();
  host.on = true;
  S.remoteOn = true;
  save();
  host.cli = mqtt(brokerList, async (topic, data) => {
    const m = await unseal(host.key, data);
    if (!m) return;
    host.remotes.set(m.id, Date.now());
    if (m.t === 'cmd') runRemote(m.c);
    sendState(true);
    renderRemoteStatus();
  }, (st) => { host.net = st; if (st === 'online') sendState(true); renderRemoteStatus(); });
  host.cli.subscribe(TOPIC(host.pair.room) + '/r');
  clearInterval(host.timer);
  host.timer = setInterval(() => { sendState(false); renderRemoteStatus(); }, 300);
  renderRemoteStatus();
  return true;
}
function hostStop() {
  host.on = false;
  S.remoteOn = false;
  save();
  host.cli?.close();
  host.cli = null;
  clearInterval(host.timer);
  host.remotes.clear();
  host.net = 'offline';
  renderRemoteStatus();
}
function snapshot() {
  const inP = !prompter.hidden;
  return {
    t: 'state', mode: inP ? 'prompter' : 'editor', st: state, reason: pauseReason,
    pct: inP && maxPos ? Math.round(pos / maxPos * 1000) / 10 : 0,
    title: scriptTitle(curScript()),
    context: inP ? sents.slice(Math.max(0, curIdx - 1), curIdx + 3).map((s, i) => ({ text: s.plain, index: Math.max(0, curIdx - 1) + i })) : [],
    currentIndex: Math.max(0, curIdx),
    sec: inP ? (currentSec()?.title ? plain(currentSec().title) : '') : titleOf(ta.value),
    sent: inP ? (sents[Math.max(0, curIdx)]?.plain || '').trim().slice(0, 80) : '',
    el: Math.round(elapsed),
    rem: Math.round(inP ? (maxPos - pos) / speedPx : doc.units / S.cpm * 60),
    cpm: S.cpm, fs: S.fontSize, rec: !!cam.rec, voice: voice.on,
  };
}
async function sendState(force) {
  if (!host.on || !host.cli?.online) return;
  const snap = snapshot();
  const j = JSON.stringify(snap);
  const now = Date.now();
  const listening = [...host.remotes.values()].some((t) => now - t < 12000);
  if (!force && now - host.lastSentAt < 3000 && (j === host.lastSent || !listening)) return;
  host.lastSent = j;
  host.lastSentAt = now;
  host.cli.publish(TOPIC(host.pair.room) + '/p', await seal(host.key, snap));
}
// 直连的遥控器：每台一个 RTCPeerConnection
const lan = { peers: [], pending: null, timer: null, scanStream: null, scanning: false };
const lanOpen = () => lan.peers.filter((x) => x.ch?.readyState === 'open' && Date.now() - x.last < 8000);
function lanSend(x, obj) { try { x.ch.send(JSON.stringify(obj)); } catch (e) {} }
function lanTick() {
  for (const x of lan.peers.slice()) if (Date.now() - x.last > 40000) lanDrop(x);
  const open = lanOpen();
  if (open.length) { const snap = snapshot(); for (const x of open) lanSend(x, snap); }
  renderRemoteStatus();
}
function lanDrop(x) {
  lan.peers = lan.peers.filter((y) => y !== x);
  try { x.pc.close(); } catch (e) {}
  if (!lan.peers.length) { clearInterval(lan.timer); lan.timer = null; }
  renderRemoteStatus();
}
async function lanBegin() {
  lanStopScan();
  if (lan.pending) { try { lan.pending.pc.close(); } catch (e) {} lan.pending = null; }
  $('#lanStart').disabled = true;
  // 先申请摄像头：浏览器这样才会在配对信息里带上真实的局域网地址，也是后面扫码要用的
  try { lan.scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } }); } catch (e) { lan.scanStream = null; }
  const pc = new RTCPeerConnection(RTC_CFG);
  const ch = pc.createDataChannel('c');
  const x = { pc, ch, id: newId(), last: Date.now() };
  lan.pending = x;
  ch.onopen = () => {
    x.last = Date.now();
    lan.pending = null;
    lan.peers.push(x);
    lanSend(x, snapshot());
    if (!lan.timer) lan.timer = setInterval(lanTick, 300);
    lanStopScan();
    $('#lanScan').hidden = true;
    $('#lanQr').hidden = true;
    $('#lanStart').textContent = '再连一台遥控器';
    $('#lanStart').disabled = false;
    renderRemoteStatus();
    toast('遥控器已连上');
  };
  ch.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch (err) { return; }
    x.last = Date.now();
    if (m.t === 'cmd') runRemote(m.c);
    else if (m.t === 'hello') lanSend(x, snapshot());
  };
  pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) { if (lan.peers.includes(x)) { lanDrop(x); toast('一台遥控器断开了'); } } };
  await pc.setLocalDescription(await pc.createOffer());
  await iceDone(pc);
  const code = await packOf({ k: 'o', sdp: pc.localDescription.sdp });
  const url = pageBase() + '#d=' + code;
  $('#lanLink').value = url;
  try { await drawQr($('#lanQr'), url); $('#lanQr').hidden = false; } catch (e) { $('#lanQr').hidden = true; }
  $('#lanScan').hidden = false;
  $('#lanStart').disabled = false;
  $('#lanStart').textContent = '重新生成配对码';
  $('#lanStat').textContent = '等待遥控器扫码…';
  $('#lanStat').classList.remove('ok');
}
async function lanAccept(text) {
  const x = lan.pending;
  if (!x) return toast('先点「开始配对」');
  let m;
  try { m = await unpackOf(text); } catch (e) { return toast('这个码不对，请重新扫'); }
  if (m.k !== 'a' || !m.sdp) return toast('这个码不是遥控器的回应码');
  lanStopScan();
  try { await x.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }); }
  catch (e) { return toast('配对失败，请重新开始配对'); }
  $('#lanStat').textContent = '正在连接…';
}
async function lanScanStart() {
  if (lan.scanning) return;
  const v = $('#scanVideo');
  if (!lan.scanStream) {
    try { lan.scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } }); }
    catch (e) { return toast('没有摄像头权限，请用下面的「手动配对」'); }
  }
  v.srcObject = lan.scanStream;
  v.hidden = false;
  await v.play().catch(() => {});
  lan.scanning = true;
  const det = 'BarcodeDetector' in window ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
  if (!det && !window.jsQR) { try { await loadScript('vendor/jsqr.js'); } catch (e) { lanStopScan(); return toast('扫码组件加载失败，请用「手动配对」'); } }
  const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
  $('#lanStat').textContent = '把摄像头对准遥控器上的码…';
  const loop = async () => {
    if (!lan.scanning) return;
    if (v.videoWidth) {
      let text = null;
      try {
        if (det) { const r = await det.detect(v); text = r[0]?.rawValue || null; }
        else {
          const sc = Math.min(1, 720 / v.videoWidth);
          cv.width = v.videoWidth * sc; cv.height = v.videoHeight * sc;
          cx.drawImage(v, 0, 0, cv.width, cv.height);
          text = window.jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height)?.data || null;
        }
      } catch (e) {}
      if (text) { await lanAccept(text); return; }
    }
    setTimeout(loop, 150);
  };
  loop();
}
function lanStopScan() {
  lan.scanning = false;
  $('#scanVideo').hidden = true;
  $('#scanVideo').srcObject = null;
  if (lan.scanStream) lan.scanStream.getTracks().forEach((t) => t.stop());
  lan.scanStream = null;
}

function runRemote(c) {
  if (prompter.hidden) { if (c === 'toggle') enter(false); return; }
  if (editing) commitEdit();
  if (typeof c === 'string' && /^seek:\d+$/.test(c)) { const idx = +c.slice(5); if (idx < sents.length) jumpTo(posOf(idx)); poke(); return; }
  const acts = {
    toggle, retake, home: () => jumpTo(0),
    pageUp: nav.pageUp, pageDown: nav.pageDown, paraUp: nav.paraUp, paraDown: nav.paraDown, secUp: nav.secUp, secDown: nav.secDown,
    faster: () => setSpeed(S.cpm + 10), slower: () => setSpeed(S.cpm - 10),
    bigger: () => setFont(S.fontSize + 4), smaller: () => setFont(S.fontSize - 4),
    mark: addMark,
  };
  acts[c]?.();
  poke();
}
function renderRemoteStatus() {
  const nLan = lanOpen().length;
  const lanEl = $('#lanStat');
  if (nLan) { lanEl.textContent = `已直连 ${nLan} 台遥控器`; lanEl.classList.add('ok'); }
  else if (lanEl.classList.contains('ok')) { lanEl.textContent = '遥控器已断开，需要重新配对'; lanEl.classList.remove('ok'); }
  const n = [...host.remotes.values()].filter((t) => Date.now() - t < 12000).length;
  const el = $('#rstat');
  const text = !host.on ? '遥控已关闭'
    : host.net !== 'online' ? '正在连接中转服务器…'
    : n ? `已连接 ${n} 台遥控器` : '等待遥控器扫码…';
  if (el.textContent !== text) el.textContent = text;
  el.classList.toggle('ok', host.on && host.net === 'online');
  const nNear = IS_NATIVE ? [...app.clients.values()].filter((c) => c.authed).length : 0;
  $('#pRemote').setAttribute('aria-pressed', String((host.on && n > 0) || nLan > 0 || nNear > 0));
  v3?.connection(nLan + n + nNear);
}
function showTab(t) {
  if (t === 'near' && !IS_NATIVE) t = 'lan';
  S.remoteTab = t;
  save();
  document.querySelectorAll('input[name="rtab"]').forEach((r) => { r.checked = r.value === t; });
  $('#tabNear').hidden = t !== 'near';
  $('#tabLan').hidden = t !== 'lan';
  $('#tabNet').hidden = t !== 'net';
}
document.querySelectorAll('input[name="rtab"]').forEach((r) => r.addEventListener('change', () => { showTab(r.value); if (r.value === 'net') openRemoteDlg(false, true); else if (r.value === 'near') nearHostStart(); else lanStopScan(); }));
$('#lanStart').addEventListener('click', lanBegin);
$('#lanScan').addEventListener('click', lanScanStart);
$('#lanConnect').addEventListener('click', () => lanAccept($('#lanPaste').value));
$('#lanCopy').addEventListener('click', async (e) => {
  const inp = $('#lanLink');
  try { await navigator.clipboard.writeText(inp.value); e.currentTarget.textContent = '已复制'; } catch (err) { inp.select(); }
});
async function openRemoteDlg(fresh, keepTab) {
  rdlg.hidden = false;
  poke();
  if (!keepTab) showTab(S.remoteTab || (IS_NATIVE ? 'near' : 'lan'));
  if (S.remoteTab === 'near') { nearHostStart(); return; }
  if (S.remoteTab !== 'net') { renderRemoteStatus(); return; }
  if (fresh || !host.on) { if (!(await hostStart(fresh))) { rdlg.hidden = true; return; } }
  const url = remoteUrl();
  $('#rlink').value = url;
  try {
    if (!window.qrcode) await loadScript('vendor/qrcode.js');
    const q = window.qrcode(0, 'M');
    q.addData(url);
    q.make();
    $('#qr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch (e) { $('#qr').textContent = '二维码加载失败，请复制下面的链接'; }
  $('#rdlgClose').focus();
}
function closeRemoteDlg() { rdlg.hidden = true; lanStopScan(); }
$('#remoteBtn').addEventListener('click', () => openRemoteDlg(false));
bind('#pRemote', () => openRemoteDlg(false));
$('#rdlgClose').addEventListener('click', closeRemoteDlg);
rdlg.addEventListener('click', (e) => { if (e.target === rdlg) closeRemoteDlg(); });
$('#rnew').addEventListener('click', () => openRemoteDlg(true));
$('#roff').addEventListener('click', () => { hostStop(); closeRemoteDlg(); toast('遥控已关闭'); });
$('#rcopy').addEventListener('click', async (e) => {
  const inp = $('#rlink');
  try { await navigator.clipboard.writeText(inp.value); e.currentTarget.textContent = '已复制'; }
  catch (err) { inp.select(); }
});

// ----- 遥控器（另一台手机）这一端 -----
async function remoteMode(room, keyStr) {
  $('#editor').hidden = true;
  prompter.hidden = true;
  $('#remote').hidden = false;
  document.title = '提词遥控器';
  const conn = $('#rconn');
  const setConn = (t, ok) => { conn.textContent = t; conn.classList.toggle('ok', !!ok); };
  let key;
  try { key = await importKey(b64u.dec(keyStr)); } catch (e) { setConn('配对码不完整，请重新扫码'); return; }
  const id = Math.random().toString(36).slice(2, 10);
  let lastHost = 0, net = 'offline';
  const refresh = () => {
    if (net !== 'online') setConn('正在连接中转服务器…');
    else if (Date.now() - lastHost < 8000) setConn('已连接提词设备', true);
    else setConn('等待提词设备…（在提词设备上打开「手机遥控」）');
  };
  const cli = mqtt(brokerList, async (t, data) => {
    const m = await unseal(key, data);
    if (!m || m.t !== 'state') return;
    lastHost = Date.now();
    renderRemote(m);
    refresh();
  }, (st) => { net = st; if (st === 'online') send(null); refresh(); });
  cli.subscribe(TOPIC(room) + '/p');
  async function send(c) {
    const ok = cli.publish(TOPIC(room) + '/r', await seal(key, { t: c ? 'cmd' : 'hello', c, id }));
    if (c && !ok) setConn('还没连上，稍等一下再按');
  }
  setInterval(() => { send(null); refresh(); }, 4000);
  document.querySelectorAll('.rbtn').forEach((b) => b.addEventListener('click', () => {
    send(b.dataset.c);
    navigator.vibrate?.(15);
  }));
  $('#remote').addEventListener('prompter-seek', (e) => { if (!v3.remoteLocked && $('#rconn').classList.contains('ok')) send('seek:' + e.detail); });
  lockScreen();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') lockScreen(); });
}
async function directRemote(code) {
  $('#editor').hidden = true;
  prompter.hidden = true;
  $('#remote').hidden = false;
  document.title = '提词遥控器';
  const conn = $('#rconn');
  const setConn = (t, ok) => { conn.textContent = t; conn.classList.toggle('ok', !!ok); };
  setConn('正在配对…');
  let offer;
  try { offer = await unpackOf(code); } catch (e) { return setConn('配对码不完整，请重新扫码'); }
  if (offer.k !== 'o') return setConn('这不是提词设备的配对码');
  const pc = new RTCPeerConnection(RTC_CFG);
  let ch = null, lastMsg = 0;
  const upd = () => {
    if (ch?.readyState === 'open' && Date.now() - lastMsg < 3000) setConn('已连接提词设备（直连）', true);
    else if (ch?.readyState === 'open') setConn('已连上，等待提词设备…', true);
    else if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) { setConn('连接断开了，请重新扫码配对'); $('#rpair').hidden = true; }
  };
  pc.ondatachannel = (e) => {
    ch = e.channel;
    ch.onopen = () => {
      $('#rpair').hidden = true; upd(); ch.send(JSON.stringify({ t: 'hello' }));
      setInterval(() => { if (ch.readyState === 'open') ch.send(JSON.stringify({ t: 'ping' })); }, 2000);
    };
    ch.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (err) { return; } if (m.t === 'state') { lastMsg = Date.now(); renderRemote(m); upd(); } };
    ch.onclose = upd;
  };
  pc.onconnectionstatechange = upd;
  setInterval(upd, 1000);
  try {
    await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await iceDone(pc);
    const ans = await packOf({ k: 'a', sdp: pc.localDescription.sdp });
    $('#rAnsCode').value = ans;
    await drawQr($('#rQr'), ans);
    $('#rpair').hidden = false;
    setConn('等待提词设备扫码…');
  } catch (e) { return setConn('配对失败，请重新扫码'); }
  $('#rAnsCopy').addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText($('#rAnsCode').value); e.currentTarget.textContent = '已复制'; } catch (err) { $('#rAnsCode').select(); }
  });
  document.querySelectorAll('.rbtn').forEach((b) => b.addEventListener('click', () => {
    if (ch?.readyState !== 'open') return setConn('还没连上，稍等一下再按');
    ch.send(JSON.stringify({ t: 'cmd', c: b.dataset.c }));
    navigator.vibrate?.(15);
  }));
  $('#remote').addEventListener('prompter-seek', (e) => { if (!v3.remoteLocked && ch?.readyState === 'open') ch.send(JSON.stringify({ t: 'cmd', c: 'seek:' + e.detail })); });
  lockScreen();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') lockScreen(); });
}
function renderRemote(m) {
  const inP = m.mode === 'prompter';
  $('#rSec').textContent = m.sec || (inP ? '' : '提词设备在编辑页');
  $('#rSent').textContent = inP ? (m.sent || '…') : '按下面的按钮开始提词。';
  $('#rFill').style.width = m.pct + '%';
  const stTxt = !inP ? '在编辑页' : m.st === 'playing' ? '播放中' : m.st === 'countdown' ? '倒数中' : ({ secEnd: '本节读完', end: '全文读完' }[m.reason] || '已暂停');
  $('#rState').textContent = stTxt;
  $('#rEl').textContent = fmt(m.el);
  $('#rRem').textContent = fmt(m.rem);
  $('#rInfo').textContent = `语速 ${m.cpm} · 字号 ${m.fs}` + (m.rec ? ' · 录像中' : '') + (m.voice ? ' · 语音跟随' : '');
  v3?.remote(m);
  const play = $('#rPlay');
  const running = inP && m.st !== 'paused';
  play.setAttribute('aria-label', !inP ? '开始提词' : running ? '暂停' : '播放');
  play.innerHTML = `<svg class="i"><use href="${running ? '#i-pause' : '#i-play'}"/></svg>`;
  play.classList.toggle('on', running);
  document.querySelectorAll('.rbtn:not(.big)').forEach((b) => { b.disabled = !inP || !$('#rconn').classList.contains('ok') || !!v3?.remoteLocked; });
}

