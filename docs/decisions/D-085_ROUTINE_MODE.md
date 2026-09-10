# D-085 — Routine Mode default / occurrence override

Status: **Approved**
Approved: 2026-09-10

This file is a canonical Decision record for D-085. Task Contracts and chat history are continuation aids only and are not the Source of Truth.

## Background

D-068 established user-owned reusable Mode definitions and 0..1 Mode assignment for ordinary planned Entries. D-072 established Mode archive / restore / delete lifecycle semantics and historical `entry_mode_snapshots` retention. D-044 and later Routine decisions established the `今回だけ / ルーティンに反映` pattern for current-Day planned Routine-derived Entries and default propagation for Routine fields.

Before D-085, Mode assignment is intentionally ordinary-Entry-only and Routine Definition / Routine Occurrence have no Mode default / override semantics.

## Product / Domain behavior

### Routine default Mode

A Routine Definition has an optional default Mode.

- A Routine default may be an active Mode or `Modeなし`.
- A newly created Routine has `Modeなし` unless a source Entry Mode is inherited by conversion.
- A newly materialized Routine occurrence uses the Routine Definition's effective default Mode.
- `Modeなし` is a first-class valid default value; no Product default Mode is introduced.

### Occurrence Mode override

A Routine Occurrence may have an explicit Mode override independent from the Routine Definition default.

The model must distinguish:

- no Mode override: inherit the Routine default; and
- explicit Mode override to `Modeなし`: use no Mode for this occurrence even when the Routine default has a Mode.

The projection therefore exposes whether a Mode override is present independently from the override Mode value.

### Day-screen editing scope

Direct Mode editing for a Routine-derived Entry follows the established Routine current-Day scope pattern.

Eligible source:

- current established TaskChuteDay;
- planned Routine-derived Entry;
- available / non-suppressed occurrence; and
- not mutation-locked.

Running, completed, historical, future/past preview, unestablished, unavailable/suppressed, or protected rows are not eligible for this direct Routine Mode edit.

When a user changes the effective Mode and the occurrence has no Mode override:

1. show the candidate locally without a server write;
2. require explicit choice between `今回だけ` and `ルーティンに反映`;
3. neither choice is preselected; and
4. cancel / Escape / dismiss restores canonical state and performs no write.

When the occurrence already has a Mode override, subsequent Mode changes on that occurrence apply directly as `今回だけ` without showing the chooser again.

D-085 does **not** add a dedicated `今回だけの変更を解除` / `ルーティン設定に戻す` action. There is no separate reset UI in this slice.

### `今回だけ`

`今回だけ` changes only the selected current Routine Occurrence.

- It creates or updates the occurrence Mode override.
- `Modeなし` is allowed as an explicit occurrence override.
- The Routine Definition default and other occurrences remain unchanged.
- A same-value no-op must not create unintended state.

### `ルーティンに反映`

`ルーティンに反映` changes the Routine Definition default Mode and makes the selected current occurrence use that new default rather than retain a separate Mode override.

For already-materialized planned occurrences of the same Routine Definition:

- occurrences with no explicit Mode override receive the new default Mode as their effective live Entry Mode;
- occurrences with an explicit Mode override remain unchanged;
- running / completed / historical facts remain unchanged;
- suppressed / unavailable occurrences are not silently reclassified; and
- no future object is created solely for propagation.

Unmaterialized future eligible occurrences use the new Routine default when they are later materialized.

The existing Routine `defaults_revision` / CAS authority must cover the default Mode change consistently with other Routine defaults.

### Routine Board

Routine Board adds a `Mode` field/column for editing the Routine Definition default Mode.

- Active Modes are selectable.
- `Modeなし` is selectable.
- An already-assigned archived Mode remains visible and valid as the existing value.
- An archived Mode cannot be newly selected for a different assignment.
- Changing Routine Board default Mode uses the same propagation rules above: planned materialized occurrences without Mode override update; explicit overrides and historical/protected facts remain unchanged.

### Conversion to Routine

When an eligible ordinary planned Entry is converted to a Routine:

- its current live Mode becomes the new Routine Definition default Mode;
- if the Entry has no Mode, the Routine default is `Modeなし`;
- the converted current occurrence does not need a separate Mode override solely to preserve that inherited value; and
- existing Section / planned-start / estimate conversion semantics remain unchanged.

### Mode archive

Archiving a Mode does not clear existing Routine references.

- Existing Routine default / occurrence override assignments to that archived Mode remain effective and readable.
- Existing planned Routine Entries using the archived Mode remain valid.
- The archived Mode cannot be newly assigned as a new Routine default or a new occurrence override.
- Users may change an existing archived assignment to `Modeなし` or to an active Mode.
- Restoring the Mode makes it normally selectable again.

### Mode delete

Deleting a Mode remains destructive only for the live Mode definition/assignment layer; historical execution facts are retained.

In addition to D-072 ordinary Entry cleanup, D-085 requires Mode deletion to clear live Routine references atomically:

- Routine Definition defaults referencing the deleted Mode become `Modeなし`;
- Routine Occurrence overrides referencing the deleted Mode become an explicit `Modeなし` override so the occurrence remains explicitly overridden;
- live `entry_modes` references are cleared as required by D-072; and
- `entry_mode_snapshots` and other historical execution facts are not rewritten or deleted.

A later new Routine default must therefore not silently overwrite an occurrence that became explicit `Modeなし` because its previously overridden Mode was deleted.

### Start / historical Mode

Routine-derived planned Entries use the existing live `entry_modes` representation for their effective Mode. At Start, existing D-068 historical snapshot semantics continue to apply so the executed Mode title/identity is retained independently from later Mode rename/archive/delete/default changes.

## Architecture / persistence constraints

D-085 approves an APP DB migration. The next APP migration slot from current main is `0025`.

Preferred implementation is additive typed relations rather than rebuilding existing Routine tables solely for Mode:

- a 0..1 Routine Definition → Mode relation, where row absence means default `Modeなし`;
- a 0..1 Routine Occurrence Mode override relation, where row presence means override-present and nullable Mode identity means explicit `Modeなし`;
- owner-scoped keys / foreign-key or equivalent integrity consistent with current Mode/Routine ownership;
- existing `entry_modes` remains the effective live Entry Mode representation; and
- existing `entry_mode_snapshots` remains the historical execution representation.

Equivalent schema is permitted only if it preserves the exact Product semantics above, owner isolation, compatibility, atomicity, and Mode-delete behavior. No AUTH DB migration is approved.

### Upgrade compatibility for pre-D-085 Routine live Mode values

D-085 must not infer a new recurring default from data that existed before recurring Mode semantics were available.

If upgrade-time data contains a **planned Routine-derived Entry** that already has a live `entry_modes` value, migration must preserve the visible Mode as an explicit Mode override for that existing Routine Occurrence. The corresponding Routine Definition default remains `Modeなし` unless it is set after D-085 or created by a post-D-085 conversion.

This backfill preserves existing visible per-Entry state without retroactively claiming that the user intended the Mode to recur. Running/completed/historical Mode snapshots must not be converted into new recurring defaults or occurrence overrides. If upgrade data cannot be mapped to an owned Routine Occurrence / Mode without ambiguity, migration must fail safely rather than infer intent.

A dedicated Routine Mode command may be introduced for the current-Day scoped mutation if that is the clearest way to preserve operation replay / CAS / ambiguity semantics. Ordinary `SetEntryMode` behavior must not be weakened or silently broadened.

All sent logical mutations must preserve existing operation-id replay, revision conflict, deterministic rejection, ambiguous-outcome reconciliation, and D-066 global serial Web mutation ordering semantics where applicable.

## Compatibility / non-goals

D-085 does not:

- create a Product default Mode;
- give Mode a fixed semantic category such as context/location/energy;
- add a Routine-mode reset/inherit UI action;
- rewrite past Execution or Mode snapshot facts;
- infer a recurring default from pre-D-085 per-Entry Mode data;
- change Mode title identity semantics;
- change Routine recurrence semantics;
- add Android/Wear/iOS-specific Mode behavior;
- add a new external dependency;
- change authentication/security posture; or
- approve production migration/deploy/data mutation.

## Verification contract

Implementation is not `Verified` merely because code, migration, unit tests, commit, or deploy exists.

At minimum, D-085 verification must cover:

- migration from current schema with existing Routine/Mode/Entry/history data preserved;
- upgrade backfill of a pre-D-085 planned Routine-derived live Mode to an occurrence override without creating a recurring default;
- new schema integrity / foreign keys / ownership isolation;
- Routine conversion inheriting Mode and `Modeなし`;
- current-Day chooser behavior, cancel/no-write, `今回だけ`, sticky override behavior, and `ルーティンに反映`;
- explicit occurrence override to `Modeなし`;
- Routine Board Mode edit and propagation to eligible planned materialized occurrences;
- protection of explicit overrides, running/completed/history, and unmaterialized future behavior;
- archived Mode existing-assignment retention and new-assignment rejection;
- Mode delete atomic cleanup of Routine defaults/overrides plus ordinary live Entry assignments while preserving historical snapshots;
- operation replay / revision conflict / ambiguous retry behavior;
- local automated regression; and
- persistent nonprod migration/deploy/browser/API/DB verification with pre-migration backup/recovery validation as required by current workflow.

Production remains `NOT_RUN` and Released remains `NO` unless separately approved.

## References

- D-044 — Routine R2A current-Day field override and default propagation
- D-054 and subsequent Routine propagation decisions
- D-066 — global serial current-Day Web mutation dispatcher
- D-068 — Mode Management / Entry Mode v0.1
- D-072 — Mode search / archive / restore / delete parity
- D-084 — Routine-derived planned placement D&D / Shift
- `docs/SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/TEST_MATRIX.md`
- `docs/DEVELOPMENT_WORKFLOW.md`
