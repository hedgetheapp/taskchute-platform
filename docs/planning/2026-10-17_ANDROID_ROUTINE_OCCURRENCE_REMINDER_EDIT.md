# Android Routine occurrence reminder editing — investigation note

**Recorded:** 2026-10-17
**Status:** Confirmed Android Planned Routine editing gap / Single selected-Day occurrence scope **AGREED (user choice A, 2026-10-17)** / implementation **NOT_STARTED**.
**Read-only investigation baseline:** GitHub `main` at `76d922c931c9b5e234ca19871268df3dff51fa1e`.

## User report

When editing a Routine-derived task in Android Today, `開始通知` and `超過通知` cannot be operated.

## Verified existing behavior (source)

- `apps/android/app/src/main/java/com/hedgetheapp/taskchute/today/TodayScreen.kt`: for `TaskEditorCapability.ROUTINE_PLANNING` both `ReminderOffsetField` and `超過通知` are explicitly disabled by `!routinePlanning`.
- `apps/android/app/src/main/java/com/hedgetheapp/taskchute/today/TaskPlanningHttpRepository.kt`: `ROUTINE_PLANNING` branch rejects changed reminder inputs with `Routineの通知設定はこの編集では変更できません。`.
- `apps/android/app/src/androidTest/java/com/hedgetheapp/taskchute/today/TodayScreenInstrumentedTest.kt`: `establishedFutureRoutineOccurrenceEditorAllowsOccurrenceTitleChange` expects both reminder controls to be disabled. This is intentionally enforced client behavior, not just a device rendering issue.
- `docs/decisions/D-155_ANDROID_TASK_REMINDERS_V01.md`: canonical reminder fields belong to the Day Entry/materialized occurrence; Routine Definition defaults and propagation to later occurrences are non-goals. Reminder settings for eligible current/future Planned and current Running are allowed, subject to existing lifecycle/planning guards.
- `docs/decisions/D-161_REMINDER_BACKED_FIXED_START_AND_CONFLICT_WARNINGS_V01.md`: non-null start reminder on a materialized occurrence also marks that Entry fixed-start for forecast; notification offset does not change anchor. Must retain this consequence.
- `apps/web/worker/application/task-metadata.ts`: existing `UpdateTaskMetadata` reminder-only patch updates the addressed `entries` row and explicitly guards `routine_occurrence_id`/state/day/planned start/estimate. Source read suggests the server has an eligible occurrence-scoped path, but an end-to-end successful Routine-specific edit has not been verified in this investigation.

## Product Owner decision — 2026-10-17

**Approved user-visible intent: option A — edit notification settings for the selected Day's materialized Routine occurrence only.**

- In Android Today Task Editor, permit `開始通知` and `超過通知` changes for an eligible Routine-derived Entry of the selected Day using the existing D-155 reminder settings and constraints.
- Do **not** change Routine Definition defaults, recurrence, or notifications on any other Day, including future occurrences.
- Preserve D-155 lifecycle eligibility: current/future Planned Entries may configure eligible reminder settings; a current Running Entry may change the overrun setting where already supported, but new start reminders must not be configured for Running; past and Completed entries do not gain reminder-setting permission.
- Preserve prerequisite checks (planned start for start reminder, positive estimate for overrun), canonical reconciliation/permissions/scheduling, and the D-161 consequence that enabling start reminder makes the selected Entry fixed-start for forecast.
- Routine-wide default configuration / future propagation (option B) is **out of scope** and requires a separate explicit Product Decision.
- This decision confirms a product behavior already contemplated by D-155; implementation feasibility, Android capability mapping, command dispatch and end-to-end verification remain pending.

Do not claim Running/Completed Routine parity without checking the corresponding editor capability and save path. A narrow fix may need client request plumbing, focused tests, and possibly Worker verification; do not assume UI-only.

## Next actions when Codex resumes

- On resumed implementation, inspect latest `main`, current Android save order (planned start/estimate and reminder patch), Worker validation, server replay/reconcile, and fixed-anchor derivation.
- Verify eligible current/future Planned Routine edit, unchanged unrelated occurrences/Definition, offset and estimate guards, rejection and retry, and a focused Android UI case.
- Use a separate Codex Markdown Task Contract and targeted tests; no speculative schema/migration/API changes.

This is a **planning/diagnostic note recording the Product Owner's approved scope**, not a replacement for canonical D-155/D-161 Decisions. No product code, data, migrations, deployment, or production changes were made.
