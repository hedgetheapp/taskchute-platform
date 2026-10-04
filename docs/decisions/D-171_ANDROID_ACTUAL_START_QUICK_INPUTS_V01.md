# D-171 — Android Actual Start Quick Inputs v0.1

Status: **Approved / Not implemented**

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

Until implemented and tested, this remains **Approved / Not implemented / Not verified**.
