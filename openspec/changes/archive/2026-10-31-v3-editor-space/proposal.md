# Proposal

## Why

正文固定624px，收起侧栏和专注后未利用新增空间；顶部控件对齐和开关稳定性也有缺陷。用户已批准自适应单栏方案，希望字号不变、同屏显示更多稿件内容。

## What Changes

- 桌面正文随可用空间扩宽并限制最长行宽，保持编辑位置。
- 工具栏与侧栏顶部对齐，两侧开关固定同高；区分Web与原生Windows标题栏。
- 采用指定缓动，处理动画中断与减少动态效果。
- 澄清格式工具、专注/全屏和开始位置选择，保留现有业务能力。
- 同步Figma状态与实际页面验证证据。

## Capabilities

### New Capabilities

- `editor-workspace`: 编辑空间、侧栏状态、内容重排与动画连续性。
- `editor-actions`: 编辑工具说明和提词开始位置的明确选择。

### Modified Capabilities

无，当前主规格目录尚无已发布能力。

## Impact

修改index.html、ui-v3.css、ui-v3.js、tests/ui.test.cjs及必要的离线缓存版本；沿用HTML/CSS/JavaScript和Capacitor，不新增框架，不改变存储键或稿件格式。目标代码库为prompter；Figma工作副本oa1czDyPOMjSdkSerE3bNW。
