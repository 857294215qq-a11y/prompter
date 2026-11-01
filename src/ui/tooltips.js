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
  // 按钮的可访问名称就是说明里的名称
  for (const r of copy) if (r.name) document.getElementById(r.id)?.setAttribute('aria-label', r.name);
  window.prompterTooltips = { copy, label };
})();
