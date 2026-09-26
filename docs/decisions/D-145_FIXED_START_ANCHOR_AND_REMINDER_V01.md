# D-145 — Fixed Start Anchor / Plan Conflict / Reminder v0.1

Status: **Approved — Product semantics / Implementation not started**

Date: 2026-09-26

## Context

TaskChute Platform already has two different time concepts:

- `planned_start_minute` is a planning value used for Section placement and ordering.
- Start Forecast is a derived projection from current progress, Day order, and estimates.

D-032 intentionally made ordinary planned start independent from Start Forecast. That remains correct for normal flexible Tasks, but it is insufficient for Tasks whose real-world start time is fixed, such as meetings, appointments, trains, reservations, or other time-bound commitments.

The Product Owner also wants a per-Task reminder capability tied to the fixed start time and wants plan conflicts to be visible early enough to support replanning.

## Approved product semantics

### 1. Fixed-start Task is an explicit concept

A Task/Entry may be marked as having a **fixed start time**.

The fixed-start concept is distinct from merely having a planned start. A normal planned start remains a planning/order value and does not become a hard forecast barrier.

A fixed-start Task requires a valid planned start time. The fixed-start time is the Task's real-world schedule anchor for that Day.

Exact persistence ownership (Task-level, Entry-level, Routine default, occurrence override, or a combination) is not decided by this Product Decision and must be resolved before implementation without changing the approved user-visible semantics.

### 2. Start Forecast for a fixed-start Task does not slide

For a fixed-start Task, the displayed Start Forecast is the fixed planned start itself.

Example:

- fixed start: `20:00`
- normal accumulated forecast before the Task: `19:40`
- displayed fixed Task Start Forecast: **20:00**

If earlier work overruns:

- fixed start: `20:00`
- accumulated forecast before the Task: `20:12`
- displayed fixed Task Start Forecast remains **20:00**

The fixed Task must not be displayed as starting at `20:12` merely because earlier Tasks are late. The difference is represented as a planning conflict.

### 3. Fixed-start Task acts as a forecast anchor

A fixed-start Task is an anchor in the Day forecast.

The forecast engine still calculates the normal accumulated cursor from current progress, order, and estimates in order to detect whether prior work fits before the anchor.

At the fixed Task:

- if the accumulated cursor is at or before the fixed start, the Task starts at the fixed time;
- if the accumulated cursor is after the fixed start, the fixed Task still starts at the fixed time and the excess duration becomes a conflict/overlap amount;
- downstream forecast continues from the fixed Task's fixed start plus its estimate, rather than shifting the fixed Task later.

This intentionally models the planning problem rather than silently rescheduling a real-world commitment.

### 4. Conflict amount

When the accumulated cursor exceeds a fixed start, the system derives a conflict duration.

Example:

- accumulated cursor before fixed Task: `20:12`
- fixed start: `20:00`
- conflict: **12 minutes**

The conflict is derived presentation/planning state. It must not automatically mutate estimates, reorder Tasks, move Tasks, or change dates.

### 5. Fixed-start visual emphasis

A fixed-start Task must be visually distinguishable in Today.

The left-side start time / Start Forecast for a fixed-start Task is emphasized in red or the canonical error/attention color.

The visual treatment should communicate “this time is fixed” rather than “this Task has failed.” Exact color token, icon, weight, and accessibility treatment are implementation/design details, but the fixed anchor must be clearly distinguishable from ordinary forecast times.

### 6. Task-level conflict indication

When prior work overlaps a fixed-start Task, the affected Task area should show the amount of conflict in a concise way.

Representative presentation:

- `⚠ 12分重複`
- or equivalent concise wording

The UI should make it possible to understand which fixed anchor is being missed and by how much.

### 7. Section-level planning warning

A Section should expose a summary warning when its plan requires attention.

At minimum, Section warning state includes:

- overlap into a fixed-start Task; and
- projected work exceeding the Section's own end boundary.

Representative presentation:

- `⚠ 時間衝突あり`
- `⚠ 12分超過`

The Section warning remains visible or understandable even when the Section is collapsed, so the user does not need to inspect every row to discover a broken plan.

Exact aggregation wording when multiple conflicts exist is a reversible presentation detail.

### 8. Replanning actions

Conflict UI should help the user understand reasonable corrective actions without automatically choosing one.

Relevant corrective actions include:

- review/reduce the estimate;
- move one or more Tasks to another Section;
- move one or more Tasks to another date / do not execute them today.

The system may expose shortcuts into existing edit, D&D, or date-move capabilities, but it must not automatically mutate the plan solely because a conflict exists.

### 9. Per-Task reminder

A Task may have a reminder setting.

For a fixed-start Task, the default reminder target is the fixed start time itself (`0 minutes before` / `at start`).

The user may change or disable the reminder for an individual Task.

Representative reminder offsets may include:

- none;
- at start;
- 5 minutes before;
- 10 minutes before;
- 15 minutes before;
- 30 minutes before;
- 1 hour before.

The exact initial preset list is a reversible UI detail as long as per-Task configuration and the default-at-start behavior are preserved.

A reminder is based on the fixed start, not on a delayed accumulated forecast. If a `20:00` fixed Task is threatened by an earlier `20:12` forecast, its reminder remains based on `20:00`.

Changing the fixed planned start must cause the reminder target to converge to the new fixed time. Starting, completing, deleting, moving to another Day, disabling the reminder, or otherwise making the reminder no longer applicable must reconcile/cancel stale scheduled delivery as appropriate.

### 10. Routine relationship

A Routine may eventually provide defaults for fixed-start and reminder behavior, while a materialized Day occurrence may need occurrence-only overrides.

The approved user-visible principle is:

- changing today's occurrence does not silently rewrite unrelated future occurrences;
- changing a Routine default, when explicitly performed from Routine settings, may affect eligible future occurrences according to the existing Routine default/override model.

The exact persistence/API shape for Routine defaults and occurrence overrides is not approved by this Decision alone.

## D-032 relationship

D-145 narrowly supersedes D-032 only for Tasks explicitly marked fixed-start.

For ordinary flexible Tasks, D-032 remains unchanged:

- planned start is not a waiting barrier;
- Start Forecast remains derived from current progress, execution order, and estimates;
- an ordinary Task may still show a Start Forecast earlier or later than its planned start.

For fixed-start Tasks, D-145 introduces the explicit anchor and conflict semantics above.

## Boundaries / non-goals

This Product Decision does not yet approve:

- a specific DB schema or migration;
- a new API/command family;
- Android notification permission changes;
- Exact Alarm / AlarmManager / WorkManager selection;
- background execution architecture;
- server push notification infrastructure;
- Wear OS notification delivery;
- production deployment;
- automatic plan repair;
- automatic estimate reduction;
- automatic Section/date movement.

If implementation requires a persisted schema change, migration, new Security/permission posture, recurring infrastructure cost, or a long-lived technology dependency, STOP and return to the Product Owner with concrete options before implementation.

## Verification intent

Implementation verification must cover at least:

1. ordinary planned Tasks retain D-032 behavior;
2. fixed `20:00` Task displays `20:00` when accumulated forecast is earlier;
3. fixed `20:00` Task still displays `20:00` when accumulated forecast is `20:12`;
4. the latter exposes a 12-minute conflict;
5. downstream forecast resumes from fixed start + fixed Task estimate;
6. fixed-start visual emphasis is present and accessible;
7. Section warning reflects fixed-anchor conflicts;
8. Section-end overflow is surfaced independently of fixed anchors;
9. reminder defaults to fixed start;
10. changing fixed start reschedules reminder intent;
11. disabling/removing/moving/completing relevant Tasks does not leave a stale reminder;
12. Routine occurrence edits do not silently mutate unrelated occurrences;
13. canonical server authority, retry/reconcile safety, and existing Day/Routine semantics remain intact.

Device notification delivery, OS permission behavior, and reboot/process-death rescheduling require separate evidence after the implementation mechanism is approved.
