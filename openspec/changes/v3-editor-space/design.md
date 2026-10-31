# Design

## Context

方案来源：docs/superpowers/specs/2026-10-31-v3-editor-space-design.md，用户已批准。当前index.html持有业务引擎，ui-v3.js处理呈现状态；ui-v3.css中正文上限624px且document-workspace固定边距。现有animateSurface支持指定曲线和减少动态效果。Figma工作文件oa1czDyPOMjSdkSerE3bNW，页01/02用于桌面参考。

## Goals / Non-Goals

**Goals:** 在既有引擎上实现两项delta规格；以真实浏览器验证排版、选择与动画中断。

**Non-Goals:** 不替换框架，不改存储键、传输协议、稿件格式，不新建原生桌面项目，不重做手机信息结构。

## Decisions

- 采用自适应单栏及约960px上限；不采用铺满超长行或双栏。正文和标题共用容器，侧栏占用宽度由同一布局变量控制。
- 两侧开关固定在编辑器上层，44px目标、32px按钮，不能在桌面开合时移动DOM父节点。平板现有工具栏入口按断点保留。
- 重排不重建富文本DOM；以选区或首个可见段落的视口纵坐标补偿滚动。
- 复用animateSurface，仅对面板/工具容器做transform和opacity；布局一次提交，快速切换取消旧动画，reduced-motion跳过动画。
- 开始位置使用现有api.enter(boolean)，true对应光标、false对应开头；主按钮与快捷键共享选择逻辑，旧存储不迁移。
- Figma保持原生Windows24px标题栏的独立参考，Web无模拟窗口控件。Figma验证时序，真实页面验证文字重排。

## Risks / Trade-offs

- [中文长行难读] → 在880–1040px范围验证并记录最终上限；达到上限允许字数不再增长。
- [选区或IME丢失] → 不改写DOM、不在输入组合中强制重建；验证跨行选区和中文输入。
- [快速切换残留遮罩] → 沿用取消机制并验证最终inert、hidden、aria-expanded。
- [离线旧样式] → 变更缓存版本并验证构建产物包含更新文件。

## Migration Plan

先规格和回归测试，后本地实现与Figma同步，最后浏览器视觉、构建与证据整理。回滚本次源码改动即可，无数据迁移。
