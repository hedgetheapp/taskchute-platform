# D-171 — Android Actual Start Quick Inputs v0.1

Status: **Approved / Implemented / Integrated / focused Android JVM + app and AndroidTest compile + signed Phone APK + exact-SHA CI PASS / Galaxy S23 representative smoke PASS (user-confirmed) / Phone AVD NOT_RUN**

Date: 2026-10-04

## Goal

Make Android Today Task Editor actual-start correction faster by adding two explicit quick-input choices:

- `前回タスク終了`
- `現在時刻`

The quick inputs apply to the **actual start** field only. D-171 does not add equivalent shortcuts to the actual end field.

## Canonical references

- D-132 / D-138: current-Day actual Execution-time editing and lifecycle transitions.
- D-147(B): Android manual minute-granularity actual-start adjacency and `input_precision: "minute"` semantics.
- Existing `SetExecutionTimes` / execution-times route remains canonical.

## Decision

### 1. Quick-input affordances

Where Android Today Task Editor already allows editing actual start under the existing lifecycle/Day rules, show two compact quick-input actions near the actual-start field:

- `前回タスク終了`
- `現在時刻`

Exact visual form (small chips/buttons, spacing, typography) is reversible implementation detail. They must not obscure the existing manual `HH:mm` input.

The actual-end field remains manual only in D-171.

### 2. Manual input remains minute-precision

Typing `18:16` manually continues to mean minute-granularity input under D-147(B).

The existing Android manual path continues to send:

`input_precision: "minute"`

and may use the approved same-minute adjacency snap when a completed prior Execution ends later within that displayed minute.

D-171 does not change manual-input semantics.

### 3. Quick inputs preserve exact instants

Quick-input selection is different from manual text entry.

Although the visible field may still display only `HH:mm`, the editor must retain the exact selected Instant in ephemeral editor state.

Examples:

- user taps `現在時刻` at `12:34:27.481Z` → effective requested start is that exact Instant;
- `前回タスク終了` resolves to canonical `ended_at = 18:16:01.250` in the Day timezone → effective requested start is exactly that canonical Instant.

For these exact quick-input requests, do **not** mark the request as minute precision and do not invoke D-147(B)'s minute snap merely because the displayed text is `HH:mm`.

The existing exact-instant request semantics remain authoritative.

### 4. Manual edit after quick selection clears exact-source authority

If the user taps a quick input and then manually changes the actual-start text, the exact quick-input Instant is discarded.

The resulting value is once again ordinary manual minute input and follows D-147(B).

This prevents hidden seconds from surviving after the user has explicitly typed a different displayed time.

### 5. `現在時刻`

`現在時刻` captures the current Instant at the moment the user activates the quick input.

Do not round to the beginning/end of the displayed minute before persistence.

Normal existing guards remain authoritative, including:

- current-Day / lifecycle eligibility;
- Day boundary;
- future-start rejection where applicable;
- overlap validation;
- existing actual-end ordering validation.

The shortcut does not bypass validation.

### 6. `前回タスク終了`

The meaning is **the most recently ended canonical Execution in the same TaskChute Day**, not the visually previous Task row and not planned/manual row order.

The candidate must come from canonical Day/Execution-derived data and use its exact `ended_at` Instant.

Do not derive the value from:

- current row order;
- planned start;
- estimate;
- displayed `HH:mm` text;
- device-local guessed seconds.

If the current Android Day projection can unambiguously resolve the latest ended Execution from existing canonical fields, reuse it.

If current projection is insufficient to identify the required exact canonical `ended_at` safely, STOP and report the evidence before introducing a new API/contract or approximating from row presentation.

### 7. Target Execution exclusion / existing historical edit safety

When the Task being edited already has an Execution, the shortcut must not select that same target Execution's own end as its "previous task" source.

Implementation must choose a different completed Execution candidate.

For historical/Completed editing, all existing start/end ordering and overlap guards remain authoritative. If no safe previous Execution candidate exists, the `前回タスク終了` action is disabled or unavailable rather than inventing a value.

Exact disabled-vs-hidden presentation is delegated.

### 8. Display after quick selection

The text field continues to display the selected Instant as the established Day timezone's `HH:mm`.

Seconds do not need to be displayed in v0.1.

The product distinction is:

- manual `HH:mm` → minute intent;
- quick choice → exact Instant intent displayed as `HH:mm`.

Accessibility semantics should identify the action label and, where practical, the resolved displayed time.

### 9. Optimistic / save behavior

The saved/optimistic lifecycle result must use the effective exact quick-input Instant when one is active.

Do not let validation normalization silently collapse an active exact quick input back to minute-start before repository serialization.

A successful canonical reconcile remains authoritative after save.

### 10. Scope

D-171 is Android Today Task Editor UX plus the minimum Android client plumbing required to preserve exact quick-input Instants.

It does not change:

- Worker Execution semantics;
- persisted schema;
- migration;
- automatic Start button timestamp behavior;
- Web Task Editor;
- Wear;
- actual-end shortcuts;
- Task ordering semantics;
- Production/Release state.

No new Worker/API behavior is approved. If existing exact-instant API support cannot safely carry the quick input through the Android client, STOP and report before changing the shared contract.

## Verification target

Future implementation should verify at minimum:

1. manual actual-start `18:16` still sends minute precision;
2. `現在時刻` captures an exact Instant with seconds/subseconds and does not send minute precision;
3. `前回タスク終了` uses exact canonical `ended_at`;
4. displayed field remains `HH:mm` for quick inputs;
5. editing the text after a quick selection clears the exact Instant and returns to minute semantics;
6. row order changes do not alter which Execution is considered the latest ended one;
7. target Execution's own end is never selected as its previous-task source;
8. no available previous Execution → no fabricated value;
9. existing overlap/Day/future/end-before-start guards still reject invalid combinations;
10. D-147(B) same-minute manual adjacency remains unchanged;
11. automatic Start remains exact and unchanged;
12. no schema/migration/shared API change is introduced.

## Implementation closeout — 2026-10-06

Implementation `ccf624ec231e3919187b0bf0038f3936842c1ac7` is integrated on `main`.

### Feasibility and target identity

The current Today projection is sufficient for every editor state where D-171 quick inputs are enabled. The Day projection exposes each Entry's canonical latest `lastEndedAt`, derived from `MAX(ended_at)` across its canonical Executions. Taking the maximum parsed `Instant` across the selected Day's `allEntries` yields the latest ended Execution independent of visual row order; no new API field is needed.

- Planned target: quick input is enabled only when the projection has no Execution identity or historical start/end, so the target cannot contribute its own end.
- Running target: quick input is enabled only with its active Execution identity and start. That active Execution is open; any projected `lastEndedAt` for this Entry is from a different, earlier ended segment and is a safe candidate.
- Completed target: quick input is enabled only when `executionId` identifies the sole canonical Execution. The target Entry is excluded from candidates, so its own end cannot be reused.
- Completed multi-Execution target: `executionId` is unavailable/ambiguous, so both quick inputs are unavailable for this target.

Candidate selection parses exact canonical Instants, compares them across the selected Day, and uses a stable Entry ID tie-break. No candidate leaves the prior-end action disabled and does not fill the field.

### Android implementation

The editor holds a typed, memory-only `ExactActualStart(Instant, source)` where source is `PREVIOUS_END` or `NOW`. Both actions are shown next to actual-start only for eligible editors; actual end stays manual. `NOW` captures the injected clock at activation. The text field formats that Instant as `HH:mm` in the Day establishment timezone. Manual text activity clears exact authority even when the user retypes the same displayed minute; the existing D-147(B) `input_precision: "minute"` path then remains in effect. Exact quick requests send the exact `started_at` without that marker. Optimistic presentation keeps the exact start and resolves the actual Section when possible. No Worker, shared API, schema, migration, or dependency change was made.

### Verification and artifact

- Focused Android JVM: Controller `5 / 5`, repository `4 / 4`, optimistic `1 / 1` PASS. Coverage includes latest exact candidate and row reorder, target exclusion, Running prior segment, Completed multi-segment unavailability, no candidate, exact Now and Day-local display, same-minute manual authority reset, exact request payloads, D-176 manual minute marker, Completed→Running reopen, and exact optimistic projection.
- `:app:compileDebugKotlin`, `:app:compileDebugAndroidTestKotlin`, `:app:assembleDebug`, and `git diff --check` PASS. The focused instrumentation source checks eligible actions, unavailable prior-end, and exact Now display; it compiled but was not run.
- Exact-SHA CI [`37460343105`](https://github.com/hedgetheapp/taskchute-platform/actions/runs/37460343105), attempt 2 PASS on implementation SHA. Attempt 1 exposed one unrelated existing reminder-prefill test failure; its isolated local rerun passed, and the full same-SHA Android app/Wear JVM, signed debug builds, instrumentation APK compile, signing checks, and artifact upload passed on attempt 2. Web/Worker verification was skipped by Android-only path classification.
- Fresh signed nonprod Phone APK: `taskchute-android-debug-ccf624ec231e3919187b0bf0038f3936842c1ac7`, artifact ID `11413037002`, expires `2026-10-13T12:07:11Z`.
- No compatible Phone AVD was available (`NOT_RUN / NO_COMPATIBLE_PHONE_AVD`). Product Owner installed the fresh D-171 build on Galaxy S23 and reported `問題なし` after the requested quick-input smoke. Record `現在時刻`, `前回タスク終了`, save behavior, and manual-overwrite interaction as representative `PASS / USER_CONFIRMED`, without claiming a full device matrix or exact-seconds visibility on-device.
- Production `NOT_RUN`; Released `NO`.
