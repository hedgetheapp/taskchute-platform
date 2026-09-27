# D-148 — Android Today D-147 Device Correctives v0.1

Status: **Approved — implementation integrated; latest Galaxy S23 D&D regression FAIL / USER_REPORTED; corrective pending; Today surface not verified**

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


## Device corrective follow-up — drag session continuity

Galaxy S23 manual verification of implementation `d0b4ef424631db32705e83a8334ed901cb4d5ad8` found that edge auto-scroll can stop partway through a held drag and behave as if the reorder session was cancelled/dropped before the finger is released.

This is a failure of the already-approved D-148 section 5 interaction contract, not new Product semantics.

Corrective requirement:

- after long-press drag begins, the stable Today-level pointer session is the sole authority for drag completion;
- source-row pointer disposal, cancellation, or local drag-detector completion caused by LazyColumn auto-scroll/recomposition must not call `finishDrag()` while the physical pointer is still down;
- source-row gesture ownership may initiate the drag and provide movement while available, but final drop occurs only on the stable parent session's real pointer-up;
- cancellation without physical pointer-up must preserve the active drag session while the parent still observes the pointer as pressed;
- the parent pointer-input key/identity must remain stable through auto-scroll and unrelated swipe-state changes;
- edge auto-scroll, geometry rebase, provisional target, and D-129 / Routine placement semantics remain unchanged.

The current artifact therefore records Galaxy S23 edge-auto-scroll continuity as `FAIL / USER_REPORTED` historical evidence. The continuity corrective is implemented in `7180514d540273f237bd471724d4430e2daa9624`.

The Today-level pointer handler is keyed by logical Day rather than swipe-menu state and records the long-press pointer ID. Once the row hands off the drag, row disposal, detector cancellation, and detector completion cannot call `finishDrag()` or clear the session. The parent observes the physical pointer at the final pass and commits at most once on the matching physical up; cancellation or Day disposal clears without a write. Existing measured edge zones, scroll-frame geometry rebase, root pointer-Y authority, and D-148 placement semantics remain unchanged.

The footer overlay corrective uses one measured bottom-aligned stack: the 104dp Running progress panel (plus any unresolved/failure panels) is directly above the footer, and the Add FAB is positioned 12dp above the stack and may still be dragged upward within the existing safe header bound. Focused JVM, focused Running-stack AVD, and focused off-screen edge-drag AVD verification PASS. The standard `Today` surface runner still did not return a completion result after starting `connectedDebugAndroidTest`; the target-app crash buffer was empty, so the full surface remains `PARTIAL / NOT_VERIFIED`. Exact-SHA CI `36300424234` PASS; APK artifact `taskchute-android-debug-7180514d540273f237bd471724d4430e2daa9624`, ID `10925795373`, expires `2026-10-04T06:35:52Z`. Galaxy S23 remains `NOT_RUN / PRODUCT_OWNER_MANUAL`.


## Device corrective follow-up — auto-scroll / provisional-order interference

Galaxy S23 manual verification of continuity-corrective artifact `7180514d540273f237bd471724d4430e2daa9624` found that the drag session now remains alive, but edge auto-scroll and provisional reorder can still interfere: while the list is programmatically scrolling, repeated `provisionalDay` reorder updates also move the rendered rows, making the intended insertion position unstable and difficult to select.

This remains a D-148 section 5 presentation corrective, not new Product semantics.

Corrective requirement:

- D-127 provisional order remains available for ordinary non-auto-scrolling drag;
- while edge auto-scroll is actively consuming non-zero list scroll, do not repeatedly mutate the rendered Task order in response to every rebased target;
- continue updating the canonical in-memory drag target from refreshed post-scroll geometry;
- during active auto-scroll, show a non-layout-shifting target cue for the current anchor / before-or-after edge rather than moving Task rows on every frame;
- when auto-scroll stops because the pointer leaves the edge zone or the list reaches its boundary, settle the latest target and resume the ordinary provisional-order preview;
- physical pointer-up during auto-scroll still commits the latest resolved target exactly once; it must not require waiting for provisional preview to resume;
- D-127 drag snapshot stability, D-148 geometry rebase, parent pointer completion authority, D-129 guards, Routine placement semantics, and server authority remain unchanged.

The current artifact therefore records Galaxy S23 auto-scroll/provisional-order interaction as `FAIL / USER_REPORTED` pending corrective verification.


## Device corrective follow-up — Routine drop into empty Section

Galaxy S23 manual verification of artifact `7180514d540273f237bd471724d4430e2daa9624` found that dragging a Planned Routine-derived occurrence into a target Section with no eligible anchor results in deterministic operation failure (`操作を完了できませんでした`).

Source review confirmed the Android no-anchor branch calls the generic Move path without `routineScoped = source.routineDerived`. Anchor-based Routine D&D already uses the occurrence-aware endpoint.

This is a D-148 implementation bug, not new Product semantics.

Corrective requirement:

- when `target.anchorEntryId == null` and the source is Routine-derived, Android must dispatch the existing occurrence-aware Section move path with `routineScoped = true`;
- `relative_planned_start = "anchor"` must remain absent because there is no anchor;
- the existing canonical no-anchor Section semantics remain authoritative: target Section canonical planned start is used, and the current occurrence-only override is persisted;
- RoutineDefinition defaults, future occurrences, and other Days remain unchanged;
- ordinary Task empty-Section move behavior remains unchanged;
- same-Section no-anchor no-op behavior remains unchanged;
- no new endpoint, schema, migration, or persistence authority is introduced.

The current artifact records Routine-to-empty-Section D&D as `FAIL / USER_REPORTED` pending corrective verification.

## Device corrective follow-up implementation — preview stability and Routine empty Section

Implementation `cc3a83ef3887c2fc06ec952ddb33b73c6bfa173c` addresses both follow-up findings without changing D-127 drag stability or server semantics.

- During consumed edge auto-scroll, an explicit `AUTO_SCROLLING` / `SETTLING` phase freezes layout-changing `provisionalDay` updates, clears the synthetic preview once at scroll entry, and keeps only the current anchor/Section drop cue. Refreshed bounds continue to update `dragState.target`; after two Compose frames without consumed scroll, the latest target settles back into the ordinary stable provisional preview.
- Physical pointer-up during the frozen phase commits the latest target exactly once, without waiting for the provisional preview. Cancellation still clears without a write.
- A Routine-derived anchorless Section drop now uses the existing occurrence-aware endpoint with `routineScoped=true`, `placement=null`, and no `relative_planned_start` marker. Ordinary anchorless moves remain on the ordinary endpoint; same-Section anchorless drops remain no-op.

Focused/full Android JVM, instrumentation compile, debug assemble, and `git diff --check` passed. Focused `TaskChute_API33` tests for the Routine empty-Section request and held edge auto-scroll/off-screen target both passed. The standard Today runner reached `connectedDebugAndroidTest` but did not return completion; the target-app crash buffer was empty, so the full Today surface remains `PARTIAL / NOT_VERIFIED`. Exact-SHA CI `36302559765` passed; APK artifact `taskchute-android-debug-cc3a83ef3887c2fc06ec952ddb33b73c6bfa173c`, ID `10925464530`, expires `2026-10-04T07:18:41Z`. Galaxy S23 remains `NOT_RUN / PRODUCT_OWNER_MANUAL`.


## Device corrective follow-up — cc3 preview-state regression

Galaxy S23 manual verification of implementation `cc3a83ef3887c2fc06ec952ddb33b73c6bfa173c` found a broader D&D regression:

- edge auto-scroll no longer works in representative device use;
- even without auto-scroll, provisional reorder presentation is unstable / incorrect;
- the user can no longer reliably complete ordinary reorder.

Source diff against the preceding drag implementation shows that `cc3a83e...` changed ordinary drag presentation in addition to the intended auto-scroll corrective:

- ordinary rows changed from `dropTarget = false` to an active target marker with a 6dp layout-changing insertion padding while `provisionalDay` was already reordering the list;
- auto-scroll entry clears `provisionalDay` back to canonical order, causing a second geometry jump exactly when programmatic scrolling starts;
- the new `DRAG_STABLE / AUTO_SCROLLING / SETTLING` presentation phase therefore affects both ordinary drag geometry and auto-scroll geometry.

This corrective must prioritize restoring the last known device behavior before `cc3a83e...`:

- preserve the Routine empty-Section fix from `cc3a83e...`;
- remove the preview-phase state-machine changes that altered ordinary D&D;
- restore ordinary D-127/D-148 provisional reorder behavior from the preceding implementation;
- do not clear `provisionalDay` when edge auto-scroll begins;
- during active edge auto-scroll, freeze the already-rendered provisional layout in place while target geometry/rebase continues; do not replace it with canonical order;
- do not add layout-changing target padding during ordinary drag;
- use only non-layout-shifting cue presentation while edge auto-scroll is active;
- pointer-up must still commit the latest resolved target exactly once.

The `cc3a83e...` artifact is therefore `FAIL / USER_REPORTED` for ordinary D&D and edge auto-scroll. Focused AVD PASS does not supersede this physical-device evidence.

## D&D regression recovery — 2026-09-27

Implementation `30b9ffd5a572097bfc25a1cf4239d9bbe84c573b` restores the pre-`cc3a83e...` ordinary drag presentation while retaining the valid Routine empty-Section routing fix.

- Ordinary Task rows no longer activate the layout-changing target padding or ordinary-row target marker. D-127 provisional placement remains the ordinary non-auto-scrolling preview.
- A single `freezeProvisionalPreviewForAutoScroll` boolean becomes true only after `LazyListState.scrollBy` consumes non-zero pixels. The current `provisionalDay` is never cleared at scroll entry; refreshed snapshots and target resolution continue while the already-rendered preview remains stable.
- While frozen, the current target is shown only with a non-layout-shifting cue inside the existing row bounds. After the edge leaves or the list reaches a boundary, two Compose frames are allowed for layout publication, then the latest target is applied once and ordinary preview resumes.
- Stable Today-parent pointer ownership, physical pointer-up completion, `dragFinishIssued` single-dispatch protection, D-127 snapshot hit-testing, geometry rebase, D-129 guards, and Routine empty-Section `routineScoped=true` / `placement=null` / no-relative-marker semantics remain unchanged.

Focused `TodayDirectManipulationTest` and full Android JVM `209 / 209` passed. TaskChute_API33 focused same-Section, visible cross-Section, Routine empty-Section, and edge auto-scroll tests passed; the three-test D&D set passed three consecutive times. The standard `scripts/android-qa.ps1 -Surface Today` did not return a result and was stopped after the target app crash buffer showed no FATAL/ANR; this remains `PARTIAL / NOT_VERIFIED`. Exact-SHA CI `36305702958` passed with signed APK `taskchute-android-debug-30b9ffd5a572097bfc25a1cf4239d9bbe84c573b`, artifact ID `10926923449`, expires `2026-10-04T08:18:53Z`. Galaxy S23 remains `NOT_RUN / PRODUCT_OWNER_MANUAL`.
