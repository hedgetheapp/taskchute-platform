# D-131 — Current and future Section configuration reconciliation v0.1

Status: **Approved**

Date: 2026-09-22

## Context

D-038 / B3 intentionally froze the Section context of an established TaskChuteDay and made an ordinary Section settings update effectively next-Day-only. D-119 later allowed explicitly opened future logical dates to become established and similarly froze the effective Section configuration at establishment.

This produces a user-visible mismatch: after Section settings are changed, the current Day and already-established future Days can continue to display an older Section layout, while only unestablished future Days use the new configuration.

The Product requirement is now:

- past logical Days preserve the Section context that was effective for those historical Days;
- the current logical Day and all already-established future Days use the latest successful Section configuration;
- unestablished future Days are not created by a settings update and use the latest configuration if/when they are later established.

## Decision

A successful owner-scoped Section configuration update reconciles the new configuration into every **already-established** TaskChuteDay whose logical date is the server-authoritative current logical date or later.

An affected update therefore includes:

- current logical Day, if already established;
- every already-established future Day;
- no past Day;
- no creation/materialization of an unestablished future Day.

Past TaskChuteDays remain frozen historical context and are never rewritten by this capability.

### Day Section context

For each affected established Day:

- rebuild/reconcile `taskchute_day_section_contexts` to the new configuration version;
- resolve Section actual start/end instants using that Day's persisted establishment timezone, Day boundary, logical date, and interval;
- do not rewrite the TaskChuteDay's established logical date, start/end interval, timezone, boundary, or disambiguation;
- preserve stable Section identity for Sections that remain in the configuration;
- Section rename, boundary edit, addition, and adjacent-absorption deletion are all reflected.

The configuration update is a planning-context barrier. Each affected Day increments `placement_revision` exactly once for the successful Section configuration update, including a rename-only or boundary-only update, so planning commands observed against the old context cannot silently commit against the new context.

### Planned Entries

For planned Entries on affected Days:

- `planned_start_minute = NULL` remains `Sectionなし`;
- non-null `planned_start_minute` is preserved and its `section_id` is re-derived from the new Day Section ranges according to D-043;
- additions / boundary edits may therefore move a planned Entry to a different Section without changing its scheduled minute;
- if a Section is deleted, the continuous replacement ranges naturally absorb planned Entries according to their preserved planned start;
- Routine-derived planned Entries follow the same D-043 pair invariant for the materialized occurrence. RoutineDefinition defaults, schedule, and unrelated occurrences are not rewritten solely by D-131.

Canonical planned ordering is recomputed as needed while preserving stable manual tie-break order within equal-minute cohorts.

### Running / Completed Entries on the current Day

Running / Completed are historical execution-bearing rows and are not re-derived from planned start.

For the current Day:

- if their existing stable Section identity remains present, keep that `section_id`;
- if their Section is removed by the settings update, rehome them only to the adjacent surviving absorption target implied by the same Section deletion transformation;
- preserve relative execution-first order;
- do not rewrite Execution facts, actual timestamps, estimate, Task identity, Project / Mode history, or lifecycle;
- do not change past-Day historical rows.

Future-Day execution remains prohibited by the existing execution boundary; D-131 does not broaden it.

### Client convergence

Web and Android share the same canonical Section configuration API and server-side reconciliation.

After a successful Section settings save, each client must ensure a subsequently shown current/future Day is reloaded from canonical server state rather than continuing to show a cached pre-update Day projection. Existing realtime invalidation may be reused where appropriate; no second client-side Section persistence model is introduced.

## Supersession

D-131 supersedes only these parts of D-038 / D-119:

- current-Day Section context freeze after a later Section settings update;
- established-future-Day Section context freeze after a later Section settings update;
- ordinary Section settings being effectively next-Day-only.

D-131 does **not** supersede:

- immutable/versioned Section configuration persistence;
- stable Section identity;
- past-Day historical context freeze;
- TaskChuteDay established interval/timezone/boundary freeze;
- D-043 Section / planned-start synchronization;
- D-081 execution-first ordering;
- operation replay / revision conflict / atomicity rules;
- no-unbounded-future-materialization;
- production boundaries.

## Persistence / compatibility

Prefer the existing schema and existing `UpdateSectionConfiguration` route / DTO / operation type.

No migration, new API route, new persisted command type, or new dependency is approved by this Decision. If implementation investigation proves one is necessary, STOP and return to the Product Owner.
