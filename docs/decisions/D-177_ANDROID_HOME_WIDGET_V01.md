# D-177 — Android Home Widget v0.1

Status: **Approved / Implemented / Exact-SHA CI PASS / Local AVD ENV_BLOCKED / Product Owner device verification pending**

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
