// In-page check for group 6 (run in a real browser at 1440×900 and 1200×800; evaluate this file and await it).
// Measures the 更多 menu, the 插入提示 menu and the device popover against the Figma copy frames.
async () => {
  const $ = (s) => document.querySelector(s);
  const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const radius = (el) => parseFloat(getComputedStyle(el).borderTopLeftRadius);
  const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;
  const failures = [], out = {};
  // Animations would leave scale .96 mid-flight in a background pane: finish them before measuring.
  const settle = (el) => el.getAnimations?.().forEach((a) => a.finish());

  // 插入提示 (2173:1241): 244 × 190, radius 12, rows 24
  $('#richEditor').focus(); $('[data-format="cue"]').click(); await wait(); settle($('#cueMenu'));
  const cue = $('#cueMenu'), cueRow = cue.querySelector('[role="menuitem"]');
  out.cue = { box: box(cue), radius: radius(cue), row: box(cueRow).h };
  if (!near(out.cue.box.w, 244) || !near(out.cue.box.h, 190)) failures.push(`cue menu ${out.cue.box.w}×${out.cue.box.h}, Figma 244×190`);
  if (!near(out.cue.radius, 12) || !near(out.cue.row, 24)) failures.push(`cue menu radius ${out.cue.radius}, row ${out.cue.row}`);
  $('#documentTitle').click(); await wait(100);

  // 设备 (2176:2467): 340 wide, radius 20, rows 40, clear of the parameter card heading
  $('#remoteBtn').click(); await wait(); settle($('#devicePopover'));
  const dev = $('#devicePopover');
  out.device = { box: box(dev), radius: radius(dev), row: box($('#deviceManage')).h, button: box($('#remoteBtn')) };
  if (!near(out.device.box.w, 340) || !near(out.device.radius, 20) || !near(out.device.row, 40)) failures.push(`device popover ${out.device.box.w} wide, radius ${out.device.radius}, row ${out.device.row}`);
  const heading = $('.settings-heading');
  if (heading && heading.getClientRects().length && hit(out.device.box, box(heading))) failures.push('device popover covers the parameter heading');
  $('#remoteBtn').click(); await wait(100);

  // 更多 (2164:478): 244 wide, radius 12, rows 24 (two extra rows and a separator: 阅读参数, 改字)
  $('#start').click(); await wait(500);
  $('#readerMore').click(); await wait(); settle($('#readerOptions'));
  const more = $('#readerOptions'), moreRow = more.querySelector('[role^="menuitem"]');
  out.more = { box: box(more), radius: radius(more), row: box(moreRow).h, ink: getComputedStyle(moreRow).color, blend: getComputedStyle(moreRow).mixBlendMode };
  if (!near(out.more.box.w, 244) || !near(out.more.radius, 12) || !near(out.more.row, 24)) failures.push(`更多 ${out.more.box.w} wide, radius ${out.more.radius}, row ${out.more.row}`);
  if (out.more.blend !== 'normal') failures.push('更多 rows are not normal blend');
  $('#readerMore').click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(200);
  return { out, failures };
}
