'use strict';
// ---------- 附近设备（只在安卓 App 里）：设备发现 + 6 位验证码配对 ----------
const app = {
  id: store.get('devId', null) || (() => { const v = newId() + newId(); store.set('devId', v); return v; })(),
  alias: '', code: '', port: 0, ips: [], hostOn: false, timer: null, fails: 0,
  clients: new Map(), trusted: store.get('trusted', {}),
};
const randHex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const gen6 = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
async function hmacHex(secret, msg) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
let linkReady = false;
const ctrl = { peers: new Map(), ws: null, peer: null, code: '', nonce: '', want: false, retry: null, rid: 0, searching: false, lastMsg: 0 };
function linkInit() {
  if (linkReady || !NP) return;
  linkReady = true;
  NP.addListener('clientOpen', (e) => app.clients.set(e.cid, { authed: false, nonce: '', devId: '', alias: '', addr: e.addr }));
  NP.addListener('clientClose', (e) => { app.clients.delete(e.cid); renderNear(); });
  NP.addListener('clientMessage', (e) => onNearMsg(e.cid, e.text));
  NP.addListener('peerFound', (e) => {
    ctrl.peers.set(e.id, e);
    if (ctrl.peer && ctrl.peer.id === e.id) ctrl.peer = e; // 对方换了地址，重连时用新的
    renderPeers();
  });
  NP.addListener('peerLost', (e) => { ctrl.peers.delete(e.id); renderPeers(); });
}

// ----- 被遥控的这一端 -----
function renderNear() {
  const c = app.code;
  $('#nearCode').textContent = c ? c.slice(0, 3) + ' ' + c.slice(3) : '--- ---';
  if (document.activeElement !== $('#nearAlias')) $('#nearAlias').value = app.alias;
  const n = [...app.clients.values()].filter((x) => x.authed);
  const st = $('#nearStat');
  st.textContent = !app.hostOn ? '没有被发现（遥控器看不到这台设备）' : n.length ? `已连接 ${n.map((x) => x.alias).join('、')}` : '正在被附近的设备发现，等待遥控器连接…';
  st.classList.toggle('ok', app.hostOn);
  $('#nearIps').textContent = app.hostOn && app.ips.length ? '本机地址：' + app.ips.map((ip) => `${ip}:${app.port}`).join('  ') : '';
  $('#nearOff').textContent = app.hostOn ? '不再被发现' : '开始被发现';
}
async function nearHostStart() {
  if (!NP) return false;
  linkInit();
  if (!app.hostOn) {
    try {
      const info = await NP.getInfo();
      app.alias = store.get('alias', null) || info.model || '提词器';
      app.ips = info.ips || [];
      if (!app.code) app.code = gen6();
      app.port = (await NP.startServer({ port: 53321 })).port;
      await NP.startAnnounce({ id: app.id, alias: app.alias, port: app.port });
      app.hostOn = true;
      S.nearOn = true;
      save();
      clearInterval(app.timer);
      app.timer = setInterval(() => {
        const snap = JSON.stringify(snapshot());
        for (const [cid, c] of app.clients) if (c.authed) NP.sendTo({ cid, text: snap });
        renderRemoteStatus();
      }, 300);
    } catch (e) {
      $('#nearStat').textContent = '启动失败：' + (e.message || e);
      return false;
    }
  }
  renderNear();
  return true;
}
function nearHostStop() {
  clearInterval(app.timer);
  app.hostOn = false;
  S.nearOn = false;
  save();
  NP.stopAnnounce().catch(() => {});
  NP.stopServer().catch(() => {});
  app.clients.clear();
  renderNear();
  renderRemoteStatus();
}
async function onNearMsg(cid, text) {
  let m;
  try { m = JSON.parse(text); } catch (e) { return; }
  let c = app.clients.get(cid);
  if (!c) { c = { authed: false, nonce: '', devId: '', alias: '' }; app.clients.set(cid, c); }
  const send = (o) => NP.sendTo({ cid, text: JSON.stringify(o) });
  if (m.t === 'hello') {
    c.devId = String(m.id || '').slice(0, 40);
    c.alias = String(m.alias || '遥控器').slice(0, 24);
    if (m.tok && c.devId && app.trusted[c.devId] === m.tok) { c.authed = true; send({ t: 'ok', alias: app.alias }); renderNear(); }
    else { c.nonce = randHex(16); send({ t: 'chal', n: c.nonce }); }
  } else if (m.t === 'auth') {
    if (c.authed || !c.nonce) return;
    if (m.mac && m.mac === await hmacHex(app.code, c.nonce)) {
      const tok = randHex(16);
      app.trusted[c.devId] = tok;
      store.set('trusted', app.trusted);
      c.authed = true;
      app.fails = 0;
      send({ t: 'ok', tok, alias: app.alias });
      renderNear();
      toast(`${c.alias} 已连上`);
    } else {
      app.fails++;
      c.nonce = randHex(16); // 每次猜错都换一个挑战
      if (app.fails >= 5) { app.fails = 0; app.code = gen6(); renderNear(); send({ t: 'locked' }); NP.closeClient({ cid }); }
      else send({ t: 'bad', n: c.nonce });
    }
  } else if (m.t === 'cmd' && c.authed) {
    runRemote(m.c);
  }
}
$('#nearNew').addEventListener('click', () => { app.code = gen6(); app.fails = 0; renderNear(); });
$('#nearForget').addEventListener('click', () => {
  app.trusted = {};
  store.set('trusted', app.trusted);
  for (const [cid] of app.clients) NP.closeClient({ cid });
  toast('已忘记所有配对过的设备，下次连接要重新输入验证码');
});
$('#nearOff').addEventListener('click', () => { if (app.hostOn) nearHostStop(); else nearHostStart(); });
$('#nearAlias').addEventListener('change', (e) => {
  app.alias = e.target.value.trim().slice(0, 20) || app.alias;
  store.set('alias', app.alias);
  if (app.hostOn) NP.startAnnounce({ id: app.id, alias: app.alias, port: app.port }).catch(() => {});
});

// ----- 当遥控器的这一端 -----
const cdlg = $('#cdlg');
const setCtrlConn = (t, ok) => { $('#rconn').textContent = t; $('#rconn').classList.toggle('ok', !!ok); };
const knownPeers = () => store.get('peers', {});
function renderPeers() {
  const ul = $('#peerList');
  ul.textContent = '';
  const list = [...ctrl.peers.values()].sort((a, b) => a.alias.localeCompare(b.alias));
  $('#peerEmpty').hidden = list.length > 0;
  for (const p of list) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'go' + (ctrl.peer && ctrl.peer.id === p.id && ctrl.ws ? ' on' : '');
    b.innerHTML = '<span class="t"></span><span class="tm"></span>';
    b.querySelector('.t').textContent = p.alias;
    b.querySelector('.tm').textContent = knownPeers()[p.id] ? '已配对 · ' + p.ip : p.ip;
    b.addEventListener('click', () => ctrlConnect(p));
    li.append(b);
    ul.append(li);
  }
}
async function ctrlOpen() {
  if (!NP) return;
  linkInit();
  cdlg.hidden = false;
  $('#codeAsk').hidden = true;
  try {
    const info = await NP.getInfo();
    app.alias = store.get('alias', null) || info.model || '遥控器';
    if (!ctrl.searching) { await NP.startDiscovery({ id: app.id }); ctrl.searching = true; }
  } catch (e) { toast('搜索失败：' + (e.message || e)); }
  renderPeers();
}
function ctrlCloseDlg() {
  cdlg.hidden = true;
  if (!ctrl.want && ctrl.searching) { NP.stopDiscovery().catch(() => {}); ctrl.searching = false; ctrl.peers.clear(); }
}
function askCode(msg) {
  $('#codeLbl').textContent = msg || '输入对方屏幕上的 6 位验证码';
  $('#codeAsk').hidden = false;
  $('#codeIn').value = '';
  $('#codeIn').focus();
}
function ctrlConnect(peer) {
  ctrl.want = true;
  ctrl.peer = peer;
  ctrl.code = '';
  ctrlSocket();
}
function ctrlSocket() {
  clearTimeout(ctrl.retry);
  if (ctrl.ws) { try { ctrl.ws.close(); } catch (e) {} }
  const peer = ctrl.peer;
  const rid = ++ctrl.rid;
  let authed = false;
  let ws;
  try { ws = new WebSocket(`ws://${peer.ip}:${peer.port}`); } catch (e) { toast('地址不对'); ctrl.want = false; return; }
  ctrl.ws = ws;
  setCtrlConn(`正在连接 ${peer.alias}…`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', id: app.id, alias: app.alias, tok: knownPeers()[peer.id]?.tok || '' }));
  ws.onmessage = (ev) => {
    if (rid !== ctrl.rid) return;
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.t === 'chal' || m.t === 'bad') {
      ctrl.nonce = m.n;
      if (m.t === 'bad') { toast('验证码不对'); askCode('验证码不对，请再看一下对方屏幕'); }
      else askCode(`输入「${peer.alias}」屏幕上的 6 位验证码`);
    } else if (m.t === 'locked') {
      toast('错误次数太多，请看对方屏幕上换了的新验证码');
      ctrl.want = false;
      ws.close();
    } else if (m.t === 'ok') {
      authed = true;
      $('#codeAsk').hidden = true;
      if (m.tok) { const k = knownPeers(); k[peer.id] = { tok: m.tok, alias: peer.alias }; store.set('peers', k); }
      cdlg.hidden = true;
      showRemoteScreen(true);
      setCtrlConn(`已连接 ${peer.alias}`, true);
      renderPeers();
    } else if (m.t === 'state') {
      ctrl.lastMsg = Date.now();
      renderRemote(m);
      setCtrlConn(`已连接 ${peer.alias}`, true);
    }
  };
  ws.onclose = () => {
    if (rid !== ctrl.rid) return;
    ctrl.ws = null;
    if (!ctrl.want) return;
    if (authed) { setCtrlConn('连接断开，正在重连…'); ctrl.retry = setTimeout(ctrlSocket, 1500); }
    else { toast(`连不上 ${peer.alias}，请确认两台设备在同一个网络`); ctrl.want = false; }
    renderPeers();
  };
  ws.onerror = () => {};
}
$('#codeGo').addEventListener('click', async () => {
  const code = $('#codeIn').value.replace(/\D/g, '');
  if (code.length !== 6 || !ctrl.ws || ctrl.ws.readyState !== 1) return;
  ctrl.ws.send(JSON.stringify({ t: 'auth', mac: await hmacHex(code, ctrl.nonce) }));
});
$('#codeIn').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); if (e.target.value.length === 6) $('#codeGo').click(); });
$('#manGo').addEventListener('click', () => {
  const ip = $('#manIp').value.trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return toast('地址要像 192.168.43.1 这样');
  ctrlConnect({ id: 'ip:' + ip, alias: ip, ip, port: 53321 });
});
function showRemoteScreen(on) {
  $('#remote').hidden = !on;
  $('#editor').hidden = on;
  if (on) history.pushState({ r: 1 }, '');
}
function ctrlLeave() {
  ctrl.want = false;
  ctrl.rid++;
  clearTimeout(ctrl.retry);
  try { ctrl.ws?.close(); } catch (e) {}
  ctrl.ws = null;
  if (ctrl.searching) { NP.stopDiscovery().catch(() => {}); ctrl.searching = false; ctrl.peers.clear(); }
  showRemoteScreen(false);
}
window.addEventListener('popstate', () => { if (!$('#remote').hidden && ctrl.want) ctrlLeave(); });
$('#rLeave').addEventListener('click', () => { if (history.state?.r) history.back(); else ctrlLeave(); });
$('#ctrlBtn').addEventListener('click', ctrlOpen);
$('#cdlgClose').addEventListener('click', ctrlCloseDlg);
cdlg.addEventListener('click', (e) => { if (e.target === cdlg) ctrlCloseDlg(); });
// 遥控器的按钮：走 WebSocket（网页版遥控页各自有自己的发送方式，这里 ws 为空时不会动作）
$('#remote').addEventListener('click', (e) => {
  const b = e.target.closest('.rbtn');
  if (!b || !ctrl.ws || ctrl.ws.readyState !== 1) return;
  ctrl.ws.send(JSON.stringify({ t: 'cmd', c: b.dataset.c }));
  navigator.vibrate?.(15);
});
$('#remote').addEventListener('prompter-seek', (e) => { if (!v3.remoteLocked && ctrl.ws?.readyState === 1) ctrl.ws.send(JSON.stringify({ t: 'cmd', c: 'seek:' + e.detail })); });

