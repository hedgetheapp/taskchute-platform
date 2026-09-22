# D-132 — SetExecutionTimes actual-Section parity v0.1

Status: **Approved**

Date: 2026-09-22

## Context

D-081 established that when a planned Entry starts, the server resolves the actual Start instant against the established Day Section context and places the resulting running / completed Entry in that actual Section. The ordinary StartEntry path already applies this behavior.

D-060 / the Android lifecycle editor also allow a planned Entry to become Running by entering actual start only, or Completed by entering actual start + end, through SetExecutionTimes. Current SetExecutionTimes only resolves actual Section when the source Entry is Sectionless. If a planned Entry already has a Section, SetExecutionTimes preserves that planned Section even when the entered actual start belongs to a different Section.

This creates inconsistent Domain behavior between StartEntry and SetExecutionTimes and is visible in both Web and Android because both use the shared Worker authority.

## Decision

For a **current logical Day planned Entry** transitioning through SetExecutionTimes:

- actual start is the authority for execution Section, exactly as in D-081 StartEntry;
- resolve exactly one Section from the established Day Section context using `[actual_start_instant, actual_end_instant)`;
- set the resulting Running / Completed Entry `section_id` to that actual Section whether the Entry was previously Sectionless or already assigned to another Section;
- preserve the original `planned_start_minute`; D-043 remains the planned-state planning invariant and does not rewrite the historical execution Section;
- if the resolved actual Section differs from the source Section, move the Entry atomically with lifecycle transition / Execution creation and increment the Day `placement_revision` exactly once;
- if the resolved Section is already the source Section, do not increment placement revision only for the sake of SetExecutionTimes;
- if actual Section cannot be resolved uniquely, fail without partial write.

The Day projection continues to use D-081 execution-first semantics:

- Running / Completed rows are displayed before Planned rows within their Section;
- Running / Completed order is derived from Execution `first_started_at` ascending, with the existing stable fallback;
- no separate client-side reorder authority is introduced.

## CAS / request behavior

A planned SetExecutionTimes may cause Section placement change, so the client must supply the current Day `expected_placement_revision` for planned transitions. The server validates it when placement changes and preserves exact operation / fingerprint / replay / ambiguity behavior. Existing request fields and endpoint are reused; no new API route or command family is introduced.

Web and Android must both use the same server-authoritative behavior. Clients may optimistically project the expected actual Section, but canonical reconciliation remains authoritative.

## Scope

Included:

- current-Day ordinary Planned -> Running / Completed via SetExecutionTimes;
- Web inline actual-time editing;
- Android lifecycle editor actual-time editing;
- newly created planned Entry followed by actual-time entry.

Not changed:

- StartEntry D-081 behavior;
- correction of already Running / Completed actual times unless existing approved semantics already apply;
- planned start value;
- future / past execution boundaries;
- Routine Definition defaults;
- schema / migration / dependency / production.

## Supersession

D-132 narrowly supersedes D-081's statement that D-060 SetExecutionTimes semantics were unchanged. It extends the same actual-Section authority to planned lifecycle transitions performed through SetExecutionTimes. All other D-081 ordering and historical semantics remain in force.
