# D-148 — Android Today D-147 Device Correctives v0.1

Status: **Approved — 5-item corrective implemented / integrated; focused edge auto-scroll PASS; full Today surface remains partial / not verified**

Date: 2026-09-27

## Context

Galaxy S23 manual verification of the D-147 implementation found four user-visible gaps while the other representative D-147 flows passed.

Observed on the D-147B APK:

- an eligible established-past ordinary Planned Task does not reveal the `…` action needed for forward day move;
- Planned Routine-derived D&D shows a provisional insertion destination but same-Section placement can reconcile back to the original position;
- after moving a Routine occurrence to another Section and then dragging it back to the original Section tail, canonical reconciliation can place it at the Section top rather than the shown drop location;
- the Today Add FAB is draggable, but its upward movement is constrained to the small 96dp local container and is therefore not useful for uncovering controls higher in the Task list.

The same device session confirmed the D-147 manual-minute actual-start adjacency, Quick Add ordering, Start optimistic ordering, Routine planned-start Section synchronization, planned Routine occurrence delete, and basic FAB drag behavior.

## Decision

### 1. Past eligible Planned row must expose forward-move actions

For an established Past Day ordinary Planned Task that satisfies D-147 forward-move eligibility:

- left-swipe actions must include the existing Note action when a Task Note is available;
- the `…` action must also be available;
- `…` opens the existing Task Actions bottom sheet;
- that bottom sheet exposes at least `今日へ移動` and `日付を移動`;
- Past edit / Start / Complete / delete / duplicate / D&D remain unavailable.

The older Past Note-only presentation must not suppress an explicitly approved D-147 forward-move action.

### 2. Android single-Routine relative D&D must converge to the shown anchor placement

D-120 bulk/Web placement semantics remain unchanged.

For Android **single Planned Routine-derived occurrence** D&D only, when the user drops relative to a concrete planned anchor Entry:

- Android must explicitly indicate that the canonical planned-start for the moved occurrence is derived from the anchor cohort;
- the Worker derives the target `planned_start_minute` from the anchor Entry, not unconditionally from the target Section start;
- the moved occurrence is positioned before/after that anchor atomically;
- the Routine occurrence Section/planned-start override is updated for that logical Day only;
- RoutineDefinition defaults, recurrence, unrelated occurrences, and future Days are unchanged;
- same-Section drops may move the occurrence into the anchor's planned-start cohort so the provisional visible placement can converge canonically;
- cross-Section relative drops use the anchor's target Section and anchor planned-start cohort;
- a drop after the final planned anchor can therefore remain at the visible Section tail after reload/reconciliation;
- Running / Completed rows remain ineligible;
- D-129 ended-Section restrictions remain;
- replay / operation fingerprint / placement revision / ambiguity / atomicity remain authoritative.

This behavior must be isolated behind a backward-compatible optional intent on the existing `BulkMoveEntriesToSectionOccurrence` request. Requests without that intent retain D-120 behavior.

The optional intent is valid only for relative placement of exactly one Routine-derived Planned occurrence. It must not silently alter existing Web bulk moves or ordinary Android D&D.

### 3. Empty/collapsed Section drop behavior remains canonical

When there is no relative anchor (for example an empty/collapsed Section drop surface), the existing canonical Section placement semantics remain unchanged.

D-148 does not invent an arbitrary tail order without an anchor.

### 4. Today Add FAB usable drag area

The Today Add FAB must be movable across the usable Today content area rather than a fixed 96dp-high local box.

Requirements:

- tap still opens Quick Add;
- drag still does not trigger Quick Add;
- the FAB may move substantially upward across the Task list;
- it remains inside the visible Today content area;
- it must not overlap/enter the bottom navigation/system inset area;
- it must not move above the Today date/navigation header safe boundary;
- movement remains memory-only;
- leaving/recreating Today resets to the default bottom-right position;
- Selection Mode visibility remains unchanged.

The exact Compose layout/measured-bound implementation is delegated; a fixed 96dp movement container is no longer acceptable.

### 5. D&D edge auto-scroll

While a Task row is being dragged in Android Today, the Task list must automatically scroll when the drag pointer approaches the visible scrollable area's top or bottom edge so a Task can be moved beyond the initially visible viewport.

Requirements:

- define a top and bottom edge activation zone inside the actual Task-list viewport;
- while the pointer remains in the top zone, scroll upward continuously until either the pointer leaves the zone or the list reaches its top;
- while the pointer remains in the bottom zone, scroll downward continuously until either the pointer leaves the zone or the list reaches its bottom;
- scroll speed should increase as the pointer gets closer to the viewport edge; exact speed curve/threshold is a reversible implementation detail;
- auto-scroll must stop immediately on drop, drag cancel, pointer release, or when the pointer leaves the edge zone;
- while the list is auto-scrolling, the current drag position must continue to resolve against the newly visible Task/Section geometry so the provisional insertion cue and final drop target stay accurate;
- normal non-drag scrolling, pull-to-refresh, swipe actions, Selection Mode, and long-press drag initiation must remain unchanged;
- D-129 ended-Section restrictions and all D-148 Routine occurrence placement semantics remain authoritative during auto-scroll;
- auto-scroll is presentation/interaction behavior only and adds no persistence or server authority.

Implementation should use the existing Today LazyColumn/list state. Do not create a second independent scroll container or an invisible full-screen gesture layer that blocks Task interaction.

## Compatibility / non-goals

Preserve:

- D-147 forward-day eligibility and Past read-only boundary;
- D-120 existing Web/bulk semantics when the new optional Android single-Routine intent is absent;
- D-129 ended-Section guards;
- D-147 Routine occurrence-only scope;
- D-147 Add FAB ephemeral state;
- D-147B execution semantics.

Do not add:

- schema/migration;
- new endpoint or command family;
- RoutineDefinition mutation;
- Past Routine carry-forward;
- Running/Completed Routine delete semantics;
- Notes implementation;
- D-145 implementation;
- production operation or Release.

## Verification contract

Implementation must cover at least:

- Past eligible ordinary Planned row left-swipe reveals Note + `…` and the bottom sheet exposes forward-move actions;
- Past Running / Completed / Routine-derived rows do not gain forward-move actions;
- Android single Routine same-Section relative drop converges to the shown before/after anchor position;
- same-Section relative drop across planned-start cohorts updates only the occurrence to the anchor cohort and survives reload;
- cross-Section relative drop to a concrete anchor derives the anchor planned-start and survives reload;
- cross-Section move away and move back after the final anchor remains at the visible tail rather than Section top;
- requests without the new optional intent preserve existing D-120 target-Section canonical planned-start behavior;
- invalid use of the optional intent (ordinary Entry, multiple Entry, no relative placement) rejects without partial mutation;
- FAB can move materially farther upward than the prior 96dp container while remaining within safe header/nav bounds;
- dragging near the Task-list top/bottom edge auto-scrolls in the intended direction and can reach initially off-screen Task/Section targets;
- edge auto-scroll stops on edge exit/drop/cancel/list boundary and does not continue after drag ends;
- provisional insertion cue/drop target remains correct while auto-scrolling;
- Quick Add tap/drag/reset and Selection Mode rules remain green.

Because section 2 changes a shared request and Worker behavior, run focused/full Worker coverage, Android focused/full JVM coverage, Web compatibility/typecheck, Today AVD, exact-SHA CI, and persistent nonprod runtime/safety verification. Galaxy S23 final verification remains Product Owner manual evidence.

## Implementation evidence — Section 5

The Today Task-list viewport is measured in root coordinates from the existing `LazyColumn`; the bottom edge is reduced by the existing `110.dp` content inset so the activation zone remains above bottom overlays/navigation. The reversible edge zone is `72.dp` and the capped per-frame delta is `32.dp`, with a quadratic ramp from 20% at the inner zone boundary to the cap at the exact edge. Top movement is negative and bottom movement is positive, guarded by `canScrollBackward` / `canScrollForward` and consumed scroll distance.

Drag-start snapshot hit testing remains authoritative during ordinary drag. The root pointer Y is tracked independently of list scroll, and after a non-zero `scrollBy` the implementation waits for two Compose frames, copies the measured row/entry/Section maps into a refreshed snapshot, and resolves the current pointer against that snapshot. The dragged overlay keeps its source row root top and therefore remains under the finger while content scrolls. The loop stops on drag end/cancel/release, edge exit, list boundary, logical-Day change, or disposal; no post-drop scroll is scheduled.

Focused `TodayDirectManipulationTest` coverage passes for outside/top/bottom/ramp/cap/invalid/boundary behavior and refreshed-bound target resolution. The focused `longPressDragNearBottomEdgeAutoScrollsTowardInitiallyOffscreenRows` AVD case reached an initially off-screen cross-Section target and dispatched the existing move path. The later Today-surface run did not return a runner completion result and is recorded as partial/not verified; no target-app crash-buffer entry was present. No Worker/API/shared contract, schema, migration, dependency, nonprod, or production change was made.
