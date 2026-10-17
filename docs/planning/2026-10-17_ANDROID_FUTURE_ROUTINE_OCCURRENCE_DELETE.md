# Android: Future-day Routine occurrence delete action — pending

**Recorded:** 2026-10-17  
**Status:** Agreed direction / **NOT_STARTED** (documentation only)  
**Owner:** Product Owner decides; ChatGPT organizes; Codex implements later.

## Problem

On Android Today, a Routine-derived Planned Task shown on a selected future Day cannot currently be deleted through the expected row action, while an ordinary Planned Task can. This was reported in the product discussion; no new implementation or device verification was performed when recording this note.

## Agreed user-visible intent

- A user should be able to delete **only the Routine occurrence/Planned Entry scheduled for the selected future Day**, using the existing Android row action / delete confirmation pattern, when canonical eligibility permits it.
- Do **not** delete, disable, or modify the Routine Definition, its recurrence rule/defaults, or occurrences on other dates.
- The deleted occurrence must not immediately regenerate when the selected Day is reloaded/reconciled. Preserve existing occurrence suppression and canonical mutation/retry semantics.
- The intended work is to correct Android **action visibility/eligibility wiring** where existing canonical single-occurrence delete already supports the selected future Day. Do not assume a Worker/API/schema change is necessary or approved.

## Scope boundary and next investigation

- **Implementation is not started.** No code, tests, migration, deployment, or user-data mutation is authorized by this tracking note.
- Before implementation, Codex must read current GitHub canonical docs, inspect the actual Android action gating and existing delete command for a selected established future Day, and verify current-Day Routine single-occurrence behavior.
- Respect D-126 (Android future planning parity, without widening Routine row eligibility on its own), D-119 (explicitly established future Day), and existing Routine suppression/delete semantics. D-174 covers occurrence-local past deletion; it does not automatically extend future behavior.
- If the current canonical command cannot safely delete exactly the selected future occurrence, **STOP** and report the Product/domain options. Do not silently introduce persistence, migrations, new command families, or broader destructive scope.
- On later implementation, use focused tests for future Routine delete action availability, ordinary-task parity, per-occurrence suppression/non-regeneration, other dates/definition remaining unchanged, and existing replay/reconciliation guards. Do not run unrelated full suites by default.
- Create the formal Codex Markdown Task Contract only when implementation resumes, after reconciling against then-current `main` and canonical docs.

## Canonical reference status

This is a **pending-work tracking note**, not a new Approved Decision, not test evidence, and not a replacement for canonical Product/Domain SPEC. If any detail conflicts with newer canonical docs, report it and obtain a Material Decision where required. Promote finalized changes to the appropriate canonical docs during an approved implementation/closeout.

Relevant canonical files at record time:

- `docs/decisions/D-126_ANDROID_FUTURE_DAY_PLANNING_PARITY_V01.md`
- `docs/decisions/D-119_FUTURE_DAY_ROUTINE_MATERIALIZATION_V01.md`
- `docs/decisions/D-174_ANDROID_PAST_DAY_TASK_EDIT_DELETE_PARITY_V01.md`
- `docs/TEST_MATRIX.md`
