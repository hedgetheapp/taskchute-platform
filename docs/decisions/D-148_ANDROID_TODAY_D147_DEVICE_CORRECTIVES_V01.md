# D-148 — Android Today D-147 Device Correctives v0.1

Status: **Approved — D&D future-Day/stable-source corrective implemented / integrated; focused PASS; persistent nonprod read-only PASS; Today surface partial / not verified; Galaxy S23 NOT_RUN / PRODUCT_OWNER_MANUAL**

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


## Device corrective follow-up — dual pointer-position authority

Galaxy S23 manual verification of recovery artifact `30b9ffd5a572097bfc25a1cf4239d9bbe84c573b` reports that D&D is still not behaving correctly. This current artifact is therefore `FAIL / USER_REPORTED` for device D&D despite focused AVD PASS.

Source review identified a remaining structural conflict after the earlier completion-authority fix:

- the stable Today-level parent pointer session updates drag position from the physical pointer in root coordinates;
- the source-row long-press detector also continues calling `onDragMove(change.position)`;
- the row callback converts its local coordinate back to root using the current `dropBounds[task.id].top`;
- `provisionalDay` can move the source Entry/placeholder to a different rendered position, which changes `dropBounds[task.id]`;
- therefore row-local movement can inject a different root Y for the same physical pointer while the parent simultaneously writes the correct root Y.

Corrective requirement:

- after long-press handoff, the stable Today parent is the sole authority for physical pointer position, drop-target updates, and completion;
- the row detector may continue owning/consuming the gesture so LazyColumn/swipe interaction does not steal it, but it must not write drag position after handoff;
- remove the row-local `dropBounds[task.id].top + localPosition.y` position reconstruction from active drag;
- provisional reorder must not affect pointer coordinates;
- existing auto-scroll snapshot/rebase, preview freeze, Routine empty-Section routing, D-129 guards, and physical-up single commit remain unchanged.

This is an implementation corrective inside the already-approved D-148 interaction contract, not a new Product semantic.


## Device corrective follow-up — parent capture after source-row disposal

The same Galaxy S23 session additionally clarified the edge-auto-scroll failure mode: once auto-scroll moves the source row off-screen, the held gesture begins to feel like normal finger scrolling and the dragged Task can no longer be placed reliably.

Source review confirms the remaining ownership gap:

- the row-level drag detector consumes pointer movement with `change.consume()` while the source row remains composed;
- the stable Today parent currently reads events at `PointerEventPass.Final`, updates drag state, but does not consume movement;
- when LazyColumn auto-scroll disposes the source row, the row-level consumer disappears;
- subsequent physical finger movement can therefore be processed by LazyColumn as ordinary user scroll before the parent observes the Final pass.

Corrective requirement:

- after long-press handoff, the stable Today parent must become both:
  1. the sole drag pointer-position / target / completion authority, and
  2. the stable gesture consumer that prevents LazyColumn/pull-to-refresh/swipe from reclaiming vertical movement while drag is active;
- parent capture/consumption must occur early enough in the pointer pass pipeline to prevent normal list scrolling after handoff;
- before long-press handoff, parent must not consume normal touch input, so ordinary scrolling/swipe/pull-to-refresh remain unchanged;
- row detector should only establish the long-press handoff; after handoff it must not provide pointer coordinates or remain required for gesture consumption;
- source-row disposal must not change pointer ownership;
- physical pointer-up in the parent remains the only commit trigger and still dispatches at most once;
- programmatic edge auto-scroll remains driven by the existing D-148 list-state loop; physical finger movement itself must not directly scroll the LazyColumn during an active drag.

This remains an implementation corrective under D-148, not a new Product semantic.

## Device corrective follow-up — parent pointer ownership capture

Implementation `ce84f3f3e963ce3d3dda22485e0fe086ed09f5a6` completes the parent-capture corrective while retaining the preceding D-148 preview, auto-scroll, and Routine placement behavior.

- `TodayTaskRow` and `detectShortLongPressDrag` no longer expose or invoke a row-level `onDragMove` callback. The source row only detects the long-press and hands off the PointerId/initial position.
- The stable Today parent observes `PointerEventPass.Initial`, remains passive before handoff, and consumes movement only for the matching active pressed drag pointer. Root Y is derived only from the stable parent root coordinate; the rendered source-row top is not used after handoff.
- Parent physical pointer-up remains the only completion authority, protected by `dragFinishIssued`; row disposal/cancellation cannot write or clear the active session. Existing D-148 edge auto-scroll, consumed-scroll preview freeze/rebase/settle, D-129 guards, and Routine empty-Section no-anchor semantics are unchanged.

Focused/full Android JVM `211 / 211` passed. TaskChute_API33 focused same-Section, visible cross-Section, and source-row-offscreen edge auto-scroll tests passed three consecutive rounds; Routine empty-Section no-anchor passed. The standard `scripts/android-qa.ps1 -Surface Today` reached `connectedDebugAndroidTest` but returned no completion result and was stopped; target-app crash buffer was empty, so the full Today surface remains `HARNESS_HUNG / PARTIAL / NOT_VERIFIED`. Compile Kotlin, instrumentation compile, debug assemble, and `git diff --check` passed. Exact-SHA CI `36308834382` passed; signed APK artifact `taskchute-android-debug-ce84f3f3e963ce3d3dda22485e0fe086ed09f5a6`, ID `10928148531`, expires `2026-10-04T09:18:45Z`. Galaxy S23 remains `NOT_RUN / PRODUCT_OWNER_MANUAL`; Worker/API/shared contract, schema, migration, dependency, persistent nonprod, D-145, Notes, Production, and Release were not changed or run.


## Device corrective follow-up — future-Day cross-Section deterministic failure

Galaxy S23 manual verification of implementation `ce84f3f3e963ce3d3dda22485e0fe086ed09f5a6` reports a deterministic failure when attempting to move a Task to another Section on tomorrow's established Future Day (`操作を完了できませんでした`).

Canonical semantics remain clear:

- D-126 treats explicitly established Future Day as the Today-equivalent planning surface, including placement;
- D-120 allows Section placement for current established Day and explicitly established future Day;
- Routine-derived planned Entry Section changes are occurrence-only and must not mutate RoutineDefinition defaults;
- date move preserves RoutineOccurrence identity and `origin_taskchute_day_id`.

Source review shows a concrete incompatibility for date-moved Routine-derived Entries:

- `BulkMoveEntriesToDay` intentionally preserves `routine_occurrences.origin_taskchute_day_id` when the Entry moves to another Day;
- `BulkMoveEntriesToSectionOccurrence` currently rejects any selected Routine Entry whose `routine_origin_taskchute_day_id !== request.taskchute_day_id`;
- therefore a valid Routine-derived Entry moved from another Day into an established future Day can be rejected by Section D&D with `resource_conflict`, even though D-120/D-126 allow planning placement on that future Day.

Current Android focused AVD covers future planning actions and current-Day cross-Section D&D separately, but does not cover:
- ordinary future-Day cross-Section D&D;
- native future Routine occurrence cross-Section D&D;
- date-moved Routine-derived Entry cross-Section D&D where origin Day differs from current Entry Day.

Corrective must preserve D-112 date-move origin semantics and D-120/D-126 future placement semantics. Do not rewrite `origin_taskchute_day_id` to the destination Day merely to satisfy the Section-move guard.


## Approved visual corrective — stable source row + destination insertion preview

Product Owner approved changing Android Today D&D presentation so the grabbed Task does not disappear from its source location while dragging.

Current implementation moves the source Entry inside `provisionalDay` and renders `ProvisionalDropSlot` at that moved Entry's new location. Because the source slot collapses while the destination slot appears elsewhere, list geometry changes on every target change and contributes to visible D&D jitter.

Approved presentation behavior:

- the canonical rendered Day/order remains stable while a drag is active;
- the source Task row remains at its original canonical position for the entire drag session;
- the source row may be visually ghosted to indicate that it is currently grabbed, but its layout slot must remain;
- `DraggedTaskOverlay` remains the only element that follows the physical pointer;
- the destination shows a temporary insertion preview / ghost slot at the resolved before/after target;
- moving the target relocates only that destination insertion preview; it must not remove/reinsert the source Entry in the list;
- empty/collapsed Section keeps the existing Section-level destination cue semantics;
- no canonical Day mutation occurs until physical pointer-up dispatches the existing placement command;
- cancel removes the destination preview and restores the unchanged canonical list with no write;
- parent pointer ownership, edge auto-scroll, target rebase, Routine occurrence semantics, D-129 guards, and exact-once physical-up commit remain unchanged.

This is an approved user-visible presentation change. It does not change persisted placement semantics, API contract, RoutineDefinition semantics, schema, migration, or production behavior.

## Implementation evidence — Future-Day cross-Section and stable source preview

Implementation `740e92b78972cdfdf8360cd37f95a54e9faf299d` closes the two current D-148 follow-ups.

The Worker Section-occurrence guard now preserves the Routine relationship and occurrence override invariants without requiring `routine_occurrences.origin_taskchute_day_id` to equal the Entry's current destination Day. This keeps date-moved Routine origin identity unchanged while allowing ordinary, native Routine, and date-moved Routine Entries to use the existing future-Day cross-Section command. The focused regression reproduced the pre-fix `resource_conflict` failure for the date-moved case, then passed all 20 affected tests after the minimal guard correction; Web typecheck also passed. Adjacent scoped estimate/section guards were not broadened because they are not used by this Android D&D path.

During Android drag, `renderDay` remains the canonical Day. The source row keeps its original 84dp layout slot and is only ghosted; `DraggedTaskOverlay` follows the physical pointer, while a non-layout-shifting `ProvisionalDropSlot` follows the refreshed destination cue. The stable Today parent remains the only physical pointer-up/finish authority, and consumed edge-scroll waits for two frames, refreshes the geometry snapshot, and re-resolves the current root pointer against the refreshed bounds.

Focused/full Android JVM, compile Kotlin, instrumentation compile, debug assemble, and `git diff --check` passed. On `TaskChute_API33`, the stable-source same-Section, visible cross-Section, off-screen edge auto-scroll, and Routine empty-Section occurrence-aware no-anchor cases all passed. The standard `scripts/android-qa.ps1 -Surface Today` reached `connectedDebugAndroidTest` but returned no completion result after approximately two minutes and was stopped; the target-app crash buffer was empty, so the full Today surface remains `HARNESS_HUNG / PARTIAL / NOT_VERIFIED`.

Exact-SHA CI `36320708350` passed, including Web/Worker verification and Android JVM/signed APK verification. Artifact `taskchute-android-debug-740e92b78972cdfdf8360cd37f95a54e9faf299d`, ID `10931897828`.

The exact pushed Worker was deployed to persistent nonprod as `taskchute-web-nonprod`, version `5bcea8ef-52c5-4cf1-b0d0-ac2fe016d195`. Guarded bindings were APP `taskchute-app-nonprod`, AUTH `taskchute-auth-nonprod`, and `REALTIME_HUB/RealtimeHub/sqlite`, with `RUNTIME_ENV=nonprod` and `BOOTSTRAP_ENABLED=false`. Root returned `200`, the protected current-Day API returned `401`, APP/AUTH migrations reported no pending migrations, both `PRAGMA quick_check` results were `ok`, both foreign-key checks were empty, and placement/routine/lifecycle guard plus transaction assertion counts were `0`. One pre-existing active Execution was observed read-only and was not changed. Authenticated Web/remote disposable QA was `NOT_RUN` because the authorized CUA browser helper was unavailable; no existing or QA data was mutated. Galaxy S23 remains `NOT_RUN / PRODUCT_OWNER_MANUAL`; Production is `NOT_RUN`; Released is `NO`.

## Implementation evidence — insertion boundary and bottom edge viewport corrective — 2026-09-27

Implementation `eb6546ed2d6ee9016d53bd44c846d4fc57c0d681` closes the Android-only insertion-boundary and bottom-edge viewport gaps without changing the D-127/D-148 command semantics.

- Entry targets are reduced to one deterministic legal insertion boundary. Shared adjacent-row coordinates are deduplicated, the nearest boundary is selected with a stable tie-break, and the target carries the resolved boundary Y used by the single thin insertion line. The destination row is no longer painted as a green target surface; Section-only header cues remain unchanged.
- Edge auto-scroll now uses the measured `LazyColumn` root viewport and measured bottom overlay top when available. The fixed `110.dp` content padding is not subtracted a second time. Existing edge-zone speed ramp, parent pointer authority, source-row continuity, snapshot rebase after consumed scroll, D-129 guards, Routine empty-Section semantics, and exact-once physical-up dispatch remain unchanged.
- Focused JVM boundary/auto-scroll helper tests and full Android JVM `214 / 214` passed. On `TaskChute_API33`, same-Section, visible cross-Section, Routine empty-Section, bottom-edge off-screen target, and collapsed non-empty Section focused cases passed; the bottom-edge test kept one physical pointer session and dispatched one move. The standard Today surface runner remains `HARNESS_HUNG / PARTIAL / NOT_VERIFIED`; the target-app crash buffer had no FATAL/ANR marker.
- Final local `:app:compileDebugKotlin`, `:app:compileDebugAndroidTestKotlin`, `:app:assembleDebug`, and `git diff --check` passed. Exact-SHA CI `36325621921` passed with signed APK artifact `taskchute-android-debug-eb6546ed2d6ee9016d53bd44c846d4fc57c0d681`, ID `10934126205`, expires `2026-10-04T14:24:16Z`. Galaxy S23 remains `NOT_RUN / PRODUCT_OWNER_MANUAL`; Worker/API/shared contract, schema, migration, dependency, persistent nonprod, D-145, Notes, Production, and Release were not changed or run.
## Corrective evidence: legal target visibility — 2026-09-28

The Android Today D&D legal-target corrective is implemented in `e8a4198e518a14380a25c71016689a9567d6d1df`.

- Legal boundaries use stable logical ownership zones derived from measured physical bounds, so the source row has no dead zone and the insertion cue remains visible above the lifted overlay.
- Ordinary same-Section targets are filtered to the source planned-start cohort. Cross-Section targets remain available. Routine same-Section placement continues through the existing occurrence-aware relative move path and is not restricted by the ordinary cohort guard.
- Stable snapshot hit testing, auto-scroll rebase behavior, parent pointer ownership, empty/collapsed Section behavior, and exact-once dispatch are preserved. No automatic planned-start change is introduced.
- Focused/full Android JVM, focused `TaskChute_API33` Today tests, compile / instrumentation compile / assemble, crash-buffer check, `git diff --check`, and exact-SHA CI `36379323128` passed. APK artifact ID `10952023768`.

The corrective has not yet been retested on Galaxy S23. Earlier D-148 D&D failures remain historical `FAIL / USER_REPORTED`; device status for this corrective is `NOT_VERIFIED / PRODUCT_OWNER_MANUAL`. No Worker/API/shared contract, schema, migration, dependency, persistent nonprod, Production, or Release change was made.
