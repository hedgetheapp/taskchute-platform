# D-177 — Android Home Widget v0.1

Status: **Approved / Implemented / Exact-SHA CI PASS / API 33 focused Widget runtime PASS / Galaxy S23 Product Owner device verification pending**

Date: 2026-10-07

## Context

TaskChute Platform treats Android Widget as a first-class Android capability that reuses the Android app's Domain / API / local-state architecture instead of becoming an independent companion implementation.

Before D-177, the Android Widget initial scope and Android background credential behavior were still Open.

The Product Owner approved the compact Widget proposal represented by Figma file `UbTJH6ykYNBQJS4Wvwz9jb`, node `698:8`, proposal v0.4, and additionally approved direct Widget Start / Complete using the existing Android authenticated session.

This Decision resolves only the v0.1 Widget scope and the narrow background-auth boundary required by that scope.

## Decision

### 1. v0.1 surface

Android adds one compact home-screen Widget for the current logical Day.

The Widget intentionally does **not** include:

- date header / date navigation;
- Quick Add;
- Notes;
- Section list;
- settings;
- broader Today controls.

The v0.1 surface prioritizes only:

- the current Running Task, when one exists;
- the next Planned Task.

### 2. Running presentation

When one Task is Running, the Widget shows:

- `今のタスク`;
- the Running Task title;
- the same running-action semantics as Android Today, using the existing `stop` icon language;
- elapsed time on the left, with the same `schedule` icon language as the Android Today Running Progress Player;
- remaining time (`estimate - elapsed`) on the right when a positive estimate exists, with the same `hourglass_top` icon language;
- after estimate overrun, right side follows the Android Today Running Progress Player: remaining is clamped to `00:00:00`, and `more_time` + `+HH:MM:SS` communicates overrun;
- the existing Running Progress Player visual language for the progress track/bar, including the overrun color transition;
- the next Planned Task below the Running Task.

Elapsed / remaining / overrun are displayed in `HH:MM:SS` form where applicable.

The semantic and icon authority for this Running time row is the current Android Today `RunningTaskPanel`; the Widget must not independently reinterpret these values.

When the Running Task has no positive estimate, the Widget must not invent a goal. It may show elapsed-only state and omit the remaining/progress goal, consistent with existing Running semantics.

### 3. Complete → next-task promotion

After canonical Complete succeeds and the Widget reconciles canonical Today:

- the completed Task disappears from the Widget;
- the next Planned Task is promoted to the primary visible Task;
- the promoted Task exposes the existing Android Today `play_arrow` Start action.

The Widget does not keep a completed-history row.

### 4. Next Task semantics

"Next Task" means the first eligible Planned Entry in the canonical current-Day ordering after applying the existing Today projection semantics.

Completed Entries are excluded.

While another Execution is active, the next Planned Task may be shown for preview, but the Widget must not dispatch Start for it. Existing single-active-Execution authority remains unchanged.

Once there is no active Execution, the promoted Planned Task may be started directly from the Widget.

If no eligible Planned Task exists, use a compact idle/empty representation with no Start mutation.

### 5. Direct Widget actions

The Widget may perform Start and Complete **without opening the Android app UI**.

It must reuse:

- the existing Android encrypted Better Auth cookie/session storage;
- the existing canonical Today repository / HTTP contracts;
- the existing Start / Complete server commands and operation identity rules.

Do not introduce:

- a new token;
- a new credential-handoff protocol;
- a new Widget-specific API command;
- a Widget-specific server authority.

Widget mutation success is canonical-server success, not local optimistic assumption.

After a successful Start / Complete, the Widget re-fetches/reconciles canonical Today and renders that result.

### 6. Failure / auth safety

For Widget read or mutation:

- `401` follows the existing signed-out/auth-required safety boundary;
- network / transport ambiguity must not be shown as canonical mutation success;
- deterministic rejection must not invent local Running / Completed state;
- retry/reconciliation must preserve existing operation identity and lifecycle invariants.

The Widget must not clear or weaken the existing encrypted session boundary merely to make background actions easier.

### 7. Background boundary

D-177 approves background use of the existing Android authenticated session **only for this Widget v0.1 canonical Today read / Start / Complete flow**.

This does not generally approve arbitrary Android background execution.

D-177 adds no:

- persistent background WebSocket;
- foreground service;
- periodic/minute-by-minute server polling;
- FCM requirement for the Phone Widget;
- general offline command queue.

A single local AlarmManager wake-up at the current Running Task's estimate boundary is Approved for the narrow purpose of switching the Widget from remaining-time presentation to Today-equivalent overrun presentation. This is not periodic polling and must not perform repeated background scheduling while the same estimate boundary remains authoritative.

Elapsed time may advance locally using platform time-dependent Widget presentation.

The progress bar may be recalculated when the Widget renders/refreshes; it does not require continuous server polling.

For a positive estimate, the Widget may use platform Chronometer behavior to advance elapsed and remaining time locally. Because RemoteViews cannot itself switch icons/colors at the zero crossing, schedule one local AlarmManager refresh for the canonical estimate-end instant. At that wake-up the Widget re-renders Today-equivalent overrun presentation. Cancel or replace the pending boundary alarm when canonical Running identity, start instant, estimate, completion, sign-out, or Widget installation state changes.

Use exact alarm delivery only when the platform permits it. If exact-alarm special access is unavailable, use a one-shot inexact AlarmManager fallback rather than requesting a new permission flow or introducing a persistent service. A delayed fallback refresh may temporarily delay the overrun visual transition; it must never invent canonical Task lifecycle state or trigger server polling.

Widget refresh should occur after Widget actions and after relevant Android app canonical reconciliation/mutations when practical. Instant cross-client Web→Phone Widget propagation is not required by v0.1.

### 8. Android implementation boundary

Prefer existing Android/platform APIs and current app infrastructure.

D-177 does not approve a new long-term dependency solely for the Widget. In particular, implementation should not add Glance/WorkManager or another framework. The approved one-shot estimate-boundary refresh must use the platform AlarmManager / BroadcastReceiver foundation already present in the Android app.

No APP/AUTH schema change, migration, Worker/API contract change, production operation, or Release is approved by D-177.

### 9. Visual authority

Use the current Android Today visual language rather than inventing new iconography.

In particular:

- Planned Start uses the existing Material Symbols Rounded `play_arrow`;
- Running Complete uses the existing `stop` action;
- Running colors/progress styling follow the existing Today / Running Progress Player direction;
- the approved Figma v0.4 node `698:8` is the implementation visual reference.

If Figma and canonical lifecycle/security rules conflict, the canonical rules win.

## Verification intent

Implementation should verify at minimum:

1. idle/no-running state promotes the first eligible canonical Planned Task;
2. Running state shows current Task + elapsed/remaining/progress + next Planned Task, with Today-equivalent schedule/hourglass/overrun icon semantics;
3. estimate-less Running does not invent a progress goal;
4. direct Widget Complete uses canonical Complete and, after success/reconcile, removes the completed Task and promotes the next Task;
5. direct Widget Start works when no Execution is active;
6. Widget never dispatches next-Task Start while an Execution is active;
7. Start / Complete work using the existing encrypted Android session without opening the app UI;
8. `401`, network failure, and deterministic rejection do not invent success;
9. process/background Widget entry can recover the stored session through the existing Android auth foundation;
10. no new server route, schema, migration, production mutation, or long-term dependency is introduced;
11. existing Android Today Start / Complete behavior remains unchanged;
12. Widget uses the existing `play_arrow` / `stop` visual language.

Galaxy S23 physical Widget behavior remains `NOT_RUN / PRODUCT_OWNER_MANUAL` until the exact implementation APK is tested.

Production remains `NOT_RUN`; Released remains `NO`.

## Implementation closeout — 2026-10-07

Implementation commit `d600f75dac79548853d28c7662fb7f70aa194de3` is on `main`. The Android implementation uses the platform `AppWidgetProvider` / `RemoteViews`, a non-exported action receiver with `goAsync()`, the existing encrypted Better Auth session, and the canonical Today repository/HTTP commands. Start and Complete re-read current Today, validate the canonical Entry / Execution identity, and render only a reconciled server projection. The Widget adds no dependency or server/persistence surface.

Focused JVM `19 / 19` passes. Android app and instrumentation sources compile, and local debug Phone plus instrumentation APK assembly passes. The required All runtime gate was attempted once; `TaskChute_API33` did not reach `sys.boot_completed=1` within 180 seconds, so runtime is `NOT_RUN / ENV_BLOCKED`. Exact-SHA GitHub Actions Android CI, signed APK build, certificate checks, and artifact upload pass. Targeted Sol Medium review found no meaningful authentication or exposure blocker; its remaining receiver-deadline caveat is recorded as R-078. Verification detail is in `docs/TEST_MATRIX.md`.

Galaxy S23 remains `NOT_RUN / PRODUCT_OWNER_MANUAL`. Production remains `NOT_RUN`; Released remains `NO`.


## Running estimate-boundary refresh refinement — 2026-10-07

RemoteViews countdown can update remaining time locally but cannot invoke app code when the countdown crosses zero, so it cannot by itself switch the Widget to the Today-equivalent overrun icon/color presentation. Product Owner approved a narrow one-shot AlarmManager refinement:

- while a canonical Running Task has a positive estimate, locally advance elapsed and remaining time using Widget-supported time-dependent views;
- schedule exactly one Widget refresh target for the canonical estimate-end instant;
- on boundary delivery, re-render from current/canonical Widget state into Today-equivalent overrun presentation;
- cancel/replace the boundary schedule when Running identity/start/estimate changes, when the Task completes, on sign-out, or when no installed Widget needs it;
- do not poll the server at intervals and do not introduce a service, WorkManager, FCM, or new dependency;
- if exact-alarm special access is unavailable, use a one-shot inexact AlarmManager fallback. A delayed transition is acceptable; fabricated lifecycle success or periodic polling is not.

This refinement changes only Widget presentation/scheduling. Existing D-177 authentication, canonical Start/Complete authority, and lifecycle rules remain unchanged.


## Start / Complete in-flight presentation refinement — 2026-10-07

Widget direct Start / Complete must not replace the whole Widget with a generic `読み込み中` state while the command is in flight.

The currently rendered Widget content remains visible until canonical reconciliation returns a new state. Duplicate command dispatch remains bounded by the existing Widget action gate and fresh canonical validation.

After the request:

- canonical success renders the reconciled new lifecycle state;
- stale action renders current canonical state without a loading flash;
- deterministic/transport failure must not invent success and may use the existing notice/error presentation over the reconciled state;
- signed-out/unavailable may still render their explicit terminal/status states when those are the actual resolved result.

This refinement changes presentation only. It does not add optimistic canonical mutation or weaken the existing Start / Complete authority.


## Running / action UX refinement implementation closeout — 2026-10-07

Implementation `99aa7fcb9d478a3fe690bf600047ba144ae4e7b8` is on `main`. The Running row now mirrors Today semantics: elapsed and remaining locally advance; after the estimate boundary, canonical re-read renders zero remaining, positive overrun, and the overrun progress color. Estimate-less Running remains elapsed-only with no progress goal or alarm. Direct Start / Complete retain the current Widget content while the existing command and canonical reconciliation run; the action gate, fresh Entry / Execution identity validation, encrypted session, and lifecycle authority remain unchanged.

A Widget-specific AlarmManager scheduler stores only a SHA-256 identity and alarm metadata in app-private preferences. Its non-exported receivers use immutable PendingIntents with a per-identity URI, exact delivery when permitted, and one-shot inexact fallback otherwise. Reconciliation replaces/cancels changed or invalid boundaries, stale deliveries cannot clear a newer record, and boot/package/exact-access changes restore or reevaluate the current alarm. When the boundary refresh observes the exact whole-second equality where overrun is still zero, one final wakeup at +1 second renders the first positive second; there is no polling or recurring loop. No task title, session, credential, API, schema, migration, or dependency was added.

Focused Widget JVM tests pass `26 / 26`; Android main and AndroidTest Kotlin compile, Phone debug APK assemble, and diff check pass. Exact-SHA CI for the implementation passed on attempt 2 after attempt 1 encountered an unrelated existing `DailyControllerTest.savingWarmDailyIsNotOverwrittenByBackgroundRefresh` assertion; the isolated rerun of that test passed. CI passed Android JVM, signed Phone/Wear build, instrumentation APK compilation, certificate verification, and artifact upload. The local environment had no connected device and only a Wear AVD, so Phone runtime/instrumentation remains `NOT_RUN / ENV_BLOCKED`; Galaxy S23 remains `NOT_RUN / PRODUCT_OWNER_MANUAL`. Production remains `NOT_RUN`; Released remains `NO`.


## Immediate optimistic Start / Complete presentation refinement — 2026-10-07

Product Owner requires direct Widget Start and Complete to feel immediate rather than waiting for the background canonical round trip.

The Widget may therefore render an **ephemeral optimistic lifecycle projection immediately on tap**, following the same authority split already used by Android Today:

- Start tap on the currently displayed eligible Planned Task immediately presents that Task as Running;
- Complete tap on the currently displayed Running Task immediately removes the Running presentation and promotes the already-known next Planned Task when available;
- the optimistic projection is presentation-only and is never persisted as canonical Task / Execution state;
- the existing encrypted session, fresh canonical validation, server Start / Complete command, operation identity, and post-command canonical reconciliation remain authoritative.

For optimistic Start, local tap time may be used only as a provisional display start for elapsed/remaining presentation until canonical Running returns. Canonical `started_at` replaces it on reconciliation. Do not schedule the estimate-boundary AlarmManager wake-up from a provisional start; schedule/replace it only from reconciled canonical Running state.

For optimistic Complete, the current estimate-boundary presentation alarm may be cancelled immediately; if canonical reconciliation restores the same Running state after failure/rejection, normal reconciliation re-establishes the authoritative boundary alarm.

While one Widget lifecycle mutation is unresolved:

- duplicate lifecycle command dispatch remains blocked;
- provisional action controls must not create a second Start / Complete against identities that are not yet canonical;
- this refinement does not newly approve general queued Widget lifecycle handoff beyond the existing D-177 action gate.

On stale action, deterministic failure, transport ambiguity, Unauthorized, or canonical contradiction, discard the optimistic projection and render the reconciled canonical result. The existing notice/error presentation may be used. After process death, Android may retain the last `RemoteViews` until the next Widget or app refresh; reopening the app starts the existing canonical Today load and Widget refresh, and the next Widget action/refresh also re-reads canonical state.

This refinement supersedes the earlier D-177 statement that Start / Complete keep the old rendered content until reconciliation. It preserves the separate requirement that the Widget never blank to a generic `読み込み中` state.

**Implementation closeout — 2026-10-07.** Implementation `435212d962b271e6d4f5adbeb4a55889f11ba6de` is integrated on `main`. The receiver applies a `RemoteViews` partial update after the existing action gate accepts a tap and before starting background canonical work. Start uses the already-rendered title and tap-time `elapsedRealtime` for display only; Complete uses the already-rendered next Planned title/metadata when available. Optimistic action controls are hidden and cleared. No provisional Execution identity, boundary alarm, follow-on lifecycle command, or app-private task snapshot/cache is created. The existing controller retains fresh canonical validation, command, and reconciled render authority. Focused Widget JVM is `30 / 30 PASS`; Android app and instrumentation compile, debug APK assemble, diff check, and exact-SHA CI pass. No compatible Phone runtime was available, so Widget runtime remains `NOT_RUN / ENV_BLOCKED`; Galaxy S23 remains `NOT_RUN / PRODUCT_OWNER_MANUAL`. Production remains `NOT_RUN`; Released remains `NO`.


## Canonical action-control restore corrective — 2026-10-07

D-177 v4 optimistic lifecycle presentation intentionally hides lifecycle controls while a mutation is unresolved. Product-owner device testing found a corrective defect: after optimistic Start is reconciled to canonical Running, the Complete action can remain hidden because the optimistic `RemoteViews` patch set the control to `GONE` and canonical render rebinds its PendingIntent without explicitly restoring `VISIBLE`. The symmetric Idle Start control has the same restoration risk after optimistic Complete.

This is not a new Product Decision. Canonical D-177 behavior already requires:
- canonical Running with a valid Execution identity exposes Complete;
- canonical Idle with an eligible next Planned Task exposes Start;
- provisional/optimistic states keep lifecycle controls non-actionable.

Corrective implementation must explicitly restore visibility and actionable PendingIntent on canonical Running/Idle render, and explicitly hide/clear the controls when canonical state is not eligible. Verification must cover the full optimistic → canonical transition rather than isolated optimistic and canonical renders only.

**Implementation closeout — 2026-10-08.** Implementation `8462c7fab753b945688ac15b6af408a83dfee666` now sets canonical Running Complete and eligible Idle Start to `VISIBLE` before binding the canonical PendingIntent and expected content description. Running without a usable Execution identity and Idle without an eligible Planned Task explicitly hide the action and clear any PendingIntent. `AndroidHomeWidgetRenderer.contentViews` is the same RemoteViews builder used by production rendering and by the transition instrumentation tests. The tests cover optimistic Start → canonical Running, optimistic Complete → canonical Idle-with-next, Running without Execution, and Idle without next using `RemoteViews.reapply`; focused JVM action eligibility tests protect the fail-closed decisions.

Focused Widget JVM `32 / 32`, `:app:compileDebugKotlin`, `:app:compileDebugAndroidTestKotlin`, `:app:assembleDebug`, and `git diff --check` pass. Exact implementation-SHA CI passed classification and the Android JVM / signed nonprod APK job, including Phone/Wear builds, instrumentation APK compilation, signer checks, and artifact upload; Web/Worker was skipped by Android-only classification. Phone instrumentation runtime is `NOT_RUN / ENV_BLOCKED` because the ADB server could not start and the emulator CLI is unavailable. Galaxy S23 remains `NOT_RUN / PRODUCT_OWNER_MANUAL`. No v4 behavior, Product semantics, dependency, API/schema/migration, backend, or production boundary changed. Production remains `NOT_RUN`; Released remains `NO`.


### Galaxy S23 representative corrective smoke — 2026-10-08

Product Owner installed/tested the exact corrective build for implementation `8462c7fab753b945688ac15b6af408a83dfee666` on Galaxy S23 and reported `問題なし`. Record this as narrow `PASS / USER_CONFIRMED` evidence for the requested action-restoration path:

- after optimistic Start reconciles to canonical Running, Complete remains visible/actionable;
- after optimistic Complete reconciles to canonical Idle with an eligible next Planned Task, Start remains visible/actionable.

This is representative smoke only, not a full device matrix or exhaustive Widget runtime verification. Automated Phone instrumentation remains `NOT_RUN / ENV_BLOCKED`. Production remains `NOT_RUN`; Released remains `NO`.


## Action affordance and allocated-height corrective — 2026-10-24

This corrective implements the already-approved D-177 optimistic Complete behavior and lifecycle authority; it adds no Product decision.

- When optimistic Complete already knows the next Planned task, show its title and the existing 48 dp play-action slot immediately in the same row.
- Keep that provisional slot disabled and clear its PendingIntent while canonical completion is unresolved. Restore its enabled state and bind a fresh Start PendingIntent only after canonical Idle confirms an eligible Planned task.
- Explicitly hide, disable, and clear the Start action when an optimistic or canonical Running state makes it ineligible, and when canonical Idle has no eligible next task.
- Fill the launcher-provided widget allocation with the root while preserving current compact content and the existing 48 dp action dimensions.

**Implementation closeout — 2026-10-24.** Implementation `491e2b99413db6f2f44ff2040352a2f5cacf820d` adds the disabled pending visual and accessibility description, stateful icon tint, explicit Start clearing when Running returns, and `match_parent` root height with compact vertical padding. It does not change lifecycle authority, authentication, the D-177 action gate, canonical validation/reconciliation, alarms, or persistence.

The focused `AndroidHomeWidgetInstrumentedTest` passes `10 / 10` on API 33. `RemoteViews.apply/reapply` coverage verifies the pending Complete→next Planned display has no listener/PendingIntent, repeated optimistic reapply stays disabled, canonical Idle restores the action within unchanged 48 dp bounds, and canonical Running/empty states clear it. Measured layout coverage at 280 dp width × 220 dp / fontScale 1.0 and 280 dp × 240 dp / fontScale 1.2 confirms the root fills the allocation, content fits, and the title does not overlap the action. `:app:compileDebugKotlin`, `:app:compileDebugAndroidTestKotlin`, `:app:assembleDebug`, and `git diff --check` pass. Exact-SHA [CI run 40067179976](https://github.com/hedgetheapp/taskchute-platform/actions/runs/40067179976) passed on attempt 1; the Android JVM and signed Phone/Wear job, instrumentation APK compile, signer checks, and artifact uploads passed. Web/Worker was skipped by Android-only classification. Phone artifact `taskchute-android-debug-491e2b99413db6f2f44ff2040352a2f5cacf820d` / ID `12549766535` (expires `2026-10-31`) has package `com.hedgetheapp.taskchute`, versionCode `1281`, APK SHA-256 `147E802332560780A14FA196AE10E3E7D76249ADD8F6489A0589E15B0044BFAB`, and CI-verified signer SHA-256 `690C0BA4EC3C8C92C84883F54BA343FF37AC0B83CEDCAEB626777885E8B602B3`.

Galaxy S23 remains `NOT_RUN / PRODUCT_OWNER_MANUAL`; Product Verified remains `NO`, Production remains `NOT_RUN`, and Released remains `NO`. No Worker/API/shared contract/schema/migration/dependency or persisted-data change.


## Compact fixed-height Phone trial — 2026-10-24

The Product Owner selected direction B for this corrective: Running and Idle share one fixed visual frame, kept compact while preserving the Running next-Planned preview. This trial uses an **adjustable 188 dp candidate**. The launcher-allocation root remains `match_parent`; the background and inner content frame are both 188 dp. Vertically centering the visible content group balances Idle, empty, and status states without filler content or new controls. Existing 48 dp actions and optimistic Complete→disabled pending Start/no-PendingIntent semantics remain unchanged.

The source instrumentation adds 280 dp width cases at 188/220/240 dp allocations and fontScale 1.0/1.3, covering long titles, Running with/without estimate and overrun, notice, Idle with/without next task, status, frame bounds/balance, and 48 dp actions. XML parsing, `git diff --check`, and `:app:compileDebugAndroidTestKotlin` pass. Instrumentation compiled but was **not run**; frame layout has not been measured on a runtime. Galaxy S23 remains `NOT_RUN / PRODUCT_OWNER_MANUAL`. The 188 dp value is not a proven optimum; Product Verified remains `NO`.

Trial implementation `eb486cc9fbd5c96666b28451893874fd07695a0b` is on `main`. Exact-SHA [GitHub Actions run 40080063028](https://github.com/hedgetheapp/taskchute-platform/actions/runs/40080063028) passed on attempt 1 for Android JVM, signed Phone/Wear builds, instrumentation APK compilation, signer verification, and uploads; Web/Worker was skipped by Android-only classification. Phone artifact `taskchute-android-debug-eb486cc9fbd5c96666b28451893874fd07695a0b` / ID `12554019184` (expires `2026-10-31`): package `com.hedgetheapp.taskchute`, versionCode `1283`, APK SHA-256 `FC1BC2A281C3FC3D36071A1FCC187E9CB4FBF18135D64E07A620321934BC736B`, ZIP SHA-256 `B64DD0BC57C6269BAA918E41786A076D6D123632DFD7DD80E07E7638100C335E`, signer SHA-256 `690C0BA4EC3C8C92C84883F54BA343FF37AC0B83CEDCAEB626777885E8B602B3`. Production remains `NOT_RUN`; Released remains `NO`.

## Complete action enabled-state corrective — 2026-10-24

The user reported that Widget Complete could not be tapped after Widget Start. Source-supported root cause (not runtime-reproduced): optimistic Start correctly disabled the Complete surface and stop icon while canonical Start was pending, but canonical Running rebound the Complete `PendingIntent` without explicitly enabling either view. When Android reapplies the `RemoteViews`, the pending disabled state can therefore survive even though the action listener is present. The corrective now explicitly enables both views only when the canonical Running projection has a validated Entry / Execution identity. A missing identity or invalid/status state hides and disables Complete and clears its `PendingIntent`. No early Complete, action-gate bypass, or lifecycle-authority change is introduced.

Regression instrumentation applies optimistic Start and reapplies canonical Running, then checks the enabled state separately from listener presence and repeats canonical reapply. It also checks optimistic `performClick()` is rejected, canonical Running without an Execution stays hidden/disabled, and an invalid canonical state clears a pending Complete. The instrumentation source compiled but was **not executed**; no ADB/emulator was launched. `AndroidHomeWidgetLogicTest` passes `34 / 34`; `:app:compileDebugKotlin`, `:app:compileDebugAndroidTestKotlin`, and `git diff --check` pass.

Implementation `a88b708d52464157b1d10469b30af5f312041560` is on `main`. Exact-SHA [GitHub Actions run 40097247354](https://github.com/hedgetheapp/taskchute-platform/actions/runs/40097247354) passed on attempt 1 for Android JVM tests, signed Phone/Wear debug APKs, AndroidTest APK compilation, signer verification, and artifact uploads; Web/Worker was skipped by Android-only classification. Phone artifact `taskchute-android-debug-a88b708d52464157b1d10469b30af5f312041560` / ID `12561765678` (expires `2026-10-31`): package `com.hedgetheapp.taskchute`, versionCode `1287`, directly measured APK SHA-256 `88E2B14E4F9C3FD4B409F3848F80AF1920077B611F57A922DDB7C18EC8E6302F`, artifact ZIP SHA-256 `CC39E7C09FD1A63B7B36E7CE0859469667BC7A122E6497E5E508FB801999FEE1`, signer SHA-256 `690C0BA4EC3C8C92C84883F54BA343FF37AC0B83CEDCAEB626777885E8B602B3`. Local APK package, versionCode, signature and APK digest were checked from the downloaded artifact. Galaxy S23 retest remains `NOT_RUN / PRODUCT_OWNER_MANUAL`; Product Verified `NO`, Production `NOT_RUN`, Released `NO`.

## Launcher allocation and initial-cell sizing corrective — 2026-10-25

This corrective resolves the trial's fixed-height mismatch while preserving D-177's approved Running and Idle two-slot content, lifecycle transitions, canonical action gates, and 48 dp controls. It does not approve a one-row design or any new Widget behavior.

- The provider requests `targetCellWidth=4` and `targetCellHeight=2` on Android 12+; legacy `minWidth=280dp` and `minHeight=200dp` remain for Android 11 and lower. Android's sizing guidance defines target cells as the default size when the Widget is added and notes that actual cell sizing and margins vary by host. [Official sizing guidance](https://developer.android.com/develop/ui/views/appwidgets/layouts).
- The root, content frame, and rounded background now follow the host allocation. Before this change, the fixed 188 dp content/background left 32 dp and 52 dp of unused frame at 220 dp and 240 dp host heights, and the 188 dp notice/preview case clipped by about 5 dp in API 33 instrumentation.
- The minimum frame is now 200 dp. Only spacing was reduced to fit the most constrained tested Running notice/preview state at fontScale 1.3; title/time/action/preview sizes and the two-slot model remain intact.
- API 33 `TaskChute_API33` instrumentation passes `13 / 13`. Synthetic host bounds covered widths 240/280 dp, heights 200/220/240 dp, fontScale 1.0/1.3, Running with long title, estimate/no estimate, overrun, notice, optimistic Start/Complete, Idle two/one/zero slots, and status. Root/content/background bounds matched the tested allocation; 48 dp actions and preview fit checks passed.
- The 4x2 value is the requested default cell span, not a measured Galaxy S23 result. The old provider had no target-cell values, so its actual previous row/column count is unknown. Galaxy S23 / One UI allocation, adjacent icon placement, and action smoke remain `NOT_RUN / PRODUCT_OWNER_MANUAL`; do not claim exact cells from the AVD tests. To exercise the new default placement on an existing installation, remove and re-add the Widget because target cells define default size when it is added. Existing instances still render into their host-provided bounds.

Implementation `19db70d8006329dd53cc48d0e8b5cd470cb8c8b0` is on `main`. Exact-SHA Android CI passed Android JVM tests, signed Phone/Wear builds, AndroidTest APK compilation, signing checks and artifact upload; Web/Worker was skipped for Android-only impact. Current run and Phone artifact identity are reported in the handoff because GitHub keeps those volatile details. Product Verified remains `NO`; Production is `NOT_RUN`; Released remains `NO`.

## 2x2 responsive layout refinement — 2026-10-25

The Product Owner's task contract approves changing the default Phone Widget placement to 2x2 and providing size-responsive layouts for the existing D-177 Running/Idle two-slot content. This refines only provider sizing and presentation; D-177 projection, elapsed/remaining/overrun behavior, optimistic transitions, canonical lifecycle authority and reconciliation, action gates, 48dp controls, authentication, and persistence remain unchanged. No API, Worker, schema, migration, shared contract, dependency, or production change is included.

- On Android 12+, the provider requests `targetCellWidth=2` and `targetCellHeight=2`; the initial resource is the compact vertical layout. Legacy minimums are 130x117dp and resize minimums are 110x117dp.
- When the host supplies `OPTION_APPWIDGET_SIZES`, the renderer provides one `RemoteViews` per supplied size. Width below 203dp selects compact vertical; wider bounds with height below 180dp select compact horizontal; other bounds select the existing detailed layout. An empty size list and Android versions before API 31 use the legacy width/height options, with 130x220dp defaults when no options exist. Resizing requests a refresh so canonical content is rendered again.
- Every variant retains the two-slot state, task metadata, status/notice, timing/progress, accessibility descriptions and the same validated action identities. The next-task preview remains display-only. Lifecycle actions retain their existing canonical checks and optimistic disabled/pending behavior.
- Local `AndroidHomeWidgetLogicTest` passes `35 / 35`; API 33 `TaskChute_API33` instrumentation passes `16 / 16`, including 110/130/150x220dp (plus 130x200dp), 240x200/220dp, 269x117dp, and 280x200/220/240dp bounds, fontScale 1.0/1.3, long titles, notices, estimate/no-estimate/overrun, Running, Idle, empty/status and action target checks. Local app / AndroidTest compilation, Phone debug APK assembly, and `git diff --check` pass. Exact-SHA GitHub Actions for `fb67da20a5e48b9f997822969cd0021b7be9ba5d` succeeded on attempt 1: Android JVM, signed Phone/Wear builds, instrumentation APK compilation, signer verification, and uploads passed; Web/Worker was skipped by Android-only classification. The CI-signed Phone APK is package `com.hedgetheapp.taskchute`, versionCode `1291`, and its signer matches the configured nonprod fingerprint. See the task handoff for the artifact, expiry and APK SHA-256.
- Android host cell geometry and margins vary; published Pixel 4 2x2 portrait/landscape sizes are examples, not Galaxy measurements. Galaxy S23 / One UI allocation and action smoke remain `NOT_RUN / PRODUCT_OWNER_MANUAL`; Android 11-and-lower sizing runtime is also untested. Remove and re-add an existing Widget to receive the new initial span. Product Verified remains `NO`; Production is `NOT_RUN`; Released remains `NO`.

Implementation source: `fb67da20a5e48b9f997822969cd0021b7be9ba5d`. See `docs/CURRENT.md` and `docs/TEST_MATRIX.md` for current verification evidence. [Official Android sizing guidance](https://developer.android.com/develop/ui/views/appwidgets/layouts).
