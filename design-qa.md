# Prompter V3 verification

Date: 2026-10-30. Scope: existing Web/PWA and Android assets, as confirmed by the user. Native desktop projects are deferred.

## Visual targets and evidence

Source: Figma file `oa1czDyPOMjSdkSerE3bNW`; desktop `2032:439`, text `2032:871`, recording `2032:1318`, tablet `2045:5721`, phone `2047:2657`, reader `2076:10175`, remote `2046:2698`.

Local evidence files delivered with this chat: `desktop.jpg`, `tablet.jpg`, `phone.jpg`, `phone-reader.jpg`, and the corresponding `desktop-comparison.png`, `tablet-comparison.png`, `phone-comparison.png` in the chat's `prompter-v3` visualization artifact directory. Screenshots are not application assets and are not committed to the app bundle.

- Desktop: 1440×900 CSS pixels; Figma render 1024×640, browser capture 1440×900. Comparison normalizes both to 1024×640.
- Tablet: 1194×834 CSS pixels; Figma render 1024×716, browser capture 1194×834. Comparison normalizes to the same aspect ratio.
- Phone: 390×844 CSS pixels; source and browser captures both 390×844. Smaller-width and landscape behavior is also checked through the responsive layout rules.
- State: editor, light appearance; playback/text/record tabs, parameter sheet and paused reader also inspected. Real stored documents and actual device state replace Figma's example document list and pretend connected state. Native window controls are omitted from browser content.

## Findings and repairs

1. The first render's parameter card ended above the viewport bottom. Corrected inherited `align-self`, then confirmed its measured height is 884 px in a 900 px viewport with 8 px top/bottom insets.
2. Phone reading controls exceeded the capsule width. Moved voice/camera commands into the existing More popover at compact widths; final More button stays inside the 390 px viewport (right edge 352 px).
3. Reading parameters inherited light-page text on a dark surface. Scoped foreground tokens to the reader/remote; confirmed computed text color is `rgb(245, 245, 247)`.
4. The initial tablet start action was in the footer. Moved start/parameter actions into the tablet toolbar and adjusted the reading-column inset to match the tablet target.
5. Independent review identified root-level select-all paste and reader-tab keyboard propagation defects. Both have failing-then-passing regression tests.

## Fidelity surfaces

- Typography: design sizes and hierarchy, regular reading text, compact metadata and tab labels are retained. The installed system Chinese font is the fallback when Noto Sans SC is absent; platform rasterization differs.
- Layout: 232 px document card, 296 px desktop parameter card, 8 px desktop outer insets, rounded cards and capsules; phone tools/start actions remain reachable; tablet keeps its two-column layout.
- Colors: light/dark application tokens, blue primary actions and independent reader colors. Save and connection status use actual application state.
- Assets: all 18 exported V3 SVGs are local, non-empty and included in the offline/Android bundle. No screenshot is used to implement a screen.
- Content: existing user document text is preserved. Example titles, document count, clock values and hypothetical connection success are not copied as product state.

## Functional evidence

`npm test`: 22 passing tests covering legacy documents, switching/search, tabs, rename, deletion confirmation, focus restoration, independent appearance, playback/return, packaging, rich-text source fidelity, bookmark ownership, mobile entry points, remote locking/disconnection, reader parameters, newlines, section toggling, import preservation, select-all paste, tab keyboard handling, clip preview and external V3 styles in picture-in-picture.

`npm run sync`: web build and Capacitor Android resource synchronization pass. `git diff --check` and JavaScript syntax checks pass.

In-app browser: page identity, nonblank content, no relevant console warnings/errors, editing/newline/undo, new/delete document, mobile sheet, tabs, countdown, reader parameters and return paths inspected. A real two-device pairing session, device microphone/camera capture and signed APK installation are not asserted by these checks. The PR workflow compiles a debug APK separately.

## Intentional boundaries

No Mac/Windows wrapper, fake OS controls, cloud backend, or fabricated bidirectional document-sync/conflict state. Full physical-device network, voice and video testing remains an acceptance step. These are stated capability/test boundaries rather than simulated success states.

final result: passed

## 2026-10-31 编辑空间与动作

- 隔离分支codex/v3-editor-space；基线23项测试，当前28项通过。新增滚动补偿、DOM选区/组合事件保持、快速切换、开始位置多入口与失效光标、格式解释、减少动态效果用例。
- IAB实际1440×900：双展开正文848px，收起后上限960px；两开关x16/x1380、y8、44×44，工具胶囊y8。1920×1080达到960px上限。
- 中文160字段落长稿：右栏展开时完整可见5段800字；收起时6段960字，增加20%；同段高度118.375px降至88.78125px，字号不变。该计数仅计完整可见段落，非全部部分可见文字。
- 长稿中段缩栏：首个可见第49段保持，顶部-0.65625px变-0.5625px。滚动值补偿6668/6638.5，而非归零。DOM回归覆盖选区与composition事件；真实操作系统中文IME候选窗未测试。
- 375/767/768/1199/1200/1440/1920宽度检查；768处发现启动按钮裁切，已让窄平板工具栏分行。844×390参数面板的启动按钮底部365px，可达。手机深色、桌面深色及设置关闭主题/侧栏保持已检查。
- Figma Mac/Windows原生参考同步70状态；原生Windows紧凑标题栏保留，Web不模拟。两侧开关移至独立固定层，正文848/960px。开始位置两态组件2153:78/2153:82；一个专用Motion演示画板2153:9657，正式画板不自动播放验证动画。
- Figma Motion指定曲线与240ms数据读回，导出两秒视频并抽查起始/中间/关闭/返回阶段。文件在docs/design/2026-10-31-editor-space/；该视频只验证面板运动，真实文字重排在IAB验证。
- 构建npm run build:web通过，缓存版本更新editor-space-2。Android真机、麦克风、摄像头与双设备同步不在本轮布局验证范围。
- 独立审阅后修正顶层Text选区导致布局异常和手输Markdown普通移焦不格式化；两项先复现失败再修复，最终30项测试通过。布局按钮之间的移焦和composition期间保留编辑DOM。
- 独立审阅为代码检查，没有独立复播IAB或Figma；实际OS中文输入法候选窗口、Android真机仍未测。窄平板参数面板打开时将入口锚在面板标题内，避免覆盖页签。
