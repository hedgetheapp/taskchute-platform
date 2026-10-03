# D-161 — Reminder-backed Fixed Start and Conflict Warnings v0.1

Status: **Approved**

Date: 2026-10-03

## Context

D-145 approves fixed-start anchors and advisory plan-conflict presentation, while leaving persistence ownership open. D-155 later established Entry-owned reminder intent and stated that reminders did not affect fixed-start or Start Forecast behavior. The Product Owner now resolves that narrow relationship for v0.1 without changing reminder delivery or adding another stored concept.

## Approved semantics

### Fixed-start marker and anchor

For a materialized Day Entry, `start_reminder_offset_minutes != null` means the Entry is fixed-start for forecast purposes. Its canonical `planned_start_minute`, resolved against the Day logical date and establishment timezone, is the anchor. The reminder offset affects notification delivery only and never shifts the forecast anchor. When the reminder is disabled (`null`), the Entry returns to ordinary flexible forecast behavior.

This marker is Entry/materialized-occurrence scoped. Configuring an occurrence does not change Routine Definition defaults or unrelated occurrences. D-155 remains authoritative for reminder ownership, allowed values, permission, alarm scheduling, and delivery.

### Forecast

Ordinary flexible planned Entries retain D-032 semantics: on the current Day the cursor begins at effective now, the active Execution's remaining estimate is applied first, then eligible planned Entries accumulate in canonical display order. An established future Day begins at its canonical Day start. Ordinary `planned_start_minute` is not a forecast barrier. Running and Completed row projections retain their existing lifecycle-specific semantics.

At an eligible fixed planned Entry, the displayed start remains its canonical planned minute, even if prior projected work arrives later. Conflict is derived immediately before the anchor as `max(0, incoming cursor - anchor)`. When an estimate exists, the end is anchor plus estimate and the downstream cursor resumes there; with no estimate, the end is unavailable and downstream resumes at the anchor, with no synthetic duration. Multiple anchors are evaluated in display order, each against the cursor produced by preceding work. Positive conflict display minutes round upward so a positive overlap is not presented as zero.

Only planned Entries in timed Sections participate in Start/End Forecast, matching the existing Web eligibility boundary. Unsectioned and untimed Section Entries receive no forecast. Past Days remain read-only and do not gain planned forecasts.

### Advisory warnings

Conflict and Section warning values are deterministic derived presentation state; they are not persisted. A fixed Entry may show its fixed start and a concise overlap amount. For each timed Section, overlap is the maximum conflict among its fixed planned Entries, not a sum. Overflow is the maximum eligible projected end in that Section, including the active current Execution's remaining forecast endpoint when its Entry belongs to that Section, minus the canonical Section end, clamped at zero. Completed historical rows are excluded. Missing Section end means no overflow warning. A Section warning remains discoverable while collapsed and exposes concrete values accessibly.

Malformed legacy data (enabled reminder with missing/out-of-range planned minute, invalid logical date, or invalid timezone) does not create a fake anchor or conflict and safely follows ordinary forecast eligibility. A valid reminder marker never authorizes automatic plan repair.

No warning automatically changes estimates, order, Section, Day, reminder state, or lifecycle. Existing edit, D&D, and Day-move capabilities remain user-controlled.

## Relationship to prior Decisions

- D-145 remains the source for fixed-start anchor, non-sliding forecast, conflict, Section warning, and no-automatic-repair semantics. D-161 resolves only the previously open v0.1 Entry-owned fixed-start marker and implements the approved presentation surface; replanning shortcuts and automatic assistance remain unimplemented.
- D-155 is superseded only where it says reminder intent does not define fixed-start status or change Start Forecast. Its reminder transport, offset delivery, permissions, local alarm state, API ownership, and lifecycle behavior remain unchanged.
- D-032 remains unchanged for flexible planned Entries.

## Boundaries

This Decision uses existing `start_reminder_offset_minutes`, `planned_start_minute`, estimate, lifecycle, Execution, Day, timezone, Section, and display-order data only. It adds no persistence field, migration, API command, dependency, notification transport, security posture, or recurring cost. Conflict state is never written to canonical storage. Production deployment and Release are not authorized.

## Verification intent

Verify fixed anchors before and after the arriving cursor, exact conflict amount, offset independence, downstream reset, reminder-off restoration, multiple anchors, extended logical minutes/timezone, malformed legacy fallback, Running/Completed regression, Section maximum overlap, overflow and combined warning, collapsed Section discoverability, and no fake unsectioned/untimed overflow. Android and Web must produce the same forecast and warning semantics for the same canonical projection.
