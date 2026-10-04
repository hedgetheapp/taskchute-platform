# D-167 — Android Complete→Start Serial Lifecycle Handoff Corrective v0.1

Status: **Approved / Not implemented**

Date: 2026-10-04

## Context

The Product Owner reported that after completing one Task and immediately starting another on Android Today, the UI can briefly appear to show two Tasks running in parallel.

Current-source investigation found a concrete Android race.

Today keeps both a canonical `state.day` and an optimistic `presentedDay`.

Current Complete flow:

1. A is canonically Running.
2. user taps Complete A.
3. Android applies an optimistic projection where A is Completed and `activeExecution = null`.
4. the Complete request is still in flight.

If the user immediately starts B, current `start()` applies B's optimistic lifecycle transition against canonical `state.day`, not the already-presented optimistic Day. Canonical `state.day` still has A as Running, so the second optimistic projection can retain A's Running row while also making B Running.

In addition, pending lifecycle writes are guarded only per Entry ID. Complete A and Start B can therefore be sent concurrently. The server still enforces at most one active Execution, so it does not canonically accept two Running Executions; however, if Start B reaches the server before Complete A commits, Start B can be rejected because A is still active.

Therefore this is both:

- a visual optimistic-projection defect; and
- an unsafe dependent lifecycle-request ordering race.

## Decision

### 1. Preserve immediate user interaction

The user may tap Start B immediately after tapping Complete A.

Do not require an artificial wait for the Complete animation/reload before accepting the next Start intent.

### 2. Optimistic lifecycle projection must chain from the effective presented state

Dependent lifecycle optimistic transitions must be composed from the current effective/presented Day, not from stale canonical Day state.

For the common handoff:

`A Running → Complete A → Start B`

the immediate presented state must be:

- A = Completed
- B = Running
- exactly one active Running projection

The UI must never render two Running rows because a later optimistic lifecycle transition rebased from stale canonical state.

### 3. Dependent execution mutations are serialized

Android must not send Start B to the server while Complete A is still an unresolved earlier lifecycle mutation whose outcome determines whether B is allowed to start.

For the handoff:

1. send/resolve Complete A first;
2. only after A's completion is safely confirmed may Start B be dispatched.

This is a client-side orchestration rule. Server execution authority and one-active-Execution invariant remain unchanged.

### 4. Failure / ambiguous transport boundary

Current Android lifecycle repository collapses transport ambiguity and deterministic non-success into `TodayMutationResult.Failure`.

D-167 must therefore behave conservatively for an unresolved predecessor:

- do not dispatch an unsent dependent Start merely because the predecessor returned a generic failure;
- reconcile canonical Today first;
- if canonical state confirms A is no longer active and B remains start-eligible, the queued Start may continue;
- if canonical state still has A active, cancel/rollback the dependent Start intent and present the existing error/retry path;
- Unauthorized cancels dependent lifecycle intents and follows the existing auth flow.

Do not invent canonical completion from local optimistic state.

### 5. Success path

If Complete A returns deterministic success/committed success under the existing repository contract, Start B may proceed after the predecessor finishes.

Implementation may reconcile before dispatching B if required by current placement/revision safety, but must not create unnecessary user-visible loading/jump.

### 6. One active optimistic execution invariant

At every Android Today presentation boundary:

- zero or one active optimistic execution is allowed;
- a Task row shown as Running must be consistent with the effective active execution identity;
- applying a new optimistic Start must not leave a stale different row in Running lifecycle presentation.

### 7. Scope

This corrective applies to dependent Android current-Day lifecycle handoffs, especially Complete A → Start B.

It does not:

- approve general multitasking/two simultaneous active Executions;
- change Worker Start/Complete semantics;
- change persisted data/schema;
- change execution timestamps;
- add a new server command;
- change Web/Wear lifecycle semantics;
- change Production/Release state.

## Verification target

Future implementation should verify at minimum:

1. A Running → Complete A → immediate Start B never renders two Running rows.
2. B Start HTTP request is not sent before Complete A resolves safely.
3. Complete success → B Start proceeds and converges to B Running.
4. Complete failure with A still canonical Running → B Start remains unsent/cancelled and UI reconciles to A Running.
5. ambiguous/generic failure followed by canonical confirmation that A completed → queued B Start may proceed safely.
6. Unauthorized predecessor cancels dependent Start and enters auth flow.
7. duplicate taps remain bounded/idempotent under existing pending guards.
8. ordinary isolated Start and Complete behavior remains unchanged.
9. realtime invalidation remains deferred/coalesced across the lifecycle handoff.
10. server still reports max one active Execution.

Until implemented and tested, this remains **Approved / Not implemented / Not verified**.
