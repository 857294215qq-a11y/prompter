const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { boot, root } = require('./helpers/boot.cjs');

const css = readFileSync(path.join(root, 'ui-v3.css'), 'utf8');
// The declarations of the first (base) rule whose selector list is exactly `selector`; later ones sit in media blocks.
const rule = (selector) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const all = [...css.matchAll(new RegExp('(?:^|[}\\n])\\s*' + esc + '\\s*\\{([^}]*)\\}', 'g'))];
  assert.ok(all.length, 'no rule for ' + selector);
  return all[0][1];
};
const has = (decls, prop, value) => assert.match(decls, new RegExp(prop.replace(/[-]/g, '\\-') + ':\\s*' + value.replace(/[().*+]/g, '\\$&') + '(;|\\s|$)'), `${prop}: ${value}`);

// WCAG relative luminance contrast of two #rrggbb colours.
const lum = (hex) => { const c = hex.match(/\w\w/g).map((h) => parseInt(h, 16) / 255).map((v) => (v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };

test('menus use the macOS 27 metrics', () => {
  const menu = rule('.popover[role="menu"]');
  has(menu, 'width', '244px'); has(menu, 'padding', '5px 12px'); has(menu, 'border-radius', '12px');
  has(menu, 'backdrop-filter', 'blur(25px)');
  const item = rule('.popover[role="menu"] > [role^="menuitem"]');
  has(item, 'height', '24px'); has(item, 'font-size', '13px'); has(item, 'padding', '0 0 0 12px'); has(item, 'border-radius', '8px');
  has(rule('.popover[role="menu"] > hr'), 'height', '11px');
  has(rule('.popover[role="menu"] .menu-heading'), 'height', '25px');
});

test('dark reader menu keeps normal blend and the dark material', () => {
  const dark = rule('#prompter .popover[role="menu"], [data-appearance="dark"] .popover[role="menu"]');
  assert.match(dark, /--menu-fill:[^;]*rgb\(64 64 64 \/ \.8\)/);
  has(rule('.popover[role="menu"] > [role^="menuitem"]'), 'mix-blend-mode', 'normal');
});

test('opaque fallback has 4.5:1 contrast', () => {
  const block = css.match(/@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/);
  assert.ok(block, 'fallback for browsers without backdrop-filter');
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/);
  const light = block[0].match(/--menu-fill:\s*(#[0-9a-f]{6})/i)[1], dark = block[0].match(/\[data-appearance="dark"\][^{]*\{[^}]*--menu-fill:\s*(#[0-9a-f]{6})/i)[1];
  assert.ok(contrast(light, '#1d1d1f') >= 4.5, 'light'); assert.ok(contrast(dark, '#f5f5f7') >= 4.5, 'dark');
});

test('touch keeps 44px menu rows', () => {
  const block = css.match(/@media \(pointer: coarse\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g).join('\n');
  assert.match(block, /\.popover\[role="menu"\] > \[role\^="menuitem"\]\s*\{[^}]*min-height:\s*44px/);
});

test('#docMenu is a menu of menu items', () => {
  const app = boot();
  const menu = app.$('#docMenu');
  assert.equal(menu.getAttribute('role'), 'menu');
  const items = [...menu.querySelectorAll(':scope > button')];
  assert.ok(items.length >= 4); for (const b of items) assert.equal(b.getAttribute('role'), 'menuitem', b.id || b.textContent);
  app.close();
});

// Task 2: popover material and controls
const block = (head) => css.match(new RegExp(head.replace(/[().]/g, '\\$&') + '\\s*\\{(?:[^{}]|\\{[^{}]*\\})*\\}', 'g'))?.join('\n') || '';

test('popovers use radius 20 and the light glass; the cue editor is a small glass panel', () => {
  const pop = rule('.popover:not([role="menu"]):not(.cue-editor)');
  has(pop, 'border-radius', '20px'); has(pop, 'padding', '18px 20px 16px'); has(pop, 'backdrop-filter', 'blur(26px)');
  assert.match(pop, /background:\s*var\(--pop-fill\)/);
  assert.match(css, /--pop-fill:\s*rgb\(255 255 255 \/ \.7\)/);
  const cue = rule('.popover.cue-editor');
  has(cue, 'border-radius', '12px'); assert.match(cue, /background:\s*var\(--pop-fill\)/);
});

test('controls take macOS sizes on fine pointers', () => {
  const fine = block('@media (pointer: fine)');
  assert.match(fine, /input\[type="checkbox"\]\[role="switch"\]\s*\{[^}]*width:\s*54px;[^}]*height:\s*24px/);
  assert.match(fine, /input\[type="checkbox"\]\[role="switch"\]::after\s*\{[^}]*width:\s*32px;[^}]*height:\s*20px/);
  assert.match(fine, /input\[type="checkbox"\]\[role="switch"\]:checked::after\s*\{[^}]*translateX\(18px\)/);
  assert.match(fine, /\.seg\s*\{[^}]*height:\s*24px;[^}]*border-radius:\s*6px/);
  assert.match(fine, /\.btn\s*\{[^}]*height:\s*24px;[^}]*min-height:\s*24px;[^}]*border-radius:\s*6px;[^}]*padding:\s*0 16px/);
  assert.match(fine, /\.cue-editor input, \.cue-custom input, #dialogInput, #dur, #cdSel, #lang, #readerTheme, #appearance\s*\{[^}]*height:\s*24px;[^}]*border-radius:\s*6px;[^}]*font-size:\s*13px/);
});

test('touch keeps 44px button targets', () => {
  assert.match(block('@media (pointer: coarse)'), /\.btn\s*\{[^}]*min-height:\s*44px/);
});

test('start buttons keep their Figma heights', () => {
  has(rule('.start-actions .btn'), 'min-height', '32px');
  has(rule('.start-actions .primary'), 'min-height', '40px');
});

// Task 3: device popover
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
function desktop(opts) {
  const app = boot({}, opts);
  app.$('#remoteBtn').getBoundingClientRect = () => rect(958, 10, 72, 32);
  return app;
}
const pop = (app) => app.$('#devicePopover');

test('设备 opens the popover under its button, not the pairing dialog', () => {
  const app = desktop();
  app.click('#remoteBtn');
  assert.equal(pop(app).hidden, false); assert.equal(app.$('#rdlg').hidden, true);
  assert.equal(pop(app).style.left, '769px'); assert.equal(pop(app).style.top, '62px');
  assert.equal(app.$('#remoteBtn').getAttribute('aria-expanded'), 'true');
  app.click('#remoteBtn'); assert.equal(pop(app).hidden, true, 'the button toggles it');
  app.close();
});

test('the popover shows the real route', () => {
  const app = desktop(); app.click('#remoteBtn');
  app.w.testView.connection(1, 'net');
  assert.match(app.$('#deviceStatus').textContent, /已连接 1 台/);
  assert.ok(pop(app).querySelector('.device-dot').classList.contains('ok'));
  assert.equal(pop(app).querySelector('[aria-current="true"]')?.dataset.route, 'net');
  assert.equal(app.$('#routeText').textContent, '当前线路：中转');
  assert.equal(app.$('#deviceSend').getAttribute('aria-disabled'), 'false');
  app.close();
});

test('disconnect updates the open popover', () => {
  const app = desktop(); app.click('#remoteBtn');
  app.w.testView.connection(2, 'lan'); app.w.testView.connection(0, null);
  assert.equal(app.$('#deviceStatus').textContent, '未连接遥控设备');
  assert.equal(pop(app).querySelector('.device-dot').classList.contains('ok'), false);
  assert.equal(pop(app).querySelector('[aria-current="true"]'), null);
  assert.equal(app.$('#routeText').textContent, '当前线路：未连接');
  assert.equal(app.$('#deviceSend').getAttribute('aria-disabled'), 'true');
  app.close();
});

test('web hides app-only rows; the app shows them', () => {
  let app = desktop(); app.click('#remoteBtn');
  assert.equal(app.$('#deviceController').closest('.device-row').hidden, true);
  assert.equal(pop(app).querySelector('[data-route="near"]').hidden, true);
  app.close();
  app = desktop({ native: true }); app.click('#remoteBtn');
  assert.equal(app.$('#deviceController').closest('.device-row').hidden, false);
  app.close();
});

test('pairing actions open the pairing dialog', () => {
  const app = desktop(), calls = [];
  app.w.testEngine.openPairing = (fresh) => calls.push(fresh);
  app.click('#remoteBtn'); app.click('#deviceManage');
  assert.equal(pop(app).hidden, true);
  app.click('#remoteBtn'); app.click('#devicePair');
  assert.deepEqual(calls, [false, true]);
  app.close();
});

test('Esc and outside click close it; there is no close button', () => {
  const app = desktop();
  app.click('#remoteBtn');
  assert.equal(pop(app).querySelector('button[aria-label="关闭"]'), null);
  app.w.document.body.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(pop(app).hidden, true);
  app.click('#remoteBtn'); app.click('#documentTitle');
  assert.equal(pop(app).hidden, true);
  app.close();
});

test('send calls sendScript once and says so; unavailable without a connection', () => {
  const app = desktop(); let sent = 0;
  app.w.testEngine.sendScript = () => { sent++; };
  app.click('#remoteBtn'); app.click('#deviceSend');
  assert.equal(sent, 0); assert.match(app.$('#uiToast').textContent, /没有连接/);
  app.w.testView.connection(1, 'lan'); app.click('#deviceSend');
  assert.equal(sent, 1); assert.match(app.$('#uiToast').textContent, /已发送/);
  app.close();
});
