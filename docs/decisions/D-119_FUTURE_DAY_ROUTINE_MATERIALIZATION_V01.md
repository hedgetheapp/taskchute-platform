# D-119 — Future Day Routine Materialization v0.1

Status: **Approved**

## Background

D-041 / Day Navigation v0.1 intentionally kept an unestablished future logical date non-materializing. Merely viewing a future Day returned a planning preview and did not create `TaskChuteDay`, Section historical context, `RoutineOccurrence`, or Routine-derived `Entry`. D-040 separately materialized eligible Routine work only for the current Day.

This leaves future planning weak for Routine-heavy use: a user can navigate to a future date but cannot see that date's real Routine Tasks until the date becomes current. The Product Owner has decided that explicitly opening a future Day means planning for that Day has begun, so the selected Day itself may be established immediately instead of remaining a virtual preview.

## Decision

### 1. Explicitly opening a future Day establishes that Day

When an authenticated user explicitly selects / opens a logical date `D` where `D` is later than the server-resolved current logical date:

- establish exactly one owner-scoped `TaskChuteDay` for `D` if it does not already exist;
- resolve its interval from the user's effective timezone / Day boundary at establishment time;
- freeze the effective Section configuration / Day Section context for `D` using the existing establishment semantics;
- return an established Day projection, not a virtual Routine preview.

Opening `D` does **not** establish adjacent dates or a range. Only the date actually opened is materialized.

Repeated or concurrent loads of the same future logical date must converge to the same Day without duplicate Day/context rows.

### 2. The opened future Day materializes its eligible Routine Tasks

As part of loading / establishing future Day `D`, reconcile eligible Routine work for `D` using the same canonical recurrence authority used by current-Day Routine materialization.

For each RoutineDefinition that is eligible on `D`:

- create exactly one `RoutineOccurrence` for `(RoutineDefinition, origin Day D)` if missing;
- create its initial planned Routine-derived `Entry` exactly once when required by the existing Routine model;
- use the existing Routine defaults, snapshots, Section / planned-start invariants, estimate, Project / Mode/default metadata, schedule period, calendar authority, and placement semantics;
- preserve existing occurrence-level overrides, moved/suppressed/skipped state, snapshots, and other protection rules.

Eligibility continues to respect the current canonical rules, including at least:

- enabled / disabled state;
- Routine archive/delete tombstone;
- start / inclusive end period;
- typed recurrence evaluator;
- workday / holiday / official-holiday / monthly-last-workday calendar authority where applicable;
- pause/resume and existing schedule suppression / restoration rules.

The load must not create a Routine Task for a Routine that is ineligible on `D`.

### 3. Established future Days reconcile newly eligible missing Routine work on later loads

A future Day can have been opened before a Routine was created, re-enabled, or otherwise became eligible for that date. Therefore loading an already-established future Day must also reconcile **missing** eligible Routine occurrences for that selected date.

This reconciliation must:

- remain exactly-once;
- never duplicate an existing occurrence / Entry;
- never resurrect an occurrence that existing canonical suppression / skip / moved / delete protections say must remain absent;
- not materialize any other future date.

Existing schedule-update propagation / suppression semantics remain authoritative for already-materialized future planned occurrences.

### 4. No virtual Routine preview is required

D-119 does not add a separate virtual Future Routine row model.

For normal Day navigation, opening a future date produces a persistent established Day and its persistent eligible Routine work. Calendar/date-picker surfaces that merely render date choices must not themselves materialize Days; the trigger is opening/selecting the Day as the active Day surface.

### 5. Interaction with D-118

D-118 remains authoritative for Routine disable/delete cleanup.

If future Day `F` has already been opened and has materialized Routine-derived data, then disabling or deleting that Routine at current logical date `D` removes materialized Routine-derived children for `D` and later, including `F`, according to D-118.

Re-enabling later does not backfill the disabled gap. If a still-future established Day becomes eligible again after re-enable, a later explicit load may materialize the missing eligible occurrence under the normal no-backfill / recurrence rules.

### 6. Historical and scope boundaries

- Unestablished **past** dates remain record-none / read-only under existing Day Navigation semantics. D-119 does not retroactively materialize past Routine history.
- Current-Day materialization keeps the existing D-040 behavior.
- Future Day execution remains prohibited unless a later Decision changes that lifecycle boundary.
- D-119 does not by itself expand the R2A `今回だけ / ルーティンに反映` editable field set. Existing future Routine-derived editing restrictions remain until a separate approved scope extends them.
- D-119 does not introduce Skip UX, occurrence Note, Task-name/Project/Mode override expansion, offline behavior, notification, or production rollout.

## Supersession / compatibility

D-119 supersedes only the D-041 clause that **viewing/opening an unestablished future Day is non-materializing** and the related Day Navigation v0.1 boundary that excluded future Routine materialization.

All other D-041 / D-042 navigation, past-Day, retry, concurrency, and historical-authority semantics remain in force unless explicitly changed here.

The practical consequence is intentional: once a future Day is explicitly opened, its timezone / boundary / Section context becomes historical authority for that Day. Later Section configuration changes do not silently rewrite that already-established Day.

## Architecture / persistence direction

The current schema already contains the required `TaskChuteDay`, Day Section context, `RoutineDefinition`, `RoutineOccurrence`, Entry relation, suppression, snapshot, and operation foundations. D-119 therefore expects no new persistence model.

Implementation should prefer generalizing/reusing current-Day establishment and Routine ensure logic so current and selected-future Day materialization share one recurrence authority and exactly-once invariants.

A schema / migration change is **not approved by this Decision**. If implementation cannot satisfy D-119 safely with the current schema, return to the Product Owner before adding a migration.

## Verification contract

At minimum verify:

- first open of an unestablished future Day establishes exactly one Day/context and returns `established`;
- all and only eligible Routine work for that date is materialized;
- repeated/concurrent loads do not duplicate Day, occurrence, Entry, or placement effects;
- opening one future date does not materialize neighboring dates;
- already-established future Day later picks up newly eligible missing Routine work exactly once;
- disabled / archived / out-of-period / recurrence-ineligible Routine does not materialize;
- schedule suppression / restore and occurrence-level protection remain correct;
- D-118 disable/delete removes already-materialized future children as specified;
- past unestablished dates remain non-materialized;
- current-Day behavior remains regression-safe;
- established future Day Section/timezone context remains frozen after later configuration changes;
- Web and Android clients consuming the shared `by-logical-date` projection remain compatible.

Production remains outside the approved execution boundary unless separately authorized.

## Canonical references

- D-040: current-Day Routine lazy materialization
- D-041 / D-042: Day Navigation / establishment boundary
- D-043: Section + planned-start synchronization
- D-047: Routine Board / pause-resume / no-backfill lifecycle
- D-086 / D-087 / D-089: recurrence evaluator and calendar families
- D-118: Routine enabled/delete cleanup for current logical date and later
