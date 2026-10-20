# Android Interrupt Phase 1 / Quick Interrupt feasibility — 2026-10-20

**Phase 1 implementation SHA:** `7276ad9685c8933509d5a6143350c0cf3d0929b9` (`main`)
**Status:** Phase 1 implemented; focused Android JVM 62 / 62 PASS; Android and AndroidTest Kotlin compile PASS; exact-SHA CI and signed Phone APK artifact PASS; Today emulator instrumentation `NOT_RUN / ENV_BLOCKED`.
**Scope:** Existing D-073 `InterruptEntry` only. No Worker, Web, API, schema, migration, dependency, nonprod data, or production change.
**Decision boundary:** Quick Interrupt UI location and tap behavior are already approved by the Product Owner. Its persistence/API/atomicity contract remains open; this report is feasibility only.

## Phase 1 — ordinary planned A → ordinary planned B

On Android Today, tapping the existing Start action for an eligible ordinary planned B while one ordinary A is running now sends the existing `POST /api/v1/entries/{source_entry_id}/interrupt` D-073 request. The request carries the canonical Day, source Entry and active Execution, target Entry, a new target Execution ID, a new continuation Entry ID, expected placement revision, and one UUIDv7 operation ID. Those IDs and the complete payload remain stable across retries.

The client does not run `Complete A` plus `Start B`, and it does not optimistically fabricate history or a second active Execution. After a success, ambiguous response, or deterministic rejection it reloads the canonical Day. Success is presented only after the exact interrupted source, target Execution, and planned same-Task continuation are visible at the required placement revision. Ambiguity retains the exact operation and offers `同じ操作を再試行`. Interrupted history is displayed as `中断`, with `last_outcome=interrupted` kept distinct from ordinary completion.

Only current established Day ordinary A → ordinary planned B is eligible. Routine source/target, non-current Day, missing or mismatched active identity, cross-Day active Entry, and multiple-running projections fail closed. D-167 Complete→Start and D-173B cross-Day display paths remain separate. The Running panel remains in place; no Quick Interrupt action was added.

The Android response parser validates the D-073 response identities, interrupted outcome, target execution, continuation placement/estimate shape, and exactly-next placement revision. The subsequent Today read remains canonical. Existing D-073 Worker and authenticated Web evidence in `docs/TEST_MATRIX.md` / `docs/RISKS.md` is reused because no Worker code changed; no new server or persistent nonprod verification is claimed.

## Quick Interrupt — feasibility only

### Reuse and atomicity

D-073 can be reused for the already-existing source A, active Execution, target planned B, continuation chain, stale-revision guards, replay discipline, one-active-Execution assertion, and canonical Day response. It cannot create B: `InterruptEntry` requires an existing planned target Entry.

Client-side `AddTaskToDay` followed by `InterruptEntry` is not safe for the approved one-tap behavior. If the first command commits and the second fails, an unintended planned Quick Entry remains. If the second response is ambiguous, the client cannot roll back the Task/Entry without risking deletion of valid work; the two requests also have separate operation identities and placement revisions. It would expose intermediate states to another client. The create, interrupt, start, and continuation therefore need one server transaction.

### Candidate command (not approved)

One candidate is a dedicated `QuickInterruptEntry` command, for example `POST /api/v1/taskchute-days/current/quick-interrupt`. Its immutable request would include `operation_id`, canonical `taskchute_day_id`, source Entry and active Execution IDs, new Task ID, new target Entry ID, new target Execution ID, continuation Entry ID, selected/frozen Section ID, default or submitted Task metadata, and `expected_placement_revision`. The response would return all created identities, interrupted source outcome, new active target execution, continuation, and the new placement revision.

The Worker would validate owner, current Day, ordinary running source, exact active Execution, one active Execution, placement revision, and Section resolution before writing. A single D1 batch would create the Task and Entry, preserve the source history and chain, insert the continuation, start the new Entry, advance placement revision once, assert identities and the single-active-Execution invariant, and store the operation result. A failure at any step must leave no partial Task, Entry, Execution, continuation, or operation result.

For durable replay, the operation fingerprint should bind every identity and metadata field; same operation plus same fingerprint returns the stored result, while reuse with a different request is misuse. A short-lived transaction guard should include the new Task/Entry IDs as well as D-073 source, execution, Day, and revision guards. The existing `operations` command allow-list is rebuilt by APP migrations when extended; an approved implementation would need a migration to allow `QuickInterruptEntry` and preserve existing operation rows. A distinct Quick guard is safer than weakening `interrupt_command_guards`, which currently describes an existing planned target. No such migration or command was made here.

### Recommended defaults and open Product choices

| Question | Recommendation for a first slice | Alternatives / status |
|---|---|---|
| Section attribution | Resolve the Section on the server using the same authoritative actual-Start/current-time rule at the interruption instant, then freeze it for the transaction. Fail closed with actionable feedback if the existing resolver cannot choose a valid Section. | Inherit A's source Section or the last selected Section. The phrase “current Section” is approved intent; exact fallback behavior still needs approval. |
| New Task metadata beyond the default title | Create an ordinary Task with title `（割込）`, no implicit Project, Mode, Note, reminder, or estimate. Let the user edit its title while Running through the existing editor. | Copy user defaults / last-used metadata, or expose a pre-command editor. A pre-command editor would conflict with the approved direct tap behavior. |
| Routine source/target | Keep the first Quick Interrupt slice ordinary-only, matching D-073's safe boundary. | Add current Routine occurrence support only after occurrence-specific history and continuation rules are approved. |
| Repeated Quick Interrupt / multiple continuations | Keep the chain unbounded by an arbitrary nesting-depth cap; each interrupted source creates exactly one planned continuation; never auto-start an earlier continuation on completion. Let the server return canonical placement. | Product must still decide how multiple planned continuations should be surfaced/prioritized and whether any grouping UI is needed. D-028's repeated-interruption intent does not settle those presentation semantics. |
| Offline / network ambiguity | Require an authenticated online command. Retain and retry the exact immutable envelope; if process-death recovery is required, persist that envelope in encrypted app-private storage until canonical confirmation or explicit recovery. | In-memory-only exact retry is simpler but loses the request after process death. A server lookup-by-operation endpoint is another option and expands the API. This persistence choice is open. |
| Cross-client changes | Enforce owner, Day, active Execution, and placement guards in the same transaction; invalidate/reload the Day for other clients after commit. | No client-side ordering can replace these server guards. |

**Already approved and not reopened here:** the action appears on the currently Running Task panel, is clearly labeled `割込`, a tap immediately starts the command without title entry or confirmation, the default title is `（割込）`, the Task title can be edited while Running, and the UI reports progress/failure without showing success before canonical confirmation.

### Impact-specific verification for a future approved implementation

- Worker/D1 integration: atomic no-partial-write probes at Task, Entry, source Execution, target Execution, continuation, placement revision, and operation-result boundaries; replay, mismatched fingerprint, owner isolation, stale source/revision, Section resolution, single-active-Execution, and concurrent-client cases.
- Android repository/controller: exact payload/replay identity, transport timeout followed by canonical confirmation, exact retry after ambiguity, auth/session reset, process-death recovery if approved, no success before canonical read, no auto-resume, and UI title edit while Running.
- Web/cross-client: other client sees one atomic new Task/Entry and consistent interrupted history after invalidation; repeated request does not duplicate Task or Entry.
- Today UI: one tap from Running panel, default title, in-progress/error feedback, canonical success, Section attribution, and Routine/non-current/ineligible negative cases.

## Evidence and limits

- Focused JVM: `TodayControllerTest` 39 / 39, `TodayHttpRepositoryTest` 15 / 15, `TodayJsonParserTest` 8 / 8 — **62 / 62 PASS**. The first combined run hit one existing `realtimeDayInvalidationReloadsSelectedDay` close/reload `ConcurrentModificationException`; isolated rerun and the complete focused rerun passed.
- `:app:compileDebugKotlin` and `:app:compileDebugAndroidTestKotlin` — **PASS**. `git diff --check` — **PASS**.
- Today emulator instrumentation did not reach test execution. The AVD booted, but `connectedDebugAndroidTest` failed before install/run: uninstall returned `DELETE_FAILED_INTERNAL_ERROR`, followed by `INSTALL_FAILED_PACKAGE_CHANGED`. Crash-buffer diagnosis found Google Play Store (`com.android.vending`) `SecurityException` while querying users; no TaskChute app crash was found. A subsequent debug APK reinstall and `MainActivity` resolution succeeded, but does not substitute for instrumentation. Classify UI runtime **NOT_RUN / ENV_BLOCKED**, not PASS or app failure.
- Exact-SHA CI completed successfully and uploaded the signed Phone APK artifact from the implementation commit. The artifact source and GitHub-reported ZIP SHA-256 are included in the final handoff; an older APK is not a substitute.
- Worker/API persistence, nonprod mutation, production, physical Galaxy S23, Product Verified, and Released remain **NOT_RUN / NO**.
