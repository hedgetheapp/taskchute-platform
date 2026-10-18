# Android: Future-day Routine occurrence delete action — completed

**Recorded:** 2026-10-17  
**Status:** Implemented / **CLOSED WITH LOCAL + EXACT-SHA EVIDENCE; GALAXY S23 REPRESENTATIVE USER-CONFIRMED PASS (2026-10-18)**
**Owner:** Product Owner decision authority; Codex implementation; ChatGPT canonical-doc coordination.

## Problem

At the time this note was recorded, Android Today did not expose the expected delete action for a Routine-derived Planned Task on a selected future Day, while an ordinary Planned Task could be deleted. No implementation or device verification had been performed yet.

## Agreed user-visible intent

- A user should be able to delete **only the Routine occurrence/Planned Entry scheduled for the selected future Day**, using the existing Android row action / delete confirmation pattern, when canonical eligibility permits it.
- Do **not** delete, disable, or modify the Routine Definition, its recurrence rule/defaults, or occurrences on other dates.
- The deleted occurrence must not immediately regenerate when the selected Day is reloaded/reconciled. Preserve existing occurrence suppression and canonical mutation/retry semantics.
- The intended work is to correct Android **action visibility/eligibility wiring** where existing canonical single-occurrence delete already supports the selected future Day. Do not assume a Worker/API/schema change is necessary or approved.

## Scope boundary and implementation result

- The implementation remains limited to the approved Android row affordance and its focused tests. No production Worker/API/shared contract/schema/migration/dependency, deployment, persistent nonprod mutation, or production action was made.
- Source inspection confirmed that `TodayDirectManipulationController.delete(...)` already dispatches the selected established future Day, while `TodayTaskRow` hid `その他` behind the coarse `canNoteOnly` shortcut even when `canPlannedDelete` was available.
- `hasOtherActions` now reflects the actual available action set, including `canPlannedDelete`, in both sectioned and unsectioned rows. The existing confirmation, `BulkDeleteEntries`, operation identity, retry, suppression, and canonical reconciliation paths are reused.
- The implementation follows D-126 (Android future planning parity without widening protected row eligibility), D-119 (explicitly established future Day), and existing Routine suppression/delete semantics. D-174 remains scoped to occurrence-local past deletion and was not used to extend future behavior.
- The focused `TaskChute_API33` flows pass for sectioned and unsectioned future Planned Routine rows and for a future Completed note-only negative case. Direct manipulation JVM tests pass `58 / 58`. One focused synthetic D1 integration test verifies exact replay, suppression through repeated future-Day ensure, and unchanged Routine Entry / Definition.
- The full Today AVD run completed `85 / 91`, with six failures. Five unrelated tests reproduced with the original action-visibility expression; one swipe failure from the full run passed when isolated. The full surface remains `PARTIAL`, while the focused changed behavior passes.
- Exact-SHA CI and signed Phone APK verification passed. On 2026-10-18, in response to the requested Galaxy S23 representative check of deleting one future-Day Routine occurrence while leaving the same Routine on another Day, the Product Owner replied `問題なし`. Record `PASS / USER_CONFIRMED` for that scoped device behavior, not a full device matrix. The Today-wide AVD suite remains `PARTIAL`; overall Product Verified remains `NO`; Released remains `NO`.

## Canonical reference status

This was a **pending-work tracking note**, not a new Approved Decision or a replacement for canonical Product/Domain SPEC. It is now closed as an implementation tracker; canonical semantics remain in the referenced Approved Decisions. Current verification evidence is in `docs/TEST_MATRIX.md`.

Relevant canonical files at record time:

- `docs/decisions/D-126_ANDROID_FUTURE_DAY_PLANNING_PARITY_V01.md`
- `docs/decisions/D-119_FUTURE_DAY_ROUTINE_MATERIALIZATION_V01.md`
- `docs/decisions/D-174_ANDROID_PAST_DAY_TASK_EDIT_DELETE_PARITY_V01.md`
- `docs/TEST_MATRIX.md`
