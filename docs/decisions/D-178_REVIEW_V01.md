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

**Approved 2026-10-09 — Historical Created Day qualification:** For an existing Note with a historical `created_at`, a Review **Created** classification is eligible only if its original creation instant matches **exactly one authoritative persisted TaskChuteDay `[start_instant, end_instant)` interval** for the owner. If zero or multiple historical Day intervals match, keep the Document and original `created_at` unchanged but **do not include that Note as Created in any daily/monthly/yearly Review count or Created-activity list**. Do not infer or reconstruct its historical Day using current timezone/boundary settings; do not materialize an unestablished past Day, backfill activity or fabricate past context. A later, successfully tracked post-activation Updated Day still qualifies independently for Review Updated metrics/list and must not be lost solely because the past Created Day is unassignable. Whether a user-facing label is needed for unassignable historical creation metadata and the exact atomic mechanism guaranteeing creation-day precedence for new writes remain design questions; the current-Day zero-match Product outcome is separately Approved while multi-match behavior remains Open. This decision does not modify `created_at` storage or approve a migration.

**Approved 2026-10-09 — No-current-Day Note save behavior (Product option B):** When an otherwise eligible **current-time** canonical Note create or meaningful content save encounters **zero matching already-persisted TaskChuteDay intervals**, preserve the ordinary Note-save capability by establishing the **current logical TaskChuteDay and its required Section context**, and commit that establishment, the guarded Note mutation, any required tracked Updated-Day activity, and operation/CAS/replay outcome as **one atomic success-or-failure boundary**. Do not permit a Note-content-only success or partial Day/Section establishment on failure. Use canonical server time and approved TaskChuteDay timezone/boundary authority, not client clock or guessed historical boundaries. This is **not** authorization to materialize an unestablished **past** Day, rebuild past Day/Section history, backfill prior Note activity, or alter the previously approved historical Created-Day exclusion rule. Preserve existing Task, Routine, Section, Day configuration, ownership and concurrency semantics; avoid unrelated side effects and ensure concurrent Day materializations reconcile safely. The exact atomic establishment algorithm, performance, schema/migration and rollout are **not approved**. A feasibility failure, unsafe concurrent establishment, missing Section authority, or a requirement to change existing Domain behavior is a **STOP and return to Product Owner**, not permission to downgrade tracking or silently reject otherwise valid saves. Matching **multiple** intervals and their error/recovery behavior remain a separate Material Decision.

**Approved 2026-10-09 — Monthly/Yearly distinct Updated Notes:** The headline `Updated Notes` count for a selected **month or year** is the number of **distinct canonical Note/Document identities** with at least one **tracked canonical Updated TaskChuteDay** belonging to that selected period, **not the sum of daily Updated counts**. Count each such Note at most once per selected month/year even if it was updated on multiple days or saved many times per day. In Note detail, display the actual **number and dates of distinct tracked Updated TaskChuteDays within the selected period** (e.g. an existing Note updated on October 1, 5 and 9 is **Updated Notes: 1**, **Updated Days: 3** for October). These are different metrics; do not label the per-Note days as extra Notes. Date's monthly/yearly headline and the Note tab must use the same unique-Note authority. Keep daily Created-over-Updated precedence on a single TaskChuteDay. **Approved 2026-10-09 — monthly/yearly Created + later Updated are both counted:** The `Created Notes` headline counts distinct canonical Notes whose original `created_at` belongs to the selected period; `Updated Notes` counts distinct Notes with at least one **tracked Updated TaskChuteDay** inside the selected period. These are **independent activity measures, not disjoint Note sets**: if Note N is created on October 1 and meaningfully edited on October 5, October (and its containing year) counts **Created Notes 1 AND Updated Notes 1** for N, with one tracked Updated Day on October 5. A creation-day edit on October 1 alone remains **Created only** (no Updated activity for that Day), even in month/year aggregation. A Note contributes at most 1 to each headline in a given period; do not add Created and Updated headlines to claim a distinct total Note count. Creation uses known canonical `created_at`, updates use only forward-only tracked post-activation days; no fabricated historical updates or Note-content snapshots. Existing forward-only update tracking remains unchanged: never infer pre-activation Updated Days or treat untracked past edits as zero historical activity.

**Approved 2026-10-09 — Note activity list and detail navigation:** The Note primary tab lists each owner-visible Note/Document identity **once** if, and only if, it has a known canonical Created Day **or** at least one tracked canonical Updated Day **within the shared selected daily/monthly/yearly period**. Notes with no qualifying activity in that interval do not appear merely because they exist or their lifetime latest `updated_at` is outside the interval. Applies across standalone / Task Primary / Project Primary / Daily Primary Notes; an in-period Created+later Updated Note appears in one row with both activity labels and remains included in both corresponding independent metrics. The list defaults to **most recent qualifying activity Day within the selected interval first** (not lifetime latest update), with a stable deterministic tie-breaker to be defined in implementation design. Provide a compact filter dropdown **All / Created / Updated**; a Note that qualifies for both appears in either activity filter, without duplication in All. Keep summary numbers independent of the list filter: filtering the rows does not silently change the meaning of the period's `Created Notes`/`Updated Notes` headline metrics.

Selecting an activity-list row opens a **read-only Note activity detail** scoped to the same selected period, retaining shared period/granularity context and enabling back navigation to the previous list/filter/scroll context. Show Note identity/type; original canonical creation date (explicitly lifetime metadata); **count and actual dates of distinct tracked Updated TaskChuteDays within the selected period**; and a most-recent-first timeline of the period's canonical Created/Updated **Day classifications**. For each Day, Created takes precedence over updates on that same Day. A separate **Open Note** action opens the existing canonical Note editor/resolver; Review does not create a second editor or a historical body snapshot. Never present a historical update Day as a past content version. Missing pre-activation update Days are **unknown/not recorded**, not proof that a Note was never edited. Stable tie-break and accessibility/loading/empty UX remain further design or existing Domain authority.

**Approved 2026-10-09 — Archived Note visibility:** A Standalone Note that is archived but still exists remains eligible for the Review Note activity list and read-only detail when its canonical Created Day or tracked Updated Day qualifies for the selected period. Do not omit it solely due to `archived_at`. Show a clear `Archived` status alongside its Note identity. Archive/restore alone is not canonical content-changing Note activity and does not create an Updated Day, even when the existing Document `updated_at` changes. Opening the underlying Note must continue to respect the existing archived Note access and editing rules; Review does not implicitly restore it. This does not change hard-delete behavior. Other Note kinds without an archive state are unaffected.

**Approved 2026-10-09 — Permanently deleted Note exclusion:** Once an existing authorized Domain hard-delete permanently removes a canonical Note/Document identity, exclude that identity from Review Note activity lists and read-only detail, and from all Date/Note `Created Notes` and `Updated Notes` counts for **every selected daily, monthly and yearly period**, even periods in which that Note previously had qualifying Created or tracked Updated activity. Counts therefore reflect currently existing canonical Document identities, not immutable historical snapshots of deleted Notes. No 'deleted Note' placeholder or historical-only Note identity is introduced in Review v0.1. This includes Project Primary Documents permanently removed by an authorized Project hard-delete under D-103, but does not change Project or Task historical accounting. Archiving is not hard deletion and retains the previously approved Review visibility. The delete action itself does not count as an Updated Day. This approval adds no new hard-delete capability and does not authorize schema, migration, physical activity-row cleanup strategy, deletion of unrelated audit history or production mutations; those remain governed by their own existing authority or subsequent technical design.

**Approved 2026-10-09 — Compact Note update-Day persistence strategy:** Use a dedicated, owner-scoped persistent table for tracked `Updated` TaskChuteDays keyed by canonical Note/Document identity and canonical TaskChuteDay identity/date. Enforce **at most one record per Note per TaskChuteDay**; repeated successful edits within that Day must not create further rows. Record only successful canonical content-changing mutations, for all four existing Document kinds. Integrate activity persistence atomically with the existing guarded Document content mutation and its operation/CAS/replay contract, so neither content-only success nor phantom activity is committed. No-op retries, archive/restore, and hard-delete are not Updated activity. The existing authorized permanent deletion of a Document must also remove any dedicated update-Day rows for that Document in the same safe atomic deletion boundary; this does not authorize deletion of unrelated audit/history data. Do not store edit-event counts, past body snapshots, or prior revisions. Creation remains derived from unchanged canonical `documents.created_at`; do not seed, infer, or backfill pre-activation Updated Days. No automatic expiration or pruning of Note activity solely to save capacity. Before requesting migration approval, verify Day attribution against historical materialized intervals and timezone/boundary changes (including the approved unassignable-Created exclusion), all four save and existing hard-delete paths, owner isolation, and the long-horizon storage/query-cost envelope (synthetic 20-year single-owner scenarios including 10 and 100 distinct Notes updated/day, plus a bounded multi-owner projection). Treat per-row byte estimates as hypotheses until measured. Exact table columns, indexes, foreign-key actions, migration SQL, deployment/cutover, and transaction implementation remain **unapproved** pending the focused feasibility/design handoff and explicit Material Decision.

Exact visual styling, filter menu geometry and platform navigation mechanics remain design work. Daily Created-over-Updated precedence, period-level independent Created/Updated Note counts, per-Note updated-day details, and the list/detail information architecture above are Approved.

### 7. Current persistence gap

The current `documents` model stores canonical `created_at`, current `updated_at`, and `revision`, but it does not retain a per-update historical event/revision timeline. A later update overwrites `updated_at`.

Therefore the current persistence can identify creation time and only the most recent update time; it cannot reconstruct every historical TaskChuteDay on which an existing Note was updated.

D-178 approves **Day-granularity historical Note activity** as the required persistence outcome, and the later 2026-10-09 decision approves the compact dedicated-table strategy with atomic content-update recording and document hard-delete cleanup. A per-edit event/revision history is not required for Review v0.1. Exact schema/migration, Day attribution/cutover and transaction/write algorithm remain unapproved. The Product Owner approved **forward-only Note update history** on 2026-10-08: record successful canonical content-changing updates only from the activation of the new activity-tracking capability onward. Do **not** reconstruct, infer, seed, or backfill historical update-Day activity before activation from `updated_at`, revision, or any other current metadata. This applies equally to existing Notes and newly created Notes after activation. Existing Notes and their original canonical `created_at` remain unchanged and may still show their known creation dates; a known creation date is not evidence of any unknown pre-activation update activity. The exact activation/cutover mechanism, physical table definition, indexing, FK/delete wiring and migration strategy remain implementation-design and Material Decision items; the approved table strategy does not itself authorize a schema/migration.

### 8. Deferred from this Decision

D-178 does not yet approve:

- exact API/query shape, historical Planned count/category attribution, and exact detail/filter/sort interactions beyond the approved four-view UI baseline;
- exact schema/migration (columns, constraints, FK/delete actions and indexes), the detailed transaction algorithm, and the activity activation/cutover mechanism for the approved dedicated update-Day table;
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
