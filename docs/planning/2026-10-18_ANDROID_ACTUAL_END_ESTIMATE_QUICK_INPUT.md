# D-179 Android Today Actual End 「見積通り」 Quick Input — implementation closeout

**Status:** IMPLEMENTED / local app + Wear JVM PASS / focused AVD PASS / exact-SHA CI PASS / signed Phone APK verified / Product Verified NO / Released NO
**Implementation SHA:** `e360792306a66e134b89027f93049499c915bb48` (`main`)
**Decision:** [D-179](../decisions/D-179_ANDROID_ACTUAL_END_ESTIMATE_QUICK_INPUT_V01.md)

## Delivered behavior

- Adds a small `見積通り` action beside the existing editable actual-end field in Android Today.
- A tap fills a one-shot end from the effective actual-start Instant plus the effective estimate duration in seconds. The editor displays Day-local `HH:mm` while retaining the exact Instant, including seconds and fractional seconds.
- Tap does not save or change lifecycle. Re-tapping recalculates. Later edits to start or estimate do not recalculate; focusing the end field clears exact quick-input authority even if the user types the same minute back.
- Uses D-171 exact start authority or an unchanged canonical Running/Completed start. A manually entered minute start keeps D-147(B) minute precision and is eligible only when the Day projection proves the minute snap cannot alter that Instant. Ambiguous history, missing/invalid data, future candidate, unsafe timezone transition, and unauthorized/future Day cases fail closed.
- Completed metadata uses the canonical Entry estimate seconds. Existing `SetExecutionTimes` receives exact `started_at` / `ended_at` where exact start authority is available; no Worker or API behavior changed.
- Exact end is carried through draft validation, `NormalizedTaskInput`, save JSON, Completed no-op comparison, and optimistic projection. Existing execution identity, owning Day, Section, replay/CAS checks, and explicit Save boundary remain authoritative.

## Verification evidence

- Focused Android JVM suite: `TaskPlanningControllerTest`, `TaskPlanningHttpRepositoryTest`, `TodayOptimisticTest` — `78 / 78 PASS`.
- Full local Android app JVM: `481 / 481 PASS`; Wear JVM: `68 / 68 PASS`.
- `:app:compileDebugAndroidTestKotlin` — PASS.
- Targeted `TodayScreenInstrumentedTest.estimateEndQuickInputIsVisibleAndSavesExactEndThroughEditor` — `1 / 1 PASS` on `TaskChute_API33`, using production source from `e967d49e84072df519ea1e9b1b3cfe7bc0cc6fbb`. The later `e360792` commit changes only JVM test synchronization; production and instrumentation sources are unchanged.
- A broader `scripts/android-qa.ps1 -Surface Today` attempt completed `44 / 49`; five unrelated failures remained, and the emulator later lost its Package Manager service. Treat that broad surface result as partial, not green. MainActivity install/launch smoke was not available after the service loss.
- Web `npm run preflight` — PASS before implementation push.
- Exact-SHA GitHub Actions run [`39090309366`](https://github.com/hedgetheapp/taskchute-platform/actions/runs/39090309366) for `e360792306a66e134b89027f93049499c915bb48`: classifier, app + Wear JVM, signed Phone/Wear APK builds, instrumentation APK compilation, signing verification, and artifact upload all PASS. The Android-only path correctly skipped Web/Worker verification.
- Phone artifact `taskchute-android-debug-e360792306a66e134b89027f93049499c915bb48`, ID `12122242657`, expires `2026-10-25T02:33:41Z`; GitHub archive digest `sha256:ab40b6f2dbdd91dc75e89fab5cf3e9f69de6cc252e3d6a491d98fd254ffc0ae5`. The extracted Phone APK is versionCode `1174`, SHA-256 `35CE23FC45C2C3E950F8D0863C52A5BDCDE4C5C2483606BC8243DC559EB46B06`; local `apksigner verify --verbose --print-certs` PASS with certificate SHA-256 `690C0BA4EC3C8C92C84883F54BA343FF37AC0B83CEDCAEB626777885E8B602B3`.
- An earlier exact-SHA run on production-equivalent code `e967d49` failed one controller test because the test edited the draft while the asynchronous references load was still in flight. The test now waits for references; the full local app and Wear suites pass after that synchronization fix. This was test synchronization; no product behavior change was needed.

## Boundaries and remaining evidence

No Worker/API/shared contract, schema, migration, dependency, deployment, persistent nonprod data, or production change was made. Persistent nonprod and production checks were not run. No Galaxy S23 confirmation for this shortcut has been supplied. Product Verified remains `NO`; Released remains `NO`.
