# D-150 — Android Notes IME footer separation v0.1

Status: **Approved / Implemented / Integrated**

Date: 2026-09-29

## Decision

Android Notesのstandalone editorで本文にfocusしてIMEを表示しても、共通のAndroid footerをIME上へ持ち上げない。Notes固有の`Scaffold.bottomBar`ではIME insetを適用せず、footerは通常のbottom bar位置に留める。

本文editor自身の`imePadding()`と、D-135のMarkdown live preview / 6-action toolbarは維持する。Task Primary Note bottom sheetの既存insetも変更しない。

## Boundary

Today / Daily / Settingsを含む共有`AndroidNavigationBar`、Activity / manifest / window inset policy、Notesのautosave / CAS / conflict / safe flush、Markdown source authority、Worker/API、schema、migration、dependency、Web、persistent nonprod、Production、Releaseは変更しない。

## Evidence

- Implementation: `cde59c0ee2fa170298b86cf518d761e1ba52c934`
- Focused `TaskChute_API33` Notes instrumentation: D-150 footer/body-focus test、Markdown toolbar test、safe-flush、Project Primary代表ケースの選択`4 / 4 PASS`
- `:app:compileDebugKotlin`、`:app:compileDebugAndroidTestKotlin`、`:app:assembleDebug`、`git diff --check`: PASS
- MainActivity/UI-tree smoke: PASS。target app crash buffer: empty
- 実IMEのpixel geometryはCompose instrumentation runnerがIME insetを開かないため直接assertしていない（`NOT_VERIFIED / TEST_HARNESS_LIMITATION`）。
- Exact-SHA CI `36566735084` PASS、signed APK `taskchute-android-debug-cde59c0ee2fa170298b86cf518d761e1ba52c934`、artifact ID `11032391422`、expires `2026-10-06T12:16:13Z`。
- Galaxy S23: `NOT_VERIFIED / PRODUCT_OWNER_MANUAL`
- Persistent nonprod: `NOT_REQUIRED`; Production: `NOT_RUN`; Released: `NO`
