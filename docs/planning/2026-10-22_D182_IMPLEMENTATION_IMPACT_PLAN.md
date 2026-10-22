# D-182 Implementation Impact / Compatibility Plan — 2026-10-22

## Preflight

- Isolated checkout: `C:\Users\hari\AppData\Local\Temp\taskchute-platform-d182-isolated-20261022`
- Remote: `https://github.com/hedgetheapp/taskchute-platform.git`
- Starting branch / HEAD / `origin/main`: `main` / `8c19e647bd8111142daaec07b8565dcf4a3989d5` (clean)
- Protected primary checkout: not accessed for writes; its existing local changes remain out of scope.
- Approval: `docs/decisions/D-182_INTERRUPTION_HARD_DELETE_PRESERVED_LINEAGE_V01.md`; execution limits in the original D-182 task contract and 2026-10-22 isolated-checkout addendum.

## Proposed implementation boundary (within approved D-182)

1. Add one APP migration `0040_interruption_hard_delete.sql`. Create owner-scoped, non-visible tombstone rows keyed by `(app_user_id, deleted_entry_id)` with only `continuation_chain_id`, nullable `parent_entry_id`, and a nullable root baseline estimate populated only when the deleted node is the chain root. Keep structural ancestry only while the chain has live members; garbage-collect all tombstones for a chain in the same successful transaction that removes its last live Entry. No title, actual seconds, Execution, Task, Day, Review row, or legacy backfill is stored.
2. Preserve existing `entries.continuation_chain_id` and `continuation_parent_entry_id` on survivors. A live parent reference must resolve to either a same-owner live Entry or a tombstone in the same chain. Reject inconsistent, cyclic/unresolvable, cross-owner, null-ID, or otherwise noncanonical chain topology without mutation. Do not re-root or update survivor placement/lifecycle/estimate/snapshots.
3. Add one dedicated, owner-authenticated `DeleteInterruptionEntry` single-row command/API route. Include the command in the migration's operations allow-list rebuild while copying every existing operation row verbatim. Keep current `DeleteCompletedEntry` singleton guard and all ordinary bulk behavior intact. Add a narrow `BulkDeleteEntries` refusal for any ordinary chain member / row with live or tombstoned lineage, so old clients cannot route a chain member around D-182 validation. Require explicit Android confirmation, established current/eligible past Day, exact placement revision, valid A/C/B class, exact chain/Execution/pair snapshot at commit, and a successful atomic D1 batch before reporting success.
4. Delete only the selected Entry's own Executions and FK-bound local rows (`lifecycle_command_guards`, Entry Mode snapshot/live row, Project snapshot, Task snapshot, Quick B→C pair via endpoint cascade). Reject Routine-bound/suppressed and `completed_entry_future_routines` linked rows. Preserve all other Tasks, documents, metadata, Entries, Executions, snapshots, and the surviving Quick pair endpoint. Review remains based on canonical live Entry/Execution data and is not backfilled or rewritten.
5. Resolve future D-073 / Quick continuation estimate baseline from the live root Entry, or from its owner-scoped root tombstone when that root was deleted. Sum only surviving Execution facts. Existing surviving `estimate_seconds` values are never updated. Add the parent Entry ID to the optional Day DTO/Android model so ordinary and Quick-generated continuations remain eligible even when the visible parent was deleted; existing clients ignore this additive field. Use the existing terminal outcome and Quick-origin projection for A/B identification.
6. Android `その他 → 削除` uses the dedicated path only for one projected eligible A/C/B row; normal planned bulk deletion keeps its current endpoint. Preserve the existing explicit cancel/confirm flow and controller's canonical refresh / deterministic-vs-ambiguous failure handling. Do not change D-181 Quick action behavior or Wear UI.

## Invariants and acceptance cases

- A root / intermediate C deletion retains only necessary lineage while descendants survive; a planned C leaf and a C with one or several descendants are each single-row deletes.
- A Quick B may be Running/Completed and may itself have descendants. Deleting A alone preserves a live B→C pair. Deleting B or C removes only that pair and keeps the other Entry in its ordinary projection/order.
- No target Execution remains; no other Execution changes; at most one active Execution remains globally; the Day placement revision increases exactly once on success and not on rejection.
- An exact replay returns the original result; changed fingerprints reject; concurrent deletion / interruption / placement changes are zero-partial-write conflict or ambiguous outcomes.
- Deleted actuals and Completed counts disappear from Day and daily/monthly/yearly Review; no deleted row or baseline is projected. Nullable baseline stays nullable. Survivor estimates and lifecycle/placement are byte-for-byte unchanged.
- Fresh migration and `0039→0040` preserve all old data and operations, and pass SQLite `quick_check` plus empty `foreign_key_check` without inferred legacy lineage.

## Compatibility, cost, and gates

- The new endpoint and optional DTO field are additive. Existing endpoint behavior and replay rows remain compatible. The new operation requires only the approved APP migration; no AUTH migration or third-party dependency.
- Retained D1 data is limited to deleted structural nodes in still-live chains and is removed when a chain becomes empty. One indexed owner/chain lookup bounds baseline and cleanup queries. No recurring query scans across users.
- Before any migration/deploy: focused local migration, Worker/D1, shared contract, Android JVM/UI checks; exact-SHA CI; latest `main`/file/status preflight; approved dual-DB backup and isolated offline recovery validation; exact nonprod binding/version and synthetic QA target confirmation. Production, restore, real-user deletion, new branch/PR/merge/tag/Release remain excluded.

## Known review point before implementation

D-073 and Quick estimate derivation currently query a live root Entry plus all live chain Executions. This plan changes only root lookup to fall back to validated owner-scoped lineage when the root is deleted; it does not alter any existing survivor estimate. This matches the approved baseline rule and introduces no estimate provenance inference.

## Implementation and verification status — 2026-10-22

- Implemented in the isolated clone: APP `0040`; owner-scoped continuation lineage analyzer / estimate fallback; dedicated `DeleteInterruptionEntry` request, route, atomic Worker command and operation replay type; narrow legacy `BulkDeleteEntries` chain rejection; optional Day lineage DTO; Android parser/model/eligibility/confirmation/controller/repository path; focused Worker and Android regressions; bounded migration script.
- PASS: Bounded migration script under bundled Node `v24.19.0`; fresh `0001→0040` and data-preserving `0039→0040`, old operation preservation, legacy root-delete barrier, `quick_check=ok`, and empty FK check. All APP migrations through `0040` also apply in Python SQLite `3.45.3` with clean integrity checks. Focused Worker integration: `4 files / 34 tests`; Worker typecheck and Web/Worker production build pass. Android focused JVM `72 / 72`, Kotlin compile, AndroidTest Kotlin compile, debug assemble, and API33 confirmation instrumentation `1 / 1` pass. Source review covered owner-authenticated routing, Entry-bound foreign keys, guarded atomic delete/replay, survivor lineage, Review projections, and explicit confirmation/cancel behavior.
- PENDING: Exact-SHA CI, commit/push, fresh APP/AUTH backup/checksum and isolated offline recovery, nonprod migration/deploy/synthetic QA, and exact-SHA Phone APK.
- Latest remote-main preflight succeeded: `git fetch origin main` and `git ls-remote origin refs/heads/main` both report the approved base SHA `8c19e647bd8111142daaec07b8565dcf4a3989d5`; local `main` is aligned. No remote write has been made. Primary checkout remains untouched. Recheck the remote immediately before the authorized fast-forward push and stop if it has advanced or contains unexpected changes.
