# D-096 — Continuous Shift placement input across Section boundaries

Status: **Approved**

## Context

D-083 allows `Shift + ArrowUp / ArrowDown` to move a current established Day's planned Entry across planned-start cohorts and Section boundaries. D-078 provides immediate repeated same-Section reorder UX, while D-079 serializes placement mutations and protects dependent operations. D-084 adds Routine-derived placement scope semantics.

The current Web behavior is asymmetric at the `MoveEntry -> ReorderEntries` boundary. Repeated `Shift + Arrow` is smooth inside one Section because same-Section reorder can accept further input against effective pending order. After a cross-Section `MoveEntry`, however, a subsequent same-Section reorder is blocked until the Move has reconciled to canonical state. This creates a visible pause exactly at a Section boundary even when the user is performing one continuous keyboard placement gesture.

The Product behavior is that ordinary planned Tasks should be movable with repeated `Shift + ArrowUp / ArrowDown` at one continuous interaction tempo regardless of whether the next placement step is represented internally as Reorder or Move.

## Decision

For an ordinary non-Routine planned Entry on the current established Day, repeated `Shift + ArrowUp / ArrowDown` input must remain immediately acceptable across Section boundaries.

The Web may optimistically project pending placement intents so the next keypress is interpreted from the effective visible position rather than waiting for each Server round-trip.

The Server remains canonical authority. Client operations must still be dispatched serially through the existing placement mutation queue and rebased against the latest canonical `placement_revision` before each write.

A continuous gesture may therefore produce sequences such as:

- `Reorder -> Reorder`
- `Reorder -> Move`
- `Move -> Move`
- `Move -> Reorder`

without forcing the user to wait for canonical reconciliation between each keypress.

The visible effect should be immediate, while writes remain ordered and retry-safe.

## Dependency and failure semantics

Queued placement operations that depend on an earlier placement must preserve explicit dependency ordering.

If a prerequisite placement deterministically fails or its precondition no longer matches canonical state, dependent unsent placement operations must be cancelled rather than silently applied to a different position.

If an earlier operation has an ambiguous outcome, the queue must pause and reconcile using existing exact-operation semantics before dependent placement proceeds.

Each dispatched placement operation must use the latest canonical `placement_revision` available at dispatch time. No parallel placement writes are introduced by this Decision.

## Effective projection

While placement input is pending, keyboard movement must be calculated from the same effective projection presented to the user, including applicable pending Move and Reorder overlays.

The effective projection must not invent Entries or Sections and must preserve D-081 execution-first ordering constraints. Running/completed Entries remain outside manual planned placement.

Section traversal continues to follow D-083 corrective behavior:

- every configured real Section is a valid traversal destination even when empty;
- `Sectionなし` participates only when an effective unsectioned Entry actually exists;
- one keypress represents one placement step and must not skip an empty real Section.

## Routine-derived Entries

D-084 remains authoritative for Routine-derived planned Entries.

If a placement step requires the existing `今回だけ / ルーティンに反映` scope chooser, continuous keyboard acceptance pauses at that step until the user chooses a scope or cancels. The client must not guess Routine scope merely to preserve key-repeat smoothness.

Where D-084 already permits a chooser-free placement (for example an applicable existing occurrence override), existing semantics may continue to use the normal serialized placement queue.

This Decision does not change Routine Definition semantics or persistence.

## Reorder / suppression parity

This Decision does not redefine which Entries belong to the Day projection or manual reorder universe. Reorder membership must remain consistent with the canonical Day projection. In particular, a physically retained Routine Entry hidden by `routine_occurrence_suppressions` must not be required in a visible `ReorderEntries` payload or receive a visible reorder position mutation.

The separate D-083 corrective for projection / suppression parity must be preserved when implementing continuous `Move -> Reorder` input.

## Non-goals

This Decision does not:

- allow running/completed Entry reorder;
- broaden placement to past/future/preview Days;
- alter planned-start or Section Domain semantics;
- remove D-084 Routine scope confirmation;
- change API request/response shapes by itself;
- add parallel placement writes;
- weaken CAS, operation replay, ambiguity handling, or mutation barriers for unrelated commands;
- add schema/migration/dependency requirements;
- change production deployment policy.

## Verification contract

At minimum verify deterministically:

1. repeated same-Section `Shift + Arrow` remains smooth;
2. `Reorder -> Move` accepts the boundary-crossing key immediately;
3. `Move -> Move` accepts another Section crossing before the first Move response resolves;
4. `Move -> Reorder` accepts a same-Section step before the preceding Move response resolves;
5. the visible effective order updates immediately for each accepted keypress;
6. Server dispatch remains serial and preserves dependency order;
7. each dispatched operation rebases to the latest canonical placement revision;
8. deterministic failure cancels dependent unsent placement operations;
9. ambiguous outcome pauses and reconciles before dependents continue;
10. the exact Day -> Evening -> below-existing-Task sequence succeeds after the Reorder suppression-parity corrective;
11. empty real Section traversal and `Sectionなし` non-synthesis remain intact;
12. Routine scope-required placement stops for the chooser and performs no guessed write;
13. focus remains on the moved Entry through optimistic placement and convergence;
14. reload/fresh-tab state reflects Server canonical placement;
15. no Worker/API/schema/migration/dependency expansion is introduced unless separately approved.

Persistent nonprod verification should use disposable fixtures where possible. Production remains outside standing approval.
