# D-165 — Today Section Overflow Minute-Precision Corrective v0.1

Status: **Approved / Not implemented**

Date: 2026-10-04

## Context

The Product Owner reported a Today UI inconsistency on Android:

- a Running Task row displayed a projected end of `12:00`;
- its timed Section also ended at `12:00`;
- the Section header nevertheless displayed `1分超過`.

Current-source investigation found two contributing behaviors.

### 1. Warning precision is finer than displayed forecast precision

Today row forecast text is displayed at logical-minute precision (`HH:mm`).

D-161 Section overflow, however, is currently derived from exact projected Instants and any positive duration is retained in seconds and later rounded upward for display.

Therefore a projected end such as:

`12:00:34`

is rendered in the row as:

`12:00`

while the Section warning becomes:

`1分超過`.

The same semantic mismatch exists in Web forecast warning calculation because it compares exact epoch milliseconds to the Section-end instant.

### 2. Android active Running endpoint reconstruction can add sub-second drift

Current Android forecast reconstructs active Running end as:

`now + max(estimateSeconds - floor(elapsedSeconds), 0)`

while `now` retains sub-second precision and elapsed duration is truncated to integer seconds.

That can produce a small positive sub-second drift even when the canonical endpoint is exactly:

`started_at + estimate`.

Web already derives the active endpoint equivalently to the exact canonical start-plus-estimate calculation at millisecond precision.

## Decision

### 1. Section overflow warning uses the same minute precision visible in Today

For D-161 **Section overflow only**, compare the projected end at the same logical-minute precision used by the Today forecast display.

Conceptually:

- convert the maximum eligible projected Section end to the displayed logical minute;
- compare that displayed minute to the canonical Section end minute;
- warning overflow minutes = `max(0, displayedProjectedEndMinute - sectionEndMinute)`.

Examples:

- Section end `12:00`, projected end `12:00:00` → no warning
- Section end `12:00`, projected end `12:00:34` → row displays `12:00` → no warning
- Section end `12:00`, projected end `12:01:00` → row displays `12:01` → `1分超過`
- Section end `12:00`, projected end `12:01:59` → row displays `12:01` → `1分超過`

The warning must not claim a greater minute value than the user can infer from the visible projected end.

### 2. Android Running forecast endpoint uses canonical start + estimate

For the active current-Day Execution, Android must derive the estimated endpoint directly from canonical execution start:

`started_at + estimate_seconds`

rather than reconstructing the endpoint from `now + truncated remaining seconds`.

This removes sub-second drift and makes the endpoint stable across ticker refreshes.

Elapsed/remaining/progress UI may continue to use current time for dynamic progress display; this Decision concerns the projected endpoint used by Today forecast/warning derivation.

### 3. Android/Web parity

D-161 requires Android and Web to produce the same warning semantics for the same canonical projection.

Therefore:

- Android adopts minute-precision Section overflow comparison;
- Web adopts the same minute-precision Section overflow comparison;
- fixed-start overlap/conflict semantics are **not changed** by D-165;
- positive fixed-start overlap may continue to round upward as approved in D-161.

### 4. Scope boundary

D-165 changes presentation-derived forecast/warning semantics only.

It does not change:

- persisted data;
- Task/Entry/Execution timestamps;
- estimate values;
- Section boundaries;
- fixed-start marker semantics;
- reminder delivery;
- D&D;
- API contracts;
- schema/migrations;
- production/release state.

## Verification target

Future implementation should verify at minimum:

1. Android Running `started_at + estimate` endpoint is stable across different `now` values.
2. Android Section end `12:00` + projected end `12:00:01` shows no overflow because the visible endpoint is `12:00`.
3. Android projected end `12:01:00` shows `1分超過`.
4. Web produces the same results for identical canonical input.
5. fixed-start overlap warning tests remain unchanged.
6. existing D-161 combined warning / collapsed discoverability behavior remains intact.

Until implemented and tested, this remains **Approved / Not implemented / Not verified**.
