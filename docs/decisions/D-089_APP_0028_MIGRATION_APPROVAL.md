# D-089 — APP 0028 migration approval

Status: **Approved**

Approved by Product Owner on 2026-09-11.

This file is a canonical companion to `D-089_ROUTINE_WORKDAY_HOLIDAY_RECURRENCE.md` and records the explicit migration approval required by that Decision.

## Approved migration scope

D-089 implementation may add the next APP migration slot, expected to be `0028` at approval time, solely to extend the typed `routine_schedules.schedule_kind` persistence contract with the four D-089 recurrence families:

- 営業日
- 休日
- 祝日
- 月末営業日

The implementation must re-check the current migration chain immediately before writing and use the actual next slot if `main` has moved.

## Required preservation

The migration must:

- preserve all existing `routine_schedules` rows without reinterpretation;
- preserve all D-086 / D-087 existing ten schedule kinds and their typed column invariants;
- add only the D-089 typed schedule kinds;
- keep interval/day/weekday columns `NULL` for the four D-089 kinds;
- preserve Routine / Task / RoutineOccurrence / Entry / Execution identities and history;
- preserve all unrelated APP data and operations;
- make no AUTH DB schema change;
- require no historical backfill or destructive cleanup.

A table rebuild is allowed only when it is data-preserving and verified by fresh-chain and upgrade migration tests plus row-by-row / count / integrity evidence.

## Concurrency / integration safety requirement

Before implementation closeout, D-089 must be reviewed for interaction with D-088 effective-day override commands and D-086/D-087 Routine reconciliation/CAS.

In particular, a successful user calendar override mutation must not leave already-materialized editable/planned calendar-based Routine state inconsistent if reconciliation fails. Calendar override mutation and reconciliation of directly affected existing planned Routine state must share an atomic/CAS-safe persistence boundary, or an equivalent design that proves no committed split-brain state is possible.

For `月末営業日`, a one-date override may move eligibility within the whole civil month; reconciliation must evaluate the affected month as a set rather than only the edited date.

No new Product semantics are approved by this companion file.

## STOP conditions

Stop and return to Product Owner if implementation requires:

- any migration beyond the typed D-089 schedule-kind extension;
- persisted historical rewrites or data migration;
- destructive/irreversible cleanup;
- a new external dependency/service or meaningful recurring cost;
- Security posture change;
- production migration/deploy;
- restore/recovery execution;
- branch / PR / merge / tag / Release;
- non-fast-forward or unexpected remote state.
