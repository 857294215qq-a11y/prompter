# V3 Design Parity · 第 1 组：模块拆分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 index.html 里约 2,080 行的内联引擎脚本按现有分区拆成 `src/engine/` 下的有序文件，不改变任何行为，为第 2–6 组的改动划出边界。

**Architecture:** 引擎目前是一个 `'use strict'` 的立即执行函数，各分区共用并反复重新赋值同一批变量（`library`、`currentId`、`S`、`v3`、`editMode`、`marks`…）。拆成 ES 模块就得把这些赋值全部改写，与"不改行为"相冲突；所以改为**按原顺序加载的普通脚本**：每个文件顶部写 `'use strict'`，顶层 `let/const` 在普通脚本之间共享同一个全局词法作用域，代码文本逐字搬运。唯一的语义差异是函数提升只在单个文件内有效，因此启动时执行的语句不能调用后面文件里的函数——由启动测试（含安卓原生分支）兜住。ui-v3.js 本组不拆（它的 `$` 等名字会和引擎在共享作用域里冲突，543 行仍可读）；第 4–6 组新增的组件各自独立成文件。

**Tech Stack:** 原生 JS（普通脚本）、jsdom 26 + node:test、Capacitor 7、`scripts/build-web.mjs`。

**Spec:** `openspec/changes/v3-design-parity/`（design.md 决策 1、tasks.md 第 1 组）。本计划同时把决策 1 由"ES 模块"修订为"有序普通脚本"，并把 ui-v3.js 的拆分移出本组。

## Global Constraints

- 对外 api（`window.initPrompterV3(api)` 收到的对象）键名与取值不变，`stop` 键仍存在（值改为 `stopPlayback`）。
- 现有 30 项测试不得修改断言；只允许改 `boot()` 的加载方式。
- 搬运的代码逐字不变，唯一允许的文本改动是 `function stop` → `function stopPlayback` 及其两处引用。
- 加载顺序固定为 `vendor/* → ui-v3.js → src/engine/00…17`，在 index.html 里逐个写出。
- sw.js 的 `CACHE` 版本号提升；`ASSETS` 必须包含 index.html 引用的每个本地脚本和样式。
- OpenSpec 文档用简体中文；结构标题与 SHALL/MUST 保持英文。

## Review Focus

1. **安卓原生分支的启动语句**：`IS_NATIVE` 为真时才执行的顶层代码（`nearHostStart`、`.app-only` 显示）若调用了后面文件的函数，只会在 App 里报错——Task 2 加一个带假 `window.Capacitor` 的启动测试。
2. **从遥控链接打开**：`#d=…` 与 `?r=…#…` 两条启动路径在最后一个文件里分支，调用的是 15/16 号文件的函数——Task 2 加两条启动测试，断言不抛错并进入遥控视图。
3. **`window.stop` 被覆盖**：拆成普通脚本后全局函数会挂到 window 上；改名后断言 `typeof window.stopPlayback === 'function'` 且 `window.stop` 仍是浏览器原生函数。
4. **离线缓存漏文件**：新脚本没进 `ASSETS` 时，网页版断网后白屏——Task 3 的测试遍历 index.html 的本地 `<script src>`/`<link href>`，断言都在 `ASSETS` 里。
5. **CI 漏触发**：`android.yml` 的 `paths` 不含 `src/**`，只改引擎时不会出 APK——Task 3 补上，并在 Task 4 用 grep 核对。

---

### Task 1: 记录基线

**Files:**
- Create: `docs/superpowers/plans/2026-10-31-v3-module-split.baseline.md`

- [ ] **Step 1:** 运行 `npm test`，记录通过数。Expected: `# pass 30`、`# fail 0`。
- [ ] **Step 2:** 运行 `npm run build:web`，记录 `www/` 文件清单（`find www -type f | sort`）。
- [ ] **Step 3:** 用 `npm run dev` 起服务，在内置浏览器 1440×900 下冒烟并逐项记录结果：打开示例稿 → 开始提词 → 倒数 → 播放/暂停（空格）→ D/A 跳段 → Q/E 跳节 → B 加书签、1 跳回 → Esc 退出；第二个标签页打开遥控链接完成配对并点"下一段"；记下控制台错误（应为 0）。摄像头录像与置顶小窗在内置浏览器不可用，标"需真机"。
- [ ] **Step 4:** 把以上写入 baseline.md 并提交：`git commit -m "docs: record module-split baseline"`。

### Task 2: 拆出引擎文件并改测试加载方式

**Files:**
- Create: `src/engine/00-core.js` … `src/engine/17-install.js`（按下表）
- Create: `scripts/split-engine.mjs`（一次性搬运脚本，提交以便复核，Task 4 结束时删除）
- Modify: `index.html:659-2745`（内联脚本换成 18 个 `<script src>`）
- Modify: `tests/ui.test.cjs:13-31`（`boot()`）
- Test: `tests/engine-split.test.cjs`

按 index.html 现有行号切分（左闭右闭，均为原文件行号；第 659–661 行的 `<script>`、`(() => {`、`'use strict';` 和第 2744–2745 行的 `})();`、`</script>` 不搬运）：

| 文件 | 行 | 分区 |
|---|---|---|
| 00-core.js | 662–708 | 示例稿、`$`、store、平台、默认设置 |
| 01-script.js | 709–767 | 文稿解析 |
| 02-editor.js | 768–936 | 编辑页 |
| 03-reader.js | 937–1153 | 提词页渲染与匹配 |
| 04-playback.js | 1154–1244 | 播放 / 分段 |
| 05-voice.js | 1245–1355 | 语音跟随 |
| 06-recorder.js | 1356–1484 | 录像 |
| 07-controls.js | 1485–1502 | 控制条自动隐藏 |
| 08-marks.js | 1503–1606 | 书签与目录 |
| 09-loop.js | 1607–1641 | 渲染循环 |
| 10-inline-edit.js | 1642–1707 | 提词画面里改字 |
| 11-session.js | 1708–1769 | 进入 / 退出 |
| 12-reader-input.js | 1770–1906 | 提词页交互与键盘 |
| 13-pip.js | 1907–1944 | 置顶小窗 |
| 14-remote.js | 1945–2032 | 遥控（中转） |
| 15-remote-lan.js | 2033–2445 | 同网直连 |
| 16-nearby.js | 2446–2707 | 附近设备 |
| 17-install.js | 2708–2743 | 安装、api 交接与启动分支 |

**Interfaces:**
- Produces: 全局（脚本作用域）上与原闭包同名的全部变量和函数；`stopPlayback()`；index.html 中 `<script src="src/engine/NN-name.js">` 的固定顺序。
- Produces: `tests/helpers/boot.cjs` 导出 `boot(saved = {}, { native = false, url = 'https://prompter.test/' } = {})`，返回值形状与现在的 `boot()` 相同；ui.test.cjs 改为从这里引入。

- [ ] **Step 1: 写失败测试 `tests/engine-split.test.cjs`**

```js
test('engine files reproduce the original inline script byte for byte', () => {
  // const BASE = '8021127'（拆分前的提交，写死，后续提交不影响）；
  // 读 git show ${BASE}:index.html 的 662–2743 行；读 src/engine/*.js（按文件名排序），
  // 去掉每个文件首行 'use strict'; 后拼接；把 stopPlayback 换回 stop 后与原文相等。
});
test('index.html loads every engine file once, in order, after ui-v3.js', () => {
  // 解析 <script src>，断言等于 [vendor…, 'ui-v3.js', ...readdirSync('src/engine').sort().map(f => 'src/engine/' + f)]
  // 且 index.html 不再含内联 <script>（无 src 的 script 数为 0）。
});
test('boots in the browser without errors', () => { /* boot(); 断言 window.onerror 未触发、#ta 有内容 */ });
test('boots as the Android app without errors', () => { /* boot({}, { native: true }); 断言无错误、.app-only 元素 hidden === false */ });
test('boots from a direct remote link without errors', () => { /* boot({}, { url: 'https://prompter.test/#d=abc' }); 断言无错误 */ });
test('boots from a relay remote link without errors', () => { /* boot({}, { url: 'https://prompter.test/?r=room#key' }); 断言无错误 */ });
test('stopPlayback does not replace window.stop', () => {
  // typeof w.stopPlayback === 'function'；w.stop !== w.stopPlayback；w.testEngine.stop === w.stopPlayback
});
```

`native: true` 时在加载脚本前设置 `w.Capacitor = { isNativePlatform: () => true, Plugins: { Link: <每个方法都返回 Promise.resolve({}) 的 Proxy> } }`。"无错误"的判定：在 `boot()` 里给 `w` 挂 `error` 监听，把错误收集到 `app.errors`，断言 `deepEqual(app.errors, [])`。

- [ ] **Step 2:** 运行 `node --test tests/engine-split.test.cjs`。Expected: 第 1、2、7 项 FAIL（文件不存在 / 仍有内联脚本 / `stopPlayback` 未定义）。

- [ ] **Step 3: 实现 `scripts/split-engine.mjs`**：按上表从 index.html 截取行段，每个文件写成 `'use strict';\n` + 原文行 + 末尾换行；把 index.html 的第 659–2745 行替换为 18 行 `<script src="src/engine/NN-name.js"></script>`。运行一次：`node scripts/split-engine.mjs`。

- [ ] **Step 4:** 手改 `function stop()` → `function stopPlayback()`（04-playback.js）、`bind('#pStop', () => v3.confirmReset(stop))` → `stopPlayback`（12-reader-input.js）、api 对象里 `stop,` → `stop: stopPlayback,`（17-install.js）。

- [ ] **Step 5: 改 `boot()`**：迁到 `tests/helpers/boot.cjs`；JSDOM 改为 `runScripts: 'dangerously'`（不加 `resources`，外部脚本不会自动加载）；按 `document.scripts` 顺序把每个本地 `src` 文件读成文本，创建内联 `<script>` 插到原位置执行，使顶层 `let/const` 共享作用域，与浏览器一致；`ui-v3.js` 执行后照旧包一层 `initPrompterV3` 以暴露 `testEngine`/`testView`。

- [ ] **Step 6:** 运行 `npm test`。Expected: 原 30 项 + 新 7 项全部 PASS。若启动测试报 `ReferenceError`/TDZ，说明某个顶层语句调用了后面文件的函数：把**那条顶层语句**移到它所依赖的最后一个文件末尾（不移动函数），在本 Task 的提交说明里逐条列出，并让第 1 项测试的比对改为"按文件拼接后与原文的差异只包含这些移动"。

- [ ] **Step 7:** 提交：`git commit -m "refactor: split inline engine into ordered scripts under src/engine"`。

### Task 3: 构建、离线缓存与 CI

**Files:**
- Modify: `scripts/build-web.mjs:5`（复制列表加 `'src'`）
- Modify: `sw.js:2-34`（`CACHE` 改为 `'prompter-ui-v3-modules-1'`；`ASSETS` 加 18 个 `./src/engine/…`）
- Modify: `.github/workflows/android.yml`（`paths` 加 `'src/**'`）
- Test: `tests/engine-split.test.cjs`

- [ ] **Step 1: 写失败测试**

```js
test('service worker caches every local script and stylesheet the page loads', () => {
  // 从 index.html 取所有本地 <script src> 与 <link rel=stylesheet href>；
  // 在 sw.js 文本里找到 ASSETS 数组；断言每一项 './' + path 都在其中。
});
test('web build ships the engine files', () => {
  // execFileSync('node', ['scripts/build-web.mjs'])；断言 www/src/engine/ 下文件名与 src/engine/ 相同。
});
```

- [ ] **Step 2:** 运行 `node --test tests/engine-split.test.cjs`。Expected: 两项 FAIL。
- [ ] **Step 3:** 按 Files 一栏修改三个文件。
- [ ] **Step 4:** 运行 `npm test`。Expected: 全部 PASS。运行 `grep -n "src/\*\*" .github/workflows/android.yml`，Expected: 1 行。
- [ ] **Step 5:** 提交：`git commit -m "build: ship src/engine in web bundle, service worker and CI"`。

### Task 4: 等价验证与规格修订

**Files:**
- Delete: `scripts/split-engine.mjs`（第 1 项测试已与写死的 `BASE` 提交比对，不依赖这个脚本）
- Modify: `openspec/changes/v3-design-parity/design.md`（决策 1 改为有序普通脚本，写明理由与提升限制；ui-v3.js 的拆分改为"新组件独立成文件"）
- Modify: `openspec/changes/v3-design-parity/tasks.md`（1.2/1.3 措辞随之修改，1.1–1.4 打勾）
- Modify: `docs/superpowers/plans/2026-10-31-v3-module-split.baseline.md`（追加拆分后结果）

- [ ] **Step 1:** `npm test && npm run sync`。Expected: 测试全部通过；`cap sync android` 输出 `Sync finished`。
- [ ] **Step 2:** 重复 Task 1 Step 3 的冒烟，逐项与基线对比，控制台错误仍为 0；把结果追加到 baseline.md。
- [ ] **Step 3:** 修订 design.md 与 tasks.md，运行 `openspec validate v3-design-parity --strict`。Expected: `is valid`。
- [ ] **Step 4:** 提交：`git commit -m "docs(openspec): record ordered-script split and verify parity"`。
