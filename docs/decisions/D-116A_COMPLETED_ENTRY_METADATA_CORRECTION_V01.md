# D-116A — Completed Entry Project / Mode Historical Correction v0.1

Status: **Approved**

## Decision

An owner may correct the historical Project and Mode metadata of an eligible
completed ordinary Entry on the current established Day. This is a narrow
historical correction; it does not reopen the Entry or change its execution or
planning facts.

Eligibility requires the authenticated owner, current established Day, an
ordinary (non-Routine-derived) completed Entry, and completed Execution
history. Planned behavior continues to use the existing Task / Entry metadata
commands. Running, Routine-derived, past/future, missing, and cross-owner
targets remain ineligible.

## Shared Task identity and Project authority

D-010 permits multiple Entries to share one Task. The first D-116A design
treated completed Project correction as a Task-level `tasks.project_id` update;
that design was stopped before implementation because it could rewrite the
meaning of other Entries that share the Task.

Completed Project correction is therefore **Entry-historical only**:

- `entry_project_snapshots` is the CAS and persistence authority for the
  completed Entry's historical Project.
- Set / replace updates that Entry's snapshot Project ID and title; clear
  records a null Project snapshot while preserving its capture time.
- `tasks.project_id` is intentionally unchanged. Other Entries sharing the
  Task retain their existing Project meaning.
- A new Project assignment must be an active Project owned by the caller.
  Existing historical assignments, including retained archived/deleted
  references, remain displayable until explicitly changed or cleared.
- If the required Project snapshot row is absent, the command fails closed; it
  does not infer the completed Entry's history from the Task's current Project.

## Entry-scoped Mode authority

Completed Mode correction is Entry-scoped. Set / replace atomically converges
the existing `entry_modes` relation and `entry_mode_snapshots`; clear removes
both. Existing snapshot capture time is preserved. If no historical Mode
snapshot exists, a set uses the completed Entry's original first Execution
start as the capture time. A newly assigned Mode must be active and owner
scoped; an existing historical snapshot remains readable until changed or
cleared.

Neither correction may change Entry / Task / Execution identity, Task title,
lifecycle, Section, estimate, planned start, placement, Project / Mode meaning
of another Entry, or Day `placement_revision`.

## Commands and safety

Reuse `UpdateTaskMetadata` for the completed Project correction and
`SetEntryMode` for the completed Mode correction. Their existing owner checks,
operation fingerprint / replay / misuse rejection, exact retry, CAS, and
canonical reconciliation remain authoritative. The completed Project branch
guards against the historical snapshot rather than `tasks.project_id`; the
completed Mode branch guards and writes the Entry-scoped relation / snapshot
atomically. Existing planned command behavior is unchanged.

D-116B conversion of a completed Entry to a future Routine must copy Project
and Mode from this corrected source Entry's historical authority, not from the
shared Task's current Project.

## Boundaries and evidence

This Decision adds no command type, API route, table, column, index, migration,
dependency, auth/security posture, realtime protocol, or production behavior.
Implementation and verification status are recorded in `docs/CURRENT.md` and
`docs/TEST_MATRIX.md`.
