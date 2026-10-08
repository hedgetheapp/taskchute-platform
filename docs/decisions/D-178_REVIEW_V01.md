# D-178 — Review v0.1

Status: **Approved / Design pending / Implementation not started**

Date: 2026-10-08

## Context

D-016 already defines Review as a projection over Domain and historical facts rather than a separate source of truth. Existing SPEC also targets future aggregation by logical day, Project, Task, Routine, Section, estimate / actual, while the concrete Review UI and broader historical-classification model remained Open.

The Product Owner approved the first Review slice as an Android bottom-navigation destination.

## Decision

### 1. Android navigation

Android shared bottom navigation adds a fifth destination:

`Task / Notes / Daily / Review / Settings`

The Review destination uses Material Symbols Rounded `analytics`.

This Decision does not yet require a matching Web navigation change.

### 2. v0.1 primary views

Review v0.1 is organized around three primary views:

- **Date** — results grouped by TaskChuteDay;
- **Project** — results grouped by the completed result's Project classification;
- **Mode** — results grouped by the completed result's Mode classification.

Exact chart/list composition, filtering controls, drill-down navigation, and visual layout remain design work.

### 3. Inclusion boundary

Review v0.1 includes **Completed Tasks / Entries only**.

The following are excluded from v0.1 aggregation:

- Planned;
- Running;
- provisional / optimistic presentation;
- incomplete work that has not reached Completed.

Review remains a projection over canonical historical facts. A UI state alone must not create Review results.

### 4. Actual duration authority

For an included Completed result, actual time is derived from the canonical valid Execution facts after any approved actual-time correction. Review must not derive actual duration from planned estimate or current wall-clock state.

Existing D-033 valid-Execution correction authority remains unchanged.

### 5. Project / Mode classification is correction-aware

Review must not classify historical results from the Task's current live Project / Mode merely because those current values later changed.

The intended Review classification is the **historical Project / Mode attached to the completed result**, including later explicit correction of that Completed result.

Therefore, when the user explicitly changes the Project or Mode of an eligible Completed Task / Entry using the approved historical-correction capability, Review must recalculate that result under the corrected Project / Mode.

This direction is consistent with D-116A for Completed Entry historical Project / Mode correction. Implementation must investigate whether existing historical representations cover every Review-eligible result before expanding the query surface. Missing historical classification must not be silently inferred from current live Task metadata.

### 6. Note activity in Review

Review v0.1 also includes note activity for the selected TaskChuteDay.

The current implemented Note / Document kinds in scope are:

- standalone Note;
- Task Primary Note;
- Project Primary Note;
- Daily Primary Note.

For Review classification, each Note is placed at most once into one of the following buckets for a TaskChuteDay:

- **Created** — the Note's canonical `created_at` belongs to that TaskChuteDay;
- **Updated** — the Note was created before that TaskChuteDay and had one or more canonical content-changing updates during that TaskChuteDay.

If a Note is created and then edited again within the same TaskChuteDay, it appears only as **Created** and must not also appear as Updated.

Multiple updates to the same pre-existing Note within one TaskChuteDay count as one Updated Note for Review. No-op saves that do not advance canonical Document state do not create Review activity.

Note activity is assigned to the TaskChuteDay whose canonical interval contains the successful create/update instant, rather than using a midnight-only civil-date rule.

Exact Review presentation of Note activity (counts, title list, drill-down, etc.) remains design work.

### 7. Current persistence gap

The current `documents` model stores canonical `created_at`, current `updated_at`, and `revision`, but it does not retain a per-update historical event/revision timeline. A later update overwrites `updated_at`.

Therefore the current persistence can identify creation time and only the most recent update time; it cannot reconstruct every historical TaskChuteDay on which an existing Note was updated.

D-178 approves the Product semantics above but does **not** approve a schema/migration or physical event-history representation. Before implementation can claim complete historical Note update Review, a separate Material Decision must define the persisted update-history strategy and the treatment of pre-migration history. The implementation must not fabricate missing historical update days from current metadata.

### 8. Deferred from this Decision

D-178 does not yet approve:

- exact API/query shape;
- schema or migration;
- cache/materialized aggregate tables;
- Week / Month UI;
- Task / Routine / Section review views;
- interrupted / cancelled-specific Review presentation;
- exact cross-Day Execution allocation UI;
- manual Note snapshots / content-version snapshot UI;
- Web Review navigation;
- production rollout.

Any required schema/migration or broader historical-snapshot expansion returns to the Product Owner as a Material Decision.

## Verification status

Design only. No implementation or verification has started.
