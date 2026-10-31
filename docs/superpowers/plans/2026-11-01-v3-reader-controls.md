# V3 Reader Controls (Task Group 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the reader screen match the `reader-controls` spec delta and the formal Figma reader frames: column aligned to the top pill, 12px timer labels, a grouped "更多" menu without duplicates, one rotate-ccw retake icon, a start hint that never overlaps the bars, and bars that hide smoothly but not while in use.

**Architecture:** Presentation stays in `ui-v3.js` / `ui-v3.css`; the engine changes only where it owns the behaviour (`applyStyle` padding and `placeOverlays` in `src/engine/03-reader.js`, the idle check in `src/engine/07-controls.js`). Geometry is checked by extending the in-page script `tests/browser/editor-layout.js` into a reader section run at 1440×900; everything else is jsdom.

**Tech Stack:** Vanilla JS classic scripts, CSS, jsdom 26 + node:test, Capacitor 7.

**Spec:** `openspec/changes/v3-design-parity/specs/reader-controls/spec.md`, decision 5 in `openspec/changes/v3-design-parity/design.md`. Figma formal frames (file `oa1czDyPOMjSdkSerE3bNW`): `Mac / 提词 · 暂停` 2076:10175, `Mac / 提词 · 更多工具` 2076:10637 (pill 311,56 818×60; menu 885,124 244×141 — right-aligned to the pill, 8px below it; items 水平镜像, 垂直镜像, separator, 打开置顶小窗, 连接遥控器, 全屏 F).

## Global Constraints

- Easing `cubic-bezier(.32,.72,0,1)` (`var(--ease)`); bar hide 240ms (opacity + 8px move), bar show 200ms.
- Icon-first: every control keeps its icon; menu items have icon + text; shortcuts shown where one exists (M, V, F).
- Engine stays behaviour-compatible: existing 80 tests pass unchanged except where a task says otherwise.
- After changing `index.html`, `sw.js`, scripts or styles, run `npm run stamp` before committing.

## Review Focus

1. Mirrored stage (`scale(-1, 1)`) — the column padding must stay symmetric so mirroring does not shift text off the pill. (Task 1 test `column padding is symmetric`.)
2. A wide user margin (`S.margin` larger than the pill inset) — the column keeps the wider of the pill inset and `S.margin`, never narrower than the user's margin. (Task 1 test `user margin wins when wider than the pill inset`.)
3. Tablet width (768–1199px) — voice and camera move back into the top bar; the menu still contains only its five items (plus the agreed extras). (Task 2 test `tablet menu contains no voice or camera`.)
4. Keyboard focus parked on a bar button while playing — bars must not hide; once focus leaves, the 2.5s timer restarts. (Task 5 test `bars stay while focus is inside`.)
5. Hint when the guide line sits low (`S.guide` 80%) — hint flips above the line instead of overlapping the bottom bar. (Task 4 test `hint flips above a low reading line`.)

## Open decision for the user (default used by this plan)

The spec's menu lists only 画面 and 窗口 groups, but today the menu also holds **阅读参数** and **改字**, which have no other button. Default: keep both as a third group **调整** at the bottom of the menu, so no feature loses its only entry point. Alternative (Figma-exact): remove them; 阅读参数 opens by clicking the speed or font value in the top bar, 改字 only by double-clicking a sentence. Task 2 implements the default; switching is a two-line change to its item list and one test.

---

### Task 1: Reading column aligned to the top pill; 12px timer labels

**Files:**
- Modify: `src/engine/03-reader.js:57-66` (`applyStyle`)
- Modify: `ui-v3.css` polish-pass rules `.bar .times > span…` and `#tPct::before` / `.bar .times > #tPct::before` (the three `font-size: 10px` label declarations)
- Create: `tests/reader-controls.test.cjs`
- Modify: `tests/browser/editor-layout.js` (add a reader section)

**Interfaces:**
- Produces: `readerInset(): number` in `03-reader.js` — pixels from the stage edge to the top pill edge when `innerWidth >= 1200`, else 0. `applyStyle` sets `content.style.paddingInline = max(S.margin vw in px, readerInset()) + 'px'`.

- [ ] **Step 1: Write the failing jsdom tests** (`boot` with a stubbed `.topbar` `getBoundingClientRect` returning `{ left: 311, right: 1129, width: 818 }`, `innerWidth` 1440, stage `clientWidth` 1440):

```js
test('reading column lines up with the top pill on desktop', () => {
  // enter the reader, then: content padding-left === padding-right === '311px'
});
test('column padding is symmetric when mirrored', () => {
  // S.mirrorX = true → same two padding values
});
test('user margin wins when wider than the pill inset', () => {
  // S.margin = 30 (vw → 432px at 1440) → padding '432px'
});
test('timer labels are 12px secondary text', () => {
  // read ui-v3.css: the rule for `.bar .times > span…` and `#tPct::before` declares font-size: 12px and color: var(--muted)
});
```

- [ ] **Step 2: Run** `node --test tests/reader-controls.test.cjs` — Expected: FAIL (padding is `S.margin + 'vw'`; labels 10px).
- [ ] **Step 3: Implement** `readerInset()` and the padding rule; change the two 10px label declarations to 12px. Call `layout(true)` on `resize` already happens (`12-reader-input.js:86`).
- [ ] **Step 4: Run** `node --test tests/reader-controls.test.cjs && npm test` — Expected: all pass.
- [ ] **Step 5: Browser check** — add to `tests/browser/editor-layout.js` a `reader` block: enter the reader (`#start`), measure `.topbar` and the first `#content .s` line box; failure if `|line.left - pill.left| > 1`. Run at 1440×900; record in `docs/superpowers/plans/2026-11-01-v3-reader-controls.verify.md`.
- [ ] **Step 6: Stamp and commit** `feat(reader): align the reading column with the top pill; 12px timer labels`.

---

### Task 2: "更多" menu grouped, no duplicates, checkmarks and shortcuts

**Files:**
- Modify: `ui-v3.js:388-427` (reader options popover), remove `compactReader` (`:398-407`)
- Modify: `ui-v3.css:187-188` (`.reader-options`)
- Test: `tests/reader-controls.test.cjs`

**Interfaces:**
- Produces in `ui-v3.js`: `openReaderMenu(): void`, `closeReaderOptions(returnFocus?: boolean): void` (existing name, gains the flag), `syncReaderMenu(): void` (sets `aria-checked` on the mirror items from `api.settings.mirrorX/mirrorY`). `#readerOptions` gets `role="menu"`; items are the existing buttons `#pMx`, `#pMy` (`role="menuitemcheckbox"`), `#pPip`, `#pRemote`, `#pFs`, then (default decision) `#readerParameters`, `#pEdit` (`role="menuitem"`), separated by `<hr role="separator">`. Each item: icon, label, and a `<kbd class="menu-key">` for M / V / F.

Item labels (exact): 水平镜像 (M), 垂直镜像 (V) — separator — 打开置顶小窗, 连接遥控器, 全屏 (F) — separator — 阅读参数, 改字.

- [ ] **Step 1: Write the failing tests**

```js
test('more menu holds only the agreed items, in groups', () => {
  // open #readerMore; menu items' accessible names in order equal the list above;
  // no #pVoice, #pCam, #nParaUp, #nSecUp, #pMark, #pList inside #readerOptions; two separators
});
test('vertical mirror toggles, shows a check, closes the menu, and stays checked', () => {
  // click #pMy in the menu → api.settings.mirrorY true, #pMy aria-checked 'true', menu hidden;
  // reopen → still 'true'; #pMy has no aria-pressed
});
test('menu shows shortcuts M, V and F', () => {});
test('menu opens below the pill, right-aligned, and works from the keyboard', () => {
  // stub .topbar rect; menu style top = pill bottom + 8, right edge = pill right;
  // ArrowDown/ArrowUp/Home/End move focus among items; Escape closes and focuses #readerMore
});
test('tablet menu contains no voice or camera', () => {
  // boot with media (max-width:1199px) true → #pVoice and #pCam are inside .topbar, not #readerOptions
});
```

- [ ] **Step 2: Run** — Expected: FAIL (menu has 阅读参数 first, voice/cam on tablet, no roles).
- [ ] **Step 3: Implement**: build the menu once at init in the order above; `openReaderMenu` positions it from `.topbar.getBoundingClientRect()` and focuses the first item; mirror items call the engine's existing click handlers then `syncReaderMenu()` and close; Escape and outside click close; delete `compactReader` and its `tablet` listener. Labels via `aria-label` + visible text.
- [ ] **Step 4: Run** `node --test tests/reader-controls.test.cjs && npm test` — Expected: all pass (update `reader parameters have an explicit close action…` only if it relied on 阅读参数 being the first item).
- [ ] **Step 5: Browser check** — menu rect is below the pill (`menu.top >= pill.bottom + 7`) and does not intersect it; record.
- [ ] **Step 6: Stamp and commit** `feat(reader): group the more menu with checks and shortcuts, no duplicates`.

---

### Task 3: One rotate-ccw retake icon

**Files:** `index.html:347` (sprite), `index.html:462` (`#pRetake`), `ui-v3.js:436` (remote icon map); test in `tests/reader-controls.test.cjs`.

**Interfaces:** new sprite symbol `#i-rotate-ccw` with Lucide rotate-ccw geometry (`M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8` and `M3 3v5h5`). `#i-retake` stays for 回到开头.

- [ ] **Step 1: Test** `retake uses the same rotate-ccw icon in the reader and the phone remote`: `#pRetake use` href `#i-rotate-ccw`; remote `[data-c="retake"] use` href `#i-rotate-ccw`; remote `[data-c="home"]` does not.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run all** — pass. **Step 5: Stamp, commit** `feat(reader): rotate-ccw for retake in the reader and the remote`.

---

### Task 4: Start hint near the reading line, never over the bars

**Files:** `src/engine/03-reader.js:158-161` (`placeOverlays`), `ui-v3.css:184,224` (`#hint`); tests in `tests/reader-controls.test.cjs` and the browser check.

**Interfaces:** `placeOverlays()` sets `#hint` `top` instead of `bottom`: below the reading line (`guideY + lhPx / 2 + 24`); if that box would reach the bottom bar's top minus 12px, it goes above the line (`guideY - lhPx / 2 - 24 - hintHeight`). `#hint` CSS drops its fixed `bottom`.

- [ ] **Step 1: Tests** `hint sits just below the reading line` and `hint flips above a low reading line` (S.guide 80, bottombar top stubbed so below would overlap) — assert `style.top` values.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run all.**
- [ ] **Step 5: Browser check** — in the reader before playing, `#hint` rect intersects neither `.topbar` nor `.bottombar`; record.
- [ ] **Step 6: Stamp, commit** `fix(reader): place the start hint at the reading line, clear of both bars`.

---

### Task 5: Bars hide smoothly, not while in use

**Files:** `src/engine/07-controls.js` (`poke`), `ui-v3.js` (expose `barsBusy`), `ui-v3.css` / `index.html:167-169` (idle styles); tests in `tests/reader-controls.test.cjs`.

**Interfaces:** v3 API `barsBusy(): boolean` — true when the reader menu is open or `document.activeElement` is inside `.bar`. `poke()` hides only when `state === 'playing' && panel.hidden && !v3?.barsBusy?.()`. Focus leaving a bar (`focusout` on `#prompter .bar`) calls `api.poke()`.

CSS: `.bar { transition: opacity 200ms var(--ease), translate 200ms var(--ease); }`, `#prompter.idle .bar { transition-duration: 240ms; }`, idle translate `0 -8px` (top) / `0 8px` (bottom) instead of ±30%.

- [ ] **Step 1: Tests** (fake timers via `mock.timers` from node:test): `bars hide after 2.5s of playing`; `bars stay while the menu is open`; `bars stay while focus is inside` then hide 2.5s after focus leaves; `idle styles move 8px with the shared curve` (read CSS text).
- [ ] **Step 2: Run** — FAIL on the busy cases and CSS. **Step 3: Implement.** **Step 4: Run all.**
- [ ] **Step 5: Stamp, sync, tick tasks 3.1–3.4 in `openspec/changes/v3-design-parity/tasks.md`, validate, commit** `feat(reader): bars fade 240ms and stay while the menu or focus is on them`.
