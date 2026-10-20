# D-181 — Android Quick Interrupt v0.1

Status: **Approved (implementation pending)**
Approved: **2026-10-21** (Product Owner)
Origin: Android Interrupt Phase 1 / Quick Interrupt feasibility report, followed by explicit Product Owner approval for the proposed Quick Interrupt design, new API, and APP DB migration.

## Background and canonical authority

References: `docs/DECISIONS.md` D-028 / D-073; `docs/SPEC.md` D-073; `docs/ARCHITECTURE.md` D-073 / D-081; `docs/OPEN_QUESTIONS.md`; `docs/planning/2026-10-20_ANDROID_INTERRUPT_PHASE1_AND_QUICK_FEASIBILITY.md`.

D-073 already implements the ordinary planned-B interruption flow. Android Interrupt Phase 1 (`7276ad9685c8933509d5a6143350c0cf3d0929b9`) connects to that existing server command; Quick Interrupt remains unimplemented. This decision authorizes the **narrow Quick Interrupt v0.1 delta** without treating feasibility observations alone as approval for broader interruption semantics.

## Approved product behavior

1. On Android Today, the current ordinary Running task's panel displays a clearly labeled `割込` action. A single tap initiates Quick Interrupt immediately, without confirmation or title-entry form. Show pending/failure feedback; never display confirmed success until canonical Day reconciliation.
2. Create a new ordinary current-Day Task and Entry titled **`（割込）`** and start its Execution as the interruption target. Its title remains editable while Running via the existing editor. Retain an explicit durable Quick-Interrupt origin independent of title renaming.
3. End the previous ordinary active Execution with **interrupted**, not completed, preserving its historical facts. Create one planned continuation of the previous logical work; do not automatically start that continuation after the new Task completes. Preserve chain identity, original-estimate/actual semantics, and historical snapshots according to D-028 / D-073 where applicable.
4. New Quick Task defaults: **no implicit Project, Mode, Note, reminder, or estimate**. Do not inherit these from the interrupted task. Resolve current Section from the server-authoritative interruption instant and frozen current-Day Section context; do not infer it from client clock, selected Section, or stale previous placement. If unique valid context cannot be proven, fail closed with actionable feedback and no mutation.
5. First slice eligibility: **established current logical Day, ordinary active Running source, authenticated online operation only**. Routine-derived source, non-current Day / cross-Day active Running, unsafe/missing identities and unresolved operations are ineligible; do not silently broaden D-073's current restrictions.
6. Repeated Quick Interrupt while the new ordinary Quick Task is Running is allowed without an arbitrary nesting limit. Each interrupt creates its own planned continuation and keeps actual history. There is no auto-resume. New grouping/priority behavior for multiple continuations is **not approved**; keep existing canonical projection/ordering rules unless they demonstrably conflict with the approved D-028 behavior.
7. Error/retry is an **online, in-memory exact-operation retry** first slice. Retain the same immutable request identifiers/payload across ambiguous retries during the same live session; reconcile against canonical server state. Automatic process-death recovery, offline queue, and a new operation-lookup endpoint are outside v0.1.

## Approved technical boundary

- **One new dedicated server command/API and the necessary backward-compatible APP migration are authorized**, including an operations command allow-list extension and minimal persisted Quick-origin/atomicity guard data if required. Exact SQL columns and index/guard layout are implementation details only so long as semantics, old data and compatibility remain intact.
- A single guarded atomic D1 outcome must create the Quick Task/Entry, end source as interrupted, start exactly one target Execution, create source continuation, update placement revision as required, and durably store the operation result. No partial Task/Entry/Execution/continuation or mixed visible state is permitted.
- Enforce authenticated owner/Day/active-execution/source identity, placement revision, target ID collisions, unique active Execution, and transaction invariants. Preserve operation ID fingerprinting, exact replay, misuse rejection, ambiguity recovery, and concurrent-client convergence. The existing D-073 `InterruptEntry` API and historical data remain backward compatible.
- Server contract, APP migration, Android repository/controller/presentation, and impacted focused tests are in-scope. Persistent nonprod backup/migration/deploy/verification may proceed under the existing governance hard gates. Production, restore, branch/PR/merge/tag/release, new recurring-cost dependencies and destructive changes remain out of scope.
- D-028's Quick-specific continuation placement/planned-start meaning was **not silently replaced** by D-073's narrow ordinary A→B supersession. If D-028's approved placement is incompatible with D-081's execution-first projection, or any new Material Product choice is required, STOP with the exact conflict/options; do not improvise or rewrite the SPEC to match code.

## Acceptance / evidence

- Android: ordinary Running → one tap `割込` → canonical `（割込）` Running, source interrupted, one planned continuation; title editable while Running; normal completion does not auto-start old work.
- Worker/D1: exact replay, conflicting fingerprint, stale active/revision, owner mismatch, duplicate IDs, concurrent callers, Section resolution, transaction failure with zero partial writes, and no more than one active Execution. Cover repeated Quick Interrupt and existing D-073 regression.
- Migration: both fresh install and upgrade with existing operations/Entries/Executions intact, no manufactured historical origins or outcomes. Observe `TEST_MATRIX` statuses separately for Implemented, Integrated, Tested, Verified and Released.
- Tests are impact-based/focused rather than all suites by default. Verify exact implementation commit in CI. Obtain the signed **Phone APK from that exact commit** for direct ChatGPT handoff; report nonprod/production/device evidence honestly.

## Explicitly deferred

Routine-aware interruption; auto-resume or Pause/Resume; generalized multiple-continuation grouping/priorities and Review UI; cross-Day interruption; persistent client/offline queue or process-death auto-recovery; production mutation/deploy. Later decisions must be approved separately.
