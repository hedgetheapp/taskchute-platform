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
- minute-by-minute server polling;
- FCM requirement for the Phone Widget;
- general offline command queue.

Elapsed time may advance locally using platform time-dependent Widget presentation.

The progress bar may be recalculated when the Widget renders/refreshes; it does not require continuous server polling.

Widget refresh should occur after Widget actions and after relevant Android app canonical reconciliation/mutations when practical. Instant cross-client Web→Phone Widget propagation is not required by v0.1.

### 8. Android implementation boundary

Prefer existing Android/platform APIs and current app infrastructure.

D-177 does not approve a new long-term dependency solely for the Widget. In particular, implementation should not add Glance/WorkManager or another framework unless investigation proves the platform APIs/current dependencies cannot satisfy this Decision; that case is a STOP condition and returns to the Product Owner.

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
