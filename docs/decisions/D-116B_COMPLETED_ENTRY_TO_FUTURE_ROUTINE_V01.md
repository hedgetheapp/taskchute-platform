# D-116B — Completed Entry to Future Routine Atomic Conversion v0.1

Status: **Approved**

## Decision

From the current established logical Day, an authenticated owner may create one
future Routine based on an ordinary completed Entry with completed Execution
history. This creates a new Task and RoutineDefinition for future use; it does
not convert or rewrite the completed Entry into a RoutineOccurrence.

The source Entry remains completed with its Entry, Task, Execution, actual-time,
placement, and historical metadata identities and values unchanged. Its
`routine_occurrence_id` remains `NULL`.

## Source metadata authority

- Title is read from the source Task, which remains the title authority.
- Project is copied from the source Entry's `entry_project_snapshots` row.
  `tasks.project_id` is not a fallback or copy authority because multiple
  Entries may share one Task and D-116A corrects completed Project history at
  Entry scope. A missing snapshot fails closed. A non-null Project must still
  be active and owner-scoped; archived or deleted targets must first be
  corrected or cleared through D-116A.
- Mode is copied from the source Entry's `entry_mode_snapshots` authority.
  Missing historical Mode means no default Mode. A non-null Mode must still be
  active and owner-scoped; archived or deleted targets must first be corrected
  or cleared through D-116A.
- Entry Section and planned start are copied together only when the pair is
  valid in the current Section configuration; otherwise both Routine defaults
  are null. Estimate is copied from the Entry.

## Future Routine

The new Routine uses a daily schedule, starts on the next logical TaskChuteDay,
has no end date, and is active/enabled. Its Task, RoutineDefinition, schedule,
optional default Mode, valid Section/start defaults, estimate, Board item,
materialization order, one Board revision increment, source correlation, and
success operation result are committed atomically. The command does not create
a current-Day occurrence or Entry; normal lazy materialization remains
authoritative when a future Day is later loaded.

## Idempotency and correlation

`CreateFutureRoutineFromCompletedEntry` is one owner-scoped atomic command with
the existing operation fingerprint, exact replay, and operation-id misuse
semantics. The minimal `completed_entry_future_routines` relation maps each
source Entry to at most one created RoutineDefinition for that owner. It is
technical retry/reload correlation, not RoutineOccurrence identity. Exact
replay returns the stored result. A new operation for an already-correlated
source converges to that Routine even if the submitted Routine Board revision
is stale. Concurrent conversions of one source converge to one Task, Routine,
Board item, and correlation.

The correlation is retained if the linked Routine is later archived or deleted
through existing soft-delete semantics, so the source action does not create a
replacement Routine. The completed source Entry remains protected from hard
deletion while this correlation exists; the existing delete command returns a
deterministic conflict rather than relying on a database error.

## Web projection and UI

Today exposes the optional future Routine correlation on the source Entry.
An eligible completed ordinary Entry offers `ルーティン化`; after creation,
the row shows a linked future-Routine state that is distinguishable from an
actual Routine occurrence and cannot create another Routine. This is a Desktop
Web capability; Android UI is not included.

## Boundaries

This Decision adds only the correlation table and the
`CreateFutureRoutineFromCompletedEntry` operation allow-list value. No existing
history is backfilled or rewritten. No AUTH migration, dependency, auth/security
posture, realtime protocol, production operation, or release is included.
Implementation and verification evidence are recorded in `CURRENT` and
`TEST_MATRIX`.
