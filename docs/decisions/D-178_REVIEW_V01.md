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

Review v0.1 is organized around four primary views:

- **Date** — results grouped by TaskChuteDay;
- **Project** — results grouped by the completed result's Project classification;
- **Mode** — results grouped by the completed result's Mode classification;
- **Note** — Note lifecycle/activity review across the current Note kinds.

**Approved 2026-10-09 — Android UI baseline:** The Review destination shows four top-level switching tabs, `Date / Project / Mode / Note`. The approved information architecture and initial presentation are:

- **Date:** one selected TaskChuteDay at a time. Present distinct **Completed / Unexecuted (canonical Planned)** Task counts and total valid **Completed** actual duration, Note Created count and Note Updated count, a discovery/list entry point for canonical Planned Tasks **currently remaining on that Day**, a list of Completed Tasks for that Day, and the Day's Created/Updated Note activity list. Exact Task open/move interactions remain design work. The user can navigate between logical Days. Use a compact count/list overview before introducing charts.
- **Project:** show Completed and Unexecuted (canonical Planned) counts separately by Project. Aggregate valid Completed actual duration by the completed result's historical Project classification, showing relative actual-time allocation in a horizontal bar chart and allowing selection of a category to inspect its completed-result history.
- **Mode:** analogous Completed and Unexecuted (canonical Planned) counts by Mode, with valid Completed actual duration by historical completed-result classification, a horizontal actual-time chart, and category-to-history drill-down.
- **Note:** a dedicated cross-Note lifecycle list for all four existing Note kinds. Show each Note's identity/type, original creation date, latest canonical update date, and count of distinct **tracked** update TaskChuteDays after tracking activation. Selecting a Note leads to its date-level Created/Updated activity history. Never imply that untracked pre-activation updates are known or that a zero tracked-day count means no earlier edits.

**Approved 2026-10-09 — Shared period across all four views:** Date / Project / Mode / Note share one selected **daily / monthly / yearly** granularity and period anchor. A single dropdown selects granularity (not a second tab row); a centered period label with previous/next buttons appears for **every** view. The selection is preserved when switching the four primary tabs. Every tab scopes its summaries/charts/Note activities to that same selected period, rather than an independent all-time dataset. The prior all-period Project/Mode illustration is superseded; Date daily layout remains its daily state, monthly/yearly being aggregate variants. Exact period rollover and Note in-period list vs lifetime metadata require design. Completed Entry cross-Day actual-duration accounting is approved separately below; chart rendering and other detailed aggregation contracts remain design work. **Approved 2026-10-09 — Monthly/Yearly Unexecuted counting:** Count each canonical **Planned Entry** currently assigned to a TaskChuteDay whose logical date falls in the selected month/year **once per selected period**. It is the count of currently remaining work in that period, never the sum of historical daily observations/snapshots. A successful move within the same month/year changes the assigned Day but **does not increase or decrease** that period's total; a move across months/years removes the Entry from the source period and adds it to the destination period while it remains Planned. The daily current-placement rule is the same one-day case. Use stable Entry identity to prevent double-counting when materialized or joined across period Days; do not dedupe different Entries merely because they share one Task definition. Never retain a missed-work snapshot or count optimistic move presentation. Exact Routine occurrence suppression/removal, lifecycle reversion, unestablished Day and category-level metadata/unknown semantics remain Open.

**Approved — Routine Created/Deleted counters in Date:** Show counts of Routine Definitions created and user-facing Routine deletions during the shared selected daily/monthly/yearly period. Occurrence materialization does not create a new Routine, and disable/enable is not a deletion. A Routine created and deleted within the same period contributes to both counts. Existing `routine_definitions.created_at` and `routine_definition_archives.archived_at` are candidate facts; mapping instants to TaskChuteDay/calendar ranges and historical coverage require further validation. This does not approve schema/migration. These are **UI/content commitments**, not an approval of exact filters, sorting, grouping edge cases, chart geometry/colors, timestamps, API shapes, or schema. The illustrative numbers/names in the mock are not specification data.

Weekly Review, exact cross-Day Execution visual presentation (not the approved Completed accounting rule), exact Project/Mode unknown-class handling and broader drill-down behavior remain Open. Daily/Monthly/Yearly period UI and monthly/yearly current-Planned-Entry count membership are Approved.

### 3. Inclusion boundary

**Amendment approved 2026-10-09 — lifecycle counts:** The earlier Completed-only *count restriction* is superseded for count metrics only. Date displays separate **Completed / Unexecuted (canonical Planned)** Task counts. Project and Mode display **Completed / Unexecuted (canonical Planned)** counts for each category. **Running count is not displayed in Review v0.1**; a Running Entry must not be miscounted as Unexecuted. This supersedes the previous 2026-10-09 Date Running-count approval.

**Completed-only actual duration and achievement semantics remain authoritative.** Actual-duration totals, Project/Mode time-comparison charts and Completed history continue to use Completed results and valid canonical Execution facts only. Never add Planned/Running estimates or show progress percentages in actual-time charts. Review count data must be grounded in canonical persisted facts; optimistic/provisional presentation is not authority.

**Approved 2026-10-09 — current-placement semantics for Unexecuted:** Review is a *current work backlog view* for Unexecuted count, not an immutable historical record of once-unfinished Tasks. For a selected TaskChuteDay, count canonical **currently assigned Planned Entries on that Day**. After a successful canonical move of a Planned Entry from Day A to Day B, it is **no longer counted on Day A**, and **is counted on Day B as Planned**; opening Review for Day A thereafter reflects the new count, including zero if none remain. Do not preserve a separate 'was unfinished on Day A' snapshot solely for Review. Only confirmed canonical placement, not a provisional move animation, changes Review counts.

This approval does **not** define all other historical/corner-case semantics (deleted/cancelled Entries, Routine skip/suppression/materialization, reversion, unestablished future Days, and all-period Project/Mode count window). Planned Project/Mode classification still needs its own authority investigation; do not silently reuse Completed historical metadata or today's live Task metadata to invent unavailable facts.

### 4. Actual duration authority

For an included Completed result, actual time is derived from the canonical valid Execution facts after any approved actual-time correction. Review must not derive actual duration from planned estimate or current wall-clock state.

Existing D-033 valid-Execution correction authority remains unchanged.

**Approved 2026-10-09 — owning-TaskChuteDay Completed attribution across boundaries:** A canonical **Completed Entry/result** is counted **exactly once** on its owning/origin TaskChuteDay, even if a related valid Execution starts or ends outside that Day's civil or logical interval. Attribute the **entire valid actual duration** of that result (using all valid canonical Execution facts associated with that Completed result) to that same owning Day; **do not split seconds at midnight, TaskChuteDay boundaries, month ends, or year ends**. Daily Completed count is 1 and its entire actual time belongs to the owning Day; monthly/yearly Completed count and actual-duration totals sum those owning-Day results whose **logical dates** fall inside the selected period. This applies consistently to Date, Project, and Mode (with Project/Mode's approved Completed historical classification) so period totals reconcile with the corresponding daily Reviewed facts, without introducing synthetic records or moving the Entry. Correcting valid actual start/end under existing D-033 authority recalculates the originating Day and its containing month/year, not the civil Day on which the corrected end instant falls.

Example: an Entry belonging to TaskChuteDay **2026-10-31**, whose valid Execution runs from **2026-10-31 23:00** to **2026-11-01 01:00**, contributes **Completed 1 / actual 2h** to October 31, October 2026 and year 2026, and **zero** to November 2026 (for that Entry). This is a Review projection accounting rule; it changes no Execution ownership, lifecycle, Day definitions, or historical data. Exact historical-category unknown treatment, time-zone/selected-period boundary query details and special invalid/fallback data remain separately governed or Open.

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

**Approved 2026-10-08 — history granularity:** Persist sufficient historical Note activity to identify **which TaskChuteDays** each Note was created or meaningfully updated on, with at most one Review activity classification per Note per Day. Review v0.1 does **not** require recording each individual edit time, edit count, or revision/content snapshot. This is a Product-level daily-granularity decision, not approval of any specific table, migration, or update-write algorithm. Existing Document `created_at` / `updated_at` semantics remain unchanged.

Note activity is assigned to the TaskChuteDay whose canonical interval contains the successful create/update instant, rather than using a midnight-only civil-date rule.

**Approved 2026-10-09 — Monthly/Yearly distinct Updated Notes:** The headline `Updated Notes` count for a selected **month or year** is the number of **distinct canonical Note/Document identities** with at least one **tracked canonical Updated TaskChuteDay** belonging to that selected period, **not the sum of daily Updated counts**. Count each such Note at most once per selected month/year even if it was updated on multiple days or saved many times per day. In Note detail, display the actual **number and dates of distinct tracked Updated TaskChuteDays within the selected period** (e.g. an existing Note updated on October 1, 5 and 9 is **Updated Notes: 1**, **Updated Days: 3** for October). These are different metrics; do not label the per-Note days as extra Notes. Date's monthly/yearly headline and the Note tab must use the same unique-Note authority. Keep daily Created-over-Updated precedence on a single TaskChuteDay. The exact monthly/yearly relationship between Created and Updated when a Note is created and later edited on **different Days of the same period** remains to be decided; do not silently add or exclude it from either bucket without an approved rule. Existing forward-only update tracking remains unchanged: never infer pre-activation Updated Days or treat untracked past edits as zero historical activity.

Exact visual styling, list sort/filter/drill-down navigation and the monthly/yearly Created-versus-Updated overlap rule remain design work; the distinct Updated Notes headline and per-Note updated-day detail semantics above are Approved.

### 7. Current persistence gap

The current `documents` model stores canonical `created_at`, current `updated_at`, and `revision`, but it does not retain a per-update historical event/revision timeline. A later update overwrites `updated_at`.

Therefore the current persistence can identify creation time and only the most recent update time; it cannot reconstruct every historical TaskChuteDay on which an existing Note was updated.

D-178 now approves **Day-granularity historical Note activity** as the required persistence outcome; a per-edit event/revision history is not required for Review v0.1. D-178 does **not** approve a schema/migration, exact physical daily-activity representation, or transaction/write algorithm. The Product Owner approved **forward-only Note update history** on 2026-10-08: record successful canonical content-changing updates only from the activation of the new activity-tracking capability onward. Do **not** reconstruct, infer, seed, or backfill historical update-Day activity before activation from `updated_at`, revision, or any other current metadata. This applies equally to existing Notes and newly created Notes after activation. Existing Notes and their original canonical `created_at` remain unchanged and may still show their known creation dates; a known creation date is not evidence of any unknown pre-activation update activity. The exact activation/cutover mechanism and physical persistence/migration strategy remain implementation-design and Material Decision items; this approval does not authorize a schema/migration.

### 8. Deferred from this Decision

D-178 does not yet approve:

- exact API/query shape, historical Planned count/category attribution, and exact detail/filter/sort interactions beyond the approved four-view UI baseline;
- schema or migration, including the exact physical daily Note activity model and cutover mechanism;
- cache/materialized aggregate tables;
- weekly or otherwise unspecified period selection;
- standalone Task / Routine / Section primary Review views (Routine Created/Deleted summary counts within Date are approved);
- interrupted / cancelled-specific Review presentation;
- exact cross-Day Execution rendering or breakdown UI beyond the approved whole-result owning-Day accounting;
- manual Note snapshots / content-version snapshot UI;
- Web Review navigation;
- production rollout.

Any required schema/migration or broader historical-snapshot expansion returns to the Product Owner as a Material Decision.

## Verification status

Design only. No implementation or verification has started.
