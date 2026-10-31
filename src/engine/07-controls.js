'use strict';
// 控制条：播放时 2.5 秒无操作自动隐藏；菜单打开或焦点在栏里时不隐藏
let idleT;
function poke() {
  prompter.classList.remove('idle');
  clearTimeout(idleT);
  idleT = setTimeout(() => { if (state === 'playing' && panel.hidden && !v3?.barsBusy?.()) prompter.classList.add('idle'); }, 2500);
}

let toastT;
function toast(msg) {
  if (prompter.hidden && v3) { v3.notify(msg); return; }
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 1300);
}

