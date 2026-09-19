# D-121 — Android unified dark UI and task interaction refinement v0.1

Status: **Approved**

## Decision

D-121 adopts the latest Android design direction reviewed by the Product Owner for the native
Today / Notes / Settings surfaces. Figma is a visual reference; this Decision and the other
canonical GitHub documents remain the Product / interaction authority.

Android uses one dark visual system across Today, Notes, and Settings. Shared app chrome,
especially the bottom navigation, uses one implementation and one geometry/typography/icon
treatment rather than per-screen copies. The bottom navigation destinations remain
`今日` / `ノート` / `設定`, with the current destination visibly selected. Existing Material 3
is retained; no third-party UI/icon dependency is introduced.

Today refines the approved D-109–D-113 surface as follows:

- every visible Task row reserves the leading slot for **selection only**; the checkbox does not
  represent lifecycle completion;
- the leading checkbox remains visually empty when an unselected Task is planned, running, or
  completed, and becomes checked only when that row is selected;
- lifecycle/action presentation is independent on the trailing side:
  - planned and start-eligible: play / Start;
  - running and completion-eligible: square stop-style action, invoking the existing canonical
    Complete command rather than introducing a new stop/interruption domain state;
  - completed: check status, not a selection indicator and not an execution action;
- the old row overflow-first edit affordance is replaced for eligible rows by left-swipe reveal of
  an `編集` action. While the swipe action is open, the trailing execution action for that row is
  not simultaneously exposed;
- tapping the revealed edit action opens the existing Task edit surface and exposes the already
  approved auxiliary Task actions through the Task Actions sheet: edit, duplicate, Task Note,
  move date, and delete, subject to each existing command's eligibility and safety boundary;
- swipe threshold, velocity, animation constants, gesture conflict handling, and equivalent
  reversible Compose implementation details are delegated implementation details. They must not
  change canonical command eligibility or persistence semantics;
- D-112 bulk selection/day operations remain authoritative. A checkbox shown for a lifecycle state
  that is not eligible for a bulk mutation does not by itself grant that mutation; disabled or
  unavailable actions must reflect canonical eligibility.

The approved Today header date navigation is refined as follows:

- remove the separate `今日` action from the header so the visible header geometry matches the approved Figma Today design;
- the center date control is the sole direct date-picker affordance in the header. Tapping it opens the existing Jetpack Compose Material 3 date-picker UI and choosing a date navigates Today to that logical date;
- the previous-day and next-day controls remain on the left and right of the center date control;
- the center calendar icon, previous/next icons, date typography, control sizing, spacing, shape, and dark colors follow the approved Figma Today / Normal frame `69:257` as the visual authority, while Material 3 remains the Android implementation foundation;
- this refinement changes only the Android Today header presentation/navigation affordance. It does not change Day/domain semantics, persistence, API/Worker behavior, or introduce a dependency.

The approved Today state set also includes the existing date navigation, Section
collapse/expand, Quick Add, high-opening Task editor, bulk selection/action bar, move-date picker,
delete confirmation, pull-to-refresh/loading/refreshing/error/empty/future-read-only
representations, RunningTaskPanel, and the D-113 execution metadata rule (show only facts present
in the server projection).

Notes keeps D-090/D-091/D-092/D-101/D-110/D-111/D-113 Document semantics, autosave, CAS,
safe flush, memory-only draft, archive/restore/hard-delete, and Task Primary Note boundaries.
Its list/editor/state surfaces are visually aligned with the shared dark Android system and shared
bottom navigation. No manual Save authority is added.

Settings keeps D-114 management semantics for Sections, Projects, and Routines while adopting the
same shared dark Android system and bottom navigation. Existing destructive confirmations,
server-owned ordering, Section configuration, Project active/archive, and Routine enabled/default
semantics remain unchanged.

## Visual reference

Implementation should compare against the latest-design frames in Figma file
`UbTJH6ykYNBQJS4Wvwz9jb`, page `UI States — Android v1`, including the latest Today/Task
DESIGN states and the reviewed Notes / Settings states. Figma does not supersede this Decision,
SPEC, or other canonical docs when a visual mock is incomplete or ambiguous.

## Boundary

D-121 is an Android Product UI / interaction refinement. It does not approve:

- Worker/API semantic changes;
- APP/AUTH schema or migration changes;
- new persistence or offline authority;
- realtime protocol changes;
- a new lifecycle state or interruption/stop command;
- a new third-party dependency;
- production deployment or production data mutation.

Existing server projections, operation identity/replay, CAS/revision, placement, execution,
Document, Routine, Project, and Section semantics remain authoritative.

## Verification contract

Treat this as an Android Large Batch under `docs/ANDROID_LARGE_BATCH_WORKFLOW.md`.
At minimum, run affected/focused Android JVM coverage, full Android JVM regression, build the
fresh debug APK, and run the required Windows `TaskChute_API33` CUA journeys for the affected
Today / Notes / Settings surfaces. Verify shared bottom navigation visually and behaviorally on all
three destinations, and cover planned/running/completed row presentation, selection independence,
swipe/edit/actions, major dialogs/sheets, Notes safe navigation/autosave states, and Settings
management entry points.

Fresh Galaxy S23 smoke remains `PENDING_SMOKE` until the Product Owner tests the final-main APK.
Do not upgrade emulator evidence to physical-device verification. Production remains
`NOT_RUN` / Released `NO` unless separately approved.
