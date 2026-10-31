// In-page layout check for the desktop editor (run at 1440×900 in a real browser; jsdom has no layout).
// Paste the function into the page (or evaluate this file) and await it; `failures` must be empty.
async () => {
  const $ = (s) => document.querySelector(s);
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  // Bounds of an element's own text, so padding reserved for a toggle does not count as overlap.
  const textBox = (el) => { const range = document.createRange(); range.selectNodeContents(el); return box(range); };
  const hit = (a, b) => a.w > 0 && b.w > 0 && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const frame = () => new Promise((r) => setTimeout(r, 320)); // let the 240ms layout motion finish
  const failures = [], combos = [];
  const set = async (left, right) => {
    const editor = $('#editor');
    if (editor.classList.contains('library-collapsed') === left) $('#toggleLibrary').click();
    if (editor.classList.contains('settings-collapsed') === right) $('#toggleSettings').click();
    await frame();
  };
  let first = null;
  const measure = (name) => {
    const left = box($('#toggleLibrary')), right = box($('#toggleSettings')), pill = box($('.format-tools'));
    const row = { name, left, right, pill, leftIcon: $('#toggleLibrary img').src.split('/').pop(), rightIcon: $('#toggleSettings img').src.split('/').pop() };
    combos.push(row); first ??= row;
    for (const [side, now, was] of [['left', left, first.left], ['right', right, first.right]]) {
      if (Math.abs(now.w - 36) > 0.5 || Math.abs(now.h - 36) > 0.5) failures.push(`${name}: ${side} toggle is ${now.w}×${now.h}`);
      if (Math.abs(now.x - was.x) > 0.5 || Math.abs(now.y - was.y) > 0.5) failures.push(`${name}: ${side} toggle moved`);
      if (Math.abs(now.y + now.h / 2 - (pill.y + pill.h / 2)) > 1) failures.push(`${name}: ${side} toggle centre is off the tool row`);
      for (const sel of ['.format-tools', '.history-tools', '.app-tools'])
        if (hit(now, box($(sel)))) failures.push(`${name}: ${side} toggle overlaps ${sel}`);
      for (const sel of ['#documentTitle', '.library-heading > span', '.settings-heading'])
        if ($(sel) && $(sel).getClientRects().length && hit(now, textBox($(sel)))) failures.push(`${name}: ${side} toggle overlaps ${sel}`);
    }
  };
  await set(true, true); measure('both open');
  await set(false, true); measure('left collapsed');
  await set(true, false); measure('right collapsed');
  await set(false, false); measure('both collapsed');
  await set(true, true); $('#focusEditor').click(); await frame(); measure('focus'); $('#focusEditor').click(); await frame(); measure('focus restored');
  const fontSize = (el) => el && parseFloat(getComputedStyle(el).fontSize);
  const body = [...document.querySelectorAll('#richEditor .editor-line:not(.editor-section)')].find((l) => l.textContent);
  const empty = [...document.querySelectorAll('#richEditor .editor-line')].find((l) => !l.textContent);
  const fonts = { section: fontSize($('#richEditor .editor-section')), body: fontSize(body), emptyLine: empty && empty.getBoundingClientRect().height };
  if (fonts.section !== 20) failures.push(`section heading is ${fonts.section}px, expected 20px`);
  if (fonts.body !== 17) failures.push(`body text is ${fonts.body}px, expected 17px`);
  if (empty && Math.abs(fonts.emptyLine - 16) > 0.5) failures.push(`empty line is ${fonts.emptyLine}px tall, expected 16px`);
  // Reader: column edge on the top pill, hint and menu clear of both bars.
  $('#start').click(); await frame(); await frame();
  const pill = box($('.topbar')), bottom = box($('.bottombar'));
  const line = [...document.querySelectorAll('#content .s')].map((el) => { const r = el.getClientRects()[0]; return r && { x: r.left, y: r.top, w: r.width, h: r.height }; }).find((r) => r && r.w > 0);
  const reader = { pill, bottom, line };
  if (!line || Math.abs(line.x - pill.x) > 1) failures.push(`reader column starts at ${line?.x}, pill at ${pill.x}`);
  const hint = $('#hint');
  if (hint && !hint.hidden) { reader.hint = box(hint); for (const [n, b] of [['top pill', pill], ['bottom bar', bottom]]) if (hit(reader.hint, b)) failures.push(`start hint overlaps the ${n}`); }
  $('#readerMore').click(); await frame();
  const menu = $('#readerOptions');
  if (menu && !menu.hidden) { reader.menu = box(menu); if (hit(reader.menu, pill)) failures.push('more menu covers the top pill'); if (reader.menu.y < pill.y + pill.h + 7) failures.push('more menu is not below the pill'); }
  $('#readerMore').click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await frame();
  return { combos, fonts, reader, failures };
}
