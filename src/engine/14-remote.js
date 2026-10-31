'use strict';
// ---------- 遥控 ----------
// 两台设备通过公共 MQTT 服务器中转消息；内容用配对码里的密钥加密，服务器看不到稿子和操作
const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
const qs = new URLSearchParams(location.search);
const brokerList = qs.get('broker') ? [qs.get('broker')] : BROKERS;
const TOPIC = (room) => `tcq-prompter/v1/${room}`;

// 精简版 MQTT 3.1.1 客户端（只用到 QoS 0 的订阅和发布）
function mqtt(urls, onMsg, onState) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const str = (x) => { const b = enc.encode(x); return [b.length >> 8, b.length & 255, ...b]; };
  const vlen = (n) => { const o = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; o.push(d); } while (n > 0); return o; };
  const pkt = (h, body) => new Uint8Array([h, ...vlen(body.length), ...body]);
  const subs = new Set();
  let ws = null, alive = false, closed = false, ping = null, ui = 0, retry = 0, buf = new Uint8Array(0);
  function connect() {
    if (closed) return;
    const url = urls[ui % urls.length];
    try { ws = new WebSocket(url, ['mqtt']); } catch (e) { ui++; setTimeout(connect, 1000); return; }
    ws.binaryType = 'arraybuffer';
    buf = new Uint8Array(0);
    ws.onopen = () => {
      const id = 'tcq' + Math.random().toString(36).slice(2, 12);
      ws.send(pkt(0x10, [...str('MQTT'), 4, 2, 0, 60, ...str(id)]));
    };
    ws.onmessage = (e) => feed(new Uint8Array(e.data));
    ws.onerror = () => {};
    ws.onclose = () => {
      clearInterval(ping);
      if (!alive) ui++; // 这个服务器连不上，换下一个
      alive = false;
      onState('offline');
      if (!closed) setTimeout(connect, Math.min(8000, 800 * 2 ** retry++));
    };
  }
  function feed(chunk) {
    const nb = new Uint8Array(buf.length + chunk.length);
    nb.set(buf); nb.set(chunk, buf.length); buf = nb;
    for (;;) {
      if (buf.length < 2) return;
      let len = 0, mul = 1, i = 1, b;
      do { if (i >= buf.length) return; b = buf[i++]; len += (b & 127) * mul; mul *= 128; } while (b & 128);
      if (buf.length < i + len) return;
      const type = buf[0] >> 4, body = buf.slice(i, i + len);
      const qos = (buf[0] >> 1) & 3;
      buf = buf.slice(i + len);
      if (type === 2) { // CONNACK
        if (body[1] !== 0) { ws.close(); return; }
        alive = true; retry = 0;
        for (const t of subs) ws.send(pkt(0x82, [0, 1, ...str(t), 0]));
        ping = setInterval(() => { try { ws.send(new Uint8Array([0xC0, 0])); } catch (e) {} }, 30000);
        onState('online');
      } else if (type === 3) { // PUBLISH
        const tl = (body[0] << 8) | body[1];
        const topic = dec.decode(body.slice(2, 2 + tl));
        onMsg(topic, body.slice(2 + tl + (qos ? 2 : 0)));
      }
    }
  }
  connect();
  return {
    subscribe(t) { subs.add(t); if (alive) ws.send(pkt(0x82, [0, 1, ...str(t), 0])); },
    publish(t, bytes) { if (!alive) return false; ws.send(pkt(0x30, [...str(t), ...bytes])); return true; },
    close() { closed = true; clearInterval(ping); try { ws.send(new Uint8Array([0xE0, 0])); ws.close(); } catch (e) {} },
    get online() { return alive; },
  };
}

const b64u = {
  enc: (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (x) => Uint8Array.from(atob(x.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((x.length + 3) % 4)), (c) => c.charCodeAt(0)),
};
const importKey = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return out;
}
async function unseal(key, u8) {
  try { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.slice(0, 12) }, key, u8.slice(12)))); }
  catch (e) { return null; }
}
function loadScript(src) {
  return new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = rej; document.head.append(sc); });
}

