# D-170 — Android Warm Loading Performance v0.1

Status: **Approved / Partially implemented — D-168A Today paging slice only / broader verification pending**

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

Notes/Daily warm re-entry and the broader D-170 scope remain **Approved / Not implemented / Not verified**. The Today adjacent-Day paging sub-slice delivered by D-168A is implemented; it does not close D-170 as a whole.

## Partial implementation closeout — D-168A Today paging — 2026-10-05

D-168A starts the canonical adjacent-Day read as soon as a horizontal paging gesture is established and overlaps it with settle. It uses a bounded three-Day memory-only canonical cache, immediately presents a warm target while revalidating, confines cold loading/retry to below the fixed Today header, and discards stale responses across selected-date or session changes. Full Android app JVM `379 / 379`, Android app/AndroidTest compilation, and debug APK assembly pass. Exact-SHA CI [`37322578898`](https://github.com/hedgetheapp/taskchute-platform/actions/runs/37322578898) passes, including signed Phone/Wear builds and instrumentation APK compilation/signing. Signed Phone artifact `taskchute-android-debug-c59ae871ab7c1610517881f5ae760c7071b492af` (ID `11351285351`) expires `2026-10-12T14:13:19Z`. AVD UI runtime and numerical before/after timing are `NOT_RUN`: there is no connected ADB device and the only configured AVD, `D173B_Wear_API37`, is not a compatible Phone Today test target. No measured latency improvement is claimed. Notes and Daily behavior, dirty editor protection, and D-170 broader timing remain open. No persistence, offline writes, API/schema/migration, third-party telemetry, or backend changes. Production `NOT_RUN`; Released `NO`.
