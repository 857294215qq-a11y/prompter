# V3 Editor Behaviour (Task Group 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the editor's format tools, cue menu, cue editing, start buttons, sidebar toggles and page hierarchy behave as the V3 revision copy and the `editor-actions` / `editor-workspace` spec deltas require.

**Architecture:** All presentation logic stays in `ui-v3.js` (it owns the rich editor, its source mapping and the undo history these features need); new static markup goes in `index.html`, styles in `ui-v3.css`. The engine changes only where it binds the start actions (`src/engine/02-editor.js`, `src/engine/12-reader-input.js`). Layout geometry that jsdom cannot measure is checked by one in-page script run in the built-in browser at 1440×900.

**Tech Stack:** Vanilla JS classic scripts, CSS, jsdom 26 + node:test, Capacitor 7.

**Spec:** `openspec/changes/v3-design-parity/specs/editor-actions/spec.md`, `openspec/changes/v3-design-parity/specs/editor-workspace/spec.md`, decisions 2–4 in `openspec/changes/v3-design-parity/design.md`. Figma copy (file `oa1czDyPOMjSdkSerE3bNW`, page 2164:75): cue menu 2173:1241, cue editor 2173:1462, both sidebars collapsed 2168:1078, right collapsed 2168:859.

## Global Constraints

- Easing everywhere: `cubic-bezier(.32,.72,0,1)`; this group adds no new motion (group 5 owns motion).
- Icon-first: every control that had an icon keeps it; new icon controls get an icon plus an `aria-label`; text is added only where the design shows text.
- No tool inserts placeholder text into the script. Every edit goes through `replaceSelectionAtBuffer` (or one `api.ta.value` write followed by one `input` event) so it makes exactly one undo step.
- Cue text: 1–12 characters (the parser's `\[[^\]\n]{1,12}\]` limit); characters `[ ] 【 】` and line breaks are stripped from user-typed cue text.
- "Unavailable" controls use `aria-disabled="true"` (not `disabled`) so they stay focusable and their explanation stays reachable; their click handlers return without acting.
- After changing `index.html`, `sw.js`, any local script or stylesheet, run `npm run stamp` before committing. New files under `assets/v3/` are added to `ASSETS` in `sw.js`.
- Storage format, transports and pairing are unchanged.

## Review Focus

1. Cue editing on a `【…】` cue — the edit must keep the full-width brackets, not convert to `[…]`. (Task 3 test `editing a full-width cue keeps its brackets`.)
2. Emphasis toggle when the selection spans the `**` markers themselves (selected from the rich editor's `<strong>` edges) — must still count as "inside" and remove, not double-wrap. (Task 1 test `emphasis removes markers when the selection covers the whole strong text`.)
3. ⌘/Ctrl+Enter right after switching documents (no valid caret) — must not start and must say why; previously it silently started from the top. (Task 4 test `shortcut without a valid caret explains and does not start`.)
4. Custom cue text that contains `]` or is pasted with a line break — must not break the markup. (Task 2 test `custom cue strips brackets and line breaks and caps at 12`.)
5. Phone and tablet widths — the fixed toggle slots apply at ≥1200px only; below that the existing sheet toggles must keep working. (Task 5 test `toggles keep sheet behaviour below 1200px` plus the existing focus-mode test.)

## File Structure

- `ui-v3.js` — format tool state, cue menu, cue editor, start actions, toggle icons/labels (Tasks 1–5).
- `index.html` — markup for `#cueMenu`, `#cueEditor`, `#startCaret`; remove `#startPosition`; toggle labels; gear icon; visible duration hint (Tasks 2–6).
- `ui-v3.css` — pressed/disabled tool states, popovers, toggle slots, heading size, empty-line gap (Tasks 1–6).
- `src/engine/02-editor.js`, `src/engine/12-reader-input.js` — start bindings (Task 4).
- `assets/v3/panel-left-open.svg`, `assets/v3/panel-right-open.svg`, `assets/v3/settings.svg`, `assets/v3/trash-2.svg` — new icons (Tasks 3, 5, 6).
- `tests/editor-actions.test.cjs` — new jsdom tests for Tasks 1–4, 6.
- `tests/browser/editor-layout.js` — in-page geometry check for Tasks 5–6.
- `tests/engine-split.test.cjs` — retire the byte-for-byte test (Task 4).

Icon SVGs follow the existing export format (`viewBox="0 0 20 20"`, `stroke="#1D1D1F"`, `stroke-width="2"`, round caps/joins): Lucide geometry scaled by 20/24. Export from the Figma instances where they exist (`icon / panel-left-open` 2168:1207, `icon / settings` 2168:1132, the trash icon in 2173:1462); `panel-right-open` is `panel-left-open` mirrored (`transform="matrix(-1 0 0 1 20 0)"` on the group).

---

### Task 1: Format tool state (section pressed, emphasis selection-only and toggling)

**Files:**
- Modify: `ui-v3.js:255` (pointerdown), `ui-v3.js:292-304` (format click handler)
- Modify: `ui-v3.css` (pressed / aria-disabled tool styles)
- Modify: `index.html:386-388` (help copy)
- Create: `tests/editor-actions.test.cjs`

**Interfaces:**
- Consumes: `boot()` from `tests/helpers/boot.cjs`; `replaceSelectionAtBuffer(value)`, `caret()`, `readRich()` in `ui-v3.js`.
- Produces: `syncFormatState(): void` in `ui-v3.js`, called from `caret()`, `richInput()` and after every format action — sets `aria-pressed` on `[data-format="section"]` and `[data-format="emphasis"]`, `aria-disabled` on `[data-format="emphasis"]`. `emphasisRange(start, end): {start, end} | null` — source range of the `**…**` run that contains the selection, or null.

Test helper used by every task in this file (define once at the top):

```js
const { boot } = require('./helpers/boot.cjs');
// Put the rich editor's selection on line `i`, characters a..b, and let ui-v3 read it.
function select(app, i, a, b = a) {
  const rich = app.$('#richEditor'), line = rich.children[i];
  const walker = app.w.document.createTreeWalker(line, app.w.NodeFilter.SHOW_TEXT);
  const nodes = []; let n; while ((n = walker.nextNode())) nodes.push(n);
  const at = (k) => { for (const t of nodes) { if (k <= t.length) return [t, k]; k -= t.length; } return [nodes.at(-1), nodes.at(-1).length]; };
  app.w.getSelection().setBaseAndExtent(...at(a), ...at(b));
  rich.dispatchEvent(new app.w.MouseEvent('mouseup'));
}
const source = (app) => app.$('#ta').value;
const submit = (app, id) => app.$(id).dispatchEvent(new app.w.Event('submit', { cancelable: true }));
const DOC = { library: [{ id: 'a', text: '# 开场\n大家好欢迎回来。\n**重点句**之后', updated: 1 }], current: 'a' };
const CUES = { library: [{ id: 'c', text: '开场[停顿]正文\n结尾【微笑】好', updated: 1 }], current: 'c' };
```

- [ ] **Step 1: Write the failing tests**

```js
test('section tool is pressed on a heading line and not on body text', () => {
  const app = boot(DOC);
  select(app, 0, 1); assert.equal(app.$('[data-format="section"]').getAttribute('aria-pressed'), 'true');
  select(app, 1, 1); assert.equal(app.$('[data-format="section"]').getAttribute('aria-pressed'), 'false');
  app.close();
});

test('emphasis is unavailable without a selection and clicking it changes nothing', () => {
  const app = boot(DOC); select(app, 1, 2);
  const b = app.$('[data-format="emphasis"]'), before = source(app);
  assert.equal(b.getAttribute('aria-disabled'), 'true');
  b.click(); assert.equal(source(app), before);
  assert.equal(app.$('#undoEdit').disabled, true, 'no undo step was made');
  app.close();
});

test('emphasis wraps a selection, then removes it, without changing the words', () => {
  const app = boot(DOC); select(app, 1, 0, 3);
  assert.equal(app.$('[data-format="emphasis"]').getAttribute('aria-disabled'), 'false');
  app.click('[data-format="emphasis"]');
  assert.equal(source(app), '# 开场\n**大家好**欢迎回来。\n**重点句**之后');
  select(app, 1, 0, 3); // the <strong> text
  assert.equal(app.$('[data-format="emphasis"]').getAttribute('aria-pressed'), 'true');
  app.click('[data-format="emphasis"]');
  assert.equal(source(app), '# 开场\n大家好欢迎回来。\n**重点句**之后');
  app.close();
});

test('emphasis removes markers when the selection covers the whole strong text', () => {
  const app = boot(DOC); select(app, 2, 0, 3); // exactly 重点句
  app.click('[data-format="emphasis"]');
  assert.equal(source(app), '# 开场\n大家好欢迎回来。\n重点句之后');
  app.close();
});

test('each format action is one undo step', () => {
  const app = boot(DOC), original = source(app);
  select(app, 1, 0, 3); app.click('[data-format="emphasis"]');
  app.click('#undoEdit'); assert.equal(source(app), original); assert.equal(app.$('#undoEdit').disabled, true);
  select(app, 1, 1); app.click('[data-format="section"]');
  app.click('#undoEdit'); assert.equal(source(app), original);
  app.close();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/editor-actions.test.cjs`
Expected: FAIL — `aria-pressed` is null, emphasis inserts `**重点**`.

- [ ] **Step 3: Implement `syncFormatState()` and `emphasisRange()` in `ui-v3.js`; change the emphasis branch of the format handler**

Emphasis: if `aria-disabled` is `"true"` return; if `emphasisRange()` returns a range, replace it with its inner text; otherwise wrap the selection. `emphasisRange` looks only within the selection's source line: a match of `/\*\*[^\n]*?\*\*/g` whose inner span contains `[start, end]` (inner bounds inclusive) or whose full span equals `[start, end]`. Cue branch is left as is (Task 2 replaces it). Remove the `'重点'` and `'停顿'` fallbacks.

CSS: `.format-tools [aria-pressed="true"] { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }` with the icon tinted to the accent (filter or mask, matching how `.v3-icon` is coloured elsewhere); `.format-tools [aria-disabled="true"] { opacity: .4; cursor: default; }`.

Help copy (`index.html`): section `切换当前行的小节标题与正文。`; emphasis `为选中文字添加或取消重点；没有选中文字时不可用。`; cue `在光标处插入停顿等提示，提示不计入朗读字数。`

- [ ] **Step 4: Run to verify they pass, then the suite**

Run: `node --test tests/editor-actions.test.cjs && npm test`
Expected: all pass. If `the section tool can turn a heading back…` in `tests/ui.test.cjs` fails, fix the code, not the test.

- [ ] **Step 5: Stamp and commit**

```bash
npm run stamp
git add ui-v3.js ui-v3.css index.html sw.js tests/editor-actions.test.cjs
git commit -m "feat(editor): section shows its state, emphasis works on selections only and toggles"
```

---

### Task 2: Cue menu (presets and custom cue)

**Files:**
- Modify: `index.html` (add `#cueMenu` after the format help paragraphs; `data-format="cue"` gets `aria-haspopup="menu"`, `aria-controls="cueMenu"`, `aria-expanded="false"`)
- Modify: `ui-v3.js` (cue branch of the format handler; menu keyboard; document click closes it)
- Modify: `ui-v3.css`
- Test: `tests/editor-actions.test.cjs`

**Interfaces:**
- Consumes: `replaceSelectionAtBuffer`, `syncFormatState` (Task 1).
- Produces: `openCueMenu(): void`, `closeCueMenu(returnFocus: boolean): void`, `insertCue(text: string): boolean` (returns false and changes nothing when the cleaned text is empty). `cleanCue(text: string): string` — strips `[]【】` and `\r\n`, trims, keeps the first 12 characters.

Markup (exact copy, from 2173:1241):

```html
<div id="cueMenu" class="popover cue-menu" role="menu" aria-label="插入提示" hidden>
  <p class="menu-heading">插入到光标处</p>
  <button type="button" role="menuitem" data-cue="停顿">停顿</button>
  <button type="button" role="menuitem" data-cue="换气">换气</button>
  <button type="button" role="menuitem" data-cue="看镜头">看镜头</button>
  <button type="button" role="menuitem" data-cue="放慢">放慢</button>
  <button type="button" role="menuitem" data-cue="加重">加重</button>
  <hr role="separator">
  <button type="button" role="menuitem" id="cueCustom">自定义提示…</button>
  <form id="cueCustomForm" class="cue-custom" hidden><label class="vh" for="cueCustomInput">自定义提示</label><input id="cueCustomInput" maxlength="12" autocomplete="off" placeholder="最多 12 个字"></form>
</div>
```

- [ ] **Step 1: Write the failing tests**

```js
test('cue menu inserts the chosen cue at the caret', () => {
  const app = boot(DOC); select(app, 1, 3);
  app.click('[data-format="cue"]');
  assert.equal(app.$('#cueMenu').hidden, false);
  assert.equal(app.$('[data-format="cue"]').getAttribute('aria-expanded'), 'true');
  app.click('#cueMenu [data-cue="换气"]');
  assert.equal(source(app), '# 开场\n大家好[换气]欢迎回来。\n**重点句**之后');
  assert.equal(app.$('#cueMenu').hidden, true);
  app.close();
});

test('with a selection the cue goes after it and the selected words stay', () => {
  const app = boot(DOC); select(app, 1, 0, 3);
  app.click('[data-format="cue"]'); app.click('#cueMenu [data-cue="停顿"]');
  assert.equal(source(app), '# 开场\n大家好[停顿]欢迎回来。\n**重点句**之后');
  app.close();
});

test('cue menu works from the keyboard and Escape returns focus to the tool', () => {
  const app = boot(DOC); select(app, 1, 3);
  const tool = app.$('[data-format="cue"]'); tool.focus(); tool.click();
  const key = (k) => app.w.document.activeElement.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  assert.equal(app.w.document.activeElement.dataset.cue, '停顿');
  key('ArrowDown'); assert.equal(app.w.document.activeElement.dataset.cue, '换气');
  key('End'); assert.equal(app.w.document.activeElement.id, 'cueCustom');
  key('Home'); key('Escape');
  assert.equal(app.$('#cueMenu').hidden, true); assert.equal(app.w.document.activeElement, tool);
  app.close();
});

test('custom cue strips brackets and line breaks and caps at 12', () => {
  const app = boot(DOC); select(app, 1, 3);
  app.click('[data-format="cue"]'); app.click('#cueCustom');
  const input = app.$('#cueCustomInput'); assert.equal(app.w.document.activeElement, input);
  assert.equal(input.maxLength, 12);
  input.value = '看]这\n里【一二三四五六七八九十'; submit(app, '#cueCustomForm');
  // brackets and the line break are stripped, leaving 13 characters; the first 12 are kept
  assert.equal(source(app), '# 开场\n大家好[看这里一二三四五六七八九]欢迎回来。\n**重点句**之后');
  assert.equal(app.$('#richEditor').children[1].querySelector('.editor-cue')?.textContent, '看这里一二三四五六七八九');
  app.close();
});

test('an empty custom cue inserts nothing', () => {
  const app = boot(DOC), before = source(app); select(app, 1, 3);
  app.click('[data-format="cue"]'); app.click('#cueCustom');
  app.$('#cueCustomInput').value = ' ] '; submit(app, '#cueCustomForm');
  assert.equal(source(app), before); assert.equal(app.$('#undoEdit').disabled, true);
  app.close();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/editor-actions.test.cjs`
Expected: FAIL — `#cueMenu` missing; cue tool still inserts `[停顿]`/wraps the selection.

- [ ] **Step 3: Implement the menu in `ui-v3.js`**

Opening remembers the source selection (`api.ta.selectionStart/End`) because focus leaves the editor; inserting collapses that saved selection to its end, then calls `replaceSelectionAtBuffer('[' + text + ']')`. Position the menu under the cue tool (8px gap), left-aligned to it, clamped to the viewport like `menu()` does. Keyboard: ArrowUp/ArrowDown wrap over menuitems, Home/End, Enter/Space activate (native button), Escape closes and focuses the tool; inside the custom input Escape closes the menu too. A click outside `#cueMenu` and the tool closes without inserting. Register Escape in the existing capture keydown handler (`ui-v3.js:481`) before the reader branches.

CSS: `.cue-menu` 220px wide, radius 12, rows 24px high, 13px text, heading 12px muted, `hr` 1px `color-mix(in srgb, var(--fg) 10%, transparent)`. (Group 6 restyles all popovers; keep this minimal.)

- [ ] **Step 4: Run tests, then the suite**

Run: `node --test tests/editor-actions.test.cjs && npm test`
Expected: all pass.

- [ ] **Step 5: Stamp and commit**

```bash
npm run stamp
git add index.html ui-v3.js ui-v3.css sw.js tests/editor-actions.test.cjs
git commit -m "feat(editor): insert cues from a preset menu or a custom cue of up to 12 characters"
```

---

### Task 3: Edit or delete an existing cue

**Files:**
- Create: `assets/v3/trash-2.svg`
- Modify: `index.html` (add `#cueEditor`), `ui-v3.js`, `ui-v3.css`, `sw.js` (`ASSETS` gains `./assets/v3/trash-2.svg`)
- Test: `tests/editor-actions.test.cjs`

**Interfaces:**
- Consumes: `cleanCue` (Task 2), `readRich`, `sourceCaret`, `renderRich`.
- Produces: `openCueEditor(cue: HTMLElement): void`, `closeCueEditor(): void`, `cueRange(cue: HTMLElement): {start: number, end: number, open: '[' | '【'}` — source range including both brackets.

Markup (from 2173:1462):

```html
<form id="cueEditor" class="popover cue-editor" aria-label="编辑提示" hidden>
  <label class="vh" for="cueEditInput">提示文字</label><input id="cueEditInput" maxlength="12" autocomplete="off">
  <button id="cueDelete" class="icon-btn danger" type="button" aria-label="删除提示"><img class="v3-icon" src="assets/v3/trash-2.svg" alt=""></button>
</form>
```

These tests boot `CUES` (defined in Task 1).

- [ ] **Step 1: Write the failing tests**

```js
const cueAt = (app, line) => app.$('#richEditor').children[line].querySelector('.editor-cue');

test('clicking a cue opens its editor with the cue text', () => {
  const app = boot(CUES); cueAt(app, 0).click();
  assert.equal(app.$('#cueEditor').hidden, false);
  assert.equal(app.$('#cueEditInput').value, '停顿'); assert.equal(app.w.document.activeElement, app.$('#cueEditInput'));
  app.close();
});

test('Enter replaces the cue text in one undo step', () => {
  const app = boot(CUES), original = source(app); cueAt(app, 0).click();
  app.$('#cueEditInput').value = '换气';
  submit(app, '#cueEditor');
  assert.equal(source(app), '开场[换气]正文\n结尾【微笑】好'); assert.equal(app.$('#cueEditor').hidden, true);
  app.click('#undoEdit'); assert.equal(source(app), original);
  app.close();
});

test('editing a full-width cue keeps its brackets', () => {
  const app = boot(CUES); cueAt(app, 1).click();
  app.$('#cueEditInput').value = '看镜头';
  submit(app, '#cueEditor');
  assert.equal(source(app), '开场[停顿]正文\n结尾【看镜头】好');
  app.close();
});

test('delete, or an emptied cue, removes the whole cue and leaves the words', () => {
  let app = boot(CUES); cueAt(app, 0).click(); app.click('#cueDelete');
  assert.equal(source(app), '开场正文\n结尾【微笑】好'); app.close();
  app = boot(CUES); cueAt(app, 0).click(); app.$('#cueEditInput').value = '';
  submit(app, '#cueEditor');
  assert.equal(source(app), '开场正文\n结尾【微笑】好'); app.close();
});

test('Escape closes the cue editor without changes', () => {
  const app = boot(CUES), before = source(app); cueAt(app, 0).click();
  app.$('#cueEditInput').value = '改了';
  app.$('#cueEditInput').dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(app.$('#cueEditor').hidden, true); assert.equal(source(app), before);
  app.close();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/editor-actions.test.cjs`
Expected: FAIL — `#cueEditor` missing.

- [ ] **Step 3: Implement in `ui-v3.js`**

A `click` listener on `rich` delegates to `.editor-cue`. `cueRange`: `readRich(text, 0, text, text.length)` on the cue's text node gives the inner span; the range is `[start - 1, end + 1]`, `open` from `cue.dataset.cue`. Submit: `cleanCue(value)` empty → remove range; otherwise replace range with `open + text + close`. Use `api.ta.setSelectionRange(range)` then `replaceSelectionAtBuffer(...)` so it is one undo step. Escape and closing return focus to the editor with the caret after the cue (`sourceCaret(range.end)`). The editor is positioned under the cue (8px), left-aligned, clamped to the viewport. Clicking outside closes without changes.

Icon: `trash-2.svg` exported from 2173:1462; `.danger .v3-icon` tinted red as in the design (`#ff3b30` light / `#ff453a` dark).

- [ ] **Step 4: Run tests, then the suite**

Run: `node --test tests/editor-actions.test.cjs && npm test`
Expected: all pass.

- [ ] **Step 5: Stamp and commit**

```bash
npm run stamp
git add assets/v3/trash-2.svg index.html ui-v3.js ui-v3.css sw.js tests/editor-actions.test.cjs
git commit -m "feat(editor): edit or delete an existing cue from a small popover"
```

---

### Task 4: Two start buttons

**Files:**
- Modify: `index.html:419` (replace the `.start-position` label/select with `#startCaret`), help shortcut copy at `ui-v3.js:363`
- Modify: `ui-v3.js:369-376` (start functions), `ui-v3.js:501` (shortcut), exported API at `ui-v3.js:519-521`
- Modify: `src/engine/02-editor.js:168`, `src/engine/12-reader-input.js:93`
- Modify: `tests/ui.test.cjs:329-344` (rewrite the start-position test), `tests/engine-split.test.cjs` (retire the byte test)
- Test: `tests/editor-actions.test.cjs`

**Interfaces:**
- Consumes: `api.enter(fromCaret: boolean)`; `caretDocument` in `ui-v3.js`.
- Produces: v3 API `startFromTop(): void` (always `api.enter(false)`), `startFromCaret(): boolean` (returns false and notifies when there is no valid caret), `syncStartActions(): void` (sets `aria-disabled` and `aria-describedby="startCaretHelp"` on `#startCaret`). `startFromSelection` is removed from the API.

Markup:

```html
<footer class="start-actions">
  <button id="startCaret" class="btn" type="button" aria-describedby="startCaretHelp">从光标处开始</button>
  <p id="startCaretHelp" class="vh">在正文里点一下放好光标后可用。快捷键 ⌘/Ctrl+Enter。</p>
  <button id="start" class="btn primary" type="button">开始提词</button>
</footer>
```

Rulings carried into this task:
- `#mobileStart` (phone and tablet footer) starts from the top — the revision copy shows one primary start action there.
- ⌘/Ctrl+Enter without a valid caret does not start; it shows the toast `当前稿件还没有光标位置，请先在正文里点一下。`.
- The byte-for-byte engine test guarded only the group-1 move; this task is the first intended engine change, so it is deleted together with `tests/fixtures/engine-8021127.txt` (git history keeps both).

- [ ] **Step 1: Write the failing tests**

```js
function startSpy(app) { const calls = []; app.w.testEngine.enter = (c) => calls.push(c); return calls; }

test('start from the top ignores the caret', () => {
  const app = boot(DOC), calls = startSpy(app); select(app, 1, 3);
  app.click('#start'); assert.deepEqual(calls, [false]);
  app.click('#mobileStart'); assert.deepEqual(calls, [false, false]);
  app.close();
});

test('start from the caret, by button or shortcut, starts once from the caret', () => {
  const app = boot(DOC), calls = startSpy(app); select(app, 1, 3);
  assert.equal(app.$('#startCaret').getAttribute('aria-disabled'), 'false');
  app.click('#startCaret'); assert.deepEqual(calls, [true]);
  const rich = app.$('#richEditor'); rich.focus();
  rich.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
  assert.deepEqual(calls, [true, true]);
  app.close();
});

test('start from the caret is unavailable after switching documents and says why', () => {
  const app = boot(), calls = startSpy(app);
  const b = app.$('#startCaret');
  assert.equal(b.getAttribute('aria-disabled'), 'true');
  assert.match(app.$('#' + b.getAttribute('aria-describedby')).textContent, /光标/);
  b.click(); assert.deepEqual(calls, []);
  app.close();
});

test('shortcut without a valid caret explains and does not start', () => {
  const app = boot(), calls = startSpy(app);
  app.w.document.body.dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
  assert.deepEqual(calls, []); assert.match(app.$('#uiToast').textContent, /光标/);
  app.close();
});

test('an old saved start position is ignored and no picker remains', () => {
  const app = boot({ startPosition: 'caret', ui: { startPosition: 'caret' } }), calls = startSpy(app);
  assert.equal(app.$('#startPosition'), null);
  app.click('#start'); assert.deepEqual(calls, [false]);
  app.close();
});
```

Rewrite `tests/ui.test.cjs` `start position routes…` to the two-button behaviour: keep its "caret from another document is rejected" part — select a caret in `first`, switch to `second`, click `#startCaret`: no `enter` call and `#startCaret` has `aria-disabled="true"`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/editor-actions.test.cjs`
Expected: FAIL — `#startCaret` missing.

- [ ] **Step 3: Implement**

`ui-v3.js`: `startFromTop`, `startFromCaret`, `syncStartActions` (called from `caret()`, `resetHistory()` and `refresh()`); `#startCaret` click calls `startFromCaret`; `#mobileStart` calls `startFromTop`; the capture keydown at `:501` calls `startFromCaret` (and no longer requires focus in the rich editor). Shortcut help line becomes `['Ctrl / ⌘ + Enter', '从光标处开始提词']`.
Engine: `02-editor.js:168` → `$('#start').addEventListener('click', () => v3 ? v3.startFromTop() : enter(false));`; `12-reader-input.js:93` → `v3 ? v3.startFromCaret() : enter(false)`.
CSS: `.start-actions [aria-disabled="true"] { opacity: .45; }`; remove `.start-position` rules.

- [ ] **Step 4: Run tests, then the suite**

Run: `node --test tests/editor-actions.test.cjs && npm test`
Expected: all pass, byte test gone, `engine-split` boot and gap tests still green.

- [ ] **Step 5: Stamp and commit**

```bash
npm run stamp
git rm tests/fixtures/engine-8021127.txt
git add -A index.html ui-v3.js ui-v3.css sw.js src/engine tests
git commit -m "feat(editor): start from the top or from the caret with two buttons"
```

---

### Task 5: Sidebar toggles in fixed slots

**Files:**
- Create: `assets/v3/panel-left-open.svg`, `assets/v3/panel-right-open.svg`; `tests/browser/editor-layout.js`
- Modify: `ui-v3.js:66-91` (`layout()`), `ui-v3.css:36,77,108,226-227` and the ≥1200px rules, `sw.js` (`ASSETS`)
- Test: `tests/editor-actions.test.cjs`

**Interfaces:**
- Consumes: `layout()`, `ui.left`, `ui.right`, `small`, `tablet`.
- Produces: `toggleState(side: 'left' | 'right', open: boolean): void` in `ui-v3.js` — sets the icon `src`, `aria-label` and `title`. Labels: left `收起稿件栏` / `展开稿件栏`; right `收起提词参数` / `展开提词参数`. `tests/browser/editor-layout.js` evaluates to `async () => ({ combos: [...], failures: string[] })`.

Geometry (≥1200px, from 2168:1078 / 2168:859, Web variant per design decision 4): both toggles 36×36; left `left: 8px`, right `right: 16px`; vertical centre equal to the format tool pill's centre (one CSS custom property `--tool-row-top` sets both the toolbar's top padding and the toggles' `top`). When the library is open, the library heading leaves room for the toggle (heading starts below the slot, 2168:859 heading at y=49). When the library is collapsed, the toolbar's left padding is slot right edge + 8px (`52px`); when the settings panel is collapsed, the toolbar's right padding is `16 + 36 + 8 = 60px`.

- [ ] **Step 1: Write the failing jsdom tests**

```js
test('toggle icons and names follow the sidebar state', () => {
  const app = boot();
  const check = (id, icon, label) => {
    assert.match(app.$('#' + id + ' img').getAttribute('src'), new RegExp(icon + '\\.svg$'));
    assert.equal(app.$('#' + id).getAttribute('aria-label'), label);
  };
  check('toggleLibrary', 'panel-left-close', '收起稿件栏'); check('toggleSettings', 'panel-right-close', '收起提词参数');
  app.click('#toggleLibrary'); check('toggleLibrary', 'panel-left-open', '展开稿件栏');
  app.click('#toggleSettings'); check('toggleSettings', 'panel-right-open', '展开提词参数');
  app.click('#focusEditor'); app.click('#focusEditor'); // focus round trip restores both collapsed
  check('toggleLibrary', 'panel-left-open', '展开稿件栏');
  app.close();
});

test('toggles keep sheet behaviour below 1200px', () => {
  const app = boot({}, { media: (q) => /max-width/.test(q) }); // phone: every max-width query matches
  app.click('#toggleSettings');
  assert.equal(app.$('#sheetBackdrop').hidden, false);
  assert.match(app.$('#toggleSettings img').getAttribute('src'), /settings2\.svg$/);
  assert.equal(app.$('#toggleSettings').getAttribute('aria-label'), '提词参数');
  app.close();
});
```

`boot()` gains a `media` option in Step 3: `boot(saved, { media: (query) => boolean })` installs `w.matchMedia` answering `matches: media(query)` before any script runs (default: always false, as today).

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/editor-actions.test.cjs`
Expected: FAIL — labels are `稿件侧栏`/`提词参数`, icon never changes.

- [ ] **Step 3: Implement**

`toggleState` called from `layout()`; on `small` the right toggle keeps `settings2` (phone opens reader parameters as a sheet) and its label stays `提词参数`. Add the `media` option to `tests/helpers/boot.cjs`. Export the two icons (see File Structure). CSS for the slots and toolbar padding as specified above, inside `@media (min-width: 1200px)`.

Write `tests/browser/editor-layout.js`: for each of the four combinations plus a focus round trip, set the state by clicking the real toggles, then measure `getBoundingClientRect()` of `#toggleLibrary`, `#toggleSettings`, `.format-tools`, `.toolbar-trailing`, `#documentTitle`, `.library-heading`, `.settings-heading`. Push a failure when: a toggle's rect differs from its first-combo rect by more than 0.5px or is not 36×36; `|toggle centreY − format pill centreY| > 1`; any toggle rect intersects a toolbar pill or a heading/title rect.

- [ ] **Step 4: Run tests, then the browser check**

Run: `node --test tests/editor-actions.test.cjs && npm test`
Expected: all pass.
Then in the built-in browser (`preview_start` name `prompter-v3-parity`, `resize_window` 1440×900, reload, then `javascript_tool` evaluating the file's function and awaiting it).
Expected: `failures` is `[]`. Record the report in `docs/superpowers/plans/2026-10-31-v3-editor-behaviour.verify.md`. Reset the viewport with preset `desktop`.

- [ ] **Step 5: Stamp and commit**

```bash
npm run stamp
git add assets/v3 index.html ui-v3.js ui-v3.css sw.js tests docs/superpowers/plans/2026-10-31-v3-editor-behaviour.verify.md
git commit -m "feat(editor): sidebar toggles sit in fixed slots and show open or close icons"
```

---

### Task 6: Editor hierarchy, duration note, gear icon

**Files:**
- Create: `assets/v3/settings.svg`
- Modify: `index.html:382` (`#appSettings` icon → `settings.svg`), `index.html:404` (`#durHint` visible), `ui-v3.css:64-66,270-275`, `sw.js` (`ASSETS`)
- Modify: `tests/browser/editor-layout.js` (add font checks)
- Test: `tests/editor-actions.test.cjs`

**Interfaces:**
- Consumes: engine `#dur` change handler (`02-editor.js:149`), `#cpmOut`.
- Produces: nothing new for later tasks.

Values: desktop body 17px → section heading 20px, weight 600; phone body 18px → section heading 21px. An empty source line renders as a 16px gap (2168:1078 `段落间距` 16); runs of empty lines are not collapsed in the source. Duration note text (from 2173:1241): `改目标时长会按字数自动换算语速。`, class `tip`, not `.vh`. Phone format tools keep their icons (remove `.format-tools .v3-icon { display: none; }` at `ui-v3.css:274`).

- [ ] **Step 1: Write the failing tests**

```js
test('target duration explains that it recalculates speed, and changing it does', () => {
  const app = boot(DOC);
  const hint = app.$('#durHint');
  assert.equal(hint.classList.contains('vh'), false); assert.equal(hint.textContent, '改目标时长会按字数自动换算语速。');
  const before = app.$('#cpmOut').textContent;
  app.$('#dur').value = '00:05'; app.$('#dur').dispatchEvent(new app.w.Event('change', { bubbles: true }));
  assert.notEqual(app.$('#cpmOut').textContent, before);
  app.close();
});

test('app settings uses the gear icon, reader parameters keep the sliders icon', () => {
  const app = boot();
  assert.match(app.$('#appSettings img').getAttribute('src'), /settings\.svg$/);
  assert.match(app.$('#readerParameters img').getAttribute('src'), /settings2\.svg$/);
  app.close();
});
```

Browser check additions in `tests/browser/editor-layout.js`: computed `font-size` of `.editor-section` is `20px` and of `.editor-line:not(.editor-section)` is `17px`; an empty `.editor-line` is 16px tall.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/editor-actions.test.cjs`
Expected: FAIL on the hint class and the icon path.

- [ ] **Step 3: Implement** the markup, CSS values and icon above.

- [ ] **Step 4: Run tests, then the browser check**

Run: `node --test tests/editor-actions.test.cjs && npm test`, then the browser check as in Task 5.
Expected: all pass; `failures` is `[]`; record in the verify file.

- [ ] **Step 5: Stamp, sync, update OpenSpec, commit**

```bash
npm run stamp && npm run sync
```
Expected: `Sync finished`. Tick 2.1–2.5 in `openspec/changes/v3-design-parity/tasks.md`; `npx openspec validate v3-design-parity --strict` reports valid.

```bash
git add assets/v3 index.html ui-v3.css sw.js tests openspec docs
git commit -m "feat(editor): larger section headings, visible duration note and a gear for app settings"
```
