'use strict';
let v3 = null;

const SAMPLE = `# 开场
大家好，欢迎回到我的频道。今天想跟大家聊一个很多人都踩过的坑：录口播的时候，前面说得很顺，结尾却卡了一下。

很多人的做法是整段重来。其实完全没必要。

# 为什么要分段录
一段三分钟的口播，真正出问题的往往只有其中十几秒。整段重录，不光浪费时间，状态也会越录越差。

分段录的好处是，每一段都能保持最好的状态。剪辑的时候再把它们接起来，观众几乎看不出来。

# 怎么用这个提词器分段录
在提词画面里，用翻页笔或者键盘的左右方向键就能翻页。按 A 和 D 跳到上一段、下一段，按 Q 和 E 跳到上一节、下一节。

也可以直接点屏幕上的任意一句话，提词会从那一句开始。

录到一半觉得这一段要重来，就按 B 加个书签。之后按数字键 1，就能直接跳回来。

# 结尾
好了，今天就聊到这里。如果这期内容对你有帮助，记得点赞关注，我们下期见。`;

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const store = {
  get(k, d) { try { const v = localStorage.getItem('prompter:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('prompter:' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
};

// 在安卓 App 里运行时，Capacitor 会注入原生插件 Link；在普通浏览器里是 null
const NP = (window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.Link : null) || null;
const IS_NATIVE = !!NP;
document.querySelectorAll('.app-only').forEach((el) => { el.hidden = !IS_NATIVE; });
document.querySelectorAll('.web-only').forEach((el) => { if (IS_NATIVE) el.remove(); });

const DEFAULTS = {
  cpm: 220, fontSize: innerWidth >= 768 ? 56 : 40, lineHeight: 1.6, margin: 10,
  align: 'left', theme: 'dark', dimRead: true, guide: 35, showGuide: true,
  mirrorX: false, mirrorY: false, countdown: 3,
  secStop: true, autoSave: IS_NATIVE || !matchMedia('(pointer: coarse)').matches, lang: 'zh-CN',
};
const isTouch = matchMedia('(pointer: coarse)').matches;
const S = Object.assign({}, DEFAULTS, store.get('readingDefaults', {}), store.get('settings', {}));
const save = () => store.set('settings', S);

