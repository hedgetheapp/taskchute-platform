### D-154A Wear pairing visual / timeout-retry corrective — 2026-09-30

- Wear sign-in now follows the approved Figma Dark UI (`561:110`), packages the same TaskChute launcher icon assets as Phone, and gives connect/send/grant waits bounded failure plus fresh-identity retry without weakening grant validation or exposing secrets.
- Implementation `a4753c2f8acc0eaa406518b4c77aa595bfd604bb`; focused Wear JVM `15 / 15`, Phone pairing JVM `2 / 2`, Phone/Wear Kotlin + instrumentation compile and debug assemble PASS; exact-SHA CI PASS with fresh signed Phone/Wear APKs. Web/Worker classifier SKIP.
- Prior paired-node Wear API37 AVD evidence: idle/error/retry UI smoke and Data Layer send acceptance; Wear instrumented `6 / 6`, Phone instrumented `2 / 2`. Latest continuation could not reconnect the Wear AVD through adb, so no additional runtime PASS is claimed. Authenticated grant→Today remains `NOT_RUN / AUTH_FIXTURE_UNAVAILABLE`; API37 Compose UI instrumentation remains recorded as tooling failure (`InputManager.getInstance` missing).
- Galaxy S23 / Pixel Watch `NOT_RUN`; Production `NOT_RUN`; Released `NO`. Worker/API/schema/migration/dependency/persistent nonprod unchanged.

### D-154 Wear OS / Pixel Watch v0.1 — 2026-09-30

- Added the Android-paired Wear OS `:wear` app for current-Day Section/task projection, forecast and estimate display, Routine marker, Start, Running progress, Complete / Next, and retryable network errors. Pairing requires explicit phone confirmation and a short-lived one-time nonce-bound grant; the Watch establishes its own Better Auth session and never receives the phone session cookie.
- Implementation `850f6356ca7ad5d95d500bce9727c8e8143bf260`; exact-SHA CI `36699695527` PASS, including Android JVM, signed Phone/Wear APK builds and instrumentation APK compilation. Phone APK artifact ID `11089423682`; Wear APK artifact ID `11089383950`.
- Persistent nonprod Worker `taskchute-web-nonprod` version `75f519f3-9e47-46b6-a239-0ddd77c56a18`; environment/bindings, root/protected-route smoke, no-pending-migration, D1 quick-check/FK and read-only safety checks PASS. Positive authenticated phone-to-Watch pairing runtime is `NOT_RUN` because no Watch emulator/device was available.
- App JVM `276 / 276`, Wear JVM `7 / 7`, Worker focused integration `36 / 36`, typecheck and build gates PASS. `TaskChute_API33` full `-Surface All` was `PARTIAL` (70 tests: 67 passed, 3 failed: one unrelated Settings expectation and two emulator package-manager/Activity teardown harness failures); after cold boot, MainActivity launch/UI and target crash-buffer smoke PASS. Wear emulator / Pixel Watch `NOT_RUN / PRODUCT_OWNER_MANUAL`; Production `NOT_RUN`; Released `NO`. No APP/AUTH migration; pairing uses the Wearable Data Layer dependency.

### D-153A Android Today Quick Add picker focus corrective — 2026-09-30

- `ReferencePicker` now explicitly clears Task-title focus after IME hide before requesting picker focus and opening Project / Mode / Section choices. CREATE's initial title autofocus remains session-scoped; picker close/selection does not reclaim focus, while a new CREATE session focuses the title again.
- Focused picker regression and related Today tests PASS. The D-153 initial `55 / 64` baseline and confirmed focus defect are retained as historical evidence; all eight remaining failures were verified against current canonical behavior and corrected in test fixtures/selectors/assertions only. An extra test-isolation timeout caused by leaving a newly opened editor/IME active was fixed by cancelling that session.
- TaskChute_API33 Today full instrumentation `64 / 64`, Android JVM `274 / 274`, compile / instrumentation compile / assemble / MainActivity + UI tree / crash buffer / `git diff --check` PASS. Implementation `f6d8b0496161032b8f2d0edf5ce417bd5fec8bba`; exact-SHA CI `36668787675` PASS, Web/Worker SKIP. APK `taskchute-android-debug-f6d8b0496161032b8f2d0edf5ce417bd5fec8bba`, artifact ID `11076473159`, expires `2026-10-07T04:28:35Z`.
- Product Owner confirmed the corrective APK on Galaxy S23 with `OK問題なし`. Representative smoke covered initial CREATE title focus, focus transfer to Project / Mode / Section pickers, and no title-focus reclaim after selection in the same CREATE session: `PASS / USER_CONFIRMED` (not an exhaustive device matrix). Persistent nonprod `NOT_REQUIRED`; Worker/API, schema, migration, dependency unchanged; Production `NOT_RUN`; Released `NO`.

### D-148 Android Today empty Section header drop targets corrective — 2026-09-29

- Empty configured and temporary unsectioned Section headers now participate as measured Section-only D&D targets without inventing relative placement or an insertion line; frozen Task geometry and Routine occurrence-aware no-anchor semantics remain intact.
- Focused Android JVM `54 / 54` and `TaskChute_API33` E1-E6 `6 / 6` passed. Exact-SHA CI `36496763036` passed and produced APK `taskchute-android-debug-635ceacf46196a937bceeaaa9e21a1d31a3ea3c0`, artifact ID `11003786549`, expires `2026-10-05T23:15:00Z`. Galaxy S23 `NOT_VERIFIED / PRODUCT_OWNER_MANUAL`; standard Today full surface `NOT_RUN / NOT_VERIFIED`; Production `NOT_RUN`; Released `NO`.
- No Worker/API/shared contract, schema, migration, dependency, persistent nonprod, D-145, or Notes change.

### D-148 Android Today exact failure diagnosis and real client chain — 2026-09-28

- Added internal structured capture for deterministic direct-manipulation failures without exposing backend details in the generic Japanese UI, plus a real HTTP client-chain regression proving that the first successful move's returned revision is serialized into the immediate second move for current and established future Days.
- Focused Android JVM `53 / 53`, Worker `16 / 16`, selected Today AVD `7 / 7`, final Android build/diff-check/crash-buffer, and exact-SHA CI `36428149578` PASS. APK `taskchute-android-debug-a2eab4c92cbaf44718cd63c058ab8e9246672e32`, artifact ID `10972313039`, expires `2026-10-05T13:25:08Z`.
- The scripted `409 resource_conflict` fixture is local diagnostic evidence only; the exact Galaxy S23 failure response was not captured. Galaxy remains `NOT_VERIFIED / PRODUCT_OWNER_MANUAL`; Production `NOT_RUN`; Released `NO`. No Worker/API/shared contract, schema, migration, dependency, or nonprod change.

### D-148 Android Today stale reconcile revision rollback corrective — 2026-09-28

- Android Today now keeps a monotonic `placement_revision` floor per logical date. Successful Quick Add/planning/D&D responses advance that floor before refresh; stale GET snapshots are ignored without replacing the optimistic projection or showing an error, with one coalesced silent retry. Newer/equal snapshots remain normal, and Future Day state is date-isolated.
- Focused Android JVM `91 / 91`, unchanged Worker proof `15 / 15`, focused `TaskChute_API33` four-row D&D `4 / 4`, MainActivity/UI-tree smoke, crash-buffer check, compile / instrumentation compile / assemble / diff-check, and exact-SHA CI `36421585299` PASS. The same-flow Quick Add plus injected stale HTTP case remains `NOT_VERIFIED / TEST_HARNESS_LIMITATION`.
- APK `taskchute-android-debug-c43fffe6470531037183c7162f519ec196e29bc4`, artifact ID `10970281200`, expires `2026-10-05T12:26:59Z`. Galaxy S23 `NOT_VERIFIED / PRODUCT_OWNER_MANUAL`, persistent nonprod / Production `NOT_RUN`, Released `NO`; Worker/API/shared contract, schema, migration, dependency, D-145, and Notes unchanged.

### D-148 Android Today D&D regression recovery — 2026-09-27

- `cc3a83e...`のGalaxy S23 `FAIL / USER_REPORTED`を履歴として保持し、pre-cc3の通常D&D presentationへ復旧。通常rowのlayout-changing target paddingと3状態previewを除去し、consumed auto-scroll時だけ単一booleanで現行`provisionalDay`を保持する。snapshot/target rebase、非layout cue、edge停止後の最新target settle、stable parent physical-up authority、Routine empty-Section occurrence-aware no-anchor requestは維持した。
- Implementation `30b9ffd5a572097bfc25a1cf4239d9bbe84c573b`、focused/full Android JVM `209 / 209`、same-section/cross-section/Routine-empty/edge focused AVDの3セット連続、compile / instrumentation compile / assemble / diff-checkはPASS。`scripts/android-qa.ps1 -Surface Today`は結果XMLなしでハングし、target app crash bufferは空。標準Today surfaceはPARTIAL / NOT_VERIFIED、Galaxy S23はNOT_RUN、ProductionはNOT_RUN、ReleasedはNO。
- Exact-SHA CI `36305702958` PASS、fresh APK `taskchute-android-debug-30b9ffd5a572097bfc25a1cf4239d9bbe84c573b` / artifact ID `10926923449` / expires `2026-10-04T08:18:53Z`。Worker/API/shared contract、schema、migration、dependency、persistent nonprod、D-145、Notesは変更・実施していない。

### D-148 Android Today D-147 device correctives — 2026-09-27

- D-148 follow-upとして、edge auto-scroll中は`provisionalDay`によるlayout-changing reorderを凍結し、target cueだけを追従させ、scroll停止後に最新targetへsettleするよう修正。Planned Routine occurrenceのanchorless empty-Section dropは既存occurrence-aware endpointへ`routineScoped=true`、`placement=null`、relative markerなしでdispatchするよう修正した。Implementation `cc3a83ef3887c2fc06ec952ddb33b73c6bfa173c`、focused/full Android JVM `208 / 208`、focused AVD 2件、exact-SHA CI `36302559765` PASS、APK artifact ID `10925464530`。標準Today surfaceはPARTIAL / NOT_VERIFIED、Galaxy S23はNOT_RUN、ProductionはNOT_RUN、ReleasedはNO。
- Past established Dayのeligible ordinary Planned rowで、left swipeのNote + `…`を表示し、More sheetの`今日へ移動` / `日付を移動`を利用可能にした。Past edit / duplicate / delete / execution / D&D、D-147(B)のmanual minute actual-start補正は変更していない。
- Android single Routine occurrence D&Dだけがoptional `relative_planned_start: "anchor"`を送り、anchor planned-start cohortへcanonical収束する。markerなしは既存D-120 Web/bulk semanticsを維持し、empty/collapsed Section behaviorとexpanded row-target priorityを保持した。Today Add FABは測定content bounds内でmemory-onlyに移動可能にした。
- Implementation `41fe8aac60ab8a5311402f5da19696e61624980b`、Worker focused `14 / 14`、Android JVM / Web typecheck / compile / assemble / diff-check、exact-SHA CI `36291132875` PASS。Today標準AVDは`37 / 45`で8件の既存fixture/expectation failure、D-148 focusedはPASS。APK artifact ID `10921289611`、nonprod Worker `3b5a9f10-b0b9-4bf1-9ab4-7b0ef4f2b7c7`、runtime/DB safety PASS。Galaxy S23 / authenticated QAはNOT_RUN、ProductionはNOT_RUN、ReleasedはNO。
- D&D edge auto-scrollを追加。実測Today `LazyColumn` viewportの上下`72.dp` edge zone、edge接近時のquadratic speed ramp（最大`32.dp/frame`）、既存drag snapshotを維持した実スクロール後の2フレーム待機・geometry再base・current pointer再解決を行う。focused JVM / focused AVDはPASSし、既存Today全surfaceはrunner完了通知なしでPARTIAL / NOT_VERIFIED。Implementation `d0b4ef424631db32705e83a8334ed901cb4d5ad8`、exact-SHA CI `36296338053` PASS、APK artifact `taskchute-android-debug-d0b4ef424631db32705e83a8334ed901cb4d5ad8` / ID `10924475595`。Worker/API/shared contract、schema、migration、dependency、nonprod、production、Notes、D-145は変更・実施していない。
- D-148 device correctiveとして、footer直上にRunning progress / unresolved / failure stackを測定配置し、Add FABをstackの12dp上へ置いた。D&Dはrowをcompletion authorityから外し、stable Today parentがlong-press後のpointer IDを保持し、source rowがLazyColumn外へ消えてもphysical pointer-upで1回だけcommitする。Focused JVM、Running stack AVD、off-screen edge-drag AVDはPASS。標準Today runnerは完了通知なしでPARTIAL / NOT_VERIFIED、crash bufferは空。Implementation `7180514d540273f237bd471724d4430e2daa9624`、CI `36300424234` PASS、APK artifact ID `10925795373`。Worker/API/shared contract、schema、migration、dependency、nonprod、production、D-145、Notesは変更・実施していない。Galaxy S23はNOT_RUN、ReleasedはNO。

### D-147B Android manual minute actual-start adjacency — 2026-09-27

- Androidのmanual actual-time editorだけが`input_precision: "minute"`を送信し、同一TaskChuteDay・同一表示minute内で開始を妨げる完了Execution blockerがある場合のみ、最大`ended_at`へeffective startを補正する。active/open、残存overlap、入力end超過、future / Day境界外、minute境界外はrejectし、既存Execution・exact caller・Start timestamp・Web・D-132 actual Section authorityは変更しない。
- blocker identity/timestampを同一D1 lifecycle guardへ含め、元request（markerを含む）でfingerprint/replayを維持。Worker focused `15 / 15`、Worker全体 `38 files / 364 tests`、Android JVM、Web typecheck、Android compile / assemble、`git diff --check`、exact-SHA CI `36285059315` PASS。
- Persistent nonprod Worker `c3a450e7-167d-4ece-a18e-4bb9c84ee5ea`、root `200`、protected API `401`、DB safety PASS。Today AVDは`44 tests / 35 PASS / 9 existing fixture failures`のPARTIAL、APK artifact ID `10920775303`。authenticated QAはCUA helper unavailableのためNOT_RUN、Galaxy S23はNOT_RUN、ProductionはNOT_RUN、ReleasedはNO。schema / migration / dependencyは変更なし。

### D-147A Android Today dogfood correctives

- Routine repeat icon accent、Routine occurrence-only delete / D&D、Quick Add / Startのoptimistic canonical ordering、Routine planned-start Section同期、established past planned ordinary Taskのforward move、Today Add FAB temporary dragを実装。
- D-147(B) manual minute-granularity actual-start補正はProduct Owner承認により完全保留。input_precision、Worker/API、schema、migration、dependency、nonprod、production、Releaseは変更・実施なし。
- Implementation b8a84a99a69a0a90f9791217abe1d5fbf145e260、focused JVM / Android compile / assemble / exact-SHA CI 36248977313、代表AVD 5 / 5 PASS。Today全体AVDは35 / 44 PARTIAL、Galaxy S23はNOT_RUN、ProductionはNOT_RUN、ReleasedはNO。
### D-147A corrective 1 — 2026-09-27

- 過去Dayのeligible ordinary Planned rowで「日付を移動」をDatePickerからcurrent/futureへ実行できるよう、past-source例外のrequest contextを保持。sourceより前のpast targetはno-write guardで拒否。
- Planned Routine-derived rowをrelative placementのD&D anchorとして許可し、Running / Completedのanchor除外、既存occurrence-aware path、D-129 ended-Section guardを維持。
- Implementation `602741f8dd1565a093c0d9a0be46cc8d0f8b05b4`、Android JVM / compile / assemble / exact-SHA CI `36282360581` PASS。Today AVDは`44 tests / 35 PASS / 9 existing fixture failures`のPARTIAL。APK artifact ID `10919013636`。
- D-147(B) manual minute-granularity actual-start補正は完全保留。Worker/API/shared contract、`input_precision`、schema、migration、dependency、nonprod、productionは変更・実施なし。Galaxy S23はNOT_RUN、ReleasedはNO。
### D-137 Daily Note v0.1 — 2026-09-23

- 確立済みDay単位の`daily_primary` Documentを追加し、GET/listでは自動作成せず明示Ensureだけで作成する。Web Notes dropdownとAndroid Task / Notes / Daily / Settings footer、Daily date navigation、body-only Markdown autosave/CAS/retryを実装。
- Implementation `f3147e51c70ad06803cc963cea0267d7d0df0a97`、Web focused `3 / 3`、Android Daily repository `3 / 3`、Android JVM / compile / assemble / typecheck / diff-check PASS。APP `0034_daily_primary_documents.sql`をpersistent nonprodへ適用し、Worker version `d6493c1a-602a-461c-a3e5-6f390d4eb4ce`、root `200`、protected API `401`、DB safety PASS。
- Notes AVDは`NOT_VERIFIED / HUNG`、CUA接続不能のためauthenticated Web / isolated QAは`NOT_RUN`、Galaxy S23は`NOT_RUN / PRODUCT_OWNER_MANUAL`、Productionは`NOT_RUN`、Releasedは`NO`。既存data mutationなし。

### D-135 Markdown cursor / interactive task checkbox corrective - 2026-09-23

- 共通Markdown editorのcaretをlight foregroundで明示し、inactive task-list markerを白色化。`- [ ]` / `- [x]` / `- [X]`は描画上のmarkerだけを安全なsource/display offset mappingとTextLayout hit testで切り替え、通常のbody update pathから既存autosaveへ接続。accessibility custom action、blocked state、active raw line、IME / selection / compositionは維持。
- Implementation 3d9781bd175ea35b95438597e80294c9a8a69ed8、Markdown focused JVM 14 / 14、Android JVM 182 / 182、Notes AVD 13 / 13、marker実タップ、compile / assemble / diff-check PASS。Exact-SHA CI 35835388710 PASS、Web/Worker SKIP。artifact taskchute-android-debug-3d9781bd175ea35b95438597e80294c9a8a69ed8 / ID 10739460429 / expiry 2026-09-30T08:09:39Z。Galaxy S23はNOT_RUN、ProductionはNOT_RUN、ReleasedはNO。

### D-135 Android Markdown Live Preview + IME Toolbar - 2026-09-23

- Standalone NotesとToday Task Primary Noteを共通のlive-preview Markdown editorへ統合。caret/selection行はraw source、非active行はbold・heading・bullet・task list・quote・linkを表示上renderし、body focus + IME表示時だけ6操作toolbarをIME直上へ表示。
- Markdown source persistenceとD-111 autosave / CAS / conflict / ambiguous retry / safe flushは維持。Implementation c8f3eb42133fb82ca541ead96a586a4a3d9db173、Markdown commands / offset mapping focused JVM 10 / 10、Android JVM 178 / 178、Notes AVD 10 / 10、instrumentation compile / debug assemble / diff-check PASS。exact-SHA CI 35828613692 PASS、Web/Worker SKIP、artifact taskchute-android-debug-c8f3eb42133fb82ca541ead96a586a4a3d9db173 / ID 10736027953。
- Galaxy S23はNOT_RUN / PRODUCT_OWNER_MANUAL、Worker/API、Web、schema、migration、offline persistence、dependency、Productionは不変・未実施、ReleasedはNO。

### Android move-success feedback / Routine enabled toggle corrective — 2026-09-23

- Todayの前日・次日・指定日MoveToDay成功時に永続成功文を表示しないようにし、既存のfailure / ambiguous / retryとMoveToDay semanticsを維持。
- Routineカードのenabled Switchを状態ラベル・accessibility付きで明示し、D-118どおり有効 / 無効へ統一。既存SetRoutineEnabled経路、編集、削除は不変。
- Implementation 3327d056a11ce99bb3d9d252330fbb40fb93c7a3、Today / Settings focused instrumentation各1 / 1 PASS、Android JVM / compile / assemble / diff-check PASS。
- Exact-SHA CI 35821183604 PASS、Web/Worker SKIP。APK artifact ID 10733521142。Galaxy S23はNOT_RUN、ProductionはNOT_RUN、ReleasedはNO。

# Changelog

## Unreleased
### D-148 Android Today two-task placement revision synchronization corrective — 2026-09-28

- Successful Android planning/direct-manipulation responses now synchronize nullable server `placement_revision` into the date-scoped monotonic Today state before pending clear/refresh, preventing the next operation from using a stale revision while retaining the optimistic projection.
- Same-Section D&D no-op insertion boundaries are omitted by simulating source removal and candidate insertion; meaningful boundaries, existing ordinary/Routine relative MoveEntry semantics, future-Day eligibility, and Worker behavior remain unchanged.
- Focused Android JVM `88 / 88`, existing Worker proof `15 / 15`, focused `TaskChute_API33` cases, compile / instrumentation compile / assemble / diff-check, and exact-SHA CI `36417239160` PASS. The same-test immediate second UI drag remains `NOT_VERIFIED / TEST_HARNESS_LIMITATION`; Galaxy S23 `NOT_VERIFIED`, Production `NOT_RUN`, Released `NO`.

### D-148 Android Today insertion boundary / bottom edge auto-scroll corrective — 2026-09-27

- Android Today D&D now resolves adjacent row hits to one deterministic insertion boundary and renders one thin non-layout-shifting insertion line; destination rows no longer receive a duplicate full-row cue.
- Bottom edge auto-scroll uses measured `LazyColumn` viewport and overlay geometry, preserving the existing parent pointer/session, snapshot rebase, Routine placement, and exact-once move semantics.
- Implementation `eb6546ed2d6ee9016d53bd44c846d4fc57c0d681`; full Android JVM `214 / 214`, focused Today AVD, compile / instrumentation compile / assemble / diff-check PASS; CI `36325621921` PASS; APK artifact ID `10934126205`. Standard Today surface remains `HARNESS_HUNG / PARTIAL / NOT_VERIFIED`, Galaxy S23 `NOT_RUN`, Production `NOT_RUN`, Released `NO`.

### D-136 Android Markdown Interactive Links + Stable Tap Selection — 2026-09-23

- 共通Android live-preview Markdown editorでinactive task checkboxとhttp(s) linkのtap / accessibility actionを埋め込み操作化し、`BasicTextField`のcaret / selectionを移動させないようInitial pointer passで処理する。
- plain `http://` / `https://` URLはraw Markdownを変更せずlinkifyし、既存Markdown linkはrendered labelから安全なplatform URI openerで開く。末尾の明白な文章句読点、malformed URL、unsupported schemeはlink destinationにしない。
- D-135のexact source persistence、IME / composition、autosave / CAS / conflict / ambiguous retry / safe flushを維持。Focused Markdown JVM `18 / 18`、Android JVM `186 / 186`、Notes AVD `15 / 15`、instrumentation compile、debug assemble、diff-check PASS。Galaxy S23 `NOT_RUN`、Production `NOT_RUN`、Released `NO`。

### D-134 Android Running Progress Player — 2026-09-23

- current DayのRunningTaskPanelを104dp progress playerへ置換。elapsed / remaining / progress / overrunはdisplay-onlyで、Completeは既存commandを再利用。Futureでは非表示、Pastはread-only。
- Implementation `419eb5a0a766c7837838f49fe45f5f4a731010d4`、RunningProgress `8 / 8`、Android JVM `168 / 168`、exact-SHA CI `35817804199` Android JVM / signed APK PASS、Web/Worker SKIP。artifact `taskchute-android-debug-419eb5a0a766c7837838f49fe45f5f4a731010d4` / ID `10732232016`。
- Today AVD全surfaceは`35 / 44`でpartial、Running panel focused / MainActivity / UI tree / crash bufferはPASS、final full Today rerunはNOT_VERIFIED。Galaxy S23は`NOT_RUN / PRODUCT_OWNER_MANUAL`、Productionは`NOT_RUN`、Releasedは`NO`。


### D-133 Android Routine full create / edit parity — 2026-09-22

- Android Routine Create / EditをTask名、Project、Mode、Section、開始予定、見積、繰り返し、開始日、終了日のfull formへ統一。Createは既存`CreateRoutine`の1回のatomic write、Scheduleは親Add / Saveまでlocal draft、`900` / `0900` / `09:00`はcanonical minuteへ正規化。
- Implementation `62d4d804db0683a6bc33cad0f4c4722212201fb0`、Worker focused `19 / 19`、Android Settings focused `18 / 18`、typecheck、debug assemble / instrumentation compile、exact-SHA CI `35725615763`、APK artifact `taskchute-android-debug-62d4d804db0683a6bc33cad0f4c4722212201fb0`（ID `10693353178`、expiry `2026-09-29T12:13:17Z`）はPASS。
- Persistent nonprod `taskchute-web-nonprod` deploy / guard / runtime / read-only DB safety PASS。Worker version `90d25052-a1f8-45e3-9f9f-6d12601265c3`。CUA kernel resetのためauthenticated Web / isolated QAはNOT_RUN、QA作成・cleanup・既存data mutationなし。schema / migration / dependency / Production操作なし。Galaxy S23は`NOT_RUN / PRODUCT_OWNER_MANUAL`、Releasedは`NO`。
### D-114 Android Routine create defaults corrective — 2026-09-22

- Android new Routine creation now carries the entered planned start and estimate through the existing atomic CreateRoutine request. The start minute resolves to exactly one current Routine Board Section; estimate minutes are stored as seconds. Title-only payloads remain backward compatible with null defaults.
- Worker focused 18 / 18, Android Settings focused tests, Web typecheck, debug APK / instrumentation compile, and exact-SHA CI 35708401799 (Android + Web/Worker) passed. APK taskchute-android-debug-a741a9562b885e1276e8011cfab735d5f5b5a556, artifact 10685921671, expiry 2026-09-29T09:08:13Z.
- Persistent nonprod taskchute-web-nonprod deploy / guard / runtime / read-only DB safety passed, Worker version 8de80f39-d1e3-47ef-810c-e5435b7cefa4. Authenticated Web and isolated QA were not run because the CUA helper was unavailable. No existing-data mutation, schema/migration/dependency change, or Production operation. Galaxy S23 is NOT_RUN / PRODUCT_OWNER_MANUAL; Released is NO.

### D-132 SetExecutionTimes actual-Section parity corrective — 2026-09-22

- Planned→Running / Completedの`SetExecutionTimes`でもactual startのSectionをserver-authoritativeに解決し、sectioned sourceを元Sectionに残す不整合を修正。cross-Sectionは既存placement CAS、atomic move・lifecycle / Execution作成、revision `+1`、same-Sectionはrevision不変、planned start保持、D-081 execution-first projectionを維持。
- Webはplanned actual-time requestへcurrent placement revisionを追加し、AndroidはCREATE / EDIT chainでsectioned Plannedを含め最新revisionを送信。新API route / command / schema / migration / dependency / optimistic persistenceは追加していない。
- Implementation `ea137da294dc7f7e239228dca49bacc2ff8150f8`、Worker focused `7 / 7`、Web App `298 / 298`、Android focused repository test、typecheck、exact-SHA CI `35683758984` rerun、persistent nonprod deploy/runtime/DB safetyはPASS。Worker version `73378404-e353-4aeb-b36d-3eafe7de3204`。Authenticated Web QAはCUA session unavailable、Galaxy S23 / Production / Releasedは`NOT_RUN / NOT_RUN / NO`。

### D-131 Section current/future reconciliation — 2026-09-22

- Section configuration update now reconciles current and already-established future Day contexts to the latest Section configuration while preserving established past Day history and avoiding materialization of unestablished future Days.
- Planned starts are re-derived through the canonical `[start, end)` Section intervals; `Sectionなし` remains paired with a null planned start. Routine-derived entries retain the D-043 pair, and running/completed entries preserve lifecycle and execution facts while using a surviving adjacent Section when their prior Section is removed.
- Each affected Day advances `placement_revision` exactly once per successful update, exact operation replay is idempotent, ordering uses the existing canonical tie-break, and the update remains atomic through existing assertion / operation semantics.
- Implementation `fb0d0542d4509912aaaa4e5e306ad65a395cc241` is covered by focused Worker evidence (`63 / 63` PASS), additional Section interval / B3 / Day Navigation coverage (`38 / 38` PASS), typecheck, and `git diff --check`. Exact `main@63174582...` passed the canonical nonprod build/deploy guard and was deployed to `taskchute-web-nonprod` as version `cb6f27b7-d9b8-4a4b-a2fb-c18c782c9dcf`; runtime/DB safety passed. Authenticated Web verification was `AUTHENTICATED_BROWSER_NOT_RUN`, production is `NOT_RUN`, and Released is `NO`.

### Android Today actual-time prefill / Running projection / consecutive Quick Add corrective

- Running / Completed editorの実績時間prefillを、compact入力parserとは分離したISO Execution instant formatterへ修正。`editor.day.establishmentTimezone`で`HH:mm`へ変換し、端末timezoneをauthorityにしない。
- Plannedの開始時間のみ保存は、既存`SetExecutionTimes` contractの`ended_at: null`でRunningへ遷移する経路をfocused regressionで固定。Running rowの開始・終了見込みはD-130どおりcanonical actual startとfull estimateから投影し、estimateなしでは開始だけを表示する。
- consecutive Quick Addは、Add / planned-start成功応答の最新`placement_revision`をmemory-onlyで記憶し、次のCREATEとstale conflict後のRetryへ再適用。CASを弱めず、409を成功扱いしない。
- 変更前artifact `a42862aa0b274f828d6426cbd16a7511d1ba5cc8`のGalaxy S23 evidenceは、actual-time prefill、Running projection `--:--`、consecutive Quick Addをそれぞれ`FAIL / USER_REPORTED`として記録。correctiveのGalaxy S23は`NOT_RUN`、Productionは`NOT_RUN`、Releasedは`NO`。
- Implementation `94b3a57437ae6d908d2c038ebb8f4c6ca31ac566`、local Android JVM `149 / 149`、instrumentation compile、debug assemble、`git diff --check`、exact-SHA CI `35597482215`はPASS。Web / WorkerはAndroid-only classifierでSKIP。fresh APK artifactは`taskchute-android-debug-94b3a57437ae6d908d2c038ebb8f4c6ca31ac566`（ID `10637282407`、expiry `2026-09-28T12:07:39Z`）。

### Android lifecycle editor / current-Day delete / placement guard / forecast parity

- Current logical Dayのordinary Planned / Running / Completed editor capabilityを実装し、`SetExecutionTimes`、D-116A historical Project / Mode、compact actual-time parserを既存contractへ接続。
- current-Day Running / Completed単体削除を既存`DeleteCompletedEntry` route / DTO / operationへ接続。D-067 Completed semantics、D-128 Running guard、Task / Project / Mode / Routine identity保持、atomic deleteを維持。
- D-129のcanonical Section `actual_end_instant` guardをAndroid D&D preview / dropとWorkerのentry planning / bulk moveへ適用し、ended Sectionを新規manual placementから除外。
- Androidの開始・終了見込みをWeb Start Forecast相当へ整合し、見積・実績durationを総分数表示へ統一。Header DatePickerとTask Actions DatePickerを共有化し、RunningTaskPanelを72dp内で上下中央揃え。
- Android JVM `149 / 149`、full Worker `37 files / 341 tests`、full Web `14 files / 478 tests`、typecheck、instrumentation compile、debug assembleはPASS。authenticated runtime、Galaxy S23、persistent nonprod destructive delete E2E、production、Releaseは未確認。

### D-127 Android Drag Immediate-Cancel Corrective

- `TodayTaskRow`のvertical long-press drag ownerをouter stable Boxの`rowDragGestureModifier` 1個へ限定。inner Task content Columnに残っていた二重`pointerInput`を削除し、horizontal swipeは維持する。
- placeholder切替時にinner visualがcompositionから外れても、outer gesture hostが同一pointer sequenceを保持し、long-press後のmove / dropをcancelしない構造へ修正。
- Artifact `aaa372086dd5e533ca5d0e32664bfa0c254490ce`のGalaxy S23 immediate-cancelは`FAIL / USER_REPORTED`として履歴保持。新corrective artifact `b46d10ff5231a3d08157bea16ffb26b523420624`はProduct OwnerのGalaxy S23確認で`PASS / USER_REPORTED`。AVD runtimeは`NOT_RUN / HUNG`、productionは`NOT_RUN`、Releaseは`NO`のまま。

### D-127 Android Drag Reorder Regression Corrective

- 前版でsource Entryをsynthetic placeholderへ置換した際にdrag gesture ownerがcompositionから消え、drop commandが送信されないregressionを修正。provisional previewは実source Entryを同じ`task.id` stable keyのままtarget位置へ移動し、そのrowだけをteal placeholder visualとして描画する。
- gesture host / `pointerInput`をsource rowの外側で維持し、lifted overlayだけにpointer deltaを適用。same-section / cross-section / empty / Completed-only Section / cancelの既存placement semantics、既存command、server authorityは維持する。
- Artifact `3f4bb61fc37af76f2ff6699a456aceba75533fbb`のGalaxy S23 drag failureは`FAIL / USER_REPORTED`として記録。今回のcorrectiveのGalaxy S23、AVD runtime、screenshot comparison、production、Releaseは未確認。

### D-127 Android Quick Add focus / drag targeting / transient feedback corrective

- Quick AddのProject / Mode / Section pickerが明示的にfocus ownerとなり、Task名fieldのinitial focusを奪い返さないよう修正。picker操作時はtext IMEを閉じる。
- drag中のprovisional presentationをsource rowのtarget移動から、source除去 + 独立placeholder + pointer-following lifted overlayへ変更。Completed / Routine-derived rowはanchorにせず、completed-only / empty Sectionは既存Section-only planned-tail semanticsへ委譲する。
- deterministic operation failureだけをgeneration token付きのtransient feedbackとし、AccessibilityManagerの推奨timeout後に同一failureだけをdismiss。ambiguous / auth / full-screen load failureはD-125どおり維持。
- `TodayDirectManipulationTest` / `TodayOptimisticTest` focused JVM 26 tests、Android-test compileはPASS。今回のcorrectiveのGalaxy S23、AVD runtime、screenshot comparison、production、Releaseは未実施。off-screen auto-scrollは追加していない。Worker/API、schema、migration、dependency、D-127 semanticsは変更なし。

### D-127 Android Today device-findings corrective

- Galaxy S23で報告されたD-127の5件（Quick Add focus reclaim、optimistic edit/lifecycle flicker、drag provisional-order oscillation、Completed actual metadataの開き括弧欠落）をsource-level correctiveとして修正。
- CREATEの初期focusをopen session単位へ限定し、成功後のoptimistic overlayを対応するsilent canonical reconcileまで保持。Realtime invalidationはoptimistic mutation中に表示へ割り込ませない。
- drag hit-testはdrag開始時のgeometry snapshotを使い、provisional animation自身がtarget判定を反転させない。Completed actual metadataは開き括弧を独立した非clip要素として表示。
- 旧artifact `taskchute-android-debug-2c6c272b5b0897a9d00ad6d8ff47d44b42d31098` はGalaxy S23 `FAIL / USER_REPORTED`。今回のcorrective artifactは実機 `NOT_RUN`、screenshot comparison / production / Releaseは未実施。Worker/API、schema、migration、dependency、D-127 semanticsは変更なし。

### D-127 Android Today local-feel / motion corrective

- Quick AddのTask名・開始予定・見積を48dp compact fieldへ整合し、CREATE時のTask名focusとCancelのsingle-line表示を追加。
- Task drag中の仮Entry順序をstable keyとCompose item placement animationで表示し、canonical Dayはdropまで変更しない。
- Task add / edit / reorder / placement / start / completeをmemory-only optimistic presentationで即時反映し、成功後はvisible `REFRESHING`なしのsilent canonical reconcileへ接続。
- Today Task Noteの本文をBasicTextFieldへ置き換え、`Markdown`ラベルを除去。NotesControllerのautosave/CAS/conflict/ambiguous retry semanticsは維持。
- D-127実機、Galaxy S23、authenticated screenshot、production、Releaseは未確認。Worker/API、schema、migration、dependencyは変更なし。

### D-121 Android Today Figma parity bundle corrective

- Quick Addのcurrent/future visibility、canonical timezone由来の初期Section、候補ロード中disabled、`900` / `0900`を含む`HH:mm`正規化を整合。
- Selection footer、Task Note Today Bottom Sheet、Swipe / Task Actions、Running panel、Drag feedback、Task Row metadataのFigma差分を修正。
- Task Primary NotesControllerのautosave/CAS/ambiguous retry/safe flush、Future/Past、D&D、lifecycle semanticsを維持。成功deleteの通知だけ抑止。
- Android JVM、instrumentation compile、debug assembleはPASS。authenticated runtime、physical device、screenshot comparisonは未実施。

### D-100 Executable Development Workflow

- `apps/web`へauthoritative `preflight`、明示surface必須の`verify:fast` / `verify:standard` / `verify:heavy`、per-step timing artifact、保守的な`evidence:summary`を追加。既存profile policy、persistent/manual evidence分離、production禁止は変更しない。

### D-072 Mode Settings management

- Mode Settingsへcurrent-tab title search、`使用中` / `アーカイブ` tab、archive / restore、確認付きhard deleteを追加。
- archived Modeは新規assignment候補から除外し、既存assignmentの表示、clear、activeへのreplaceを維持。
- Mode deleteはlive relationだけをclearし、Task / Entry / Execution / historical snapshot / Day placementを保持するAPP `0022_mode_archive_delete.sql`を追加。
- 検索やtabで絞り込まれたreorderでもcanonical full orderを維持し、archiveは位置を保持、delete後だけpositionをcompact。
- local focused / migration / full regression、persistent nonprod APP `0022` migration、authenticated browser search/archive/restore/delete E2E、DB integrityはPASS。承認済み使い捨てD072 fixtureだけをhard deleteし、planned live relation clear、completed snapshot retention、Task/Entry/Execution retention、board compaction/revisionを確認した。production / restore / AUTH migration / tag / releaseは未実施。

### Bootstrap

- Obsidian依存から独立したTaskChute Platform repositoryを初期化。
- Server-centricなtarget architectureを記録。
- single-user / multi-deviceの初期scopeを記録。
- Web appをprimary / universal clientかつinitial development priority最優先とする方針をApprovedとして記録。
- Androidをnative first-class client、Wear OS / Pixel Watchをcompanion target、native iOS appをfuture / low priorityとするclient strategyを記録。
- Markdown-nativeなNotes/Documents方針を記録。
- Notes/Commentsで共有するAttachment capability要件を記録。
- legacy Obsidian repositoryをsemantics / migration / regression knowledgeのreferenceとして扱う方針を記録。
- Project Instructions、`AGENTS.md`、`DEVELOPMENT_WORKFLOW.md`のAI開発Governanceを整合。
- canonical docsを日本語ベースへ整理し、doc ownerとDecision状態の不整合を修正。
- Androidをoffline-capableとする方針、およびStart / Completeのretry safetyをApprovedとして記録。
- First vertical sliceをServer + Web + browser reload recovery中心へ更新。

### Core Domain / Architecture design

- D-013を`Proposed`からApproved Server + Web First vertical sliceへ昇格し、async Web mutation、Start / Complete、active Execution max 1、Next Entry、reload recoveryをimplementation contractとして確定。
- Task / Entry / Execution、Project、Section、RoutineDefinition / RoutineOccurrenceのCore Domain foundationをApprovedとして整理。
- Entry identityをTaskChuteDay / Section移動で維持し、ordering authorityをEntry identityとする方針を確定。
- RoutineOccurrenceのorigin TaskChuteDayをEntry延期後も保持し、actual execution dayと区別できる方針を確定。
- configurable TaskChuteDayをcivil dateと分離し、canonical timezone + DayBoundaryPolicyによるcontinuous `[start, end)` intervalとして整理。
- DayBoard / Calendar / Timeline / Review / MapをDomain / historical factsからのprojectionとして整理し、過去historyのretroactive reclassificationを避ける方針を確定。
- Task / Project Primary Documentとoptional RoutineOccurrence Documentのfoundationを追加。
- planned Placeとobserved Execution Locationを分離し、Start / Complete location captureをoptional / best-effortとする将来拡張方針を追加。
- Web initial stackとしてReact + Vite SPA、Server APIとしてCloudflare Workers、structured persistenceとしてCloudflare D1をApproved。
- Native clientはWeb React codeの直接流用を前提とせず、Android / Wear OSはKotlin + Compose、native iOSはSwift + SwiftUIを第一候補とする方針を記録。
- APIをconceptual Command / Queryへ分離し、client-issued mutationのlogical operation identity、placement revision、silent last-write-wins禁止、atomic command原則を追加。
- Better AuthをTaskChute Serverのinitial application authとして採用し、email/password、secure browser session、public signup disabled、auth identityとTaskChute app user identityの分離を確定。
- D1 exact transaction / constraint strategyを本runtime前にlocal + remote concurrency / atomicity spikeで検証するGateを追加。
- D1 spike用`D1-SPIKE-01`〜`D1-SPIKE-08`をTEST_MATRIXへ追加し、未実施evidenceを`NOT_RUN`として記録。
- D1 feasibility spikeをcurrent harnessでlocal D1とtemporary remote D1の両方に対して実施し、`D1-SPIKE-01`〜`D1-SPIKE-08`のPASS evidenceを取得・reviewした。
- local test runnerのport / persisted state共有によるfixture干渉を特定してrun単位隔離へ修正し、reorder concurrency contractはHTTP winner・stored result・final D1 orderの一致まで検証するよう強化した。
- D1 `batch()` + conditional SQL + database constraintsによるatomicity / concurrency / idempotency strategyのfeasibilityをVerifiedとした。exact production schema / migration SQL / command-specific algorithm / infrastructure failure reconciliationは実装incrementごとに確定・reviewする方針とした。

### Runtime foundation decisions

- D-023をApprovedし、initial-user bootstrapを通常runtimeではdisabled、explicit modeがexact `"true"`の場合だけavailableとするlifecycleを確定。enabled中もtoken必須とし、provisioning後はmode disable + token remove / rotateを要求する。
- D-022をApprovedし、initial runtimeで新規作成するentity IDをUUIDv7のopaque identityとする方針を確定。ID timestampをDomain ordering authorityには使用しない。
- First sliceのSectionをuser-global stable entityとし、APP persistence baselineをapp user / auth mapping / settings / Project / Section / TaskChuteDay / Task / Entry / Execution / operationの最小stable-reference modelとして確定。
- initial bootstrapではIANA timezone、TaskChuteDay boundary、initial Sectionsを明示入力し、暗黙のProduct defaultを適用しない。DST ambiguous / nonexistent local timeはTemporal-compatibleな`compatible` semanticsで扱う。
- initial userをoperator-only one-shot bootstrapで作成し、public signupをbootstrap中も有効化しない方針を確定。bootstrapはAUTH_DB / APP_DB partial failureからrecoverableにする。
- initial browser sessionをrolling 7日 / update threshold 1日とし、same Worker内でseparate `AUTH_DB` / `APP_DB` D1 bindingsを利用するphysical boundaryを確定。
- `FEATURES.md`のD1 concurrency / atomicity spike statusをcanonical evidenceに合わせて`Verified`へ修正。

### Runtime bootstrap implementation

- `BOOTSTRAP_ENABLED` gateをrequest body parseより前へ追加し、missing / disabled / invalid modeとtoken不備をinformation disclosureのない404 postureに統一。mode / token / partial-failure recovery / public signup regressionをlocal automated testへ追加。
- PR #3でFirst production runtime bootstrap sliceを`main`へmerge。
- React + Vite SPAとCloudflare Worker runtime scaffoldを追加。
- Better Auth `1.7.1`をexact pinし、public signup disabled、operator-only bootstrap、rolling 7日 / update threshold 1日sessionを実装。
- same Worker内にseparate `AUTH_DB` / `APP_DB` D1 bindingsを実装し、Better Auth subjectからstable TaskChute `app_user_id`へmappingするPrincipal境界を追加。
- bootstrapをAUTH_DB / APP_DB partial failureからrecoverableにし、secret / passwordをtracked fileや通常logへ残さない運用を実装。
- explicit IANA timezone / TaskChuteDay boundaryからcurrent logical dayをresolve / materializeし、actual intervalとestablishment contextを保存。
- DST nonexistent / ambiguous boundaryをTemporal-compatible `compatible` semanticsで処理し、actual resolved boundary instantでday membershipを判定。
- CreateProjectとAddTaskToDayを実装し、Task / Entry separate UUIDv7 identity、optional Project relation、explicit Entry positionをAPP_DBへ保存。
- logical operation replay、different-semantic operation-ID misuse rejection、request fingerprint version 1、placement revision conflict protectionを実装。
- unexpected infrastructure failureをdeterministic Domain rejectionへ誤保存せず、canonical Query + same-operation retryへreconcileできるfailure pathを実装。
- same-operation concurrent raceがstored winner resultへ収束するようrejection persistence raceを修正し、owner-scoped temporary guard / assertionを追加。
- Web DayBoardでlogin/logout、Project作成、Task + Entry追加、pending feedback、canonical refetch、browser reload recoveryを実装。
- local evidenceとしてWorker / D1 34件 + Web 7件 = 41件PASS、typecheck / production build / fresh local migrations / FK checks PASSを取得し、implementation bundle / GitHub PR diff reviewもPASS。
- remote D1 Product runtime verification、deployed Worker verification、production verificationは未実施のまま。

### Runtime lifecycle / ordering implementation

- PR #5でFirst Server + Web vertical sliceのlifecycle / ordering incrementを`main`へmerge。
- `0002_lifecycle_ordering.sql`でExecution persistence、lifecycle operation support、既存operation rowを保持するmigrationを追加。
- `executions`へuser-wide active Execution最大1をenforceするpartial UNIQUE indexを追加。
- ReorderEntriesを実装し、TaskChuteDay-level `placement_revision`によるstale conflict rejection、same-operation replay、misuse rejection、atomic rollbackを実装。
- ReorderをEntryごとのUPDATEから`json_each`を利用するset-based updateへ変更し、200 Entryの未承認capを削除。mutation batch statement数をEntry数から分離した。
- StartEntryを実装し、planned EntryのみStart、exactly one active Execution、別active Execution時no implicit interrupt、same-operation retry safetyを実装。
- CompleteEntryを実装し、running Entryとactive Executionを終了、first `ended_at` preservation、same-operation retry safetyを実装。
- Start / Completeは`placement_revision`を変更しない。
- current projectionへactive Executionとlifecycle-aware Nextを追加し、Next以外のplanned Entryもactive ExecutionがなければStart可能にした。
- TaskChuteDay境界をまたぐactive Executionを分割せず保持し、current DayBoard外のEntryに属するExecutionもWebからComplete可能にした。
- Webへmove up/down、Start、Complete、pending / conflict reconciliationを追加。
- ambiguous Reorder / Start / Completeは元operation専用Retryとclient-side Discardを表示し、retained operation中はunrelated mutationから旧operationを暗黙再送しないようguardを追加。
- 64 Entry set-based Reorder、stale conflict replay、cross-owner Reorder、Next advancement、cross-day active Execution、HTTP lifecycle routes、path/body mismatch、ambiguous Retry / Discard等のcoverageを追加。
- current local evidenceをWorker / D1 49件 + Web 18件 = 67件PASSへ更新。`npm ci`、typecheck、production build、fresh migrations、existing operation upgrade、FK checks、active Execution index、`git diff --check`もPASS報告。
- source-only reviewで初回3 blockerを検出・修正後に再review PASS、GitHub PR #5 diff reviewもPASS。
- remote D1 Product runtime verification、deployed Worker verification、deployment / production smokeは引き続き`NOT_RUN`。Implemented / Integrated / local TestedをVerified / Releasedへ自動昇格しない。
### D-148 Android Today D&D parent pointer ownership capture — 2026-09-27

- Galaxy S23の歴史的`FAIL / USER_REPORTED`（edge auto-scroll後に通常scrollへ戻る、row移動中の二重座標authority）に対し、long-press handoff後のrow `onDragMove`を削除した。stable Today parentが`PointerEventPass.Initial`で一致するactive pointerの移動だけをconsumeし、parent root座標からのみdrag位置を更新する。row disposal/cancelはfinish/clearせず、physical pointer-upと`dragFinishIssued`だけが1回のcommitを許可する。pre-handoffの通常scroll/swipe/pull-to-refresh、既存auto-scroll freeze/rebase/settle、Routine empty-Section semanticsは維持。
- Implementation `ce84f3f3e963ce3d3dda22485e0fe086ed09f5a6`、focused/full Android JVM `211 / 211`、same/cross/source-row-offscreen edge D&D 3セット連続、Routine empty-Section、compile / instrumentation compile / assemble / diff-checkはPASS。標準Today surfaceはrunner hangで`HARNESS_HUNG / PARTIAL / NOT_VERIFIED`、target app crash bufferは空。Exact-SHA CI `36308834382` PASS、fresh APK `taskchute-android-debug-ce84f3f3e963ce3d3dda22485e0fe086ed09f5a6` / artifact ID `10928148531` / expires `2026-10-04T09:18:45Z`。Galaxy S23はNOT_RUN、ProductionはNOT_RUN、ReleasedはNO。Worker/API/shared contract、schema、migration、dependency、persistent nonprod、D-145、Notesは変更・実施していない。
### D-148 Future-Day D&D stable source preview — 2026-09-27

- Implementation `740e92b78972cdfdf8360cd37f95a54e9faf299d` removes the invalid same-Day origin equality from the existing Routine Section-occurrence guard while retaining Routine relation/override safety. The focused Worker regression reproduces the previous date-moved future-Day `resource_conflict` and passes ordinary, native Routine, date-moved Routine, and exact replay coverage (`20 / 20`).
- Android Today keeps the canonical Day and source row at its original 84dp layout slot during drag, ghosts that source row, follows the finger only with `DraggedTaskOverlay`, and shows a non-layout-shifting destination insertion cue. Stable parent physical-up remains the only finish authority; consumed edge auto-scroll still performs frame-delayed geometry rebase and target resolution.
- Focused/full Android JVM, four focused `TaskChute_API33` Today cases, Web typecheck, Android compile / instrumentation compile / assemble, and `git diff --check` PASS. Standard Today runner is `HARNESS_HUNG / PARTIAL / NOT_VERIFIED` after reaching `connectedDebugAndroidTest`; crash buffer empty. Exact-SHA CI `36320708350` PASS; APK artifact `taskchute-android-debug-740e92b78972cdfdf8360cd37f95a54e9faf299d` / ID `10931897828`.
- Persistent nonprod deploy PASS: Worker version `5bcea8ef-52c5-4cf1-b0d0-ac2fe016d195`, root `200`, protected API `401`, APP/AUTH migrations `0 / 0`, both quick checks `ok`, FK checks empty, transient guards/assertions empty; one pre-existing active Execution was observed but not touched. Authenticated Web/remote disposable QA `NOT_RUN` because the authorized browser helper was unavailable. Galaxy S23 / Production / Released remain `NOT_RUN / NOT_RUN / NO`; D-145, Notes, schema, migration, dependency, and shared contract unchanged.

### D-131 corrective — future Routine materialization Section resolution — 2026-09-28

- D-131 Section configuration reconciliation後に未establish future Dayを初回openする際、RoutineDefinitionのstored default Sectionが旧contextでも、`default_planned_start_minute`を選択Dayのcanonical Section contextへ再解決してmaterializeするよう修正した。RoutineDefinitionは変更せず、boundary / unique match / null pair invariant / schedule / replay / transaction semanticsを維持した。
- Implementation `0732b6ca264afd91e7feee42430ae2cfdcadf2ff`、RED reproduction、Day Navigation `19 / 19`、Routine R2B `19 / 19`、typecheck、Worker build、diff-check、exact-SHA CI `36359852667`はPASS。Android jobはSKIPPED。
- Persistent nonprod `taskchute-web-nonprod` version `0097de84-e791-4874-9df2-d2e1d553fd62`のguard / root `200` / protected API `401` / APP-AUTH migration `0 / 0` / quick_check / FK / guardsはPASS。CUA unavailableのためauthenticated Future Day GETはNOT_RUN。既存data mutation、schema / migration / dependency、Android/APK、productionは実施していない。ReleasedはNO。
### D-148 Android Today legal D&D target visibility corrective — 2026-09-28

- Added forgiving legal-boundary ownership zones so eligible drop targets remain visible and reachable without replacing the stable drag snapshot.
- Ordinary same-Section boundaries are limited to the source planned-start cohort; Routine same-Section drops retain occurrence-aware relative placement, while cross-Section and empty/collapsed Section semantics remain unchanged. The insertion cue renders above the lifted overlay.
- Implementation `e8a4198e518a14380a25c71016689a9567d6d1df`; focused/full Android JVM, focused Today AVD, Android builds, diff-check, and exact-SHA CI `36379323128` PASS. APK artifact `10952023768` / `taskchute-android-debug-e8a4198e518a14380a25c71016689a9567d6d1df`.
- Galaxy S23 corrective retest remains `NOT_VERIFIED / PRODUCT_OWNER_MANUAL`; prior failures are retained as historical evidence. Worker/API/shared contract, schema, migration, dependency, persistent nonprod, Production, and Release were untouched.

### D-148 Android Today single-task relative D&D corrective — 2026-09-28

- Restored ordinary single-Task concrete-anchor D&D through the existing `MoveEntry` relative-placement path across planned-start cohorts. The earlier same-Section cohort filter was limited to the bulk `ReorderEntries` semantics; no client-side planned-start or order rewrite was added.
- Routine-derived single-Task anchors retain the occurrence-aware flags, while same-Section no-anchor no-op, Section-only moves, future-Day eligibility, stable source/snapshot, auto-scroll/rebase, and parent pointer-up one-time dispatch remain unchanged.
- Focused JVM, focused `TaskChute_API33` current/future/Routine/edge cases, compile / instrumentation compile / assemble / diff-check, and exact-SHA CI `36409567988` PASS. APK artifact `10964185874` / `taskchute-android-debug-50e79a0b70eb9a45d30e3f5876ceb56d3efe5bc0`. Galaxy S23 remains `NOT_VERIFIED / PRODUCT_OWNER_MANUAL`; Worker/API/shared contract, schema, migration, dependency, persistent nonprod, D-145, Notes, Production, and Release were unchanged/not run.
### D-148 Android Today stale parent pointerInput closure corrective — 2026-09-28

- Fixed the confirmed stale parent `pointerInput(day.logicalDate)` completion closure: the parent drag session remains stable, while `rememberUpdatedState` makes physical pointer-up use the latest confirmed placement revision after same-day recomposition.
- Pre-fix real `performTouchInput` RED reproduced first revision `5 → 6` followed by an incorrect second request with revision `5`. Post-fix current/future two-step, same-screen Quick Add revision handoff, Routine, and existing auto-scroll/pointer regressions passed; focused JVM `53 / 53`, Android build/instrumentation compile/assemble, crash-buffer check, and `git diff --check` passed.
- Exact-SHA CI `36434645647` PASS; APK `taskchute-android-debug-8996e1b66895f5bd77d0636646f197f16fc99418`, artifact ID `10975751026`, expires `2026-10-05T14:18:23Z`. Galaxy S23 remains `NOT_VERIFIED / PRODUCT_OWNER_MANUAL`; Worker/API/shared contract, schema, migration, dependency, persistent nonprod, Production, and Release were unchanged/not run.
### D-146 Android Notes interaction refinements + movable Add FAB — 2026-09-29

- Implemented the approved Android Notes dogfood correctives: one-shot new-title focus/select-all, recoverable empty-title validation, local-time created/updated timestamps, compact `…` lifecycle sheet, shared `本文を入力` Markdown placeholder/full unfocused preview, touch-slop-safe link/checkbox interaction, Notes Selection Mode, and shared memory-only movable Add FAB.
- Android JVM `237 / 237`, Notes AVD `15 / 15`, Today shared-FAB representative `1 / 1`, final Android builds/diff-check, MainActivity smoke, and exact-SHA CI `36505504619` passed. APK `taskchute-android-debug-df89d1ef539eac7ebb353da5f7b4bda2490324d1`, artifact ID `11007415041`, expires `2026-10-06T00:59:07Z`. Product Owner tested the fresh D-146 APK on Galaxy S23 and reported `問題なし`; representative device smoke is `PASS / USER_CONFIRMED` (not a full device matrix or pixel comparison). Production `NOT_RUN`; Released `NO`.
- No Worker/API/shared contract, Web, schema, migration, dependency, persistent nonprod, D-145, or production change.

### D-148 current Galaxy S23 closeout — 2026-09-29

- Product Owner checked the latest D-148 APK `taskchute-android-debug-635ceacf46196a937bceeaaa9e21a1d31a3ea3c0` (artifact ID `11003786549`) on Galaxy S23 and reported `OK.問題なし`, recorded as `PASS / USER_CONFIRMED` representative smoke. Earlier intermediate APK failures remain historical evidence; full device matrix/pixel comparison is not claimed. Production `NOT_RUN`; Released `NO`.
### D-137 Android Daily loading latency corrective — 2026-09-29

- Android Daily now starts the Day projection and established-Day Daily summary read concurrently on an initial/cache-miss load. A controller-lifetime memory-only summary relation cache skips repeated full Daily list retrieval for known logical dates; successful Ensure/fetch updates the cache, and a cached Missing relation triggers one canonical re-list/reconcile without creating a synthetic document.
- Focused `DailyControllerTest` `7 / 7`, `DailyDocumentHttpRepositoryTest` `3 / 3`, Daily Compose AVD `1 / 1`, MainActivity/UI-tree smoke, crash buffer, `:app:compileDebugKotlin`, `:app:compileDebugAndroidTestKotlin`, `:app:assembleDebug`, and `git diff --check` passed. Exact-SHA CI `36519478907` passed; signed APK `taskchute-android-debug-c3625072b3c35f853839e17a55d1809fd198fe00`, artifact ID `11011904203`, expires `2026-10-06T04:00:48Z`.
- Worker/API/shared contract, schema, migration, dependency, persistent nonprod, and UI/domain semantics were unchanged. Web/Worker verification was skipped by the Android-only classifier. Authenticated Daily network runtime remains `NOT_VERIFIED`. Product Owner tested the fresh corrective APK on Galaxy S23 and reported `まあ早くなったね`; representative performance smoke is `PASS / USER_CONFIRMED` with perceived latency improved, while numeric benchmarking remains `NOT_RUN`. Production `NOT_RUN`; Released `NO`.
### D-149 Android Project Primary Notes — 2026-09-29

- Android Notesのactive listへmaterialized Project Primary Documentを追加し、`PROJECT NOTE`、Project title、archive suffix、created/updated timestampsを表示するbody-only Project editorを実装した。Project titleは編集せず、standaloneのselection / swipe / lifecycle actions、Project Ensureは追加していない。
- 既存のDocument HTTP routes、operation identity、revision/CAS、autosave、conflict、ambiguous exact reconcile、safe flushを維持。listの旧`project_documents` omission、unknown kind、別Project identityは安全に扱う。Worker/API/shared contract、Web、schema、migration、dependency、persistent nonprodは変更・実施なし。
- Implementation `97a9367fb1917b0b4f5b56a5ff9a4824b1fb86c4`、focused Android JVM `33 / 33`、D-149 instrumentation `2 / 2`、compile / instrumentation compile / assemble / diff-check、exact-SHA CI `36556167363` PASS。APK `taskchute-android-debug-97a9367fb1917b0b4f5b56a5ff9a4824b1fb86c4` / artifact ID `11027763308` / expires `2026-10-06T10:35:34Z`。
- Full Notes instrumentationは既存ケースのhangで完走せずPARTIAL / NOT_VERIFIED。Galaxy S23 `NOT_VERIFIED / PRODUCT_OWNER_MANUAL`、Production `NOT_RUN`、Released `NO`。
### D-149 corrective — all Android Notes Project candidates + lazy Ensure — 2026-09-29

- Android Notes now shows every Project Board item in the normal Notes list, including archived Projects. Board title/archive/order remains authoritative; materialized `project_documents` contributes document identity/revision/timestamps, and unmaterialized candidates display `作成日 --` / `更新日 --`.
- The first tap of an unmaterialized Project performs one existing D-103 Project Primary Ensure with UUIDv7 operation/document identity, adopts only a canonical matching Project Primary result, and preserves exact retry/reconcile identity on ambiguous outcomes. No eager/background Ensure is performed; Archived view remains Standalone-only and Project rows remain outside standalone Selection Mode/lifecycle actions.
- Implementation `a1d57de9cd60e79996ad7415ade08f7b8855b52d`; focused Android JVM `41 / 41`, D-149 focused `TaskChute_API33` instrumentation `3 / 3`, compile / instrumentation compile / assemble / diff-check / MainActivity smoke PASS. Full Notes remains PARTIAL / NOT_VERIFIED due to the pre-existing task-primary autosave hang.
- Exact-SHA CI `36562305310` PASS, Web/Worker SKIP. APK `taskchute-android-debug-a1d57de9cd60e79996ad7415ade08f7b8855b52d`, artifact ID `11029803506`, expires `2026-10-06T11:34:38Z`. Galaxy S23 `NOT_VERIFIED / PRODUCT_OWNER_MANUAL`; persistent nonprod `NOT_REQUIRED`; Production `NOT_RUN`; Released `NO`. No Worker/API/shared contract, Web, schema, migration, dependency, or persistence change.
### D-150 Android Notes IME footer separation — 2026-09-29

- Notes standalone editorのbottom barからNotes-only `imePadding()`を外し、本文editorのIME insetとD-135 Markdown toolbarを維持。本文focus中も共通footerがIME上へ持ち上がらないようにした。
- Implementation `cde59c0ee2fa170298b86cf518d761e1ba52c934`。focused Notes instrumentation選択`4 / 4 PASS`、compile / instrumentation compile / assemble / diff-check、MainActivity/UI-tree/crash-buffer smoke PASS。Exact-SHA CI `36566735084` PASS、APK artifact `taskchute-android-debug-cde59c0ee2fa170298b86cf518d761e1ba52c934` / ID `11032391422` / expires `2026-10-06T12:16:13Z`。実IME geometryはtest harness limitationで直接assertしていない。Galaxy S23 `NOT_VERIFIED / PRODUCT_OWNER_MANUAL`、Production `NOT_RUN`、Released `NO`。
- Worker/API/shared contract、Web、schema、migration、dependency、persistent nonprodは変更・実施なし。

- Product Ownerがcorrective APK `a5e01f3ef0c1dd791dbc595bc63276b67a923ac8`をGalaxy S23で確認し、Markdown toolbar / IME adjacencyとIME終了後のfooter復帰を`オケ問題なし`と確認。D-150 corrective representative device smokeを`PASS / USER_CONFIRMED`へ更新する。automated pixel geometryは引き続きharness limitationとして分離する。

### D-150 corrective — Markdown toolbar / IME adjacency — 2026-09-29

- Product OwnerのGalaxy S23 finding（Markdown toolbarがIME上端よりfooter相当分高く残る）に対し、Notes editor open + IME visible時は`Scaffold.bottomBar`へcontentを渡さず、footerの計測予約そのものを除去した。editor側`imePadding()`と`MarkdownLiveEditor.kt`は維持し、負のoffset・Activity/window inset変更は行っていない。
- Corrective implementation `a5e01f3ef0c1dd791dbc595bc63276b67a923ac8`、footer state JVM `1 / 1`、focused Notes AVD `4 / 4`、compile / instrumentation compile / assemble / diff-check、MainActivity/UI-tree/crash-buffer smoke PASS。Exact-SHA CI `36569749556` PASS、APK `taskchute-android-debug-a5e01f3ef0c1dd791dbc595bc63276b67a923ac8` / artifact ID `11033721498` / expires `2026-10-06T12:44:07Z`。
- 実IMEのtoolbar隣接pixel geometryはtest harness limitationで未直接測定。Galaxy S23 `NOT_VERIFIED / PRODUCT_OWNER_MANUAL`、persistent nonprod `NOT_REQUIRED`、Production `NOT_RUN`、Released `NO`。Worker/API/shared contract、Web、schema、migration、dependencyは不変。
### D-151 Android Notes long-press Selection Mode — 2026-09-29

- D-146のNotes Selection Modeを、左→右スワイプ開始・checkbox表示からStandalone Note rowのCompose標準long-press開始・selected row visualへcorrective。row-wide tap toggle、zero-selection auto-exit、Project Primary guard、Back、Add FAB/row action suppressionを維持し、`LazyListState.isScrollInProgress`中のentryを拒否。
- Implementation `ecd7234105574d929f6b5cf9bd7d26377f6cc37f`、focused JVM `2 / 2`、full Android JVM `266 / 266`、focused Notes AVD `4 / 4`、build/diff-check、MainActivity/UI-tree/crash-buffer smoke、Exact-SHA CI `36576219498` PASS。APK `taskchute-android-debug-ecd7234105574d929f6b5cf9bd7d26377f6cc37f` / artifact ID `11036894455` / expires `2026-10-06T13:38:02Z`。
- Product Ownerがfresh D-151 APKをGalaxy S23で確認し`問題なし`と報告したため、long-press Selection Modeの代表device smokeを`PASS / USER_CONFIRMED`として記録する（full device matrixではない）。Persistent nonprod `NOT_REQUIRED`、Production `NOT_RUN`、Released `NO`。Worker/API/shared contract、Web、schema、migration、dependencyは変更なし。Full Notes runnerは既知のtask-primary autosave hang境界を維持。

### D-152 Android Document Realtime Invalidation — 2026-09-30

- Added bounded targeted/wildcard realtime document invalidation for Android Notes and Daily, with Worker mapping for successful document mutations and Daily Ensure/body updates.
- Clean loaded editors refetch canonical HTTP data; dirty, saving, and blocked drafts are preserved and deferred invalidations retry at the existing save/reconcile boundary. Daily invalidation never performs Ensure/materialization.
- Android JVM `274 / 274`, Notes/Daily focused AVD, Worker focused test, Web typecheck, exact-SHA CI `36657992841`, and persistent nonprod runtime smoke PASS. Today standard surface remains `PARTIAL / NOT_VERIFIED`; Galaxy S23 `NOT_RUN`; Production `NOT_RUN`; Released `NO`.
- Product Owner subsequently reported `問題なし` after representative Galaxy S23 smoke on APK `taskchute-android-debug-d9b48e63fd6f4eaa3dc109feba97432db1d6d609` (implementation SHA `d9b48e63fd6f4eaa3dc109feba97432db1d6d609`, artifact ID `11073237433`): Web→open Android Note, Web→open Android Daily Note, and preservation of an Android local edit during a remote realtime change. Record as `PASS / USER_CONFIRMED`; full device matrix and exhaustive race verification remain unclaimed. Production `NOT_RUN`; Released `NO`.
