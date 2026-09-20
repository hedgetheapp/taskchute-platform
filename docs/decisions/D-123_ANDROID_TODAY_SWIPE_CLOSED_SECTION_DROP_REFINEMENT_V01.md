# D-123 — Android Today Swipe Actions / Collapsed Section Drop Refinement v0.1

Status: **Approved**

## Decision

D-123 refines the Android Today interaction surface without changing canonical Task / Entry /
Execution / Document authority.

- For an eligible ordinary planned Task on the current established Day, **Right → Left** (conventional left swipe; the finger moves from the right side toward the left) reveals direct
  `編集`, direct `ノート` when the visible row has a valid `taskId`, and `その他`. While the
  swipe surface is open, that row's trailing execution action is not simultaneously exposed.
- `その他` opens the Task Actions bottom sheet. The sheet contains the actions that are not already
  represented by the direct Note shortcut: `編集`, `複製`, `前の日へ移動`, `次の日へ移動`,
  `日付を移動`, and `削除`, subject to each existing command's eligibility and safety boundary.
  Task Note is not duplicated inside this sheet.
- The **Right → Left** action menu (conventional left swipe) is dismissed by tapping another row, a Section header, or other Today content outside the open menu. A **Left → Right** gesture (conventional right swipe) on the open owner row first returns it to the neutral state; a later separate Left → Right gesture may enter Selection Mode under D-124.
- D-110 Task Primary Note eligibility is preserved independently from planning eligibility. A
  visible row with a valid `taskId` may expose a Note-only **Right → Left** (conventional left swipe) affordance even when planning
  edit / duplicate / day-operation actions are unavailable, including running, completed,
  Routine-derived, future, or past rows. This does not grant any new planning write eligibility.
- During an eligible current-Day ordinary planned Task drag, a collapsed configured Section header
  is a drop target even when that Section already contains Entries. The Section does not auto-expand.
  A successful drop uses the existing Section-area / Section-only `MoveEntry` semantics, so the Task
  is placed at that target Section's planned tail. The local collapsed state remains collapsed after
  canonical reconciliation.
- Invalid / no-op drops remain no-write. Existing owner scope, Day boundary, placement revision,
  retry / ambiguity, pending-row, lifecycle, and read-only guards remain authoritative.

## Relationship to existing Decisions

D-123 refines only the affected Android Today interaction details:

- D-121 remains authoritative for the unified dark UI, lifecycle/selection separation, execution
  controls, and shared Android navigation. D-123 supersedes only D-121's Task Actions composition
  where Task Note was also listed inside the sheet.
- D-110 remains authoritative for Task Primary Note semantics, `ReorderEntries` / `MoveEntry`,
  duplicate semantics, and valid-`taskId` Note eligibility. D-123 extends the Android drop surface
  to a non-empty collapsed Section header while reusing existing Section-tail semantics.
- D-112 bulk selection/day operations, D-111 Notes autosave/CAS/safe flush, D-113 local Section
  collapse and drag feedback, and existing Server/API authority remain unchanged.

## Visual target

Figma file `UbTJH6ykYNBQJS4Wvwz9jb`, current `Today — Full Screen` and
`Today — Flow & States` pages are the approved visual reference for this refinement. Figma is not
Product / Domain authority; this Decision and the canonical Product documents remain authoritative.

## Boundary

No Worker/API contract, schema, migration, new persistence, realtime protocol, security posture,
third-party dependency, production operation, or Release semantics are introduced.

## Verification contract

Implementation is not part of this Decision-record commit. When implemented, treat D-123 as an
Android Large Batch: run focused and full Android JVM coverage, fresh debug APK build, the affected
Today AVD/CUA journeys for planned swipe actions, Note-only running/completed access, collapsed
Section drag/drop, move-date and delete confirmation, plus regression coverage for existing
selection/execution/drag behavior. Galaxy S23 verification remains `NOT_RUN` until the final-main
APK is tested by the Product Owner.
