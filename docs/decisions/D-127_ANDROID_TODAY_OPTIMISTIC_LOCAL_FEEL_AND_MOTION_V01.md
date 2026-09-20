# D-127 Android Today Optimistic Local Feel and Motion v0.1

Status: Approved implementation decision

## Decision

Android Today may project an accepted user intent immediately in an ephemeral presentation overlay for Task add, edit, reorder, placement, start, and complete. The overlay is memory-only and scoped to the selected logical Day and Entry identity. The server and the existing canonical Command responses remain authoritative.

Successful commands keep the optimistic presentation while a silent canonical reconcile runs. Silent reconcile must not blank Today or enter the visible `REFRESHING` state. Deterministic failure, authorization failure, conflict, or ambiguous direct manipulation clears or reconciles the overlay using the existing D-125 semantics; it does not create a persistent offline queue or local database authority.

Task drag uses a pure provisional order for presentation while the pointer moves. Stable Entry keys and Compose item-placement animation may animate surrounding rows, but canonical Day data is changed only through the existing placement command after drop.

## Boundaries

- No Worker/API command, payload, schema, migration, or dependency change is introduced.
- Existing operation identity, placement revision, CAS, retry, reconcile, and D-125 error semantics remain in force.
- The overlay is discarded when the selected logical Day changes or canonical state is published.
- A failed silent reconcile does not turn a successful command into a mutation failure; later realtime, foreground, or explicit refresh may converge the presentation.

## Evidence boundary

The implementation is source/JVM/build tested in this change. Authenticated runtime, Galaxy S23, screenshot comparison, and production remain `NOT_RUN` until separately verified.
