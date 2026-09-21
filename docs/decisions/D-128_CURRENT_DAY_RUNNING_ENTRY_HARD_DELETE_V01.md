# D-128 — Current-Day Running Entry hard delete v0.1

Status: **Approved**

Date: 2026-09-21

## Context

D-067 permits an explicit, irreversible hard delete of one completed Entry on the server-authoritative current TaskChuteDay. D-112 otherwise protects running / completed Entries from Android planning delete operations.

The Product Owner approved a narrow extension: on the current logical Day, a Running or Completed Task may be deleted from Android Today through `その他 → 削除`. Completed deletion keeps D-067 semantics. Running deletion removes the mistaken active execution record instead of fabricating a Complete / Interrupt event.

## Decision

- Scope is one authenticated owner's Entry on the server-authoritative current TaskChuteDay only.
- Planned delete continues to use the existing planned delete path.
- Completed delete remains D-067.
- Running delete is added as a narrow D-067-compatible extension.
- Past / future Running or Completed Entries are not deletable by this capability.
- Running / Completed bulk delete remains unavailable.
- Android exposes the action through `その他 → 削除` only when the opened Day is current.
- Deletion always requires explicit destructive confirmation.
- No other Running / Completed planning mutation eligibility is broadened by this Decision.

### Running deletion semantics

A Running target must have canonical Running lifecycle state and its canonical active Execution relation. The delete removes:

- the target Entry;
- all Executions belonging to that Entry, including the active Execution;
- Entry-bound lifecycle guards and historical Task / Project / Mode snapshot or relation rows that would otherwise retain or block the Entry.

The delete does **not** synthesize `ended_at`, Complete, Interrupt, or continuation history. It is an irreversible correction that removes the mistaken running fact.

Task identity, Project / Mode definitions, unrelated Entries / Executions, RoutineDefinition, RoutineOccurrence, schedule / suppression identity, and other Day history are retained. Existing D-067 no-regeneration / reference-integrity protections continue to apply. A completed Entry already linked by the D-116B completed-entry-to-future-Routine correlation remains protected exactly as under D-067.

### Command compatibility

To avoid a new command family and compatibility-only migration, the existing D-067 HTTP / DTO / operation identity remains in use:

- route / DTO / operation `command_type`: `DeleteCompletedEntry`;
- request and result shape remain unchanged;
- the Worker lifecycle guard is broadened from completed-only to canonical current-Day `running | completed`;
- completed requires no active Execution as before;
- running requires the canonical active Execution relation and may delete that active Execution.

The legacy command name is retained as a compatibility detail. No schema, migration, new persisted command type, dependency, realtime protocol, or production operation is approved by D-128.

### Atomicity / retry

D-067 owner scope, exact operation replay, request fingerprint, placement CAS, one atomic D1 mutation, placement revision increment, deterministic rejection, and ambiguous retry semantics remain authoritative.

## Supersession

D-128 supersedes D-112 / D-123 only for the single-row current-Day Running delete entry point and supersedes D-067 only for lifecycle eligibility of the reused hard-delete command. D-067 completed semantics remain unchanged.

## Non-goals

- Running / Completed bulk delete
- undo / restore
- past or future destructive delete
- deleting Task identity or RoutineDefinition
- changing other Running / Completed planning fields
- Web UI parity beyond preserving existing D-067 behavior
- production deployment or mutation
