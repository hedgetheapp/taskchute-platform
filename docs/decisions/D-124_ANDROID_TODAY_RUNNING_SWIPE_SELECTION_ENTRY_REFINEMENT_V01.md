# D-124 — Android Today Running Swipe / Selection Entry Refinement v0.1

Status: **Approved**

## Decision

D-124 refines Android Today swipe and bulk-selection interaction without changing canonical
Task / Entry / Execution persistence authority.

### Running row swipe actions

For a current established Day ordinary Running row:

- left swipe exposes direct `編集`, direct `ノート` when a valid `taskId` exists, and
  `その他`;
- the existing trailing Complete control is hidden while the swipe surface is open;
- `編集` may open the existing edit surface, but field-level mutation remains limited by existing
  command eligibility. In particular, D-117's current-running Project / Mode capability does not
  imply new permission to change title, lifecycle, Section, planned start, estimate, placement,
  Routine relation, or historical execution facts;
- `その他` may open Task Actions, but visible/enabled actions remain filtered by the existing
  command eligibility. The presence of `その他` does not grant running day-move, duplicate,
  delete, or other mutations that are otherwise unavailable;
- the revealed right-side background visually continues the Running row surface rather than
  switching to the normal planned-row background.

This supersedes D-123 only for the Running-row Note-only presentation. Completed,
Routine-derived, future, and past valid-`taskId` rows retain the D-123 Note-only treatment unless
another canonical eligibility rule explicitly permits more.

### Selection Mode entry and row toggle

Selection Mode no longer begins by tapping the leading/time area.

- From normal Today mode, right-swiping a selection-eligible Task row enters Selection Mode.
- The row used to enter Selection Mode is selected immediately.
- On entry, all Task rows expose their Selection Mode checkbox visual. Rows that are not eligible
  for D-112 bulk selection remain disabled/non-selectable; the checkbox visual does not grant a
  mutation.
- While Selection Mode is active, the entire selectable Task row is the selection toggle target.
  Tapping anywhere on that row, including the checkbox area, toggles selected/unselected state.
  Users are not required to hit the checkbox itself.
- Existing Selection action bar commands, operation eligibility, lifecycle separation, and
  `解除` behavior remain unchanged.
- Right-swipe selection entry must coexist with left-swipe Task actions and long-press drag.
  Threshold, velocity, gesture arbitration, and animation constants are reversible Android
  implementation details and must not change the canonical eligibility above.

## Relationship to existing Decisions

- D-112 remains authoritative for which Entries are eligible for bulk mutation and for the
  existing bulk day-move/delete commands.
- D-121 remains authoritative for normal-mode hidden checkboxes, Selection Mode checkbox visuals,
  lifecycle/execution separation, and the shared dark Android visual system. D-124 supersedes only
  the previous Selection Mode entry affordance and defines row-wide tap toggling.
- D-123 remains authoritative for planned-row `編集 / ノート / その他`, Task Actions composition,
  completed/non-current Note-only access, and collapsed Section drop semantics, except for the
  Running-row refinement explicitly stated above.
- D-117 remains authoritative for current ordinary Running Project / Mode metadata editing.

## Visual target

Figma file `UbTJH6ykYNBQJS4Wvwz9jb`, current `Today — Full Screen` and
`Today — Flow & States` pages are the approved visual reference. Figma remains visual reference
only; canonical Product behavior is defined by this Decision and SPEC.

## Boundary

No Worker/API contract, schema, migration, new persistence, realtime protocol, security posture,
third-party dependency, production operation, or Release semantics are introduced.

## Verification contract

Implementation is not part of this Decision-record update. When implemented, treat D-124 together
with the still-unimplemented D-123 interaction scope as an Android Large Batch. Required evidence
must cover at least:

- planned and Running left-swipe action composition and execution-action hiding;
- Running revealed-background continuity;
- Completed Note-only regression;
- right-swipe Selection Mode entry with the swiped row initially selected;
- all-row checkbox visibility with ineligible rows remaining disabled;
- whole-row tap selection toggle in Selection Mode;
- no regression to left swipe, long-press D&D, bulk action eligibility, lifecycle actions, or
  collapsed Section drop.

Android automated tests, AVD/CUA, Galaxy S23, production, and Release remain `NOT_RUN` until the
implementation batch is executed.
