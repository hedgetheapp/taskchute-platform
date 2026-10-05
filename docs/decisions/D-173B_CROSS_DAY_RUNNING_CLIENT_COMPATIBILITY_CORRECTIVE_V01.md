# D-173B — Cross-Day Running Client Compatibility Corrective v0.1

Status: **Approved / Implemented / Integrated / Exact-SHA CI PASS / Persistent nonprod deployed / Product Owner device verification NOT_RUN**

Date: 2026-10-05

## Incident and root cause

The Product Owner reported that after starting `睡眠` on the prior TaskChute Day and leaving it Running across the Day boundary, Android Today returned `HTTP 200 / PARSE_ERROR`; Today, Daily, and Pixel Watch were reported unavailable while Standalone Notes remained available. This is the D-173A device evidence.

The canonical Worker projection keeps one user-global active Execution, while the queried Day's Section and Entry collections contain only that Day's Entries. The existing cross-Day Worker lifecycle fixture confirms that the prior-Day Entry remains absent from Day B rows while the active Execution retains its stable `entry_id` and can be completed.

Before implementation, the equivalent Android parser fixture failed on current `main` with `IllegalArgumentException: active execution entry is missing from Today projection`. This confirms the Android root cause as `CROSS_DAY_ACTIVE_EXECUTION_CLIENT_INCOMPATIBILITY`. The Wear parser has the corresponding current-row-only resolution requirement and a cross-Day instrumentation fixture; its pre-fix runtime RED could not be executed because no compatible Wear emulator/device was available (the installed emulator rejected the host's unsupported HAXM hypervisor). Wear JVM/model/controller behavior and AndroidTest compilation are verified locally; the Wear parser RED remains `NOT_RUN`.

## Approved behavior

- The Task and Entry remain on the originating TaskChute Day and original Section.
- The Entry is not moved, copied, split, or automatically completed at a Day or Section boundary.
- One active Execution may cross Day and Section boundaries. The user completes it through the ordinary Complete action; the actual `ended_at` belongs to that same Execution.
- Current-Day Section and Entry rows remain limited to current-Day membership. The prior-Day Entry does not join current-Day ordering, placement revision, selection, D&D, or Section overflow as a Task row.
- Android Running Player, Wear Running screen, and Wear complication present the Task as ordinary Running. No cross-Day label, warning, modal, or special screen is added.
- Daily uses its existing current-Day and Daily Document path without cross-Day UI.

## Projection and compatibility

The established current-Day response adds an optional, nullable top-level `active_entry` presentation object only when the active Running Entry is absent from that Day's rows:

```json
{
  "id": "<entry-id>",
  "task": { "id": "<task-id>", "title": "<effective-title>" },
  "lifecycle_state": "running",
  "estimate_seconds": 900
}
```

The existing `active_execution` identity and meaning do not change. `active_entry` is not inserted into `sections` or `unsectioned_entries`, is not a planning or ordering authority, and contains no Project, Mode, or Section projection. The Worker resolves its Task/title through owner-scoped Entry and Task joins and the existing Routine-occurrence / Entry snapshot precedence. Same-Day Running continues to resolve from its existing Day row and returns `active_entry: null`; idle returns `active_entry: null`.

The field is additive and optional in the shared type and both client parsers. New clients continue to accept old same-Day responses that omit it; existing clients ignore the additive field. Existing clients that already reject a cross-Day active Execution still need an updated client to present and complete that state. No existing field changes meaning. No schema, migration, data repair, new command, dependency, or production operation is introduced.

Complete continues to send the stable prior-Day `entry_id` and active `execution_id` through the existing endpoint and payload. After success, clients reconcile the canonical current Day; current-Day rows remain unchanged and the active Running presentation disappears.

Forecast semantics remain unchanged: the existing global active-Execution remaining estimate still advances the current-Day planned queue where that was already canonical behavior. The separate active Entry is not added to Day rows or current-Day Section overflow calculations. D-164 last-known-good complication behavior remains unchanged.

## Verification and rollout boundary

Exact-SHA CI `37255333103` passed for implementation `9fea9c39593f34079dc71da102ca048eec994e00`. Canonical nonprod `taskchute-web-nonprod` deployed as Worker version `740668f6-5687-4966-8fc6-d9c11cd270a9`; read-only root returned `200`, and unauthenticated protected current-Day API returned `401`. Fresh signed Phone and Wear APK artifacts and their expiry times are recorded in `docs/TEST_MATRIX.md`. Android exact RED is captured. Wear parser instrumentation is compiled but its runtime RED is `NOT_RUN / NO_COMPATIBLE_WEAR_AVD`; no physical product verification is implied by JVM or build results.

The Product Owner's existing cross-Day `睡眠` Execution must remain active during automated deployment and verification. Galaxy S23 and Pixel Watch update-install / manual Complete checks remain `NOT_RUN / PRODUCT_OWNER_MANUAL` until the Product Owner reports them. D-167 remains `NOT_STARTED`. Production is `NOT_RUN`; Released is `NO`.
