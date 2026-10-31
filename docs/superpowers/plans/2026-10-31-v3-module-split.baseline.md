# 模块拆分基线（拆分前，提交 8021127）

## 自动

- `npm test`：30 项，pass 30，fail 0。
- `npm run build:web`：`www/` 共 31 个文件；顶层为 index.html、manifest.webmanifest、ui-v3.css、ui-v3.js，其余在 icons/、vendor/、assets/。

## 冒烟（内置浏览器，1440×900，`npm run dev`，先清空 localStorage）

同一段脚本前后各跑一次：开始提词 → 等 3.8 秒倒数 → 空格 → Home → D → D → E → Q → B → End → 1 → Esc，每步读 `#content` 的 transform。

| 步骤 | 结果 |
|---|---|
| 稿件列表 | 2 份 |
| 倒数后播放按钮名称 | 播放 |
| 空格后 | 暂停 |
| Home | translate3d(0px, 281.4px, 0px) |
| D | translate3d(0px, 245.4px, 0px) |
| D 再按一次 | translate3d(0px, 245.4px, 0px) |
| E | translate3d(0px, -191.6px, 0px) |
| Q | translate3d(0px, 281.4px, 0px) |
| B 后 End | translate3d(0px, 281.4px, 0px) |
| 1（跳回书签） | translate3d(0px, 281.4px, 0px) |
| Esc | 退出提词画面 |
| 控制台错误 | 0 |

说明：End 与“跳回书签 1”在这段脚本里都停在开头位置，第二次按 D 也没有移动。后来查明这不是程序问题：冒烟时浏览器窗格处于隐藏状态，浏览器不跑动画帧，画面没有更新（见下方“拆分后”）。

遥控（通过互联网）：标签页 1 打开“设备 → 通过互联网”得到配对链接，标签页 2 打开链接，5 秒内显示“已连接提词设备”；在遥控页点“开始”，标签页 1 进入提词画面。两边控制台错误 0。

需真机：摄像头录像、置顶小窗、附近设备（安卓 App）、麦克风语音跟随。

## 拆分后（src/engine 共 18 个文件）

- `npm test`：39 项（原 30 项 + 新增 9 项），pass 39，fail 0。
- `npm run sync`：`Sync finished`；`android/app/src/main/assets/public/src/engine/` 下 18 个文件。
- 浏览器冒烟：18 个引擎脚本全部加载；开始提词、空格、各跳转键、B、1、Esc 均正常，控制台错误 0；`window.stop` 仍是浏览器原生函数。窗格隐藏时浏览器不跑动画帧，于是改为手动驱动 `frame()` 读取位置。
- 逐键等价对比：拆分前（`git archive 8021127`）与拆分后在 jsdom 中用同一段脚本、同样的时钟与逐帧驱动运行：示例稿 → 开始 → 播放 2 秒 → 空格 → Home、D、D、E、Q、B、End、1、↓、PageDown、A、R、]、+、M → Esc，每步记录 transform、字号和提词画面状态。两份输出**完全一致**，均无错误。在这次对比里，End、第二次 D、跳回书签 1 都正常移动，证实拆分前记下的“不移动”是窗格隐藏造成的。
- 遥控配对：与拆分前同样的两个标签页操作，5 秒内显示“已连接提词设备”；点“开始”后提词设备进入提词画面，两边控制台错误 0。
