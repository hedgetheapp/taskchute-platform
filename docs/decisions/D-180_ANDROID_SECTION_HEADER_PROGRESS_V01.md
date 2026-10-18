# D-180 — Android Today Section Header Progress v0.1

Status: **Approved scope for Stage 1 / NOT_STARTED**  
Date: 2026-10-18

## Goal and decision origin

The Product Owner selected a two-line Android Today Section header, completed/assigned task counts, a dynamic remaining-estimate summary, compact progress bar, and their visual alignment in the design discussion recorded in `docs/planning/2026-10-17_ANDROID_SECTION_HEADER_PROGRESS.md`. On 2026-10-18 the Product Owner explicitly confirmed the remaining progress metric: **progress fill = Completed Entry count / all currently assigned Entries** (e.g. `4/10` = 40%). A Running Entry does **not** increase the filled fraction before completion; its remaining estimated work may still decrease independently.

This Decision approves the following narrowly bounded **Stage 1 Android UI display-only work**, not the separately proposed persistent Section icon feature.

## Product behavior: configured Section headers

1. Present two lines for each configured Section already shown on the selected Android Today Day. First line retains the existing collapse/expand chevron, spaced `HH:mm - HH:mm` range, title, and D-161/D-165 warning information. Do not change the meaning of collapse, Section warning, forecast or drag/drop targets.
2. Second line ordering: **compact progress bar → subdued Material completion icon → `Completed/Total件` → subdued hourglass icon → remaining estimated workload**. The second line starts with the bar's **left edge horizontally aligned to the first line's time-range text** (not right-aligned). The bar width should visually match the *duration text alone*, not the hourglass icon, and must not stretch to fill the row. Preserve layout stability as the remaining-time label changes length. Stage 1 has no user-configurable custom Section icon yet; do not render a fabricated icon. Keep the later optional-icon slot/alignment in mind without reserving a misleading fake icon.
3. Count **currently assigned Entry instances** in the selected Section from the Day projection, one per Entry (including Routine-derived occurrences). Numerator = `Completed`; denominator = all `Planned + Running + Completed` assignments. No task-definition counts, duplicate Routine counts, historic placement snapshots, or arbitrary exclusion of a row hidden by the `完了タスクを表示` preference. The same summary remains visible while the Section is collapsed. Move, deletion, lifecycle and canonical reload update the summary by existing projection/convergence rules. Do not mutate Day or Entry state to calculate metrics.
4. **Bar fill**: `Completed / Total`, bounded to [0,1]; `4/10` fills 40%, `0/0` is empty and does not imply complete. Running remains incomplete until Completed, even if its time estimate is exhausted. This bar is *not* the percentage of estimated duration spent.
5. **Remaining estimated workload**: Completed contributes zero; Planned contributes its known effective Entry estimate; Running contributes `max(0, effective estimate − elapsed execution duration)` for the active Execution, without changing estimates. For any unfinished Entry lacking an estimate, show the known nonnegative remaining subtotal with trailing `+` (`40m+` for example), never falsely present the known subtotal as complete. Use existing authoritative Day/Execution timestamps and clock projection. Do not add cross-Day Running entries to a Section in which they are not currently projected. Do not exceed existing timezone or Entry identity authority.
6. This is a display-only summary. Avoid new backend polling/background jobs. Derive updates from existing canonical/current optimistic Day data and a suitable UI-local time tick for Running remaining work. Preserve lifecycle/operation retry, D-162 completed-row hide, and accessibility descriptions. Reversible spacing, typography, exact minute rounding and update cadence may be settled by Codex within these semantics, ensuring no negative time and a stable, understandable UI.

## Scope / non-goals

- Stage 1 is **Android Today** only and covers **configured, timed Sections** rendered on the selected Day. `セクションなし` summary presentation is deliberately **deferred** rather than assigning a new product rule or inventing a time-range for that group; retain its existing header/collapse behavior. Do not create new historical/future Days.
- The separate user-configurable Material Symbols Rounded Section icon remains **NOT_APPROVED for persistence**. No icon picker, new Section icon field, Section configuration propagation/history rule, Web/Wear UI, API, Worker, migration/schema, dependency, database write, production change, or Release is approved here.
- Existing D-161/D-165 warning text, warning time precision, accessibility and ability to discover overlap/overflow must not regress. Where a two-line layout and a warning cannot coexist accessibly at narrow width, STOP and report layout options rather than hiding/truncating the warning silently.
- Do not change the Section header's D&D/collapse hit target, autoscroll, dates, historical Section context, Section configuration reconciliation (D-131), forecast authority, or D-178 Review aggregates.

## Acceptance / focused verification

- Pure JVM computation: empty, 4/10=40%, mixed Planned/Running/Completed, Running time decreases and clamps to zero, unknown estimate `+`, Routine occurrence counted once, moved/deleted Entry and completed-hide preference.
- Focused Android UI instrumented checks: both rows and alignment, compact bar/count/hourglass visibility, collapsed and completed rows hidden, D-161/D-165 warning retained, no extra icon when absent, narrow screen/font scaling, Sectionless header unchanged, collapse and D&D hit targets retained.
- Run only impact-appropriate Android JVM / AndroidTest compile / focused AVD (where available), appropriate compile/build and exact implementation-SHA GitHub CI; do not default to full unrelated suites. Keep full Today AVD result separate if attempted.
- For changed Android source, supply the exact implementation-SHA signed **Phone APK** for ChatGPT direct user handoff. Do not claim Galaxy S23 or Product Verified until evidence exists. Update `docs/CURRENT.md` and `docs/TEST_MATRIX.md` with actual evidence.

## Implementation STOP conditions

Unresolved material Sectionless behavior, unapproved icon storage/schema/API, change of warning semantics, inability to show warning and summary safely, additional backend mutations/dependency/cost/security/compatibility impact, unexpected GitHub remote change / non-fast-forward, destructive or production operations, or conflict with canonical docs. Report concrete evidence and options to the Product Owner.

## References

- `docs/planning/2026-10-17_ANDROID_SECTION_HEADER_PROGRESS.md` — prior recorded design choices
- `docs/planning/2026-10-17_SECTION_CUSTOM_ICONS.md` — separate icon proposal, not persistence approval
- D-121 Section header, D-134 Running progress, D-161/D-165 Section warnings, D-162 completed hide, D-173B overnight Running, D-131 config reconciliation
- `docs/DEVELOPMENT_WORKFLOW.md` and `docs/TEST_MATRIX.md`

This decision records the approved product scope. The Stage 1 implementation and verification evidence for `b7b405df1a25ffd68ba256cacef9c8563a5bf71f` is recorded in `docs/CURRENT.md` and `docs/TEST_MATRIX.md`; that evidence does not claim Galaxy S23 verification or release.
