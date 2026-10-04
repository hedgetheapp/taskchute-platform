# D-164 — Wear Standalone Connectivity and Last-Known-Good Running Complication v0.1

Status: **Approved / Not implemented**

Date: 2026-10-04

## Context

The Product Owner reported that the Pixel Watch Running complication can disappear while a Task is still running.

Source investigation on current main found a concrete failure path in the existing implementation:

- Wear is already an independent TaskChute client: normal Today reads use the Watch's own authenticated HTTPS session and do not require the Phone app as a proxy.
- D-160 invalidation is delivered directly to Wear by FCM; WorkManager then re-fetches canonical Today.
- the complication provider also performs its own canonical fetch.
- a transient auth/load/network failure maps to `WearComplicationPresentation.Unavailable`.
- for `GOAL_PROGRESS`, `Unavailable` maps to `NoDataComplicationData`, which allows the visible Running complication to disappear even though the server-canonical Task may still be Running.
- therefore a successful background refetch followed by a second transient complication fetch can also erase an otherwise valid Running display.

D-154 already established that Wear normally talks directly to TaskChute Server. D-158/D-160 keep periodic/event-driven refresh as freshness mechanisms.

## Decision

### 1. Watch is a standalone canonical client

TaskChute Wear must continue to communicate directly with TaskChute Server using the Watch's own authenticated session.

The Product must not depend on an active Phone-app connection for normal Today / Running projection refresh.

The app should let Wear OS / Android networking choose the currently usable transport. Depending on device/network state this may be Phone-mediated connectivity, Wi-Fi, or LTE/eSIM. TaskChute should not model "Phone first, then SIM" as application-level authority.

When the Phone is unavailable but the Watch has usable Wi-Fi/LTE connectivity, Wear should continue canonical reads directly.

### 2. Transient connectivity failure must not erase known Running state

After Wear has successfully obtained a canonical Running projection, a transient fetch failure must not replace that known Running complication with `NoData`.

Transient cases include ordinary transport timeout, temporary network handoff, temporary 5xx, or equivalent retryable/unavailable conditions.

Wear may retain the last-known-good Running projection while canonical refresh is temporarily unavailable.

### 3. Canonical success remains authoritative

Last-known-good data is a temporary display fallback, not a new source of truth.

On the next successful canonical Today fetch:

- if the Task is still Running, refresh to that canonical Running state;
- if canonical Today has no active execution, clear/replace the Running presentation accordingly;
- if the canonical Running identity changed, replace the retained projection with the new canonical one.

Explicit authentication loss / unauthorized session handling remains authoritative and is not treated as a transient Running fallback.

### 4. Avoid success → redundant fetch failure → disappearance

Implementation must remove the current class of failure where:

1. background invalidation work successfully fetches canonical Today;
2. it requests a complication refresh;
3. the complication provider performs another network fetch;
4. that second fetch transiently fails;
5. the Running complication becomes `NoData`.

The exact implementation mechanism is delegated as long as it preserves the authority rules above. A small Watch-local persisted last-known-good projection is acceptable; a new server-side persistence model is not required by this Decision.

### 5. Background / periodic convergence

D-160 event-driven invalidation remains the normal freshness path.

D-158's 300-second system complication refresh remains fallback.

After connectivity returns, Wear must reconcile with canonical server state without requiring the Phone app to become connected first.

## Non-goals

This Decision does not:

- make Phone connectivity authoritative;
- add Phone → Watch proxying for normal Today reads;
- add a new server schema or API solely for the fallback cache;
- make stale local Running data permanently authoritative;
- change Start / Complete domain semantics;
- define new notification behavior;
- change production/release state.

## Verification target

Future implementation verification should include a physical Pixel Watch LTE scenario:

1. Running complication is visible.
2. Phone connection is removed / Phone is out of range.
3. Watch obtains independent network connectivity through Wi-Fi or LTE/eSIM.
4. transient network handoff/fetch failure does not erase the visible Running projection.
5. canonical refresh resumes without Phone reconnection.
6. completing the Task elsewhere is reflected after the Watch next successfully reaches the server.
7. explicit unauthorized/signed-out behavior remains correct.

Until implemented and tested, this remains **Approved / Not implemented / Not verified**.
