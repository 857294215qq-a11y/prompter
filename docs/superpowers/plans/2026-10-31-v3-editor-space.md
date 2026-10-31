# V3 编辑空间 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在保持字号和业务数据兼容的前提下，通过自适应正文、固定侧栏开关和明确操作增加同屏稿件内容。

**Architecture:** 保留index.html业务引擎、ui-v3.js状态控制与ui-v3.css呈现。桌面布局用统一空间规则，开关独立定位；重排不替换富文本DOM。Figma同步原生参考与关键状态，实际浏览器负责排版和输入验证。

**Tech Stack:** 原生HTML/CSS/JavaScript、Web Animations API、Capacitor、Node test runner/jsdom。

**Spec:** ../specs/2026-10-31-v3-editor-space-design.md（用户已批准）；../../../openspec/changes/v3-editor-space/specs/。

## Global Constraints

- 正文字号17px不因收起侧栏变化，初始行宽上限960px，允许在880–1040px内经验证调整并记录。
- 卡片外距8px，左栏232px、右栏296px，栏与正文间距24px；开关32px图形按钮置于44px可点击区域。
- cubic-bezier(.32,.72,0,1)，默认进入240ms，关闭可180ms；减少动态效果禁用位移/缩放。
- 超宽屏达到行宽上限后允许同屏字数不再增加。不改存储键、稿件格式、传输协议，不新增框架。
- 目标prompter，不双写历史prompter-v3。原生Windows保留24px标题栏与4px间隔，Web不模拟。

## Review Focus

- 中文IME组合与跨行选区遇到布局变化：不重建编辑DOM、不丢选区（Task 1）。
- 长稿已滚动到中段：保留光标段或首个可见段落纵向位置（Task 1）。
- 动画期间快速反复切换：最终inert、aria-expanded、可见状态一致（Task 2）。
- 缺少有效光标或切换稿件：从光标开始不得使用前稿位置（Task 3）。
- 767/768及1199/1200断点、短横屏：入口可达且无侧栏遮挡残留（Task 4）。

---

### Task 1: 自适应桌面空间与固定开关

**Files:** 修改ui-v3.css、ui-v3.js；测试tests/ui.test.cjs；记录design-qa.md。

**Interfaces:** 消费现有layout()和ui.left/ui.right。新增captureEditorAnchor()返回{element,top,scrollTop,selection}或null，restoreEditorAnchor(anchor)返回void；只在布局变化前后调用，不改稿件内容。标题和#richEditor使用同一可用列与960px上限。

- [x] 添加回归：布局切换前后#richEditor节点相同、ta值相同、DOM选区anchor/focus节点和offset相同；保持现有focus restoration测试通过。jsdom只验证状态和选区，不声称验证像素。
- [x] 执行npm test确认新增用例可暴露回归；像素问题用后续浏览器测量作为先失败证据。
- [x] 修改.document-workspace、.document-content、标题/正文宽度规则，移除桌面缩栏时的固定占位；两个开关保持编辑器固定父节点与同高坐标，标题/工具避让44px点击区。
- [x] 实现captureEditorAnchor()/restoreEditorAnchor()；优先选区段落，其次首个可见段落，按重排前后getBoundingClientRect().top差值补偿内容区scrollTop；composition期间不重建节点。
- [x] npm test通过；浏览器1440×900测双展开、单收起、双收起、专注往返的正文宽度/高度和开关bounds，证明双收起换行减少且位置不跳。记录中文IME及长稿中段操作结果。

### Task 2: 可中断布局动效

**Files:** 修改ui-v3.js、ui-v3.css；测试tests/ui.test.cjs；记录design-qa.md。

**Interfaces:** 沿用animateSurface(el,show,display)和motionJobs取消机制；layout()先提交新布局，面板及工具容器使用transform/opacity衔接，正文不逐帧缩放或改写。

- [x] 添加动画测试：捕获Element.animate参数断言指定曲线和240ms进入；减少动态效果时无位移动画；连续切换结束后aria-expanded与inert匹配最后状态。
- [x] npm test先运行新增用例，再实现最小修复，保证旧动画finished回调不会覆盖新状态。
- [x] npm test通过；浏览器重复快速切换两栏和专注，确认无残留遮罩、丢焦点或文字缩放。

### Task 3: 明确工具与开始位置

**Files:** 修改index.html、ui-v3.js；测试tests/ui.test.cjs；记录README.md。

**Interfaces:** 新增#startPosition选择start/caret，startFromSelection()调用api.enter(boolean)。复用现有caret()、#start、#mobileStart和快捷键路径；避免旧start监听重复启动。格式data-format值与存储格式不变。

- [x] 添加测试：三个格式按钮可访问名称分别含小节标题/标记重点/插入提示，聚焦可获取说明；#paneText包含“仅影响提词画面”。
- [x] 添加测试：startPosition=start从零开始；caret使用当前稿件选区；切换稿件后无有效光标时回到开头并显示说明；主按钮、移动入口和快捷键各只启动一次。沿用现有播放、撤销及持久化测试。
- [x] npm test先确认失败，再修改按钮文案、说明、专注动态标签与共享开始选择；默认start保持现有默认行为。
- [x] npm test通过；记录README准确说明格式工具、专注/全屏区别及开始位置规则。

### Task 4: Figma同步、视觉与集成验证

**Files:** Figma副本oa1czDyPOMjSdkSerE3bNW的Mac/Windows页；本地design-qa.md、sw.js（需要时更新缓存版本）、docs/design证据文件。

**Interfaces:** 消费Tasks 1–3的实际布局及文案；每次Figma写入返回所有受影响ID。使用既有状态ID，避免再复制整套V3。

- [x] 读取当前Mac/Windows关键状态，调整顶部基线、两个固定开关、正文响应宽度；桌面修改不得波及手机。保留正确同页导航及专注返回路径。
- [x] Figma Motion可用时做一组代表性开/合/专注演示并读回指定曲线；不支持时记录限制，使用实际页面验证，不重试不支持API。非静态动效需要时导出短视频验证开始/中段/结束，避免无意义全量导出。
- [x] 浏览器在1440×900、1920×1080与375/768/1199/1200宽度测试浅深色、四种侧栏组合、短横屏、中文长稿及键盘说明；保存截图和尺寸数据，确认正文未超过约定上限。
- [x] 执行npm test、npm run build:web；核对离线缓存包含更新的CSS/JS，必要时更新缓存版本。无可用Android设备时注明真机未测。
- [x] 更新design-qa.md及OpenSpec tasks完成情况，实际验证与推断分开，记录剩余限制；只在所列验收通过后声明完成。实现后作一次独立整体审阅并处理实质问题。

## Execution Notes

推荐本会话原生执行：四项任务共享同一layout()、富文本选择和DOM入口，串行实施可减少接口偏差。审批后先按using-git-worktrees确定隔离方式，再执行计划；提交仅限本轮文件，不包含用户已有未跟踪的.agents/.claude配置，不推送或发布。
