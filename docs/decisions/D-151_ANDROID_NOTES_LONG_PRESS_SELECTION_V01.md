# D-151 — Android Notes Long-Press Selection v0.1

Status: **Approved / Implemented / Integrated / focused PASS / Notes AVD focused PASS / Galaxy S23 PASS / USER_CONFIRMED / Production NOT_RUN / Released NO**

Date: 2026-09-29

## Decision

Android NotesのStandalone Note Selection Mode開始を、D-146の左→右スワイプからCompose標準の長押しへ変更する。長押ししたStandalone Noteを即時selectedとし、Selection Mode中はStandalone rowのtapで選択/解除する。最後の1件を解除した時点でSelection Modeを終了する。

D-151はD-146のうち、Notes Selection Modeの開始gestureとselected-row presentationだけをsupersedeする。Document authority、Markdown source、D-111 autosave/CAS/conflict/ambiguous retry/safe flush、lifecycle、Project Primary Note、D-150 footer/IME、API/Worker semanticsは変更しない。

## Interaction

- active / archived Standalone Note rowだけが長押しSelectionの対象となる。
- 長押しはCompose標準の`combinedClickable`を使い、通常のtouch-slop / scroll cancellationを維持する。
- `LazyListState.isScrollInProgress`が`true`の間はSelection Modeを開始しない。long-lived pointer handlerへ古いscroll状態をcaptureせず、long-press dispatch時に現在値を読む。
- 左→右を含むhorizontal swipeはSelection Modeを開始しない。Notes専用の旧horizontal pointer recognizerは削除する。
- Selection Mode中のStandalone row tapはrow全体のtoggle authorityとし、Note openと`…` actionは抑制する。Project Primary rowは引き続き非selectable / non-openableとする。
- Checkbox glyph / 48dp checkbox slotは廃止する。selected rowは既存AccentBlueを使った薄いblue-tinted backgroundとoutlineで示し、row height・content位置を変えない。
- selected semanticsをrowへ公開し、long-click label `選択モードを開始`を提供する。

## Scope boundary

bulk Document mutation、Project row selection、new lifecycle/API/Worker command、schema/migration、dependency、persistent state、Web、D-145、Production、Releaseは対象外である。Add FAB、D-149 Project lazy Ensure、D-150 IME/footer、Markdown/autosave semanticsは維持する。

## Evidence

- Implementation: `ecd7234105574d929f6b5cf9bd7d26377f6cc37f`
- Focused JVM helper: `NotesScreenTest` `2 / 2 PASS`; full Android JVM `266 / 266 PASS`
- `TaskChute_API33` focused Notes instrumentation: long-press selection + row toggle/zero-exit/no-checkbox, horizontal swipe no-entry, Project selection guard, and D-150 editor regression `4 / 4 PASS` (individual serial runs)
- `:app:compileDebugKotlin`, `:app:compileDebugAndroidTestKotlin`, `:app:assembleDebug`, `git diff --check`: PASS
- MainActivity/UI-tree smoke: PASS after reinstall; target-app crash buffer empty
- Exact-SHA CI `36576219498` PASS; Web/Worker verification skipped by Android-only classifier
- APK `taskchute-android-debug-ecd7234105574d929f6b5cf9bd7d26377f6cc37f`, artifact ID `11036894455`, expires `2026-10-06T13:38:02Z`
- Full Notes runner was not run; the pre-existing task-primary autosave hang remains outside this focused corrective
- Galaxy S23: `PASS / USER_CONFIRMED` — Product Owner tested the fresh D-151 APK and reported `問題なし`; representative long-press Selection Mode smoke only, not a full device matrix. Persistent nonprod: `NOT_REQUIRED`; Production: `NOT_RUN`; Released: `NO`
