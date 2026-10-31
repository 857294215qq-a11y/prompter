/* Prompter V3 presentation controller. The existing engine owns playback and transports. */
window.initPrompterV3 = function initPrompterV3(api) {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const editor = $('#editor'), settings = $('#settingsPanel'), library = $('#libraryPanel');
  const small = matchMedia('(max-width: 767px)'), tablet = matchMedia('(max-width: 1199px)');
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  const ui = Object.assign({ appearance: 'system', left: true, right: true, tab: 'Play' }, api.store.get('ui', {}));
  let mobileLeft = false, mobileRight = false, focusRestore = null, notifyTimer;
  let caretDocument = null;
  let history = [api.ta.value], historyIndex = 0, historyBusy = false, action = null, actionOpener;
  let optionsOpen = false, parametersInReader = false, latestRemote = null, remoteLocked = false;
  let settingsMove = 0;
  const uiSave = () => api.store.set('ui', ui);
  const on = (id, fn) => $(id).addEventListener('click', fn);
  const icon = (name) => { const img = document.createElement('img'); img.src = 'assets/v3/' + name + '.svg'; img.className = 'v3-icon'; img.alt = ''; return img; };
  const text = (el, value) => { if (el.textContent !== value) el.textContent = value; };
  const motionJobs = new WeakMap();
  let previousLayout = null, toolbarMotion = null;
  function animateSurface(el, show, display = 'block') {
    motionJobs.get(el)?.cancel();
    if (typeof el.animate !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const oldDisplay = el.style.getPropertyValue('display'), priority = el.style.getPropertyPriority('display');
    if (!show) el.style.setProperty('display', display, 'important');
    const target = el.matches('.modal') ? el.querySelector('.card') : el;
    const animations = [];
    const options = { duration: 240, easing: 'cubic-bezier(.32,.72,0,1)' };
    if (target !== el) animations.push(el.animate(show ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], options));
    const x = target.id === 'hint' ? '-50%' : '0';
    const from = { opacity: 0, translate: x + ' 12px', scale: '.98' }, to = { opacity: 1, translate: x + ' 0', scale: '1' };
    animations.push(target.animate(show ? [from, to] : [to, from], options));
    let active = true;
    const restore = () => { if (!active) return; active = false; animations.forEach(a => a.cancel()); if (!show) { if (oldDisplay) el.style.setProperty('display', oldDisplay, priority); else el.style.removeProperty('display'); } motionJobs.delete(el); };
    motionJobs.set(el, { cancel: restore });
    return Promise.all(animations.map(a => a.finished)).then(restore, restore);
  }

  function notify(message) {
    const el = $('#uiToast'); text(el, message); el.hidden = false;
    clearTimeout(notifyTimer); notifyTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }
  function appearance() {
    const dark = ui.appearance === 'dark' || (ui.appearance === 'system' && systemDark.matches);
    document.documentElement.dataset.appearance = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]').content = dark ? '#161618' : '#ffffff';
    $('#appearance').value = ui.appearance;
  }
  appearance(); systemDark.addEventListener('change', appearance);
  $('#appearance').addEventListener('change', (e) => { ui.appearance = e.target.value; uiSave(); appearance(); });

  function captureEditorAnchor() {
    const content = $('.document-content'), rich = $('#richEditor');
    if (!content || !rich || editor.hidden) return null;
    const sel = window.getSelection();
    let element = sel?.anchorNode && rich.contains(sel.anchorNode) ? sel.anchorNode : null;
    if (element?.nodeType === Node.TEXT_NODE) element = element.parentElement;
    while (element && element !== rich && element.parentNode !== rich) element = element.parentElement;
    const bounds = content.getBoundingClientRect();
    if (!element || element.getBoundingClientRect().bottom <= bounds.top || element.getBoundingClientRect().top >= bounds.bottom)
      element = [...rich.children].find(n => n.getBoundingClientRect().bottom > bounds.top) || rich;
    return { element, top: element.getBoundingClientRect().top, scrollTop: content.scrollTop };
  }
  function restoreEditorAnchor(anchor) {
    if (anchor?.element.isConnected) $('.document-content').scrollTop = anchor.scrollTop + anchor.element.getBoundingClientRect().top - anchor.top;
  }
  function layout() {
    const anchor = captureEditorAnchor();
    const toolbar = $('.document-toolbar'), beforeTools = toolbar.getBoundingClientRect();
    const left = small.matches ? mobileLeft : ui.left;
    const right = tablet.matches ? mobileRight : ui.right;
    editor.classList.toggle('library-collapsed', !left);
    editor.classList.toggle('settings-collapsed', !right);
    library.inert = !left;
    settings.inert = !right && !parametersInReader;
    $('#toggleLibrary').setAttribute('aria-expanded', String(left));
    $('#toggleSettings').setAttribute('aria-expanded', String(right || parametersInReader));
    toggleState('left', left); toggleState('right', right);
    $('#sheetBackdrop').hidden = !(small.matches && left || tablet.matches && right);
    if (previousLayout) {
      if (left !== previousLayout.left) animateSurface(library, left, 'flex');
      if (right !== previousLayout.right) animateSurface(settings, right, 'flex');
    }
    previousLayout = { left, right };
    restoreEditorAnchor(anchor);
    toolbarMotion?.cancel();
    if (previousLayout && typeof toolbar.animate === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const after = toolbar.getBoundingClientRect(), dx = beforeTools.left - after.left;
      if (dx) toolbarMotion = toolbar.animate([{translate: dx + 'px 0'}, {translate:'0 0'}], {duration:240,easing:'cubic-bezier(.32,.72,0,1)'});
    }
    updateMeta();
  }
  // Desktop toggles say what they will do; below 1200px the right one opens the reader parameters sheet.
  function toggleState(side, open) {
    const button = $(side === 'left' ? '#toggleLibrary' : '#toggleSettings'), sheet = side === 'right' && tablet.matches;
    const label = sheet ? '提词参数' : (open ? '收起' : '展开') + (side === 'left' ? '稿件栏' : '提词参数');
    const name = sheet && small.matches ? 'settings2' : 'panel-' + side + '-' + (open ? 'close' : 'open');
    button.querySelector('img').src = 'assets/v3/' + name + '.svg';
    button.setAttribute('aria-label', label); button.title = label;
  }
  function closeSheets() { mobileLeft = mobileRight = false; closeMenu(); closeReaderOptions(); layout(); }
  function returnSettings() {
    if (!parametersInReader) return;
    parametersInReader = false; settings.inert = true;
    const move = ++settingsMove;
    const finish = () => { if (move !== settingsMove) return; editor.append(settings); settings.classList.remove('reader-parameters'); layout(); };
    const animation = animateSurface(settings, false, 'flex');
    if (animation) animation.then(finish); else finish();
    $('#readerParameters').setAttribute('aria-pressed', 'false');
    $('#readerMore').setAttribute('aria-pressed', 'false'); $('#readerMore').setAttribute('aria-expanded', 'false'); $('#readerMore').setAttribute('aria-controls', 'readerOptions'); layout();
  }
  on('#toggleLibrary', () => {
    if (small.matches) { mobileLeft = !mobileLeft; mobileRight = false; }
    else { ui.left = !ui.left; uiSave(); }
    layout();
  });
  on('#toggleSettings', () => {
    if (parametersInReader) { returnSettings(); $('#readerMore').focus(); return; }
    if (tablet.matches) { mobileRight = !mobileRight; mobileLeft = false; }
    else { ui.right = !ui.right; uiSave(); }
    layout();
    if (mobileRight) $('#tab' + ui.tab).focus();
  });
  on('#sheetBackdrop', closeSheets);
  small.addEventListener('change', closeSheets); tablet.addEventListener('change', closeSheets);
  on('#focusEditor', () => {
    if (!focusRestore) { focusRestore = { left: ui.left, right: ui.right }; ui.left = ui.right = false; }
    else { Object.assign(ui, focusRestore); focusRestore = null; }
    $('#focusEditor').setAttribute('aria-pressed', String(!!focusRestore));
    $('#focusEditor').setAttribute('aria-label', focusRestore ? '退出专注编辑' : '专注编辑');
    $('#focusEditor').title = focusRestore ? '退出专注编辑，恢复原侧栏' : '专注编辑，隐藏两侧栏（不进入系统全屏）'; layout();
  });

  function tab(name) {
    if (!['Play', 'Text', 'Record'].includes(name)) name = 'Play';
    ui.tab = name; uiSave();
    for (const n of ['Play', 'Text', 'Record']) {
      $('#tab' + n).setAttribute('aria-selected', String(name === n));
      $('#tab' + n).tabIndex = name === n ? 0 : -1;
      $('#pane' + n).hidden = name !== n;
    }
    $('#paneText').append($('#mirrorControls'));
    if (name === 'Play') $('#panePlay').append($('#mirrorControls'));
  }
  for (const name of ['Play', 'Text', 'Record']) {
    on('#tab' + name, () => tab(name));
    $('#tab' + name).addEventListener('keydown', (e) => {
      const names = ['Play', 'Text', 'Record'];
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const idx = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (names.indexOf(name) + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
      tab(names[idx]); $('#tab' + names[idx]).focus();
    });
  }
  tab(ui.tab); layout();

  // Rich editing keeps the original plaintext/markdown document as the engine's source.
  const rich = document.createElement('div');
  rich.id = 'richEditor'; rich.contentEditable = 'true'; rich.setAttribute('role', 'textbox');
  rich.setAttribute('aria-multiline', 'true'); rich.setAttribute('aria-label', '稿件正文'); rich.spellcheck = false;
  api.ta.before(rich); api.ta.classList.add('source-buffer'); api.ta.tabIndex = -1;
  let renderedSource = null;
  function readRich(anchor, anchorOffset, focus, focusOffset) {
    let source = '', start = null, end = null;
    function point(node, offset) {
      if (node === anchor && offset === anchorOffset) start = source.length;
      if (node === focus && offset === focusOffset) end = source.length;
    }
    function walk(node) {
      if (node.nodeType === 3) {
        if (node === anchor) start = source.length + anchorOffset;
        if (node === focus) end = source.length + focusOffset;
        source += node.textContent; return;
      }
      const tag = node.nodeName;
      if (node !== rich && (tag === 'DIV' || tag === 'P') && node.previousSibling && !source.endsWith('\n')) source += '\n';
      source += node.dataset?.prefix || '';
      if (tag === 'STRONG') source += '**';
      if (node.dataset?.cue !== undefined) source += node.dataset.cue || '[';
      if (tag === 'BR' && node.nextSibling) source += '\n';
      point(node, 0);
      [...node.childNodes].forEach((child, i) => { walk(child); point(node, i + 1); });
      if (tag === 'STRONG') source += '**';
      if (node.dataset?.cue !== undefined) source += node.dataset.cue === '【' ? '】' : ']';
    }
    point(rich, 0);
    [...rich.childNodes].forEach((line, i) => { if (i && !source.endsWith('\n')) source += '\n'; else if (i && rich.childNodes[i - 1].textContent === '') source += '\n'; walk(line); point(rich, i + 1); });
    return { source, start: start ?? source.length, end: end ?? start ?? source.length };
  }
  function renderRich(force = false) {
    if (!force && (document.activeElement === rich || renderedSource === api.ta.value)) return;
    rich.textContent = '';
    api.ta.value.split('\n').forEach((line) => {
      const el = document.createElement('div'); el.className = 'editor-line';
      const heading = line.match(/^(#+\s*)/);
      if (heading) { el.dataset.prefix = heading[0]; el.classList.add('editor-section'); line = line.slice(heading[0].length); }
      const parts = line.split(/(\*\*[^\n]*?\*\*|\[[^\]\n]{1,12}\]|【[^】\n]{1,12}】)/g);
      for (const part of parts) {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 3) { const b = document.createElement('strong'); b.textContent = part.slice(2, -2); el.append(b); }
        else if (/^(\[.*\]|【.*】)$/.test(part)) { const c = document.createElement('span'); c.className = 'editor-cue'; c.dataset.cue = part[0]; c.textContent = part.slice(1, -1); el.append(c); }
        else if (part) el.append(document.createTextNode(part));
      }
      if (!el.childNodes.length) el.append(document.createElement('br'));
      rich.append(el);
    });
    renderedSource = api.ta.value;
  }
  function caret() {
    const sel = window.getSelection();
    if (!sel?.anchorNode || !rich.contains(sel.anchorNode)) return;
    caretDocument = api.current().id;
    const result = readRich(sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset);
    api.ta.setSelectionRange(Math.min(result.start, result.end), Math.max(result.start, result.end));
    syncFormatState(); syncStartActions();
  }
  function richInput() {
    caretDocument = api.current().id;
    const sel = window.getSelection();
    const result = readRich(sel?.anchorNode, sel?.anchorOffset, sel?.focusNode, sel?.focusOffset);
    api.ta.value = result.source; renderedSource = result.source;
    api.ta.setSelectionRange(Math.min(result.start, result.end), Math.max(result.start, result.end));
    api.ta.dispatchEvent(new Event('input', { bubbles: true }));
    syncFormatState(); syncStartActions();
  }
  function sourceCaret(index) {
    // Build source offsets from the rendered tree, including hidden markdown syntax.
    for (const line of rich.children) {
      if (!line.textContent && readRich(line, 0, line, 0).start === index) {
        const range = document.createRange(); range.setStart(line, 0); range.collapse(true);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); rich.focus(); return;
      }
    }
    const walker = document.createTreeWalker(rich, NodeFilter.SHOW_TEXT);
    let node, best = null;
    while ((node = walker.nextNode())) {
      const at = readRich(node, 0, node, node.textContent.length);
      best = { node, offset: Math.max(0, Math.min(node.textContent.length, index - at.start)) };
      if (index <= at.end) break;
    }
    const selection = window.getSelection(); const range = document.createRange();
    if (best) range.setStart(best.node, best.offset);
    else range.setStart(rich.firstChild || rich, 0);
    range.collapse(true); selection.removeAllRanges(); selection.addRange(range); rich.focus();
  }
  function replaceSelection(value) {
    caret(); const start = api.ta.selectionStart, end = api.ta.selectionEnd;
    api.ta.value = api.ta.value.slice(0, start) + value + api.ta.value.slice(end);
    api.ta.dispatchEvent(new Event('input', { bubbles: true }));
    renderRich(true); sourceCaret(start + value.length); caret();
  }
  rich.addEventListener('input', richInput);
  rich.addEventListener('keyup', caret); rich.addEventListener('mouseup', caret); rich.addEventListener('blur', (e) => {
    caret();
    const layoutControl = e.relatedTarget?.closest?.('#toggleLibrary, #toggleSettings, #focusEditor');
    renderRich(!layoutControl && !composing);
  });
  let composing = false;
  rich.addEventListener('compositionstart', () => { composing = true; });
  rich.addEventListener('compositionend', () => { composing = false; });
  rich.addEventListener('paste', (e) => { e.preventDefault(); replaceSelection(e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n')); });
  rich.addEventListener('beforeinput', (e) => { if (['insertParagraph', 'insertLineBreak'].includes(e.inputType)) { e.preventDefault(); replaceSelection('\n'); } });
  rich.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.isComposing) { e.preventDefault(); replaceSelection('\n'); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(e.shiftKey ? 1 : -1); }
  });
  document.querySelectorAll('[data-format]').forEach((b) => b.addEventListener('pointerdown', (e) => { caret(); e.preventDefault(); }));

  function updateMeta() {
    const date = new Date(api.current().updated);
    text($('#documentMeta'), small.matches ? $('#saveState').textContent + ' · ' + $('#deviceState').textContent : Number.isNaN(date.getTime()) ? '本机稿件' : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' 编辑');
  }
  function refresh() {
    const current = api.current();
    text($('#documentTitle'), api.scriptTitle(current));
    updateMeta();
    const search = $('#scriptSearch').value.trim().toLocaleLowerCase();
    const list = $('#scriptList'); list.textContent = '';
    for (const doc of api.library()) {
      if (search && !(api.scriptTitle(doc) + '\n' + doc.text).toLocaleLowerCase().includes(search)) continue;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'script-row'; b.dataset.scriptId = doc.id;
      b.setAttribute('aria-current', doc.id === current.id ? 'true' : 'false');
      const title = document.createElement('span'); title.className = 'script-row-title'; title.textContent = api.scriptTitle(doc);
      const meta = document.createElement('span'); meta.className = 'script-row-meta'; const parsed = api.parse(doc.text);
      meta.textContent = `${parsed.secs} 节 · ${api.fmt(parsed.units / api.settings.cpm * 60)} · 本机稿件`;
      b.append(title, meta); b.addEventListener('click', () => { api.openScript(doc.id); resetHistory(); mobileLeft = false; layout(); }); list.append(b);
    }
    if (!list.children.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = '没有找到稿件'; list.append(empty); }
    renderRich(); syncFormatState(); syncStartActions();
  }
  $('#scriptSearch').addEventListener('input', refresh);
  function resetHistory() {
    caretDocument = null; history = [api.ta.value]; historyIndex = 0; renderRich(true);
    // Re-rendering collapses the old selection onto the editor itself; drop it so it is not read as a new caret.
    const sel = window.getSelection(); if (sel?.anchorNode && rich.contains(sel.anchorNode)) sel.removeAllRanges();
    syncStartActions();
  }
  api.ta.addEventListener('input', () => {
    if (!historyBusy) { history = history.slice(0, historyIndex + 1); history.push(api.ta.value); if (history.length > 100) history.shift(); historyIndex = history.length - 1; }
    syncHistory();
  });
  function syncHistory() { $('#undoEdit').disabled = historyIndex < 1; $('#redoEdit').disabled = historyIndex >= history.length - 1; }
  function undo(direction) {
    const next = historyIndex + direction; if (next < 0 || next >= history.length) return;
    historyIndex = next; api.ta.value = history[next]; historyBusy = true;
    api.ta.dispatchEvent(new Event('input', { bubbles: true })); historyBusy = false; renderRich(true); rich.focus(); syncHistory();
  }
  on('#undoEdit', () => undo(-1)); on('#redoEdit', () => undo(1));
  document.querySelectorAll('[data-format]').forEach((button) => button.addEventListener('click', () => {
    const start = api.ta.selectionStart, end = api.ta.selectionEnd, selected = api.ta.value.slice(start, end);
    if (button.dataset.format === 'section') {
      const line = api.ta.value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
      const prefix = api.ta.value.slice(line).match(/^#+[ \t]*/)?.[0] || '';
      api.ta.setSelectionRange(line, line + prefix.length); replaceSelectionAtBuffer(prefix ? '' : '# ');
    } else if (button.dataset.format === 'emphasis') {
      if (button.getAttribute('aria-disabled') === 'true') return;
      const range = emphasisRange(start, end);
      if (range) { api.ta.setSelectionRange(range.start, range.end); replaceSelectionAtBuffer(range.inner); }
      else replaceSelectionAtBuffer('**' + selected + '**');
    } else if (cueMenu.hidden) openCueMenu(); else closeCueMenu(true);
  }));
  const lineStart = (index) => (index ? api.ta.value.lastIndexOf('\n', index - 1) + 1 : 0);
  // The **…** run on the selection's line that holds the whole selection (markers included), or null.
  function emphasisRange(start, end) {
    const value = api.ta.value, from = lineStart(start), stop = value.indexOf('\n', from);
    for (const m of value.slice(from, stop < 0 ? value.length : stop).matchAll(/\*\*([^\n]*?)\*\*/g)) {
      const s = from + m.index, e = s + m[0].length;
      if (start >= s && end <= e) return { start: s, end: e, inner: m[1] };
    }
    return null;
  }
  // Section shows the current line's state; emphasis only acts on a selection.
  function syncFormatState() {
    const start = api.ta.selectionStart, end = api.ta.selectionEnd;
    const section = /^#/.test(api.ta.value.slice(lineStart(start)));
    $('[data-format="section"]').setAttribute('aria-pressed', String(section));
    const emphasis = $('[data-format="emphasis"]');
    const inside = start !== end && emphasisRange(start, end);
    // Wrapping across a line or half over another **…** run would leave stray markers.
    const unsafe = api.ta.value.slice(start, end).includes('\n') || (!inside && [...api.ta.value.matchAll(/\*\*[^\n]*?\*\*/g)]
      .some((m) => m.index < end && start < m.index + m[0].length));
    emphasis.setAttribute('aria-disabled', String(start === end || unsafe));
    emphasis.setAttribute('aria-pressed', String(!!inside));
  }
  function replaceSelectionAtBuffer(value) {
    const start = api.ta.selectionStart, end = api.ta.selectionEnd;
    api.ta.value = api.ta.value.slice(0, start) + value + api.ta.value.slice(end);
    api.ta.dispatchEvent(new Event('input', { bubbles: true })); renderRich(true); sourceCaret(start + value.length); caret();
  }

  // Cue menu: a preset or custom cue goes in at the caret, or after the selection, which stays unchanged.
  const cueTool = $('[data-format="cue"]'), cueMenu = $('#cueMenu'), cueForm = $('#cueCustomForm');
  const cueItems = () => [...cueMenu.querySelectorAll('[role="menuitem"]')];
  let cueAt = 0;
  const cleanCue = (value) => [...value.replace(/[[\]【】\r\n]/g, '').trim()].slice(0, 12).join('');
  function openCueMenu() {
    cueAt = Math.max(api.ta.selectionStart, api.ta.selectionEnd);
    cueForm.hidden = true; cueMenu.hidden = false; cueTool.setAttribute('aria-expanded', 'true');
    const rect = cueTool.getBoundingClientRect();
    cueMenu.style.left = Math.max(12, Math.min(innerWidth - 232, rect.left)) + 'px';
    cueMenu.style.top = Math.max(12, rect.bottom + 8) + 'px';
    cueItems()[0].focus();
  }
  function closeCueMenu(returnFocus) {
    if (cueMenu.hidden) return;
    cueMenu.hidden = true; cueTool.setAttribute('aria-expanded', 'false');
    if (returnFocus) cueTool.focus();
  }
  function insertCue(value) {
    const cue = cleanCue(value); closeCueMenu(false);
    if (!cue) { sourceCaret(cueAt); return false; }
    api.ta.setSelectionRange(cueAt, cueAt); replaceSelectionAtBuffer('[' + cue + ']'); return true;
  }
  cueMenu.querySelectorAll('[data-cue]').forEach((b) => b.addEventListener('click', () => insertCue(b.dataset.cue)));
  on('#cueCustom', () => { cueForm.hidden = false; $('#cueCustomInput').value = ''; $('#cueCustomInput').focus(); });
  cueForm.addEventListener('submit', (e) => { e.preventDefault(); insertCue($('#cueCustomInput').value); });
  cueMenu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCueMenu(true); return; }
    if (e.target.id === 'cueCustomInput') return;
    const items = cueItems(), i = items.indexOf(document.activeElement);
    const next = { ArrowDown: (i + 1) % items.length, ArrowUp: (i - 1 + items.length) % items.length, Home: 0, End: items.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault(); e.stopPropagation(); items[next].focus();
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#cueMenu, [data-format="cue"]')) closeCueMenu(false); });

  // Editing an existing cue: change its words (brackets kept), or delete it; Escape leaves it alone.
  const cueEditor = $('#cueEditor'), cueInput = $('#cueEditInput');
  let editing = null;
  function cueRange(cue) {
    const t = cue.firstChild, inner = readRich(t, 0, t, t.length);
    return { start: inner.start - 1, end: inner.end + 1, open: cue.dataset.cue === '【' ? '【' : '[' };
  }
  function openCueEditor(cue) {
    editing = cueRange(cue);
    const rect = cue.getBoundingClientRect();
    cueEditor.hidden = false;
    cueEditor.style.left = Math.max(12, Math.min(innerWidth - 232, rect.left)) + 'px';
    cueEditor.style.top = Math.max(12, rect.bottom + 8) + 'px';
    cueInput.value = cue.textContent; cueInput.focus(); cueInput.select();
  }
  function closeCueEditor(caretAt) {
    if (cueEditor.hidden) return;
    cueEditor.hidden = true; editing = null;
    if (caretAt !== undefined) sourceCaret(caretAt);
  }
  function rewriteCue(value) {
    const range = editing, cue = cleanCue(value); closeCueEditor();
    api.ta.setSelectionRange(range.start, range.end);
    replaceSelectionAtBuffer(cue ? range.open + cue + (range.open === '【' ? '】' : ']') : '');
  }
  rich.addEventListener('click', (e) => { const cue = e.target.closest?.('.editor-cue'); if (cue?.firstChild) openCueEditor(cue); });
  cueEditor.addEventListener('submit', (e) => { e.preventDefault(); if (editing) rewriteCue(cueInput.value); });
  on('#cueDelete', () => { if (editing) rewriteCue(''); });
  cueInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCueEditor(editing.end); } });
  document.addEventListener('click', (e) => { if (!e.target.closest('#cueEditor, .editor-cue')) closeCueEditor(); });

  function closeMenu() { $('#docMenu').hidden = true; $('#docMore').setAttribute('aria-expanded', 'false'); }
  function menu() {
    const el = $('#docMenu'); el.hidden = !el.hidden; $('#docMore').setAttribute('aria-expanded', String(!el.hidden));
    if (!el.hidden) { const rect = ($('#docMore').getBoundingClientRect().width ? $('#docMore') : $('#mobileDocMore')).getBoundingClientRect(); el.style.left = Math.max(12, Math.min(innerWidth - 212, rect.right - 190)) + 'px'; el.style.top = Math.max(12, Math.min(innerHeight - 280, rect.bottom + 8)) + 'px'; el.querySelector('button').focus(); }
  }
  on('#docMore', menu); on('#mobileDocMore', menu); on('#importScript', () => $('#file').click());
  for (const [id, label, target] of [['menuDevices', '设备与遥控', '#remoteBtn'], ['menuSettings', '应用设置', '#appSettings']]) {
    const button = document.createElement('button'); button.id = id; button.type = 'button'; button.textContent = label;
    button.addEventListener('click', () => { closeMenu(); $(target).click(); }); $('#docMenu').append(button);
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('#docMenu, #docMore, #mobileDocMore')) closeMenu(); });

  function showDialog(id) { const el = $('#' + id); el._opener = document.activeElement; el.hidden = false; el.querySelector('input, select, button')?.focus(); }
  function hideDialog(id) { const el = $('#' + id); const video = el.querySelector('video'); if (video && !video.paused) video.pause(); el.hidden = true; el._opener?.focus?.(); }
  function ask(title, message, confirm, fn, value) {
    closeMenu(); actionOpener = document.activeElement; action = fn;
    text($('#dialogTitle'), title); text($('#dialogMessage'), message); text($('#dialogConfirm'), confirm);
    $('#dialogInput').hidden = $('#dialogInputLabel').hidden = value === undefined;
    $('#dialogInput').value = value || ''; $('#actionDialog').hidden = false;
    (value !== undefined ? $('#dialogInput') : $('#dialogCancel')).focus();
    if (value !== undefined) $('#dialogInput').select();
  }
  function closeAction() { $('#actionDialog').hidden = true; action = null; actionOpener?.focus?.(); }
  on('#dialogCancel', closeAction);
  $('#dialogForm').addEventListener('submit', (e) => {
    e.preventDefault(); const fn = action, value = $('#dialogInput').value.trim();
    if (!$('#dialogInput').hidden && !value) { $('#dialogInput').focus(); return; }
    closeAction(); fn?.(value); refresh();
  });
  function newDocument() { ask('新建稿件', '稿件会自动保存在本机。', '新建', (title) => { api.createDocument('', title); closeSheets(); renderRich(true); rich.focus(); }, '未命名稿件'); }
  function deleteDocument() { ask('删除这份稿件？', '“' + api.scriptTitle(api.current()) + '”将从本机删除，请先导出需要保留的内容。', '删除稿件', () => { api.removeCurrent(); resetHistory(); notify('稿件已删除'); }); }
  on('#renameScript', () => ask('重命名稿件', '修改名称不会改变正文。', '保存', api.rename, api.scriptTitle(api.current())));
  on('#duplicateScript', () => { const doc = api.current(); api.createDocument(doc.text, api.scriptTitle(doc) + ' 副本'); closeMenu(); notify('已复制稿件'); });
  on('#exportScript', () => {
    const url = URL.createObjectURL(new Blob([api.ta.value], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = api.scriptTitle(api.current()).replace(/[\\/:*?"<>|]/g, '_') + '.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); closeMenu();
  });
  $('#sample').addEventListener('click', closeMenu);
  on('#appSettings', () => showDialog('appDialog'));
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => hideDialog(button.dataset.close)));
  document.querySelectorAll('.modal').forEach((el) => el.addEventListener('click', (e) => { if (e.target === el) { if (el.id === 'actionDialog') closeAction(); else if (['appDialog', 'helpDialog'].includes(el.id)) hideDialog(el.id); } }));
  on('#saveDefaults', () => { api.store.set('readingDefaults', { ...api.settings, remoteOn: false, nearOn: false }); notify('已保存当前阅读参数'); });
  on('#restoreDefaults', () => {
    const values = api.store.get('readingDefaults', null);
    if (!values) return notify('还没有保存过默认参数');
    const { remoteOn, nearOn, remoteTab, ...reading } = values; Object.assign(api.settings, reading); api.saveSettings(); api.syncControls(); notify('已恢复阅读参数');
  });
  on('#settingsPip', async () => { hideDialog('appDialog'); if (!window.documentPictureInPicture?.requestWindow) return notify('当前浏览器不支持置顶小窗，请使用支持此功能的桌面 Chrome 或 Edge。'); api.enter(false); await api.togglePip(); });
  function help(title, lines) { text($('#helpTitle'), title); const container = $('#helpContent'); container.textContent = ''; for (const [a, b] of lines) { const p = document.createElement('p'); const strong = document.createElement('strong'); strong.textContent = a; p.append(strong, document.createTextNode(b ? '　' + b : '')); container.append(p); } showDialog('helpDialog'); }
  function previewClip(clip) {
    text($('#helpTitle'), clip.label + ' · 第 ' + clip.n + ' 条');
    const container = $('#helpContent'); container.textContent = '';
    const video = document.createElement('video'); video.controls = true; video.playsInline = true; video.preload = 'metadata'; video.src = clip.url; video.className = 'clip-preview';
    const save = document.createElement('button'); save.type = 'button'; save.className = 'btn primary'; save.textContent = '保存到本机'; save.addEventListener('click', () => api.saveTakeManually(clip));
    container.append(video, save); showDialog('helpDialog');
  }
  on('#aboutBtn', () => help('关于提词器', [['Prompter · V3', '分段录制、语音跟随与手机遥控。'], ['本机保存', '稿件和设置保存在当前浏览器或 App 中。'], ['平台', 'Web / PWA 与 Android；桌面客户端将另行开发。'], ['语音与录像', '取决于浏览器能力与设备授权。']]));
  on('#shortcutsBtn', () => help('快捷键与翻页笔', [['空格', '播放 / 暂停'], ['← → / PgUp PgDn', '上一页 / 下一页'], ['A / D', '上一段 / 下一段'], ['Q / E', '上一节 / 下一节'], ['R', '重录本节'], ['B / 1–9', '添加书签 / 跳到书签'], ['G / C', '语音跟随 / 录像'], ['M / V', '水平 / 垂直镜像'], ['+ − / [ ]', '语速 / 字号'], ['L / F / Esc', '目录 / 全屏 / 返回编辑'], ['Ctrl / ⌘ + Enter', '从光标处开始提词']]));

  $('#readerTheme').addEventListener('change', (e) => { api.settings.theme = e.target.value; api.saveSettings(); if (api.isReading()) api.layout(true); });
  $('#editorVoice').addEventListener('change', () => { api.voiceToggle(); sync(); });
  $('#editorCamera').addEventListener('change', async () => { await api.camToggle(); sync(); });
  on('#editorClips', () => { api.enter(false); api.openPanel(); });
  // Two start actions: from the top always works; from the caret needs a caret placed in this document.
  const caretReady = () => caretDocument === api.current().id;
  function startFromTop() { api.enter(false); }
  function startFromCaret() {
    if (!caretReady()) { notify('当前稿件还没有光标位置，请先在正文里点一下。'); return false; }
    api.enter(true); return true;
  }
  function syncStartActions() { $('#startCaret').setAttribute('aria-disabled', String(!caretReady())); }
  on('#startCaret', startFromCaret); on('#mobileStart', startFromTop);
  settings.addEventListener('input', () => { if (api.isReading()) api.layout(true); });
  settings.addEventListener('change', () => { if (api.isReading()) api.layout(true); });
  function sync() {
    $('#editorVoice').checked = api.voice.on; $('#editorCamera').checked = api.cam.on;
    $('#readerTheme').value = api.settings.theme;
    $('#editorVoice').disabled = !(window.SpeechRecognition || window.webkitSpeechRecognition);
    text($('#voiceNote'), $('#editorVoice').disabled ? '当前环境不支持语音跟随，可使用手动翻页。' : '语音跟随需要联网与麦克风许可。');
    $('#editorCamera').disabled = !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder;
    syncHistory();
  }

  // Move secondary reader commands into an anchored popover; preserve original handlers.
  const options = document.createElement('div'); options.id = 'readerOptions'; options.className = 'popover reader-options'; options.hidden = true;
  const more = document.createElement('button'); more.id = 'readerMore'; more.type = 'button'; more.className = 'ib'; more.setAttribute('aria-label', '更多阅读操作'); more.setAttribute('aria-expanded', 'false'); more.append(icon('ellipsis'));
  more.setAttribute('aria-controls', 'readerOptions');
  const parameters = document.createElement('button'); parameters.id = 'readerParameters'; parameters.type = 'button'; parameters.className = 'text-btn'; parameters.append(icon('settings2'), document.createTextNode('阅读参数')); parameters.setAttribute('aria-pressed', 'false');
  const closeParameters = document.createElement('button'); closeParameters.id = 'readerSettingsClose'; closeParameters.type = 'button'; closeParameters.className = 'icon-btn'; closeParameters.setAttribute('aria-label', '关闭阅读参数'); closeParameters.append(icon('x')); settings.prepend(closeParameters);
  closeParameters.addEventListener('click', () => { returnSettings(); more.focus(); });
  // Menu groups: 画面 (mirrors, checked when on) · 窗口 · 调整. Each item keeps its icon and shows its shortcut.
  options.setAttribute('role', 'menu'); options.setAttribute('aria-label', '更多阅读操作');
  const menuItems = [['pMx', '水平镜像', 'M', true], ['pMy', '垂直镜像', 'V', true], null, ['pPip', '打开置顶小窗'], ['pRemote', '连接遥控器'], ['pFs', '全屏', 'F'], null, ['readerParameters', '阅读参数'], ['pEdit', '改字', '', true]];
  for (const item of menuItems) {
    if (!item) { const hr = document.createElement('hr'); hr.setAttribute('role', 'separator'); options.append(hr); continue; }
    const [id, label, key, check] = item, b = id === 'readerParameters' ? parameters : $('#' + id);
    b.setAttribute('role', check ? 'menuitemcheckbox' : 'menuitem'); b.setAttribute('aria-label', label); b.removeAttribute('title');
    const text = b.querySelector('.lbl-t'); if (text) text.textContent = label;
    if (key) { const k = document.createElement('kbd'); k.className = 'menu-key'; k.textContent = key; b.append(k); b.setAttribute('aria-keyshortcuts', key); }
    options.append(b);
    if (id !== 'readerParameters') b.addEventListener('click', () => { syncReaderMenu(); closeReaderOptions(true); });
  }
  $('#prompter .topbar').append(more); $('#prompter').append(options);
  const readerItems = () => [...options.querySelectorAll('[role^="menuitem"]')].filter((b) => !b.hidden);
  // Checkbox items report state with aria-checked; the engine's aria-pressed would contradict it.
  function syncReaderMenu() {
    // The engine marks edit mode with aria-pressed each time it changes; until then the last checked state holds.
    const edit = $('#pEdit'), editOn = edit.hasAttribute('aria-pressed') ? edit.getAttribute('aria-pressed') === 'true' : edit.getAttribute('aria-checked') === 'true';
    const on = { pMx: api.settings.mirrorX, pMy: api.settings.mirrorY, pEdit: editOn };
    for (const b of readerItems()) {
      if (b.getAttribute('role') === 'menuitemcheckbox') b.setAttribute('aria-checked', String(!!on[b.id]));
      if (b !== parameters) b.removeAttribute('aria-pressed');
    }
  }
  function openReaderMenu() {
    returnSettings(); syncReaderMenu();
    optionsOpen = true; options.hidden = false; more.setAttribute('aria-expanded', 'true');
    const bar = $('#prompter .topbar').getBoundingClientRect();
    options.style.top = Math.round(bar.bottom + 8) + 'px'; options.style.right = Math.round(innerWidth - bar.right) + 'px';
    readerItems()[0]?.focus(); api.poke();
  }
  options.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeReaderOptions(true); return; }
    const items = readerItems(), i = items.indexOf(document.activeElement);
    const next = { ArrowDown: (i + 1) % items.length, ArrowUp: (i - 1 + items.length) % items.length, Home: 0, End: items.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault(); e.stopPropagation(); items[next].focus();
  });
  const startMarker = document.createComment('phone start action'); $('#mobileStart').before(startMarker);
  const settingsMarker = document.createComment('sidebar toggle position'); $('#toggleSettings').before(settingsMarker);
  const parameterLabel = document.createElement('span'); parameterLabel.className = 'tablet-param-label'; parameterLabel.textContent = '提词参数'; $('#toggleSettings').append(parameterLabel);
  function tabletActions() {
    if (tablet.matches && !small.matches) $('.toolbar-trailing').append($('#toggleSettings'), $('#mobileStart'));
    else { settingsMarker.after($('#toggleSettings')); startMarker.after($('#mobileStart')); }
  }
  tabletActions(); tablet.addEventListener('change', tabletActions); small.addEventListener('change', tabletActions);
  function closeReaderOptions(returnFocus = false) {
    const was = optionsOpen; options.hidden = true; optionsOpen = false; more.setAttribute('aria-expanded', 'false');
    if (was && returnFocus) more.focus();
  }
  more.addEventListener('click', () => { if (optionsOpen) closeReaderOptions(); else openReaderMenu(); });
  parameters.addEventListener('click', () => {
    settingsMove++;
    closeReaderOptions(); parametersInReader = true; $('#prompter').append(settings); settings.classList.add('reader-parameters'); settings.inert = false;
    animateSurface(settings, true, 'flex');
    parameters.setAttribute('aria-pressed', 'true'); tab('Text'); $('#tabText').focus();
    more.setAttribute('aria-pressed', 'true'); more.setAttribute('aria-expanded', 'true'); more.setAttribute('aria-controls', 'settingsPanel');
  });
  $('#pBack').addEventListener('click', () => { returnSettings(); closeReaderOptions(); renderRich(true); });
  $('#stage').addEventListener('pointerdown', () => { returnSettings(); closeReaderOptions(); });
  $('#prompter').addEventListener('click', (e) => { if (!e.target.closest('#readerOptions, #readerMore')) closeReaderOptions(); });

  // Remote presentation remains backed by the existing encrypted/peer-to-peer transports.
  const rpad = $('#remote .rpad'); rpad.classList.add('v3-remote-pad');
  const cmd = (c) => rpad.querySelector('[data-c="' + c + '"]');
  for (const c of ['pageUp', 'pageDown', 'paraUp', 'paraDown', 'secUp', 'secDown', 'mark', 'home', 'retake']) {
    const b = cmd(c), label = b.textContent; b.setAttribute('aria-label', label); b.textContent = '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'i');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + ({ pageUp: 'up2', pageDown: 'down2', paraUp: 'up1', paraDown: 'down1', secUp: 'secup', secDown: 'secdown', mark: 'mark', home: 'retake', retake: 'rotate-ccw' }[c]));
    svg.append(use); const span = document.createElement('span'); span.textContent = label; b.append(svg, span);
  }
  const speed = document.createElement('div'); speed.className = 'remote-stepper';
  const font = document.createElement('div'); font.className = 'remote-stepper';
  const speedLabel = document.createElement('span'); speedLabel.className = 'remote-step-label'; speedLabel.textContent = '语速';
  const fontLabel = document.createElement('span'); fontLabel.className = 'remote-step-label'; fontLabel.textContent = '字号';
  const speedValue = document.createElement('output'); speedValue.id = 'remoteSpeed'; speedValue.textContent = '—';
  const fontValue = document.createElement('output'); fontValue.id = 'remoteFont'; fontValue.textContent = '—';
  const speedMinus = cmd('slower'), speedPlus = cmd('faster'), fontMinus = cmd('smaller'), fontPlus = cmd('bigger');
  for (const [b, label, symbol] of [[speedMinus, '减速', '−'], [speedPlus, '加速', '+'], [fontMinus, '字号变小', '−'], [fontPlus, '字号变大', '+']]) { b.textContent = symbol; b.setAttribute('aria-label', label); }
  speed.append(speedLabel, speedMinus, speedValue, speedPlus); font.append(fontLabel, fontMinus, fontValue, fontPlus); rpad.append(speed, font);
  const contextToggle = document.createElement('label'); contextToggle.className = 'check switch-row remote-context-toggle'; contextToggle.textContent = '同步正文 · 点句定位';
  const check = document.createElement('input'); check.type = 'checkbox'; check.id = 'remoteContext'; check.setAttribute('role', 'switch'); contextToggle.append(check); rpad.after(contextToggle);
  const context = document.createElement('div'); context.id = 'remoteContextBody'; context.className = 'remote-context'; context.hidden = true; contextToggle.after(context);
  const lock = document.createElement('button'); lock.id = 'remoteLock'; lock.type = 'button'; lock.className = 'text-btn'; lock.textContent = '锁定操作'; lock.setAttribute('aria-pressed', 'false'); $('#remote .rtop').append(lock);
  const remoteTitle = document.createElement('div'); remoteTitle.id = 'remoteTitle'; remoteTitle.className = 'remote-document-title'; $('#rSec').before(remoteTitle);
  check.addEventListener('change', () => { context.hidden = !check.checked; if (latestRemote) renderRemoteContext(latestRemote); });
  lock.addEventListener('click', () => { remoteLocked = !remoteLocked; lock.textContent = remoteLocked ? '解锁操作' : '锁定操作'; lock.setAttribute('aria-pressed', String(remoteLocked)); remoteAvailability(); });
  function remoteAvailability() {
    const connected = $('#rconn').classList.contains('ok');
    for (const b of rpad.querySelectorAll('.rbtn')) b.disabled = !connected || remoteLocked || (b.id !== 'rPlay' && latestRemote?.mode !== 'prompter');
    $('#remote').classList.toggle('remote-disconnected', !connected);
  }
  function renderRemoteContext(message) {
    context.textContent = '';
    for (const line of message.context || []) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = line.text;
      b.className = line.index === message.currentIndex ? 'current-sentence' : '';
      b.disabled = remoteLocked || !$('#rconn').classList.contains('ok');
      b.addEventListener('click', () => { if (!remoteLocked) $('#remote').dispatchEvent(new CustomEvent('prompter-seek', { detail: line.index })); });
      context.append(b);
    }
    if (!context.children.length) context.textContent = '连接后显示当前句及上下文。';
  }
  new MutationObserver(remoteAvailability).observe($('#rconn'), { attributes: true, attributeFilter: ['class'], childList: true });
  // Capture before every transport listener, so locked/disconnected controls cannot send.
  $('#remote').addEventListener('click', (e) => {
    const b = e.target.closest('.rbtn'); if (!b) return;
    if (remoteLocked || !$('#rconn').classList.contains('ok')) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (b.dataset.c === 'home' && !b.dataset.confirmed) { e.preventDefault(); e.stopImmediatePropagation(); ask('回到开头？', '提词设备将回到稿件开头。', '回到开头', () => { b.dataset.confirmed = 'true'; b.click(); delete b.dataset.confirmed; }); }
  }, true);
  remoteAvailability();

  // Keyboard handling gives the active dialog priority over playback shortcuts.
  document.addEventListener('keydown', (e) => {
    const modals = [...document.querySelectorAll('.modal:not([hidden])')];
    const modal = modals[modals.length - 1];
    if (modal) {
      e.stopImmediatePropagation();
      if (e.key === 'Escape') { e.preventDefault(); if (modal.id === 'actionDialog') closeAction(); else if (['appDialog', 'helpDialog'].includes(modal.id)) hideDialog(modal.id); else modal.querySelector('.phead button')?.click(); }
      if (e.key === 'Tab') {
        const focusable = [...modal.querySelectorAll('button:not([disabled]), input:not([hidden]), select, textarea, a[href], [tabindex="0"]')].filter((el) => !el.closest('[hidden]'));
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
      return;
    }
    if (e.key === 'Escape') {
      if (parametersInReader) { e.preventDefault(); e.stopImmediatePropagation(); returnSettings(); more.focus(); }
      else if (optionsOpen) { e.preventDefault(); e.stopImmediatePropagation(); closeReaderOptions(); more.focus(); }
      else if (!$('#docMenu').hidden) { e.preventDefault(); closeMenu(); $('#docMore').focus(); }
      else if (mobileLeft || mobileRight) { e.preventDefault(); closeSheets(); }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !api.isReading()) {
      e.preventDefault(); e.stopImmediatePropagation();
      // In a text field the shortcut belongs to that field; the engine's own handler is stopped too.
      if (e.target.closest?.('input, select, textarea')) return;
      closeCueMenu(false); closeCueEditor();
      if (document.activeElement === rich) caret();
      startFromCaret();
    }
  }, true);

  const motionSelector = '.modal, .popover, #panel, #hint, #cam, #uiToast, #prompter';
  const visibility = new WeakMap();
  document.querySelectorAll(motionSelector).forEach(el => visibility.set(el, !el.hidden));
  new MutationObserver(records => {
    const changed = new Set(records.map(r => r.target));
    for (const el of changed) {
      if (!el.matches(motionSelector)) continue;
      const show = !el.hidden;
      if (visibility.get(el) === show) continue;
      visibility.set(el, show);
      if (el.id === 'prompter') { if (show) el.querySelectorAll('.bar').forEach(bar => animateSurface(bar, true)); continue; }
      animateSurface(el, show, el.matches('.modal') ? 'grid' : el.id === 'hint' ? 'flex' : 'block');
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  refresh(); sync();
  return {
    startFromTop, startFromCaret, refresh, resetHistory, sync, newDocument, deleteDocument, closeSheets, notify, previewClip,
    confirmAction: ask,
    emptyDocument: () => { rich.focus(); notify('先写一段正文，再开始提词。小节标题不计入正文。'); },
    saved: (ok) => { text($('#saveState'), ok ? '已保存到本机' : '保存失败，请导出稿件以免丢失'); updateMeta(); },
    saving: () => { text($('#saveState'), '正在保存…'); updateMeta(); },
    connection: (count) => { text($('#deviceState'), count ? `已连接 ${count} 台遥控设备` : '未连接遥控设备'); updateMeta(); },
    confirmReset: (fn) => ask('回到开头？', '当前提词将停止，并回到稿件开头。', '回到开头', fn),
    remote: (m) => { latestRemote = m; text(speedValue, String(m.cpm)); text(fontValue, String(m.fs)); text(remoteTitle, m.title || '提词设备'); renderRemoteContext(m); remoteAvailability(); },
    get remoteLocked() { return remoteLocked; },
  };
};

// 滑块已填部分的宽度：设值或拖动时更新 --p
(function () {
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const paint = (el) => { const mn = +el.min || 0, mx = +el.max || 100; el.style.setProperty('--p', ((+el.value - mn) / (mx - mn) * 100) + '%'); };
  const hook = () => document.querySelectorAll('input[type="range"]').forEach((el) => {
    if (el.__painted) return; el.__painted = true;
    Object.defineProperty(el, 'value', { get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); paint(this); }, configurable: true });
    el.addEventListener('input', () => paint(el)); paint(el);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
  window.addEventListener('load', hook);
})();
