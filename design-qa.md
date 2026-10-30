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

`npm test`: 21 passing tests covering legacy documents, switching/search, tabs, rename, deletion confirmation, focus restoration, independent appearance, playback/return, packaging, rich-text source fidelity, bookmark ownership, mobile entry points, remote locking/disconnection, reader parameters, newlines, section toggling, import preservation, select-all paste, tab keyboard handling and clip preview.

`npm run sync`: web build and Capacitor Android resource synchronization pass. `git diff --check` and JavaScript syntax checks pass.

In-app browser: page identity, nonblank content, no relevant console warnings/errors, editing/newline/undo, new/delete document, mobile sheet, tabs, countdown, reader parameters and return paths inspected. A real two-device pairing session, device microphone/camera capture and signed APK installation are not asserted by these checks. The PR workflow compiles a debug APK separately.

## Intentional boundaries

No Mac/Windows wrapper, fake OS controls, cloud backend, or fabricated bidirectional document-sync/conflict state. Full physical-device network, voice and video testing remains an acceptance step. These are stated capability/test boundaries rather than simulated success states.

final result: passed
