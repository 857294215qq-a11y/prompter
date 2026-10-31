const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { boot, root } = require('./helpers/boot.cjs');

const css = readFileSync(path.join(root, 'ui-v3.css'), 'utf8');
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });

// A 1440×900 desktop reader whose top pill spans 311–1129, as in the Figma reader frames.
function desktopReader(saved = {}) {
  const app = boot({ settings: { countdown: 0, ...saved } });
  Object.defineProperty(app.w, 'innerWidth', { value: 1440, configurable: true });
  app.$('#stage').getBoundingClientRect = () => rect(0, 0, 1440, 900);
  app.$('.topbar').getBoundingClientRect = () => rect(311, 28, 818, 60);
  app.click('#start');
  return app;
}
const padding = (app) => [app.$('#content').style.paddingLeft, app.$('#content').style.paddingRight];

test('reading column lines up with the top pill on desktop', () => {
  const app = desktopReader();
  assert.deepEqual(padding(app), ['311px', '311px']);
  app.close();
});

test('column padding is symmetric when mirrored', () => {
  const app = desktopReader({ mirrorX: true });
  assert.deepEqual(padding(app), ['311px', '311px']);
  app.close();
});

test('user margin wins when wider than the pill inset', () => {
  const app = desktopReader({ margin: 30 }); // 30vw of 1440 = 432px
  assert.deepEqual(padding(app), ['432px', '432px']);
  app.close();
});

test('below 1200px the column keeps the user margin', () => {
  const app = boot({ settings: { countdown: 0 } });
  Object.defineProperty(app.w, 'innerWidth', { value: 1000, configurable: true });
  app.click('#start');
  assert.deepEqual(padding(app), ['100px', '100px']);
  app.close();
});

test('timer labels are 12px secondary text', () => {
  const rules = css.match(/[^{}]*(?:\.times > span:not|#tPct::before)[^{}]*\{[^}]*\}/g);
  assert.ok(rules.length >= 3);
  for (const r of rules) {
    assert.doesNotMatch(r, /font-size:\s*10px/, r);
    if (/font-size/.test(r.split('{')[1])) assert.match(r, /font-size:\s*12px/, r);
    assert.match(r, /color:\s*var\(--muted\)/, r);
  }
});
