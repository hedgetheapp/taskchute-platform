# D-146 — Android Notes Interaction Refinements + Movable Add FAB v0.1

Status: **Approved — Implementation not started**

Date: 2026-09-26

## Context

Android Notes has the shared Document/autosave/CAS foundation from D-090/D-091/D-092/D-101/D-110/D-111, the dark visual system from D-121, and the shared Markdown live-preview editor from D-135/D-136.

Product Owner feedback from Galaxy S23 dogfooding identified a set of narrow Android interaction and presentation corrections. This Decision records those approved user-visible deltas without changing Document authority, persistence, API semantics, or Markdown source format.

## Decision

### 1. Standalone Note create title focus

Creating a new standalone Note continues to create the canonical initial title `notitle`.

On the first presentation of that newly-created editor:

- the title field receives focus automatically;
- the whole `notitle` text is selected;
- typing replaces the whole title immediately;
- this initial focus/select-all happens once per create-editor open session and must not re-fire after server response, recomposition, autosave, or subsequent user focus changes.

Opening an existing Note does not auto-select its title.

### 2. Empty-title validation and autosave recovery

Standalone Note title must not be empty or whitespace-only.

Android validates this before sending a save request and shows `タイトルを入力してください`.

While the title is invalid:

- the local draft is preserved;
- body edits are preserved locally;
- no invalid title/body update is sent.

After the user enters a valid title again:

- only the local empty-title validation error is cleared;
- the current latest title/body draft becomes `UNSAVED`;
- normal debounce/autosave resumes;
- successful save converges through existing revision/CAS semantics.

Revision conflict, ambiguous outcome, authentication failure, and other server/network error semantics are not converted into local-validation recovery.

### 3. Notes list timestamps

Each standalone Note row shows both timestamps:

- `作成日 YYYY-MM-DD HH:MM:SS`
- `更新日 YYYY-MM-DD HH:MM:SS`

Canonical server instants are rendered in the device local timezone for presentation only. Persistence/API timestamps are unchanged.

### 4. Notes list row actions

The current visible `操作` button and anchored DropdownMenu are replaced by a compact `…` affordance using the same bottom-sheet interaction pattern as Android Today Task Actions.

For an active standalone Note the sheet provides:

- `ノート名を変更`
- `アーカイブ`
- `削除`

For an archived standalone Note it provides:

- `ノート名を変更`
- `復元`
- `削除`

Rename starts from the current title and presents the title selected for quick replacement. Empty-title validation follows section 2. Archive/restore/hard-delete retain D-092 semantics and delete confirmation.

### 5. Markdown empty-body placeholder

The shared Android Markdown editor placeholder changes from `Markdown` to `本文を入力`.

This presentation change applies to every Android surface using the shared editor, including standalone Note, Task Primary Note, and Daily Note. Markdown storage/rendering semantics are unchanged.

### 6. Unfocused live preview includes the first line

When the Markdown body does not have editor focus, no line is treated as the active raw-edit line merely because the stored caret offset is zero.

Therefore an opened Note with an unfocused body renders all supported lines, including the first line, through live preview.

Once the body is focused, only the actual caret/selection line uses the existing raw-source editing representation. Losing body focus returns that line to preview.

### 7. Markdown task-list checkbox visual parity

Inactive Markdown task-list markers continue to persist exact `- [ ]` / `- [x]` source and use the existing safe source/display offset mapping.

Their rendered checkbox appearance is changed to visually match the Android Today Selection Mode checkbox: same shape, sizing rhythm, selected/unselected treatment, and dark-theme visual language.

This is presentation-only. Markdown source and autosave behavior do not change.

### 8. Link and checkbox gestures must permit scrolling

D-136 tap interaction is refined so an interactive Markdown link or checkbox does not monopolize the whole pointer sequence.

- a stationary tap on a link opens the existing safe http(s) destination;
- a stationary tap on a checkbox toggles the marker;
- when pointer movement exceeds normal touch slop / resolves as scroll, the interactive action is canceled and vertical scrolling proceeds normally;
- scrolling that begins on link or checkbox text must feel the same as scrolling from ordinary body text;
- a drag/scroll must never accidentally open a link or toggle a checkbox.

Stable tap selection/caret behavior from D-136 remains for genuine taps.

### 9. Notes list Selection Mode

The standalone Notes list adopts the Android Today right-swipe Selection Mode interaction:

- left-to-right swipe on an eligible Note row enters Selection Mode;
- the initiating row is selected immediately;
- all eligible rows show the same selection checkbox visual language as Today;
- while Selection Mode is active, tapping an eligible row anywhere toggles its selection;
- when selection reaches zero, Selection Mode exits;
- individual row open and `…` actions are suppressed while Selection Mode is active;
- the create FAB is hidden while Selection Mode is active.

This Decision does **not** add bulk archive/delete/rename or any other multi-Document mutation. Existing standalone Document commands remain single-Document. Atomic bulk Document lifecycle semantics remain out of scope.

### 10. Shared Add FAB visual parity and temporary movement

Android Today Task add and Android Notes standalone Note add use the same visual Add FAB component:

- circular shape;
- same geometry, background/content treatment, Material Add icon, and accessibility semantics;
- Notes no longer renders a text `＋` glyph as its FAB content.

Both Today and Notes Add FABs can be temporarily moved by drag so the user can uncover underlying row controls.

- normal tap performs the existing add action;
- drag moves the FAB within safe visible content bounds and must not enter the bottom navigation/system-inset area;
- tap and drag are disambiguated so a drag does not trigger Add;
- the offset is ephemeral UI state only;
- no preference, local storage, database field, API, or account sync is added;
- leaving/recreating the surface resets to the existing default bottom-right position;
- existing visibility/eligibility rules still apply, including hiding the FAB during Selection Mode.

## Compatibility / supersession

This Decision preserves:

- D-090/D-091/D-092 standalone Document identity/lifecycle;
- D-101 Task Primary Document authority;
- D-111 autosave/CAS/conflict/ambiguous retry/safe flush;
- D-121 Android dark visual system and Today Selection Mode visual language;
- D-135 exact Markdown source + live preview model;
- D-136 safe http(s) link destination handling and stable genuine-tap interaction.

It narrowly supersedes D-136 only where the previous interactive pointer handling consumed drag/scroll gestures, and refines current Android Notes presentation/interaction details described above.

## Non-goals

This Decision does not approve or add:

- APP/AUTH schema or migration;
- new Worker/API command;
- bulk Document mutation;
- Project Primary Note listing on Android;
- Android Document realtime invalidation;
- Daily Note loading architecture changes;
- offline persistence/sync;
- production operation or Release.

Those are separate work items.

## Verification contract

Implementation must include focused automated coverage for at least:

- one-shot new-Note title focus + select-all without focus reclaim;
- empty-title local validation and successful autosave recovery after correction;
- created/updated timestamp formatting;
- `…` bottom sheet and rename/archive/restore/delete eligibility;
- placeholder `本文を入力`;
- unfocused first-line preview;
- task-list checkbox visual/state behavior without source-format change;
- link/checkbox tap-vs-scroll gesture arbitration;
- Notes right-swipe Selection Mode, whole-row toggle, zero-selection exit, action/FAB suppression;
- Today + Notes movable Add FAB tap/drag bounds/reset semantics.

Run impacted Android JVM tests and surface-aware Android runtime verification. Because the shared FAB touches Today and Notes, run both Today and Notes surface verification unless source impact analysis proves a narrower safe contract. Galaxy S23 remains Product Owner manual evidence until performed.

Production and Release remain NOT_RUN / NO.
