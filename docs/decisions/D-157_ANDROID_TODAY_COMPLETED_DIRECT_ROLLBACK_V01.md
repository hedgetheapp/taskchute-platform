# D-157 — Android Today Completed → Planned Direct Rollback v0.1

Status: **Approved**

## Context

D-156 introduced current-Day Android Task Editor corrections for Running → Planned and Completed → Running, but intentionally required a two-step flow to return a Completed Entry to Planned.

Product Owner approved direct rollback on 2026-10-02 so that a mistaken completed record can be returned to the pre-start state from the same Task Editor without first saving an intermediate Running state.

## Decision

### 1. Completed → Planned by clearing both actual fields

For an eligible current established Day Completed Entry:

- clear actual start
- clear actual end
- Save
- Entry becomes planned

This is a correction that treats the editable completed Execution as an invalid mistaken execution fact.

Server-canonical outcome:

- guard owner, current established Day, Entry identity, Completed lifecycle, editable Execution identity, expected started_at, expected ended_at, and normal non-interrupted terminal state
- delete only that single editable completed Execution
- transition Entry completed → planned atomically with the Execution deletion
- preserve current section_id, planned_start_minute, position, estimate, Task metadata, Mode, Routine occurrence identity, and Day placement_revision
- do not create cancelled/tombstone/audit history in this slice
- do not delete or rewrite any other Execution

After success, the removed Execution contributes no start/end/duration projection. For the eligible single-Execution case, actual start/end are blank and completed duration returns to zero.

### 2. Existing D-156 gestures remain distinct

The Task Editor uses the actual-time fields themselves as the correction gesture:

- Completed + start retained + end blank → Running
- Completed + start blank + end blank → Planned
- Completed + start blank + end present → invalid
- Running + start blank + end blank → Planned

No separate rollback button or confirmation dialog is added.

### 3. Eligibility / historical safety

D-157 does not grant a general history-delete capability.

Direct Completed → Planned is limited to the same current-Day Completed editing boundary where one concrete editable, non-interrupted Execution can be identified safely.

If the Entry has multiple Execution segments, interrupted/continuation history, no unambiguous editable Execution, stale lifecycle/timestamps, or cross-owner identity, reject with no partial mutation.

D-157 does not delete an entire logical work chain and does not rewrite earlier valid historical Execution facts.

### 4. Routine-derived occurrence parity

The same direct rollback applies to an eligible current-Day Routine-derived occurrence.

It changes only that materialized Entry/Execution. It does not mutate Routine Definition, recurrence, defaults, other occurrences, or future materialization semantics.

### 5. Reminder interaction

D-155 reminder semantics remain unchanged.

After Completed → Planned canonical reconciliation:

- any running/overrun reminder state is absent
- start reminder intent is reevaluated under the existing Planned reminder rules
- no already-past reminder instant is emitted immediately as a fallback

### 6. Scope / non-goals

In scope:

- current established Day
- Android Today Task Editor
- eligible ordinary and Routine-derived Completed Entries
- server-canonical atomic Completed → Planned correction
- optimistic presentation/reconcile
- existing operation fingerprint / exact replay / stale guard / owner isolation

Out of scope:

- past/future Day lifecycle correction
- Web/Wear UI
- interrupted/continuation rollback
- multiple-Execution history deletion/editor
- undo/history/tombstone/audit persistence
- new lifecycle state
- production/release

No schema or migration is approved for D-157.

## Supersession

D-157 narrowly supersedes D-156 section 4 only where D-156 stated that Completed start+end both blank is invalid and requires a two-step Completed → Running → Planned flow.

All other D-156 semantics remain in force.

## Verification intent

Worker/API focused verification must cover:

- eligible Completed single Execution → Planned success
- exact expected start/end/lifecycle/owner/current-Day guards
- atomic Execution delete + lifecycle update
- placement / planned start / position / revision preservation
- no other Execution mutation
- interrupted or multi-Execution rejection
- exact replay and operation-id misuse
- Routine-derived current-Day parity without RoutineDefinition mutation

Android focused verification must cover:

- Completed both blank validates and saves as Planned
- Completed start-only still reopens to Running
- Completed end-only remains invalid
- optimistic Completed → Planned presentation clears execution/start/end/duration
- immediate editor reopen reflects Planned state
- failure/reconcile safety
- reminder fields remain unchanged

Persistent nonprod verification is required because Worker lifecycle semantics change. Production remains NOT_RUN unless separately approved.
