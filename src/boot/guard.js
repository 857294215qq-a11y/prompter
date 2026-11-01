'use strict';
// 引擎分成多个脚本，浏览器在等下一个脚本时仍会处理点击和按键；那时后面文件里的函数还没定义，所以先挡下所有输入
(() => {
  const events = ['click', 'dblclick', 'auxclick', 'contextmenu', 'pointerdown', 'pointerup', 'mousedown', 'mouseup',
    'touchstart', 'touchend', 'keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'change', 'submit', 'paste', 'drop'];
  const block = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
  for (const type of events) window.addEventListener(type, block, { capture: true, passive: false });
  window.prompterBooted = () => { for (const type of events) window.removeEventListener(type, block, { capture: true }); };
})();
