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

说明：End 与“跳回书签 1”在这段脚本里都停在开头位置，第二次按 D 也没有移动。这是拆分前的现状，拆分后只核对是否一致，不在本组修。

遥控（通过互联网）：标签页 1 打开“设备 → 通过互联网”得到配对链接，标签页 2 打开链接，5 秒内显示“已连接提词设备”；在遥控页点“开始”，标签页 1 进入提词画面。两边控制台错误 0。

需真机：摄像头录像、置顶小窗、附近设备（安卓 App）、麦克风语音跟随。
