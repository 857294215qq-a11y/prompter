# Prompter V3 implementation

**Goal:** Apply the approved Figma V3 to the existing Web/PWA and Android application. Native Mac and Windows projects are deferred by the user.

**Source:** Figma oa1czDyPOMjSdkSerE3bNW, pages 00–04. Existing design handoff and live design context take precedence over old screenshots.

**Architecture:** Keep the existing HTML/CSS/JavaScript application, Capacitor bridge, storage keys, and transport protocols. Introduce local V3 CSS and a small UI controller rather than replace the working engine or add a frontend framework. Use exported design assets. Browser windows keep their actual system controls.

## Scope and constraints

- Update editing, document navigation, parameter tabs, reader, remote controls, settings and mobile/tablet layouts.
- Preserve playback, caret start, section pause, bookmarks, mirrors, voice recognition, camera clips, picture-in-picture and the existing three pairing transports.
- Preserve saved documents and settings; import must not overwrite the open document.
- Connection and save labels reflect actual state, never Figma demonstration values.
- Keep appearance separate from reader text/background settings.
- Include new files in both Android's www bundle and the PWA offline cache.
- No desktop wrapper or fake system window buttons.

## Review focus

- Existing saved libraries and bookmark ownership survive switching documents.
- Destructive actions require explicit UI confirmation and preserve a valid current document.
- Mobile sheets restore focus and all controls remain reachable in short landscape viewports.
- A disconnected/locked remote cannot dispatch transport commands.
- New styles, scripts and icons are packaged and available offline.

## Execution

- [x] Add meaningful DOM regression tests and observe the V3 workflow tests fail against the baseline.
- [x] Implement the editor and navigation; connect actual document actions and persistent appearance/layout state.
- [x] Apply reader/remote designs; retain protocols and platform capability checks.
- [x] Update PWA caching and Android packaging; run tests, web build and Capacitor sync.
- [x] Verify the app in the in-app browser at desktop, tablet and phone widths; compare against Figma and fix defects.
- [x] Review the final diff, commit, push the feature branch, and create a reviewable PR (GitHub PR #1).

## Verification

Node's built-in test runner with jsdom executes the real application scripts against persisted legacy documents. Browser checks cover real rendering, editing, tabs, focus, playback, sheets and settings. Android native hardware and actual two-device camera/voice/network behavior require device testing; report that boundary.

Independent final review: two findings (root-level paste range; reader tab key propagation). Both reproduced by regression tests before correction. A final compatibility check also covered PiP external styles; full suite 22/22 after the fix pass. No deferred reviewer findings. Platform font fallback and real document content are deliberate differences from Figma examples.
