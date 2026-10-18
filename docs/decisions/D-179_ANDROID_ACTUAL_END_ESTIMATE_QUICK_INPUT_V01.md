# D-179 — Android Actual End 「見積通り」 Quick Input v0.1

Status: **Approved product intent (2026-10-18) / IMPLEMENTED at `e360792306a66e134b89027f93049499c915bb48` / exact-SHA CI PASS / signed Phone APK verified / Product Verified NO / Released NO**

Date: 2026-10-18

## Context and approvals

Android Today Task Editor already has D-171 `前回タスク終了` / `現在時刻` quick inputs for actual **start**. The Product Owner requested a new **actual-end** quick input labeled `見積通り`, chose **exact Instant precision** (including seconds/fractions) and **one-shot fill, not reactive recalculation** on 2026-10-17 (see `docs/planning/2026-10-17_ANDROID_ACTUAL_END_ESTIMATE_SHORTCUT.md`), then authorized proceeding with this work item on 2026-10-18.

This decision authorizes the new **Android Today actual-end field** shortcut only. It does not rewrite D-171 history; D-171's end-manual-only boundary describes its own earlier implementation, now narrowly extended by D-179.

## Product behavior

1. Show a small, accessible `見積通り` action adjacent to the actual-end field wherever that field is **already** editable under the existing established current/past Day, lifecycle, and Entry/Execution authority. Preserve the manual end field and the D-171 actual-start shortcuts. No new future-Day execution/edit permission.
2. On explicit tap, set the in-memory **proposed actual end = effective actual-start Instant + effective Entry estimate duration in seconds**. Example: start `10:00:35.250` + 30 minutes → end `10:30:35.250`. Display the proposed end in the owning Day's establishment timezone as `HH:mm` while retaining the **exact** proposed end Instant in ephemeral editor intent. Do not derive seconds from rendered `HH:mm`.
3. An effective start may be an exact D-171 quick choice, an unchanged canonical Running/Completed Execution start, or the existing well-defined manual start interpretation. If the client cannot prove the **actual start Instant that will be persisted**, or an existing D-147(B) minute-snap could change it and invalidate exact `end = start + estimate`, fail closed/disable the shortcut and report a feasibility blocker rather than fabricate exact duration or change Worker semantics.
4. The effective estimate is the **currently edited Entry estimate**, including a valid unsaved estimate edit where the existing editor allows it. Do not read a Routine Definition default in place of the current effective occurrence value. Missing/invalid/nonpositive estimate, missing/invalid/unresolvable start, unestablished/unauthorized Day or ambiguous Execution authority → no quick fill.
5. This is a **one-shot** field fill. No lifecycle mutation, automatic Complete, API write, or Save occurs on tap. Subsequent edits to start or estimate do **not** recalculate the filled end automatically. A later explicit tap recalculates. Manual edit/clear of the end field discards the ephemeral exact-end authority even when the user retypes the same visible minute.
6. Do not prefill a future actual end as if it were valid. Present the shortcut as disabled/unavailable when the candidate is future relative to the available clock, rather than bypassing the existing save-time future-end rejection. This conservative disabled-vs-hidden UI treatment is a reversible presentation detail; no future-time Domain eligibility is changed.
7. Respect midnight crossing only where existing historical actual-end authority allows it; do not change Entry/Execution identity, the originating TaskChuteDay, or its frozen Section context. Keep manual typing semantics and D-147(B) start-minute precision unchanged, and preserve owner, revision/CAS, operation/replay, overlap, lifecycle, history and canonical reconciliation guards.
8. Android Today only. No automatic Complete change, no Web/Wear parity, no Worker/API/domain contract change, schema/migration, dependency, new background service, data backfill, production mutation, or Release.

## Implementation feasibility / STOP boundary

Inspection of `main` at decision time finds that `TaskPlanningModels.kt` supports `exactActualStart` / `NormalizedTaskInput.actualStartInstant` but **not** exact actual end; `TaskPlanningHttpRepository.kt` currently converts `actualEndMinute` back to a minute-resolved Instant. Its Completed no-op comparison also uses displayed end minute. Codex must carry exact-end authority through **draft → validation → normalized input → repository JSON `ended_at` → optimistic presentation**, including the same-displayed-minute-but-different-seconds case. Preserve the effective canonical start alongside an exact-end selection when necessary, without secretly reinterpreting manual start edits. Use existing `SetExecutionTimes` request fields if safely feasible. No broad API/server change is approved by this Decision.

**STOP** and report a concrete example plus Product/technical options if exact end cannot be persisted through existing command safely, if minute-snap/ambiguous start prevents truthful fixed-duration semantics, if historical identity or replay guarantees change, or if shared API/Worker/schema/migration/security/cost/compatibility changes are required. Do not degrade this Decision to minute-rounded end silently.

## Impact-aware verification contract

- Focused Android model/validation/controller/repository tests for start `10:00:35.250` + 30m → exact `ended_at=10:30:35.250`, displayed `10:30`, correct `started_at`, and no minute-precision marker for truly exact-start intent.
- Missing/invalid start or estimate, future candidate, start/estimate changes after tap (no reactive recompute), re-tap (recompute), manual end overwrite clears exact intent, current/established past eligibility, future Day and ambiguous multi-Execution negative cases.
- Completed same-visible-minute end correction must **not** no-op when the underlying exact end differs. Preserve manual typed-end minute semantics, D-171 start quick inputs, D-147(B), D-174 past sleep-like cross-Day end, and normal Save-only lifecycle changes.
- Focused UI instrumentation for visible action, enable/disable, click/update/save handoff; representative Today surface runtime where available. Use affected Android tests/build/static checks only; Web/Worker tests `NOT_REQUIRED` if their production code/shared contract unchanged. Record exact-SHA CI, AVD, Galaxy S23 manual status separately.
- `TEST_MATRIX`, `CURRENT`, affected canonical docs to be updated from actual evidence. Android source change requires exact implementation-SHA signed **Phone APK** delivery through ChatGPT after review. Product Verified and Released are not implied by compile/CI alone.

## Canonical references

- D-171 actual-start exact choices and minute authority
- D-147(B) manual-minute adjacency
- D-132 / D-138 current-Day actual editing
- D-174 established past-Day historical correction
- D-156 / D-157 rollback/reopen
- `docs/DEVELOPMENT_WORKFLOW.md`, `docs/TEST_MATRIX.md`
- `docs/planning/2026-10-18_ANDROID_ACTUAL_END_ESTIMATE_QUICK_INPUT.md` — implementation and exact-SHA verification closeout.

No implementation or release operation was performed in this Decision commit.
