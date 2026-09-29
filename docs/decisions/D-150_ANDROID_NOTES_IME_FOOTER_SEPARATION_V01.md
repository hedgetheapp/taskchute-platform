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
- Galaxy S23: `PASS / USER_CONFIRMED`（corrective representative smoke）
- Persistent nonprod: `NOT_REQUIRED`; Production: `NOT_RUN`; Released: `NO`

## Corrective — Markdown toolbar / IME adjacency

Product OwnerのGalaxy S23確認で、初回実装後も`Scaffold`が`bottomBar`の高さをcontent paddingとして予約し続け、Markdown toolbarがIME上端よりfooter相当分高く残ることが判明した。Notes editorが開いていてIMEがvisibleな場合だけ`Scaffold.bottomBar`へcontentを渡さず、footerの計測自体を除去する。editor側の`imePadding()`は単一のIME回避ownerとして保持し、負のoffset、translation、固定高さ補正、Activity/window inset変更は行わない。`MarkdownLiveEditor.kt`は変更しない。

- Corrective implementation: `a5e01f3ef0c1dd791dbc595bc63276b67a923ac8`
- `shouldShowNotesNavigationBar(editorOpen, imeVisible)`の4状態focused JVM: `1 / 1 PASS`
- `TaskChute_API33` focused Notes instrumentation: `4 / 4 PASS`
- Exact-SHA CI `36569749556` PASS、APK `taskchute-android-debug-a5e01f3ef0c1dd791dbc595bc63276b67a923ac8`、artifact ID `11033721498`、expires `2026-10-06T12:44:07Z`
- 実IMEのtoolbar隣接pixel geometryはCompose runnerがIMEを開けないため自動では未直接測定。Product Ownerがcorrective APKをGalaxy S23で確認し「オケ問題なし」と報告したため、toolbar / IME adjacencyとfooter復帰のrepresentative device smokeを`PASS / USER_CONFIRMED`とする。full device matrix / pixel-perfect measurementではない。
