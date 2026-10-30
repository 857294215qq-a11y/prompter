/* Prompter V3 presentation controller. The existing engine owns playback and transports. */
window.initPrompterV3 = function initPrompterV3(api) {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const editor = $('#editor'), settings = $('#settingsPanel'), library = $('#libraryPanel');
  const small = matchMedia('(max-width: 767px)'), tablet = matchMedia('(max-width: 1199px)');
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  const ui = Object.assign({ appearance: 'system', left: true, right: true, tab: 'Play' }, api.store.get('ui', {}));
  let mobileLeft = false, mobileRight = false, focusRestore = null, notifyTimer;
  let history = [api.ta.value], historyIndex = 0, historyBusy = false, action = null, actionOpener;
  let optionsOpen = false, parametersInReader = false, latestRemote = null, remoteLocked = false;
  const uiSave = () => api.store.set('ui', ui);
  const on = (id, fn) => $(id).addEventListener('click', fn);
  const icon = (name) => { const img = document.createElement('img'); img.src = 'assets/v3/' + name + '.svg'; img.className = 'v3-icon'; img.alt = ''; return img; };
  const text = (el, value) => { if (el.textContent !== value) el.textContent = value; };

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

  function layout() {
    const left = small.matches ? mobileLeft : ui.left;
    const right = tablet.matches ? mobileRight : ui.right;
    editor.classList.toggle('library-collapsed', !left);
    editor.classList.toggle('settings-collapsed', !right);
    library.inert = !left;
    settings.inert = !right && !parametersInReader;
    $('#toggleLibrary').setAttribute('aria-expanded', String(left));
    $('#toggleSettings').setAttribute('aria-expanded', String(right || parametersInReader));
    $('#toggleSettings img').src = 'assets/v3/' + (small.matches ? 'settings2' : 'panel-right-close') + '.svg';
    $('#sheetBackdrop').hidden = !(small.matches && left || tablet.matches && right);
    updateMeta();
  }
  function closeSheets() { mobileLeft = mobileRight = false; closeMenu(); closeReaderOptions(); layout(); }
  function returnSettings() {
    if (!parametersInReader) return;
    editor.append(settings); parametersInReader = false; settings.classList.remove('reader-parameters');
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
    $('#focusEditor').setAttribute('aria-pressed', String(!!focusRestore)); layout();
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
    const result = readRich(sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset);
    api.ta.setSelectionRange(Math.min(result.start, result.end), Math.max(result.start, result.end));
  }
  function richInput() {
    const sel = window.getSelection();
    const result = readRich(sel?.anchorNode, sel?.anchorOffset, sel?.focusNode, sel?.focusOffset);
    api.ta.value = result.source; renderedSource = result.source;
    api.ta.setSelectionRange(Math.min(result.start, result.end), Math.max(result.start, result.end));
    api.ta.dispatchEvent(new Event('input', { bubbles: true }));
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
  rich.addEventListener('keyup', caret); rich.addEventListener('mouseup', caret); rich.addEventListener('blur', () => { caret(); renderRich(true); });
  rich.addEventListener('paste', (e) => { e.preventDefault(); replaceSelection(e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n')); });
  rich.addEventListener('beforeinput', (e) => { if (['insertParagraph', 'insertLineBreak'].includes(e.inputType)) { e.preventDefault(); replaceSelection('\n'); } });
  rich.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.isComposing) { e.preventDefault(); replaceSelection('\n'); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(e.shiftKey ? 1 : -1); }
  });
  document.querySelectorAll('[data-format], #startCaret').forEach((b) => b.addEventListener('pointerdown', (e) => { caret(); e.preventDefault(); }));

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
    renderRich();
  }
  $('#scriptSearch').addEventListener('input', refresh);
  function resetHistory() { history = [api.ta.value]; historyIndex = 0; renderRich(true); }
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
    } else replaceSelectionAtBuffer(button.dataset.format === 'emphasis' ? '**' + (selected || '重点') + '**' : '[' + (selected || '停顿') + ']');
  }));
  function replaceSelectionAtBuffer(value) {
    const start = api.ta.selectionStart, end = api.ta.selectionEnd;
    api.ta.value = api.ta.value.slice(0, start) + value + api.ta.value.slice(end);
    api.ta.dispatchEvent(new Event('input', { bubbles: true })); renderRich(true); sourceCaret(start + value.length); caret();
  }

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
  on('#shortcutsBtn', () => help('快捷键与翻页笔', [['空格', '播放 / 暂停'], ['← → / PgUp PgDn', '上一页 / 下一页'], ['A / D', '上一段 / 下一段'], ['Q / E', '上一节 / 下一节'], ['R', '重录本节'], ['B / 1–9', '添加书签 / 跳到书签'], ['G / C', '语音跟随 / 录像'], ['M / V', '水平 / 垂直镜像'], ['+ − / [ ]', '语速 / 字号'], ['L / F / Esc', '目录 / 全屏 / 返回编辑'], ['Ctrl / ⌘ + Enter', '开始提词']]));

  $('#readerTheme').addEventListener('change', (e) => { api.settings.theme = e.target.value; api.saveSettings(); if (api.isReading()) api.layout(true); });
  $('#editorVoice').addEventListener('change', () => { api.voiceToggle(); sync(); });
  $('#editorCamera').addEventListener('change', async () => { await api.camToggle(); sync(); });
  on('#editorClips', () => { api.enter(false); api.openPanel(); });
  on('#mobileStart', () => api.enter(false));
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
  options.append(parameters);
  for (const id of ['pMx', 'pMy', 'pEdit', 'pPip', 'pRemote', 'pFs']) { const b = $('#' + id); b.setAttribute('aria-label', b.title); options.append(b); }
  $('#prompter .topbar').append(more); $('#prompter').append(options);
  const compactControls = ['pVoice', 'pCam'].map((id) => {
    const button = $('#' + id), marker = document.createComment(id + ' desktop position'); button.before(marker); return { button, marker };
  });
  function compactReader() {
    for (const { button, marker } of compactControls) {
      if (tablet.matches) options.insertBefore(button, parameters);
      else marker.after(button);
    }
  }
  compactReader(); tablet.addEventListener('change', compactReader);
  const startMarker = document.createComment('phone start action'); $('#mobileStart').before(startMarker);
  const settingsMarker = document.createComment('sidebar toggle position'); $('#toggleSettings').before(settingsMarker);
  const parameterLabel = document.createElement('span'); parameterLabel.className = 'tablet-param-label'; parameterLabel.textContent = '提词参数'; $('#toggleSettings').append(parameterLabel);
  function tabletActions() {
    if (tablet.matches && !small.matches) $('.toolbar-trailing').append($('#toggleSettings'), $('#mobileStart'));
    else { settingsMarker.after($('#toggleSettings')); startMarker.after($('#mobileStart')); }
  }
  tabletActions(); tablet.addEventListener('change', tabletActions); small.addEventListener('change', tabletActions);
  function closeReaderOptions() { options.hidden = true; optionsOpen = false; more.setAttribute('aria-expanded', 'false'); }
  more.addEventListener('click', () => { returnSettings(); optionsOpen = !optionsOpen; options.hidden = !optionsOpen; more.setAttribute('aria-expanded', String(optionsOpen)); api.poke(); });
  parameters.addEventListener('click', () => {
    closeReaderOptions(); parametersInReader = true; $('#prompter').append(settings); settings.classList.add('reader-parameters'); settings.inert = false;
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
    use.setAttribute('href', '#i-' + ({ pageUp: 'up2', pageDown: 'down2', paraUp: 'up1', paraDown: 'down1', secUp: 'secup', secDown: 'secdown', mark: 'mark', home: 'retake', retake: 'retake' }[c]));
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
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && document.activeElement === rich) { e.preventDefault(); e.stopImmediatePropagation(); caret(); api.enter(false); }
  }, true);

  refresh(); sync();
  return {
    refresh, resetHistory, sync, newDocument, deleteDocument, closeSheets, notify, previewClip,
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
