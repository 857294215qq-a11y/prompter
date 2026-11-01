# V3 Native Look (Task Group 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menus, popovers and controls take the macOS 27 library sizes and materials from the Figma copy, and 设备 opens an anchored popover that shows the real connection state instead of jumping straight into the pairing dialog.

**Architecture:** CSS for sizes and materials in `ui-v3.css` (one block per component, macOS sizes under `@media (pointer: fine)` so touch keeps 44px targets). The device popover is static markup in `index.html` driven by `ui-v3.js`; the engine reports the active route through the existing `v3.connection()` hook and exposes three actions on the api. Branch `v3-native` is stacked on `v3-motion` (PRs #6 and #7 open).

**Tech Stack:** CSS (`backdrop-filter`, `@supports`, `prefers-reduced-transparency`), vanilla JS, jsdom 26 + node:test.

**Spec:** `openspec/changes/v3-design-parity/specs/native-controls/spec.md`, decision 8 in `openspec/changes/v3-design-parity/design.md`. Figma (copy page): more menu 2164:478, cue menu 2173:1241, cue editor 2173:1462, device popover 2164:733 / 2176:2467, version choice 2166:1036.

## Global Constraints (values read from the Figma instances)

- **Menu:** width 244 (more / cue), radius 12, padding 5px 12px, rows 24px with 12px left inset, a 12px check column, 16px icon, 8px gap, 13px text; separator block 11px with a 1px line; header 25px (5 top, 4 bottom, 12px secondary text); hover row radius 8.
  - Light material: `rgb(217 217 217 / .55)` over `rgb(217 217 217 / .40)`, `backdrop-filter: blur(25px)`, shadow `0 8px 48px rgb(0 0 0 / .25)` plus a 1.25px ring `rgb(219 219 219)`.
  - Dark material (reader): `rgb(64 64 64 / .80)` over `rgb(255 255 255 / .20)`, shadow alpha .45, ring `rgb(166 166 166)`. Text uses normal blend.
- **Popover:** radius 20, padding 18px 20px 16px, fill `rgb(255 255 255 / .70)` with `blur(26px)`, shadow `0 8px 48px rgb(0 0 0 / .25)` and a .5px ring `rgb(219 219 219)`; rows 40px; group label 12px medium `#6e6e73`; divider 1px `#dadadd`.
- **Controls:** text field 24px tall, radius 6, white, 13px; switch 54×24 with a 32×20 knob; segmented control 24px tall, radius 6, track `rgb(0 0 0 / .08)`, selected segment accent with white 13px label; button 24px tall, radius 6, padding 0 16px, fill `rgb(0 0 0 / .08)`, prominent = accent; radio 16×16. The editor's start buttons keep their Figma sizes (32 / 40).
- **Fallback:** where `backdrop-filter` is unsupported or `prefers-reduced-transparency: reduce` is set, menus and popovers use opaque `#f2f2f4` (light) / `#2c2c2e` (dark) with text contrast ≥ 4.5:1.
- **Touch:** under `(pointer: coarse)` menu rows and buttons keep a 44px minimum.
- Stamp before each commit touching `index.html`, scripts or styles.

## Review Focus

1. Web without the nearby feature: the device popover must not show the app-only "当作遥控器使用" row or a "附近" route that can never be active. (Task 3 test `web hides app-only rows`.)
2. Connection drops while the popover is open: dot, text, route and the send button update in place. (Task 3 test `disconnect updates the open popover`.)
3. The popover must not cover the parameter card's heading at 1440 and at 1200 widths. (Task 4 browser check.)
4. Opaque fallback contrast in both appearances. (Task 1 test on the fallback colours' contrast ratio.)
5. Reader 更多 menu on the dark reader keeps readable text (normal blend). (Task 1 test and Task 4 screenshot.)

---

### Task 1: Menus (更多, 插入提示, 稿件更多)

**Files:** `ui-v3.css` (`.popover` menu rules, `.cue-menu`, `.reader-options`, `#docMenu`), new `tests/native.test.cjs`.

**Interfaces:** CSS custom properties `--menu-fill`, `--menu-ring`, `--menu-shadow` set per appearance; menus are `.popover[role="menu"]` (add `role="menu"` to `#docMenu`, items `role="menuitem"`).

- [ ] **Step 1: Failing tests** — `menus use the macOS 27 metrics` (parse the CSS block for `.popover[role="menu"]`: radius 12px, padding 5px 12px, width 244px for `.cue-menu`/`.reader-options`; item rule height 24px, 13px, padding-left 12px; separator 11px); `dark reader menu keeps normal blend and readable text` (rule for `#prompter .popover[role="menu"]` sets the dark material and `mix-blend-mode: normal` on items); `opaque fallback has 4.5:1 contrast` (compute WCAG contrast of the fallback fill vs text colour in light and dark: ≥ 4.5); `#docMenu is a menu` (role and item roles after boot).
- [ ] **Step 2: Run** `node --test tests/native.test.cjs` — FAIL. **Step 3: Implement.** **Step 4: Run all.**
- [ ] **Step 5: Stamp, commit** `feat(native): macOS 27 menus with glass material and an opaque fallback`.

---

### Task 2: Popovers and controls

**Files:** `ui-v3.css` (popover material for `.popover:not([role="menu"])` incl. `#cueEditor`; controls: `.cue-editor input`/text inputs, `input[role="switch"]`, `.seg`, `.btn`, radios), `tests/native.test.cjs`.

- [ ] **Step 1: Failing tests** — `popovers use radius 20 and the light glass` ; `controls take macOS sizes on fine pointers` (inside `@media (pointer: fine)`: switch 54×24 with 32×20 knob, `.seg` 24px radius 6, `.btn` 24px radius 6 padding 0 16px, text inputs 24px radius 6 13px, radio 16px); `touch keeps 44px targets` (`@media (pointer: coarse)` sets min-height 44px on `.btn` and menu rows); `start buttons keep their Figma heights` (`.start-actions .btn` 32px, `.start-actions .primary` 40px still win on fine pointers).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run all.**
- [ ] **Step 5: Stamp, commit** `feat(native): macOS 27 popover material and control sizes`.

---

### Task 3: Device popover

**Files:** `index.html` (new `#devicePopover`), `ui-v3.js` (open/close, render state), `src/engine/15-remote-lan.js:243-258,295` (`renderRemoteStatus` passes the route; `#remoteBtn` asks `v3.openDevices()` first), `src/engine/17-install.js` (api: `openPairing(fresh)`, `controllerOn()`, `controllerOff()`, `sendScript()`), `tests/native.test.cjs`.

**Interfaces:**
- Engine → UI: `v3.connection(count: number, route: 'near' | 'lan' | 'net' | null)` — route from `renderRemoteStatus`: nearby clients → `'near'`, LAN peers → `'lan'`, relay remotes → `'net'`, none → `null`.
- UI → engine api: `openPairing(fresh: boolean)` → `openRemoteDlg(fresh)`; `controllerOn()` → `ctrlOpen()`; `controllerOff()` → `ctrlLeave()`; `sendScript()` → `sendState(true)`.
- `v3.openDevices(): void` opens `#devicePopover` under `#remoteBtn` (left = button left − 189, top = button bottom + 20, from 2164:733; right edge clamped 8px left of the parameter card when it is open), focus on its first control. Closes on Esc, outside click, or focus moving elsewhere; no close button.

Markup rows (from 2176:2467, exact copy): title 设备与遥控; status row (dot + 提词平板 / 已连接 N 台遥控设备 or 未连接遥控设备); 管理已配对设备 (monitor-smartphone icon, chevron); 配对另一台设备 (plus icon); divider; group label 这台电脑; 当作遥控器使用 (switch, `.app-only`); 当前线路 (read-only three-part display 附近 / 局域网 / 中转 with the active part marked `aria-current="true"` and a visually hidden "当前线路：…"; 附近 is `.app-only`); 发送当前稿件到平板 (button, `aria-disabled="true"` with no connection); footnote 连接状态与稿件同步分别显示。断线时保留本机内容。

- [ ] **Step 1: Failing tests** — `设备 opens the popover under its button, not the pairing dialog`; `the popover shows the real route` (`v3.connection(1, 'net')` → 中转 current, dot ok, send enabled); `disconnect updates the open popover` (`v3.connection(0, null)` → 未连接, no current part, send `aria-disabled`); `web hides app-only rows`; `pairing actions open the pairing dialog` (管理 → `openPairing(false)`, 配对另一台 → `openPairing(true)`, spies); `Esc and outside click close it; there is no close button`; `send calls sendScript once and toasts`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run all** (update tests that expected `#remoteBtn` to open `#rdlg` directly).
- [ ] **Step 5: Stamp, commit** `feat(native): device popover anchored to 设备 with the live route`.

---

### Task 4: Compare with Figma at 1440×900

**Files:** `tests/browser/editor-layout.js` (native section), `docs/superpowers/plans/2026-11-01-v3-native-controls.verify.md`, `openspec/changes/v3-design-parity/tasks.md`.

- [ ] **Step 1:** Browser check: open 更多 (reader), 插入提示, 设备; measure each box, corner radius (`getComputedStyle`), row heights; compare with 244×141 / 244×190 / 340×397, radius 12 / 12 / 20, rows 24 / 40 — failure beyond 2px. Device popover must not intersect `.settings-heading` at 1440 and 1200.
- [ ] **Step 2:** Screenshots of the three states next to the Figma frames (get_screenshot 2164:478, 2173:1241, 2164:733); record deviations in the verify file.
- [ ] **Step 3:** Stamp, sync, tick 6.1 and 6.2, validate, commit `test(native): measure menus and the device popover against Figma`.
