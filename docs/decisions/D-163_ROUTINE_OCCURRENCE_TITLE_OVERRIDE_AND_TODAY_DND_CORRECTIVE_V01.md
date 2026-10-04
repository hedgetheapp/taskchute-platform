# D-163 — Routine Occurrence Title Override and Today D&D Corrective v0.1

Status: **Approved**

Date: 2026-10-04

## Decision

A planned Routine occurrence may have an occurrence-only title override. The effective planned title is `routine_occurrences.title_override` when non-NULL, otherwise the current shared Task title. Editing this title never changes the shared Task title, Routine Definition, recurrence schedule, or unrelated occurrences. A normalized override equal to the shared Task title is stored as NULL. The existing routine occurrence task-title snapshot is updated atomically with the override so that the effective title is frozen when the occurrence starts. Running and Completed rows continue to use their historical snapshot; existing history is not rewritten or backfilled.

`SetRoutineTitle` is owner-, entry-, occurrence-, and established-Day-scoped. It is permitted only for a planned Routine occurrence on the current Day or an already-established future Day, consistent with D-138 planning authority. Past Days, non-Routine Entries, Running/Completed occurrences, and unestablished future previews are rejected without materializing a Day. Operation identity, replay, and ambiguity rules follow existing typed Routine commands.

Today D&D insertion cues represent only legal top/bottom boundaries that the release command can dispatch. The displayed cue and final resolved target must be the same target; stale LazyColumn geometry from off-screen/disposed rows must not produce an insertion cue inside a visible row. The implementation filters drag geometry to currently visible rows at drag start and after actual auto-scroll rebase, while preserving stable snapshots between scrolls and canonical full-order no-op checks. Existing D-147/D-148 relative placement, Routine placement, ended-Section, and command semantics are unchanged.

## Narrow supersession and boundaries

This Decision narrowly supersedes D-138's read-only Routine title field for planned Routine occurrences only. It does not enable title edits for ordinary Running/Completed Tasks or Routine Running/Completed occurrences. D-147/D-148 D&D command semantics remain authoritative; only target cue/geometry correctness is corrected.

One nullable `routine_occurrences.title_override` column is added. Existing rows and historical snapshots are not backfilled or rewritten. Worker/API command additions are backward-compatible; no new dependency, production operation, D-145 behavior, or Notes behavior is included.
