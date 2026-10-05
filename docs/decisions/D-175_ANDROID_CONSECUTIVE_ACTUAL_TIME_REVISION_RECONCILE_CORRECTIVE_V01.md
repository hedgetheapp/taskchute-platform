# D-175 Android Consecutive Actual-Time Save Revision / Reconcile Corrective v0.1

Status: **Approved corrective / Implemented / Integrated / Local and exact-SHA CI PASS / Galaxy S23 PASS (USER_CONFIRMED); AVD UI not run**

Implementation commit: `708a0a48bc4bd3872cebf165a39c59a9cb683d00` on `main`.

## Classification and reported behavior

This is a product defect correction within existing actual-time, lifecycle, and placement-revision semantics. It does not introduce a new product decision.

The Product Owner reported saving actual start/end for Planned Task A, then immediately saving Task B. B showed the generic Today update error and did not save until an explicit refresh. During refresh A could briefly appear Planned before later showing Completed. The separate D-174 representative device check (prior-Day `睡眠`, actual end changed to `08:00`, save, `問題なし`) is recorded as `PASS / USER_CONFIRMED`; this does not verify delete or the full D-174 matrix.

## Confirmed root cause and RED evidence

Canonical `SetExecutionTimesResult` includes `placement_revision`, and the Worker returns the resulting revision while enforcing stale expected revisions. Android's `TaskPlanningHttpRepository` previously mapped successful `/execution-times` responses through `toSaveResult()`, discarding the response body and returning plain `Success`. The existing `TaskPlanningController` therefore had no revision to confirm before the next editor opened.

Before the fix, the repository RED returned `Success` where `SuccessWithRevision(6)` was required. The consecutive editor / real-repository harness modeled the canonical Worker guard: A used expected revision 5 and advanced the simulated canonical revision to 6; B also sent 5 and received simulated HTTP `409 revision_conflict`. The exact RED was expected revisions `[5, 6]` versus actual `[5, 5]`, statuses `[200, 200]` versus `[200, 409]`, conflict codes `[]` versus `[revision_conflict]`. After the fix, requests use `[5, 6]`, both simulated statuses are `200`, and no conflict is returned. The handset's raw HTTP status was not captured; this evidence confirms the canonical failure mechanism through the Android boundary harness and Worker contract, not a captured device response.

## Corrective

Successful actual-time mutation responses now parse canonical `placement_revision` and return `PlanningSaveResult.SuccessWithRevision`. The existing controller callback confirms that revision for the selected logical date before save reconciliation, so an immediately opened editor uses the new revision without a blocking refresh. Malformed successful response bodies fail closed with a reload message. The fix covers ordinary actual-time correction, completed-Execution reopening, and the actual-time command used after Entry creation.

`TodayController` production code did not change. A new stale-reconcile test confirms the existing optimistic overlay keeps A visibly Completed while a revision-5 Planned projection is stale beneath the confirmed revision-6 floor; a fresh revision-6 Completed projection then clears the overlay normally. Server stale-revision rejection remains unchanged. No delay, forced full refresh, blind retry, or Worker semantic relaxation was added.

## Changed files and verification

Implementation and regression coverage are limited to:

- `apps/android/app/src/main/java/com/hedgetheapp/taskchute/today/TaskPlanningHttpRepository.kt`
- `apps/android/app/src/test/java/com/hedgetheapp/taskchute/today/TaskPlanningHttpRepositoryTest.kt`
- `apps/android/app/src/test/java/com/hedgetheapp/taskchute/today/TaskPlanningControllerTest.kt`
- `apps/android/app/src/test/java/com/hedgetheapp/taskchute/today/TodayControllerTest.kt`

Local focused Android repository/controller/reconcile tests pass; full app JVM is `356 / 356 PASS`. Focused Worker execution-correction integration is `30 / 30 PASS`. `:app:compileDebugKotlin`, `:app:compileDebugAndroidTestKotlin`, `:app:assembleDebug`, and `git diff --check` pass. Exact-SHA CI for the implementation commit passes Android JVM, signed Phone/Wear debug builds, AndroidTest compile, certificate checks, and artifact upload; Web/Worker jobs are correctly skipped for Android-only impact. The CI-produced Phone APK has one verified nonprod signer. Exact run/artifact identifiers and expiry remain GitHub's volatile metadata and are reported in the implementation handoff.

The `TaskChute_API33` AVD did not reach boot-complete within the 180-second attempt; Android UI runtime is `NOT_RUN / AVD_BOOT_TIMEOUT`. The Product Owner installed the exact D-175 Phone build on Galaxy S23 and repeated the reported flow: save Task A with manual actual start/end, then immediately save Task B with manual actual start/end without refreshing. The Product Owner reported `問題なし`; record this representative consecutive-edit path as `PASS / USER_CONFIRMED`, including no observed second-save failure or visible Task A lifecycle rollback. No authenticated QA fixture or automated user-data mutation was used. Worker deploy is `NOT_REQUIRED` because Worker/API source did not change. No schema or migration was added.

## Boundaries

- D-174 representative historical actual-end correction: `PASS / USER_CONFIRMED`; delete and full device matrix remain unverified.
- D-175 exact-build Galaxy S23 representative consecutive actual-time edit: `PASS / USER_CONFIRMED`.
- D-167: `NOT_STARTED`.
- Production: `NOT_RUN`.
- Released: `NO`.
