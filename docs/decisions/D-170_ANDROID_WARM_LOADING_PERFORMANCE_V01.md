# D-170 — Android Warm Loading Performance v0.1

Status: **Approved / Implemented / Integrated (D-168A Today; D-170B Notes + Daily) / focused JVM + exact-SHA CI PASS / Phone UI and numerical timing not run**

Date: 2026-10-04

## Goal

Improve the perceived and measurable loading speed of Android Today, Notes, and Daily without changing canonical server authority or introducing a persistent offline cache.

The first slice follows:

**measure → keep already-loaded UI visible → refresh canonically in background → measure again**

This Decision intentionally avoids speculative backend/API redesign until current bottlenecks are measured.

## Current-source findings

### Today

`TodayController` keeps loaded Day state in memory across destination changes, but `TodayScreen` calls `loadCurrent()` when the composable is entered.

When an existing Day is present the controller uses `REFRESHING`, so Today already has a partial stale-while-revalidate shape and can keep content available while the network request runs.

D-170 should preserve and tighten that behavior rather than replacing it with a new cache layer.

### Notes

`NotesController` survives navigation in `MainActivity` and retains its loaded lists, but `NotesScreen` calls `controller.load()` on entry.

`load()` sets `loadingList = true`, and `NotesList` currently replaces the existing list with a blocking `ノートを読み込んでいます…` presentation until the refresh completes.

Therefore a previously loaded Notes list can feel slow even though usable data is already in memory.

### Daily

`DailyController` also survives navigation and retains the selected document plus an in-memory date→summary cache.

However `DailyScreen` calls `loadCurrent()` on entry, `loadDate()` sets `loading = true`, and the screen replaces the editor/content with a spinner while refresh work runs.

For an uncached date, Daily currently performs:

1. Day fetch and Daily summary-list fetch in parallel;
2. then fetches or ensures the Daily document.

This makes first-time Daily loading naturally more network-sensitive than Today.

## Decision

### 1. Canonical authority remains Server

Memory state is presentation acceleration only.

The TaskChute Server remains authoritative for:

- Today Day / Entry / Execution state;
- Notes list and Document state;
- Daily Day / Document state.

A warm in-memory value must be reconciled with canonical server state.

D-170 does not approve an offline-write model.

### 2. Same-process warm re-entry must not blank useful content

If the requested surface already has usable canonical data from the current app process, re-entering that surface must show that data immediately.

Background canonical refresh may begin at once, but it must not replace already-renderable content with a blocking full-screen/list spinner.

Applies to:

- Today;
- Notes list;
- Daily document for the same requested logical date.

### 3. Notes warm-list behavior

When Notes already has a loaded list:

- keep the existing list rendered;
- refresh in the background;
- do not replace the list with `ノートを読み込んでいます…`;
- reconcile to the returned canonical list when successful.

A lightweight non-blocking refresh indicator is allowed but not required.

If there is no usable prior Notes list, the existing initial loading presentation may be shown.

Existing dirty editor / autosave / CAS behavior is unchanged.

### 4. Daily warm-document behavior

When Daily already has the requested logical date and a loaded Document:

- keep the editor/body rendered while canonical refresh occurs;
- do not replace it with the blocking loading spinner;
- update to canonical content only when it is safe under the existing dirty/saving/blocked rules.

Never overwrite local unsaved edits with a background refresh.

If the requested date has no usable loaded Document, normal initial loading remains allowed.

The existing in-memory `dailySummaryCache` may be reused and expanded only within the current process.

### 5. Today warm behavior

Today must continue to preserve already-loaded Day content during background refresh.

D-170 may remove redundant visual loading transitions or redundant same-surface refresh triggers if investigation proves them unnecessary, but must not weaken realtime/canonical convergence.

A missed or delayed realtime invalidation must still be recoverable through a normal canonical refresh.

### 6. Editor safety boundary

D-170 does **not** approve blindly opening a stale cached editable Note or Daily Document and allowing writes before canonical revision safety is established.

For editable Documents:

- existing loaded editor state may remain visible;
- dirty/saving/blocked state has priority;
- a newly reopened Document that would otherwise require a fetch must not become write-enabled solely from an unvalidated stale cache.

Any broader editable-document cache semantics require a separate Decision.

### 6A. Sign-out handling when Notes / Daily have unsaved state

The Product Owner approved the following sign-out behavior for D-170 session isolation.

If neither Notes nor Daily has an unsaved / saving / unresolved state, sign-out proceeds normally.

If Notes or Daily has an unsaved, saving, blocked, ambiguous, conflict, or otherwise unresolved local editing state that could be lost by session reset:

- do **not** sign out immediately;
- present a confirmation dialog explaining that unsaved changes exist;
- actions are **破棄してログアウト** and **キャンセル**;
- **破棄してログアウト** explicitly discards the local pending state and then signs out;
- **キャンセル** aborts sign-out and returns to the current authenticated UI;
- do not add an automatic “save then sign out” workflow in this slice.

This confirmation is the authority boundary that permits Notes / Daily memory and pending-state reset on sign-out without silent data loss.

### 7. Measurement first

Before optimization, add local/dev performance evidence for at least:

- cold app start → auth restore complete;
- auth restore complete → Today content;
- warm Today re-entry → first usable content;
- Notes tap → first usable list;
- warm Notes re-entry → first usable list;
- Daily tap → first usable editor/content;
- warm Daily re-entry → first usable editor/content.

Prefer local timestamps/test hooks/logging that do not transmit analytics or personal content.

Do not add third-party analytics or remote telemetry.

Record before/after evidence in TEST_MATRIX/current handoff as appropriate.

### 8. No fixed millisecond SLA in v0.1

D-170 does not invent an arbitrary hard latency budget before baseline measurement exists.

Acceptance for this slice is behavioral plus comparative:

- same-process warm re-entry does not block on network before showing already-loaded content;
- before/after measurements show whether network wait was removed from the visible critical path;
- no correctness/reconciliation regression.

If measurement shows server/API latency dominates cold load, report the evidence before changing backend contracts.

### 9. D-168 coordination

D-168 already allows safe bounded adjacent-Day prefetch for page swiping.

D-170 may reuse future in-memory adjacent-Day data when D-168 is implemented, but D-170 does not require prefetch and does not expand D-168's navigation semantics.

### 10. Not approved in this slice

D-170 v0.1 does not approve:

- persistent disk/database cache for Today/Notes/Daily content;
- offline editing;
- new schema/migration;
- new backend endpoint;
- changing existing API response contracts;
- third-party performance SDK/analytics;
- server-side caching architecture changes;
- production deployment/release by itself.

If measurements show one of these is materially useful, STOP and return with evidence/options.

## Verification target

Future implementation should verify at minimum:

1. warm Today re-entry shows prior usable Day immediately while canonical refresh runs;
2. warm Notes re-entry keeps the existing list visible during refresh;
3. first Notes load still shows an appropriate loading state when no data exists;
4. warm Daily re-entry for the same date keeps the existing editor/body visible during refresh;
5. Daily background refresh never overwrites dirty/saving/blocked content;
6. first Daily load still safely performs the required canonical load;
7. successful background refresh updates stale warm data;
8. failed background refresh does not erase still-usable warm data, while surfacing retry/error appropriately;
9. realtime invalidation still reconciles Today/Notes/Daily;
10. sign-out/principal change must not expose the previous principal's warm data;
11. no persistent cache, schema, migration, API, or dependency is added;
12. before/after timing evidence is recorded.

At decision creation, Notes/Daily warm re-entry and session isolation remained **Approved / Not implemented / Not verified**. D-168A delivered the Today adjacent-Day paging slice; D-170B closes the Notes/Daily warm re-entry and session-isolation implementation. Device UI verification and numeric before/after timing remain `NOT_RUN`; deterministic held-response tests provide behavioral evidence that network completion is no longer on the warm presentation path. See the closeouts below and `docs/TEST_MATRIX.md`.

## Partial implementation closeout — D-168A Today paging — 2026-10-05

D-168A starts the canonical adjacent-Day read as soon as a horizontal paging gesture is established and overlaps it with settle. It uses a bounded three-Day memory-only canonical cache, immediately presents a warm target while revalidating, confines cold loading/retry to below the fixed Today header, and discards stale responses across selected-date or session changes. Full Android app JVM `379 / 379`, Android app/AndroidTest compilation, and debug APK assembly pass. Exact-SHA CI [`37322578898`](https://github.com/hedgetheapp/taskchute-platform/actions/runs/37322578898) passes, including signed Phone/Wear builds and instrumentation APK compilation/signing. Signed Phone artifact `taskchute-android-debug-c59ae871ab7c1610517881f5ae760c7071b492af` (ID `11351285351`) expires `2026-10-12T14:13:19Z`. AVD UI runtime and numerical before/after timing are `NOT_RUN`: there is no connected ADB device and the only configured AVD, `D173B_Wear_API37`, is not a compatible Phone Today test target. Product Owner tested the fresh D-168A Phone build on Galaxy S23 and reported `問題なし`; record the Today adjacent-paging warm-loading UX as representative `PASS / USER_CONFIRMED`, while retaining numerical timing as `NOT_RUN` and making no quantified latency claim. At the D-168A closeout, Notes/Daily behavior, dirty editor protection, and broader D-170 work remained open; D-170B closes the Notes/Daily implementation scope below. No persistence, offline writes, API/schema/migration, third-party telemetry, or backend changes. Production `NOT_RUN`; Released `NO`.

## D-170B Notes / Daily warm re-entry closeout — 2026-10-06

Implementation `aeba7090189169963cea2d2f8686a0f5c030e5d5` is on `main`; test-only CI stability follow-up `bd4b79f19a68989ac4b576b535ca703cc2070a44` is also on `main`. Notes keeps independent in-memory snapshots for active and archived lists, including a loaded-empty list, renders a warm snapshot while fetching canonical data, reconciles success, and preserves the snapshot with retry/error on failure. Realtime list invalidation during an in-flight read is coalesced into another canonical read.

Daily preserves an already loaded same-date document/body during re-entry and refresh. It adopts only a response for the current request/date/document when local editing is still clean, the edit generation did not change after request start, and the returned revision is not older. Dirty, saving, blocked/unresolved, and newly typed-then-reverted states are preserved. Failed or temporarily unavailable same-date refreshes keep the warm body and save status and expose retry. Realtime invalidation retains the same local-edit and revision guards.

Notes and Daily asynchronous work uses a cancellable session child scope. Authenticated session exit clears list snapshots, editor/selection/lifecycle state, Daily document/day/body/cache/invalidation state, and prevents a previous session response from repopulating either surface. When pending local state could be lost, the approved sign-out dialog offers `破棄してログアウト` and `キャンセル`; only explicit discard clears both controllers before sign-out. Clean sign-out proceeds normally. No auth authority or canonical server semantics changed.

Focused `NotesControllerTest` `40 / 40 PASS`, `DailyControllerTest` `19 / 19 PASS`, and the additional CI-triggered Today token-generation test `1 / 1 PASS`. App Kotlin compile, AndroidTest Kotlin compile, debug APK assemble, and `git diff --check` pass. The first exact-SHA CI attempt on `aeba709` exposed an existing unrelated failure-token test that treated an intermediate `null` as a new token; its predicate was hardened in the test-only `bd4b79f` follow-up. Exact-SHA CI [`37444571375`](https://github.com/hedgetheapp/taskchute-platform/actions/runs/37444571375) on `bd4b79f` passes all Android jobs; Web/Worker were correctly skipped. Fresh signed Phone APK `taskchute-android-debug-bd4b79f19a68989ac4b576b535ca703cc2070a44`, artifact ID `11402413860`, expires `2026-10-13T09:42:46Z`.

Held-response tests prove usable warm Notes/Daily content remains available before canonical response completion; numeric before/after device timing is `NOT_RUN`, and no latency claim is quantified. No compatible Phone AVD was available (`D173B_Wear_API37` is Wear-only); Android UI runtime is `NOT_RUN / NO_COMPATIBLE_PHONE_AVD`. Galaxy S23 is `NOT_RUN / PRODUCT_OWNER_MANUAL`. No Worker/API/shared contract, schema/migration, dependency, persistent cache, Web/Wear, production operation, or user-data mutation. Production `NOT_RUN`; Released `NO`.
