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
