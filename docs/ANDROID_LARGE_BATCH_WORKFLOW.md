# Android Large Batch Development Workflow

Status: **Canonical operational workflow**

This document supplements `docs/DEVELOPMENT_WORKFLOW.md` for Android development. Project Instructions remain higher-priority governance, and Product / Domain / Architecture / Decision / implementation / verification remain owned by their existing canonical sources.

## Purpose

Android development may group multiple related capabilities into one Large Batch work item to reduce Product Owner waiting time, repeated agent handoffs, repeated environment setup, and redundant verification without lowering the quality bar.

The core rule is:

**Make the user-visible work item larger while keeping Codex internal implementation and test slices small.**

Large Batch does not expand Codex decision authority and does not weaken STOP conditions, Security boundaries, migration rules, or production boundaries.

## Batch boundary

Prefer one Batch when capabilities share the same screen, Domain flow, canonical API, state transition, or verification setup. Three to six related capabilities is a practical heuristic, not a hard limit.

Split the Batch, or resolve a Material Decision first, when work crosses a new Domain semantic, persisted compatibility or migration boundary, auth/Security posture, offline/background architecture, notification/widget architecture, long-term dependency, meaningful ongoing Cost change, production operation, or unresolved Material Product/UX Decision.

## Before Codex starts

ChatGPT reconstructs current GitHub state and defines one Task Contract for the whole Batch. The contract includes approved scope, non-goals, acceptance criteria, affected surfaces, verification contract, STOP conditions, Git/nonprod boundary, and required handoff.

Material Decisions are resolved before implementation. The Task Contract does not create new Product authority by itself.

## Codex execution

Codex executes the approved Batch end-to-end without waiting for user confirmation between ordinary internal slices.

Internally, Codex decomposes the Batch by feature or state transition. Each slice gets focused automated coverage as it is implemented so regressions are detected early. Reversible implementation details, ordinary bug fixes, tests, refactors, local verification, and factual docs maintenance remain delegated within the approved scope.

Do not run the entire full suite, persistent nonprod verification, or Galaxy S23 smoke after every internal slice. Heavy gates are consolidated at the end of the Batch unless impact/risk requires earlier execution.

## Android final gate

At Batch completion, run the impact-appropriate final gate:

1. Focused JVM tests for affected logic / ViewModel / repository / state transitions.
2. Android JVM affected/full coverage according to impact analysis, once at Batch closeout.
3. Windows local AVD `TaskChute_API33` through `scripts/android-qa.ps1` once for the affected instrumentation surface(s), APK install/launch readiness, and crash check.
4. Web / Worker / integration verification only when contracts or server behavior are affected.
5. Persistent nonprod verification only when the Batch changes behavior that requires remote evidence.
6. Canonical docs and `TEST_MATRIX` updated to the evidence actually obtained.

`scripts/android-qa.ps1` already runs `:app:connectedDebugAndroidTest`, which builds the
required debug and instrumentation APK inputs, then installs the debug APK and checks the
resolved activity and crash buffer. Therefore separate `assembleDebug` and
`assembleDebugAndroidTest` are `NOT_REQUIRED` in the ordinary local Android gate when this
script passes and final CI supplies the APK artifact. They remain allowed for troubleshooting
or when a Task Contract explicitly requires compile-only evidence. GitHub Android CI continues
to build and upload the debug APK and compile the instrumentation APK.

### Surface-aware local instrumentation

The no-argument invocation keeps the historical full gate:

```powershell
./scripts/android-qa.ps1
```

It is equivalent to `-Surface All` and executes every connected instrumentation class. For an
isolated ordinary UI change, select exactly the affected surface:

| Surface | Instrumentation class |
|---|---|
| `Notes` | `com.hedgetheapp.taskchute.document.NotesScreenInstrumentedTest` |
| `Today` | `com.hedgetheapp.taskchute.today.TodayScreenInstrumentedTest` |
| `Security` | `com.hedgetheapp.taskchute.security.EncryptedSessionStoreInstrumentedTest` |
| `Settings` | `com.hedgetheapp.taskchute.settings.SettingsScreenInstrumentedTest` |

The repository script currently accepts one of `All`, `Notes`, `Today`, `Security`, or `Settings` per run.
The Gradle runner does not safely express multiple class filters through this command, so a
multi-surface ordinary Batch runs one selected command per affected surface rather than
silently running only the first class. Every selected run retains APK install, resolved
MainActivity, and package crash-buffer checks and prints emulator, instrumentation, smoke, and
total timings.

For a single-surface ordinary change with no auth/security/cross-shell/realtime/shared-contract
impact, the closeout is full affected Android JVM coverage once, the matching targeted Surface
run once, and `git diff --check`. A multi-surface ordinary change selects each affected surface
once; unrelated Security or other surfaces are not added merely for reassurance. `All` remains
required for auth/session/Keystore, broad MainActivity/navigation-shell, realtime lifecycle,
shared Android infrastructure, unknown/cross-surface impact, milestone/release work, an
explicit contract requirement, or evidence that an isolated change affected another surface.

For an Android-only Batch with no Worker/API/shared-contract impact, full Web / Worker tests,
Web typecheck, and Web build are `NOT_REQUIRED by impact analysis`; the reverse applies to a
Web-only Batch with no Android/shared impact. The CI workflow still runs every affected heavy
job and routes unknown or cross-surface paths conservatively.

GitHub Actions continues to provide Web/Worker verification, Android JVM, APK build, and instrumentation APK compile as independent evidence. It does not replace the Windows local AVD runtime gate.

## Galaxy S23 evidence

Galaxy S23 manual smoke is not required for every Batch. Add it for device-specific or high-risk work such as lifecycle/auth/Keystore/network recovery, Samsung/OS-specific behavior, touch/keyboard/back/system-UI interactions, major UI milestones, and release candidates.

When device evidence is required but not run, record `NOT_RUN`; never promote Emulator PASS into device PASS automatically.

## Failure handling

Classify failures from evidence before changing code: for example `TEST_CODE_FAIL`, `APP_RUNTIME_FAIL`, or `ENV_BLOCKED`.

For `TEST_CODE_FAIL` (stale assertion, inadequate wait, fixture, or latch issue with no app
runtime failure), correct the test and rerun the failing test/class or selected Surface first.
Do not mechanically rerun unrelated instrumentation surfaces; the Batch closeout still runs
the Surface(s) required by impact analysis.

For `APP_RUNTIME_FAIL`, correct the application behavior, rerun the affected focused test and
affected Surface gate, and expand to `All` only when the impact analysis requires it. For
`ENV_BLOCKED`, address the emulator/SDK/environment cause before retrying; do not repeatedly
restart a broad suite without new evidence.

Do not classify an environment problem as a product regression, and do not hide a product
regression as an environment issue.

## Speed rules

Avoid repeated investigation, repeated full-suite execution, and duplicate model review when they do not add evidence. Use focused verification during implementation and consolidate heavy verification at Batch closeout. Do not rerun the full Android JVM suite, AVD, or Galaxy S23 smoke after every internal slice. Read the Primary touch set and referenced canonical sections first; expand repository-wide investigation only for a concrete dependency or ambiguity.

When no persistent nonprod, migration, or other remote gate is needed between commits, an
implementation commit and a factual docs commit may be pushed together in one final
fast-forward push after an immediate remote recheck. Do not create a second docs-only commit
solely to copy GitHub Actions run or artifact metadata; GitHub remains authoritative for those
volatile values.

Within approved scope and absent a STOP condition, Codex should continue through implementation, tests, local Android QA, implementation commit, fast-forward push to `main`, approved persistent nonprod verification, factual canonical docs maintenance, and docs push without returning for routine confirmation.

## STOP conditions

The normal Project Instructions and `docs/DEVELOPMENT_WORKFLOW.md` STOP conditions remain unchanged. In particular, stop for a new Material Decision, unapproved migration/schema change, destructive/irreversible operation, restore, production mutation/deploy, branch/PR/merge/tag/Release operation requiring approval, meaningful Security/Cost/dependency change, Material canonical contradiction, non-fast-forward remote state, or scope-outside change.

## Model routing

Follow the current `docs/DEVELOPMENT_WORKFLOW.md` routing. At the time this workflow was established, ordinary implementation uses Luna xhigh, lightweight read/test/log work uses Luna Low–Medium, and auth/Security/concurrency/architecture ambiguity may escalate to Sol Medium. Do not duplicate the same investigation across models merely for reassurance.
