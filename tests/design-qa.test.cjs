const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { boot, root } = require('./helpers/boot.cjs');

// Fixes from the group 7 screenshot comparison (docs/design-qa.md).
const css = readFileSync(path.join(root, 'ui-v3.css'), 'utf8');
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });

test('插入提示 looks pressed while its menu is open (2173:1241)', () => {
  assert.match(css, /\.format-tools \[aria-pressed="true"\], \.format-tools \[aria-expanded="true"\] \{[^}]*background:\s*color-mix\(in srgb, var\(--accent\) 12%, transparent\)/);
  assert.match(css, /\.format-tools \[aria-pressed="true"\] \.v3-icon, \.format-tools \[aria-expanded="true"\] \.v3-icon \{/);
});

test('text fields show the macOS focus ring (2173:1462)', () => {
  assert.match(css, /\.cue-editor input:focus, \.cue-custom input:focus, #dialogInput:focus \{[^}]*outline:\s*3px solid color-mix\(in srgb, var\(--accent\) 50%, transparent\)/);
});

test('the tablet reader column lines up with the top pill too (2046:2225)', () => {
  const app = boot({ settings: { countdown: 0 } });
  Object.defineProperty(app.w, 'innerWidth', { value: 1194, configurable: true });
  Object.defineProperty(app.$('#stage'), 'clientWidth', { value: 1194 });
  Object.defineProperty(app.$('.topbar'), 'offsetWidth', { value: 818 });
  app.click('#start');
  assert.equal(app.$('#content').style.paddingLeft, '188px', '(1194 − 818) / 2');
  app.close();
});

test('phones keep the plain margin', () => {
  const app = boot({ settings: { countdown: 0 } });
  Object.defineProperty(app.w, 'innerWidth', { value: 390, configurable: true });
  Object.defineProperty(app.$('#stage'), 'clientWidth', { value: 390 });
  Object.defineProperty(app.$('.topbar'), 'offsetWidth', { value: 366 });
  app.click('#start');
  assert.equal(app.$('#content').style.paddingLeft, '39px', '10vw of 390');
  app.close();
});
