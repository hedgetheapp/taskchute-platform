# D-138 — Android Today Planning / Lifecycle Refinements v0.1

Status: **Approved / Implemented**

## Context

Android Today needed four narrow planning/lifecycle corrections while preserving
the established Day, Routine, Execution, placement, and read-only boundaries:

- a planned start exactly at a completed Execution end minute must be legal;
- a planned Routine occurrence must be editable from Today for that occurrence;
- a current-Day Running Entry must allow estimate correction;
- a Completed row must show actual start and end in its left projection slot.

The existing `TaskChuteDay`, Entry estimate, Routine occurrence override,
Execution, Section context, placement revision, and operation/replay persistence
already represent these outcomes. No schema, migration, or new command family
is required.

## Decision

### 1. Completed-end boundary

A completed Execution ending at logical minute `T` does not reserve `T + 1`.
A new planned Entry may start exactly at `T`. The normal Android create chain
(`AddTaskToDay` → estimate → planned-start) and the existing
`SetEntryPlannedStart` Section resolution remain authoritative. No `+1` minute,
UI rounding, retry loop, or historical reorder is introduced. Half-open Section
intervals and D-129 ended-Section protection remain unchanged.

Historical Entry/Execution facts remain immutable and execution-first projection
ordering remains D-081 behavior.

### 2. Routine occurrence planning from Today

An ordinary planned Routine-derived Entry may open the Today editor on the
current established Day and on an explicitly opened established future Day.
The editable scope is the displayed occurrence only:

- Section and planned-start are edited through `SetRoutineSectionPlan` with
  `action = occurrence`;
- estimate is edited through `SetRoutineEstimate` with `action = occurrence`;
- RoutineDefinition defaults, recurrence schedule, and unrelated occurrences are
  not changed;
- title, Project / Mode, recurrence, enable/disable, and Routine Settings scope
  are not added to this Today capability.

Past Days and unestablished future previews remain no-write. Current/future
eligibility uses D-119/D-120 established-Day boundaries and the server validates
the Section/planned-start pair and placement revision atomically.

### 3. Running estimate

`SetEntryEstimate` accepts ordinary planned Entries and ordinary current-Day
Running Entries. Completed Entries, past/future Running Entries, and
Routine-derived Entries remain outside the ordinary command.

A current-Day Running Routine occurrence uses the typed occurrence estimate
command. It updates the occurrence override and effective Entry estimate
atomically, keeps the active Execution/lifecycle unchanged, does not change the
RoutineDefinition default, and does not propagate to later occurrences.

The resulting effective estimate is used by the Android Running projection,
progress player, and downstream forecast after canonical reconciliation.
Placement revision is unchanged for estimate-only edits.

### 4. Completed projection slot

For a Completed Android Today row, the left 48dp slot displays the canonical
Execution-derived actual start and actual end in the established Day timezone.
The slot does not substitute planned start or estimate and does not fabricate a
missing timestamp. Planned rows retain Web Start Forecast behavior; Running rows
retain D-130 actual-start plus estimate projection behavior.

Accessibility semantics describe Completed slot values as actual times.

### 5. Actual start without end

For a planned Entry, actual start without actual end remains valid and transitions
the Entry to Running. Actual end without actual start remains invalid. Actual
start plus actual end continues to transition to Completed. Day timezone,
logical date, boundary, D-060/D-132 SetExecutionTimes, and actual Section
authority remain canonical.

## Compatibility and supersession

D-138 narrowly supersedes:

- D-109/SPEC's exclusion of Routine-derived Entries from the Android editor,
  only for occurrence-level Section/planned-start and current-Day Running
  estimate capability;
- D-120/D-124 current-only Routine occurrence planning restrictions, only for
  the established future occurrence Section/planned-start and estimate cases;
- D-124's statement that Running estimate changes are not permitted;
- D-130's statement that Completed left-projection behavior is unchanged.

All other D-109, D-119, D-120, D-124, D-129, D-130, and D-132 semantics remain
in force, including Routine definition authority, D-129 ended Sections,
execution boundaries, historical ordering, placement CAS, replay/ambiguity,
past read-only behavior, and future execution prohibition.

## Boundaries

This Decision does not add Routine title/Project/Mode or recurrence editing to
Today, Completed estimate editing, future execution, historical backfill,
schema/migration, a new API route or command family, a dependency, offline
authority, or production behavior.

## Verification intent

Focused Worker coverage covers the exact completed-end boundary, ordinary
Running estimate, Routine current/future occurrence plan and estimate, completed
rejection, replay/CAS, and no definition propagation. Focused Android coverage
covers editor capability, occurrence command composition, actual-start-only
validation, and Completed actual projection. Device and persistent nonprod
evidence are recorded separately in `docs/TEST_MATRIX.md` and must not be
claimed when not run.
