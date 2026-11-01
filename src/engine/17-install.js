'use strict';
// ---------- 安装成 App ----------
let installEvt = null;
const installBtn = $('#install');
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (installBtn) installBtn.hidden = false; });
window.addEventListener('appinstalled', () => { if (installBtn) installBtn.hidden = true; installEvt = null; });
if (installBtn && isIOS && !isStandalone) installBtn.hidden = false;
installBtn?.addEventListener('click', async () => {
  if (installEvt) {
    installEvt.prompt();
    await installEvt.userChoice.catch(() => {});
    installEvt = null;
    installBtn.hidden = true;
  } else if (isIOS) {
    installBtn.textContent = '在 Safari 点「分享」→「添加到主屏幕」';
  }
});
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !IS_NATIVE && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

v3 = window.initPrompterV3({
  library: () => library, current: curScript, scriptTitle, parse, fmt, settings: S,
  openScript, createDocument, saveLibrary, store, ta, onTextChange, syncControls,
  rename: (title) => { curScript().title = title; curScript().updated = Date.now(); saveLibrary(); renderLibrary(); },
  removeCurrent: () => { const id = currentId; library = library.filter((x) => x.id !== id); if (!library.length) library.push({ id: newId(), text: '', updated: Date.now(), marks: [] }); currentId = library[0].id; marks = [...(curScript().marks || [])]; openScript(currentId); },
  isNative: IS_NATIVE, voice, cam, voiceToggle, camToggle, enter, exit, applyStyle, layout,
  isReading: () => !prompter.hidden, openPanel, closePanel, renderPanel, togglePip,
  saveSettings: save, stop: stopPlayback, poke, saveTakeManually,
});
syncControls();
if (location.hash.startsWith('#d=')) directRemote(location.hash.slice(3));
else if (qs.get('r') && location.hash.length > 1) remoteMode(qs.get('r'), location.hash.slice(1));
else if (S.remoteOn) hostStart(false);
if (IS_NATIVE && S.nearOn) nearHostStart();
