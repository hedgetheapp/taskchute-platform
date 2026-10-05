# D-174 Android Past-Day Task Edit / Delete Parity v0.1

Status: **Approved / Implemented / Integrated / Local, exact-SHA CI, and persistent nonprod verified; representative Galaxy S23 actual-end correction PASS / authenticated QA and AVD UI pending**

## Decision

An already-established past TaskChuteDay is editable history, not blanket read-only history. Android Today may open an existing past Day and use the existing Task Editor to correct an eligible Entry or Routine occurrence. A past Entry remains on its originating Day unless an explicit existing day-move command is used. D-174 does not establish an unestablished past Day, synthesize its context, backfill Tasks or Routine occurrences, or change current / future Day behavior beyond the explicit compatibility extensions below.

All historical writes are authenticated-owner scoped and bounded to the selected established Day plus stable Entry / Execution / occurrence identities. Existing operation identity and exact-replay behavior, placement revision / CAS, lifecycle guards, future-time rejection, Execution overlap checks, exactly-one-active-Execution constraint, and canonical reconciliation remain authoritative. Rejection and retry must not partially update history. No synthetic Entry or Execution, fake Complete, automatic Day move, split Execution, or implicit cascade is introduced.

## Android surface

An eligible past row may expose the existing `編集`, `ノート`, and `その他 → 削除` affordances. Reuse the existing Task Editor and destructive confirmation; do not add a separate history editor or warning mode. After save / delete, reload the selected historical Day and retain its selected date.

D-174 does not add a past-row Start-now or ordinary Complete button, historical D&D / reorder, Duplicate, bulk historical delete, Quick Add, or past reminder scheduling. D-147's established-past Planned forward-day move remains available under its existing semantics. D-155 remains authoritative: past Entries do not gain new reminder intent.

## Lifecycle and fields

For ordinary Tasks on an established past Day:

- **Planned:** correct title, Project, Mode, Section, planned start, estimate, and actual start / end using existing planning and `SetExecutionTimes` semantics. No actual times leaves the Entry Planned; start only makes it Running; start plus end makes it Completed. A safe single-row delete is allowed.
- **Running:** use the existing Running editor fields, including estimate and actual-time correction. Entering an end completes the same Execution. Clearing times may roll back only through existing safe rollback rules. A safe single-row delete is allowed.
- **Completed:** use the existing Completed editor fields and actual-time correction. Clearing the end may reopen the same Execution to Running; clearing both may roll it back to Planned only where existing isolated rollback rules permit. A safe single-row delete is allowed.

Historical execution-time correction keeps the same Entry and Execution identities. Actual start remains inside the owning established Day interval; actual end may cross that interval's boundary. Neither timestamp may be in the future, and existing ordering, overlap, owner, and active-Execution uniqueness guards remain in force. For a prior-Day Task completed the next morning, correcting its end to 08:00 changes that same Execution and leaves its Entry on the origin Day / Section.

## Section authority

Planning correction uses the selected past Day's frozen established Section context, never today's Section configuration, and does not rewrite that context. A past Planned correction may explicitly choose a historically ended Section; D-129's current-time placement restriction does not apply to that historical correction. Preserve D-043 planned Section / start synchronization.

Running / Completed Section authority remains D-081 / D-132. Actual start may resolve the Entry's actual Section from the originating Day's frozen context. D-174 does not add an independent planning-Section edit for Running / Completed if doing so would change the actual-Section Domain semantics.

## Historical metadata authority

Historical metadata edits are local to the selected Entry or occurrence. For an ordinary Planned Entry, use existing ordinary Task / Entry planning authority only where it does not silently rewrite unrelated Entry history. For Running / Completed Entries, use existing Entry snapshots and historical relations; for Routine-derived Entries, use occurrence-local overrides / snapshots. Do not change unrelated Entries, shared current / future Task or Routine authority, or future occurrences. Stable Entry / Execution identities remain unchanged.

No new persisted representation or schema / migration is approved by D-174. If existing authority cannot correct a field without changing unrelated records, fail closed and report the exact field / limitation. Any expansion requiring new persistence or migration must stop before that change and return options for a separate Decision.

## Routine-derived Entries

Every past Routine edit or delete is occurrence-only. Do not mutate the Routine Definition, recurrence, defaults, another occurrence, unrelated snapshot, or future behavior. A Planned occurrence may use only existing occurrence-level field overrides and frozen occurrence / Entry history. Running / Completed actual-time correction uses the selected stable Entry / Execution identity and existing occurrence/history-local metadata authority.

Delete may remove only the selected occurrence's Entry and its Entry-bound Execution / history required by the existing command, while preserving the Routine Definition and other occurrences. Existing suppression / skip authority must prevent accidental regeneration. If safe historical Running / Completed occurrence deletion requires new schema / migration, ambiguous suppression semantics, or a destructive cascade beyond the selected occurrence, stop and return options; never delete or disable the Routine Definition as a fallback.

## Delete and protected history

Delete is single-row and requires explicit destructive confirmation. Reuse or narrowly extend the existing `DeleteCompletedEntry` family where appropriate, retaining exact established owner / Day / Entry / Execution identity, lifecycle validation, placement revision / CAS, replay safety, and atomic cleanup of only Entry-bound Executions, guards, snapshots, and relations. Preserve Task / Project / Mode definitions, Routine definitions, other occurrences, continuation chains, `completed_entry_future_routines`, and other protected history. Reject safely where a protected relation prevents deletion. Do not synthesize lifecycle transitions or cascade into unrelated domain history.

## Supersession

D-174 narrowly supersedes the established-past read-only boundary from D-123, D-124, D-147, D-148 and related SPEC wording **only** for the past edit / eligible single-row delete surface defined here. D-042's unestablished-past record-none / no-fabrication / no-backfill boundary is unchanged. Existing current / future semantics, D-012 operation retry safety, D-043 planning synchronization, D-081 / D-132 actual-Section authority, D-129 current-time placement guard, D-155 reminder boundary, and D-173B cross-Day Execution semantics remain authoritative except for the explicit historical correction rules above.

Historical D-123 / D-124 / D-147 / D-148 records remain evidence of the earlier approved scope; this Decision does not rewrite those records.

## Implementation and authority map

Implementation `2ae2ee32084cb89037b83845b8623081715d207e` is integrated on `main`. Android reuses the selected established Day, existing Task Editor, and single-row delete confirmation. Existing commands and persistence are retained:

- Ordinary Planned title and Project use `UpdateTaskMetadata` only when the Task is not shared with another Entry or a Routine Definition. Shared Task metadata is rejected safely because changing the Task would rewrite unrelated/current/future authority and Planned Entry has no historical metadata snapshot. Running / Completed title remains read-only as in the existing editor; Project correction uses the selected Entry's historical snapshot.
- Mode uses `SetEntryMode` for ordinary Entries and occurrence / Entry snapshot authority for Routine-derived Entries. Planned Section and planned start use the existing `MoveEntry` / `SetEntryPlannedStart` paths with the selected Day's frozen Section context. Routine Planned title, Project, Section, planned start, and estimate stay occurrence-local.
- Estimate uses `SetEntryEstimate` for Planned Entries and allows an established past Running Entry only with exactly one active Execution; Routine estimate uses `SetRoutineEstimate` occurrence authority. Actual start / end use `SetExecutionTimes`; lifecycle rollback uses the existing safe `RevertEntryStart` / execution-correction rules.
- Actual-time correction preserves Entry and Execution identity and originating Day. Actual start remains inside the owning Day; actual end may cross its boundary. Owner, future-time, overlap, active-Execution uniqueness, placement revision / CAS, operation replay, and canonical reconciliation checks remain enforced.
- A single past Planned row uses the existing `BulkDeleteEntries` planned-deletion authority; past Running / Completed uses `DeleteCompletedEntry`. Routine deletion records occurrence suppression. Continuation-chain and completed-entry future-Routine protections remain enforced; unsafe targets reject without a cascade.

The shared ordinary Planned Task title / Project case above remains intentionally guarded. Supporting a historical-only value where that Task is referenced by other history or a Routine Definition needs a new Entry-local persistence authority and a separate schema / migration Decision; D-174 did not authorize it. The exact options remain an Open Question in `docs/OPEN_QUESTIONS.md`.

No schema, migration, dependency, production operation, or existing user-data mutation was introduced.

## Verification and remaining evidence

- `npm run verify:heavy -- --surface cross`: Web `15 files / 490 tests PASS`, Worker / D1 `41 files / 428 tests PASS`, typecheck, normal build, and `git diff --check` PASS. Android app and Wear JVM suites, Android / AndroidTest Kotlin compilation, and signed debug APK build / verification also PASS.
- Exact-SHA GitHub Actions [run `37269689329`](https://github.com/hedgetheapp/taskchute-platform/actions/runs/37269689329) attempt 2 PASS. Attempt 1 failed only the unchanged, previously intermittent `TodayDirectManipulationTest.deterministicFailureDismissalIsGenerationSafe`; its isolated forced local rerun PASSed before the failed CI job was retried.
- Persistent nonprod `taskchute-web-nonprod` deploy PASS; Worker version `a3aa8ed4-36dd-42be-ba6b-a93f646cbadc`. Guarded bindings were APP `taskchute-app-nonprod`, AUTH `taskchute-auth-nonprod`, and `REALTIME_HUB/RealtimeHub/sqlite`; `RUNTIME_ENV=nonprod`, `BOOTSTRAP_ENABLED=false`. Root `200`, unauthenticated protected current-Day API `401`; APP / AUTH `quick_check=ok`, foreign-key checks empty, and no pending migrations. Every remote D1 integrity probe reported `rows_written=0`.
- Fresh signed Phone APK artifact `taskchute-android-debug-2ae2ee32084cb89037b83845b8623081715d207e`, artifact ID `11328331801`, expires `2026-10-12T06:01:46Z`; the CI signer fingerprint was verified locally. Wear APK and AndroidTest artifacts were also produced by the same CI run.
- Authenticated disposable QA is `NOT_RUN / AUTH_FIXTURE_UNAVAILABLE`; no QA account or Task was created and no existing user / `睡眠` history was mutated. The focused Android instrumentation Kotlin compiled, but the local `TaskChute_API33` AVD did not reach boot-complete within 180 seconds; Android UI runtime is `NOT_RUN / AVD_BOOT_TIMEOUT`.

The Product Owner reports a representative Galaxy S23 D-174 check: opened prior-Day `睡眠`, edited actual end to `08:00`, saved, and observed `問題なし` (`PASS / USER_CONFIRMED`). This is evidence for that actual-end correction path only; it does not verify delete or the full matrix. The separate D-173B cross-Day report remains distinct. Production is `NOT_RUN`, Released is `NO`, and D-167 remains `NOT_STARTED`.
