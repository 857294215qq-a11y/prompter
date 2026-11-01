'use strict';
// 图标按钮的悬停说明：文案与 Figma「Tooltip 文案表」(2177:2292) 一致，快捷键与代码里实际的按键一致
(() => {
  // name: null 表示用按钮当前的可访问名称（会随状态变化，比如收起/展开、播放/暂停）
  // key: 逻辑按键，显示时按平台换成 ⌘ 或 Ctrl
  const copy = [
    // 编辑页
    { id: 'toggleLibrary', name: null, key: null },
    { id: 'newScript', name: '新建稿件', key: null },
    { id: 'docMore', name: '稿件操作', key: null },
    { id: 'undoEdit', name: '撤销', key: 'Mod+Z' },
    { id: 'redoEdit', name: '重做', key: 'Mod+Shift+Z' },
    { id: 'focusEditor', name: null, key: null },
    { id: 'appSettings', name: '应用设置', key: null },
    { id: 'toggleSettings', name: null, key: null },
    // 表里写了 M / V，但这两个键只在提词画面有效，编辑页不列快捷键
    { id: 'mx', name: '水平镜像', key: null },
    { id: 'my', name: '垂直镜像', key: null },
    { id: 'startCaret', name: '从光标处开始', key: 'Mod+Enter' },
    // 提词 · 顶栏
    { id: 'pBack', name: '返回编辑', key: 'Escape' },
    { id: 'pStop', name: '停止，回到开头', key: null },
    { id: 'pPlay', name: null, key: 'Space' },
    { id: 'pRetake', name: '重录本节', key: 'R' },
    { id: 'pVoice', name: '语音跟随', key: 'G' },
    { id: 'pCam', name: '摄像头录像', key: 'C' },
    { id: 'spDn', name: '减慢语速', key: '-' },
    { id: 'spUp', name: '加快语速', key: '+' },
    { id: 'fsDn', name: '缩小字号', key: '[' },
    { id: 'fsUp', name: '放大字号', key: ']' },
    { id: 'pMark', name: '添加书签', key: 'B' },
    { id: 'pList', name: '目录', key: 'L' },
    { id: 'readerMore', name: '更多工具', key: null },
    // 提词 · 底栏
    { id: 'nSecUp', name: '上一节', key: 'Q' },
    { id: 'nParaUp', name: '上一段', key: 'A' },
    { id: 'nPageUp', name: '上一页', key: 'ArrowLeft' },
    { id: 'nPageDn', name: '下一页', key: 'ArrowRight' },
    { id: 'nParaDn', name: '下一段', key: 'D' },
    { id: 'nSecDn', name: '下一节', key: 'E' },
  ];
  const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  function glyph(key) {
    if (!key) return null;
    const mac = isMac();
    const fixed = { Escape: 'Esc', Space: '空格', ArrowLeft: '←', ArrowRight: '→', '-': '−' };
    if (fixed[key]) return fixed[key];
    if (key === 'Mod+Z') return mac ? '⌘Z' : 'Ctrl+Z';
    if (key === 'Mod+Shift+Z') return mac ? '⇧⌘Z' : 'Ctrl+Shift+Z';
    if (key === 'Mod+Enter') return mac ? '⌘ 回车' : 'Ctrl+回车';
    return key;
  }
  const row = (id) => copy.find((r) => r.id === id);
  function label(id) {
    const r = row(id), el = document.getElementById(id);
    if (!r) return null;
    return { name: r.name || el?.getAttribute('aria-label') || '', key: glyph(r.key) };
  }
  // 按钮的可访问名称就是说明里的名称；快捷键单独作为补充描述，读屏不会把名称读两遍
  for (const r of copy) {
    const el = document.getElementById(r.id); if (!el) continue;
    if (r.name) el.setAttribute('aria-label', r.name);
    el.removeAttribute('title');
    if (!r.key) continue;
    const desc = document.createElement('span'); desc.id = 'tip-key-' + r.id; desc.className = 'vh'; desc.textContent = '快捷键 ' + glyph(r.key);
    document.body.append(desc);
    el.setAttribute('aria-describedby', [el.getAttribute('aria-describedby'), desc.id].filter(Boolean).join(' '));
  }

  // 悬停 500ms 出现，键盘聚焦立即出现；移开、点击、Esc、失焦时立即消失；触屏不显示
  const tip = document.createElement('div'); tip.id = 'tooltip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
  document.body.append(tip);
  // lastInput: focus shows a tooltip only after keyboard input, like :focus-visible (a window refocus after a click does not)
  // suppressed: the button just pressed keeps its tooltip away until the pointer really leaves it
  let timer = 0, owner = null, pending = null, suppressed = null, lastInput = 'pointer';
  const touchOnly = () => matchMedia('(hover: none)').matches;
  const target = (node) => { const el = node?.closest?.('button'); return el && row(el.id) ? el : null; };
  const visible = (el) => !el.hidden && !el.closest('[hidden]');
  function hide() { clearTimeout(timer); timer = 0; owner = pending = null; tip.hidden = true; }
  function show(el) {
    if (touchOnly() || !visible(el)) return;
    const { name, key } = label(el.id);
    owner = el; tip.textContent = key ? name + '  ' + key : name; tip.hidden = false;
    // 底栏的按钮说明放在上方 8px，其余放在下方 4px；始终留在窗口内 8px
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    const top = el.closest('.bottombar') ? r.top - 8 - h : r.bottom + 4;
    tip.style.top = Math.max(8, Math.min(innerHeight - h - 8, top)) + 'px';
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  }
  document.addEventListener('pointerover', (e) => {
    // pointerover also fires moving between a button's own icon and label: keep the running delay
    const el = target(e.target); if (!el || el === owner || el === pending || el === suppressed || touchOnly() || e.pointerType === 'touch') return;
    hide(); pending = el; timer = setTimeout(() => { pending = null; show(el); }, 500);
  });
  document.addEventListener('pointerout', (e) => { const el = target(e.target); if (el && !el.contains(e.relatedTarget)) { if (el === suppressed) suppressed = null; hide(); } });
  document.addEventListener('pointerdown', (e) => { lastInput = 'pointer'; suppressed = target(e.target); hide(); }, true);
  document.addEventListener('click', hide, true);
  document.addEventListener('focusin', (e) => { const el = target(e.target); if (el && lastInput === 'keyboard') { hide(); show(el); } });
  document.addEventListener('focusout', (e) => { if (target(e.target) === owner) hide(); });
  document.addEventListener('keydown', (e) => { lastInput = 'keyboard'; if (e.key === 'Escape') hide(); }, true);
  // Faded reader bars take no pointer events, so no pointerout comes: hide with them
  const reader = document.getElementById('prompter');
  if (reader) new MutationObserver(() => { if (reader.classList.contains('idle') && owner?.closest('#prompter')) hide(); }).observe(reader, { attributes: true, attributeFilter: ['class'] });
  addEventListener('scroll', hide, true); addEventListener('resize', hide);

  window.prompterTooltips = { copy, label, show, hide };
})();
