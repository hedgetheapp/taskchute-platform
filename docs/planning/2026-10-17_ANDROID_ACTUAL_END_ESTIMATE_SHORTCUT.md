# Android Actual End — 「見積通り」quick input (proposal)

**Recorded:** 2026-10-17  
**Status:** Product request captured / exact timestamp precision **AGREED 2026-10-17** / remaining behavior details **PROPOSED** / **NOT_STARTED**  
**Current GitHub main observed before recording:** `d9d8c293f2a306e25968f0be15ab99462be4645a`

## User request

In the Android Today Task Editor, actual-start inputs already have `前回タスク終了` and `現在時刻` shortcuts (D-171). Add an **actual-end time input shortcut labeled `見積通り`**. This is a requested future feature, not an instruction to implement during travel.

## Proposed product behavior (not yet approved as detailed semantics)

- Display a compact `見積通り` quick input next to the actual-end field where editing actual end is already eligible under existing lifecycle and established-Day rules.
- On tap, calculate **proposed actual end = selected Entry's effective actual start + its effective estimate duration**.
- Example: actual start 10:00, estimate 30 minutes → end field 10:30.
- The tap fills the actual-end field. It does **not** change actual start, estimate, lifecycle, or persist/complete automatically; existing explicit Save and canonical reconcile are required.
- No usable actual start or estimate → shortcut unavailable (disabled/hidden presentation delegated).
- Allow crossing the calendar midnight where existing owning-Day historical correction semantics permit it; preserve same Entry/Execution and owning Day.
- Existing future-time, start/end ordering, overlap, single active Execution, authenticated owner, Day and revision/replay validation remain authoritative. An estimated end in the future is not automatically accepted as a completed actual end.
- **Agreed 2026-10-17 — exact timestamp precision:** use the effective actual-start Instant plus estimate duration without rounding to minute boundaries, preserving source seconds (and fractional seconds when present). For example actual start `10:00:35` + 30 minutes → effective actual end `10:30:35`; display Day-local `10:30` (`HH:mm`). This is an explicit user choice of option A. Do not silently replace the underlying exact timestamp with `10:30:00`. Handling of later manual edits remains proposed, not yet finalized.
- Apply to Android actual-end editing only; no changes proposed to automatic Complete button behavior, Web/Wear, schema, migration, or shared Worker/API without a separate feasibility/Decision.

## Open product questions

1. **Resolved (user choice A, 2026-10-17):** quick-input actual end preserves exact seconds/subseconds from actual start plus estimate duration, without minute rounding. Display stays `HH:mm`.
2. **Open:** should the action be visible but disabled when the proposed end would be in the future, or allow filling with save-time validation? **Recommendation:** disable when it cannot produce a valid end.
3. **Open:** when actual start / estimate is manually edited after applying the end shortcut, should end remain fixed until the next tap? **Recommendation:** one-shot fill, no hidden continuous recalculation.

## References and boundaries

- `docs/decisions/D-171_ANDROID_ACTUAL_START_QUICK_INPUTS_V01.md`: approved start-only quick choices, exact vs minute intent. The actual-end manual-only scope must be narrowly extended by a newly approved decision; this planning note does not supersede it.
- `docs/decisions/D-147_ANDROID_TODAY_DOGFOOD_CORRECTIVES_V01.md`: D-147(B) minute adjacency semantics and Routine actual-time parity.
- `docs/decisions/D-174_ANDROID_PAST_DAY_TASK_EDIT_DELETE_PARITY_V01.md`: historical editing, future end rejection, midnight crossing, preserving owning Day/Execution identity.
- `docs/TEST_MATRIX.md`: implementation verification to be added when approved.

**No implementation, tests, APK, schema, migration, deployment, or user-data change is authorized by this note.** Before Codex implementation, reconcile latest branch/HEAD/docs, resolve the product questions, then prepare a focused Markdown Task Contract. Avoid unrelated full suites.
