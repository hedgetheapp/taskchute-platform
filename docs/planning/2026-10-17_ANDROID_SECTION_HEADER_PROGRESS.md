# Android Today Section header: progress and remaining workload (proposal)

**Recorded:** 2026-10-17  
**Status:** User request captured / calculation semantics and display edge cases **PROPOSED / OPEN** / **NOT_STARTED**  
**GitHub main read-only investigation baseline:** `9aa644f150b9653b6421c4387e758663d88b9aad`

## User-visible request

The Product Owner wants Section headers to show the whole Section's task count, completed-task count, and remaining time. Example:

`09:00-12:00 セクション名 (4/10件 1h20m)`

Interpret the requested `4/10` as **4 Completed out of 10 assigned entries**. The intended meaning of `1h20m` is to be confirmed before it becomes approved Product semantics.

Initial scope assumption from discussion context: **Android Today Section headers**; Web/Wear parity not yet decided. No implementation requested while travelling.

## Current source and canonical considerations

- Android `TodayScreen.kt` `SectionHeader` currently renders a 38dp single-line header with collapse arrow, time range, Section title and optional D-161/D-165 warning. Space is constrained and warning visibility must not regress.
- `TodayModels.kt` `TodaySection.entries` contains the Section's Planned / Running / Completed `TodayTask` entries with Entry estimate and execution information. `TodayDay.unsectionedEntries` is separate.
- D-162 `完了タスクを表示` hides completed **rows only**; does not alter Sections, canonical entries, forecasts or warnings. Header summary should therefore be independent of the hide/show preference, if that behavior is approved.
- D-134 Running progress uses `max(0, estimate - elapsed)`, with separate overrun indication. D-173B cross-Day active entries remain outside current Day rows, so do not silently add them to current-Day Section counts.
- D-161 / D-165 Section forecast warnings and precision are existing independent indications; do not conflate them with remaining workload.
- D-178 Review analytics have a different period/Completed projection; this proposal should not claim Review historical facts from approximate current Section workload.

## Proposed behavior for Product decision

1. Per selected established Day Section, summarize **currently assigned Entries**. `completed/total件` uses Completed count / all Planned+Running+Completed count, not Task Definition count or history of moved/deleted assignments. Routine occurrences and ordinary Entries each count as assigned Entries when present.
2. Same Section summary stays visible even while Section is collapsed or Completed rows are hidden by D-162; it updates after confirmed canonical changes in status/placement/delete and can use existing carefully reconciled optimistic presentation where safe.
3. **Recommended interpretation of remaining time:** **remaining work estimate**, not the wall-clock time until Section end. Completed contributes 0; Planned with estimate contributes full estimate; current active Running with estimate contributes `max(0, estimate - elapsed)`. Running whose estimate is exceeded contributes 0 rather than a negative balance; overrun remains visible separately. Whether a Running entry whose active execution is on another logical Day participates in its owning Day needs verification.
4. Unknown estimates must not silently be treated as a fully known zero remaining duration. Decide compact display for partial totals: e.g. known portion plus `+`/a small unknown-estimate marker, or `--` when no valid estimates are available.
5. Format compactly near `HH:MM - HH:MM Section name` as `(4/10件 1h20m)`; allow reasonable responsive/ellipsis behavior for long Section names, narrow Galaxy S23 width, and existing warning labels. Avoid hiding warning content or changing expand/collapse, horizontal paging or D&D touch targets.
6. `セクションなし` group, empty Sections (`0/0件`), current/future/past Days, and unknown estimate cases require appropriate fallback rules. No DB write or mutation for display-only aggregation.

## Open questions

- **Primary:** Does `1h20m` mean (A) remaining **estimated task workload**, including the estimated remainder of Running, or (B) remaining **clock time until the Section's configured end**? Recommendation: A because it reflects unfinished work, independent from the Section time window.
- If A: What to show when one or more uncompleted tasks have no estimate? Recommendation: show calculated known remaining work with an explicit unknown marker rather than falsely presenting a complete total.
- Live Running countdown update cadence, rounding to display minutes, and whether static estimates are preferable to a live remaining estimate.
- Overflow handling with Section title and existing warning on narrow screens (single-line compact vs secondary detail line); no change to D-161 warning semantics.
- Whether first release should be Android-only, and whether the unsectioned group gets the same summary.

## Implementation boundary

This is a planning note, **not an Approved Decision for unresolved semantics**, not a Codex implementation task and not verification evidence. No code, schema, migration, API, production, or user-data changes authorized. After Product questions are resolved, Codex should verify latest main and canonical docs, design a focused Task Contract (aggregation unit tests, hidden/collapsed/Running/unknown-estimate/moved Routine cases, UI warnings and gestures), and avoid unrelated full suites.
