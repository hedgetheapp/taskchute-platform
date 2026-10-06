# D-172 — Android Note Cursor Position Restore v0.1

Status: **Approved / Implemented / Integrated / focused JVM + exact-SHA CI PASS / Galaxy S23 representative smoke PASS (user-confirmed) / Phone AVD NOT_RUN**

Date: 2026-10-04

## Goal

When a user reopens an Android Note, restore the caret to the position where they last edited/read that same Document instead of always reopening at the default position.

The behavior survives Android app process death/restart on the same device.

## Scope

D-172 applies to Android Markdown editor surfaces backed by a stable Document identity:

- Standalone Note;
- Task Primary Note;
- Project Primary Note;
- Daily Note.

The feature is Android-local presentation/editor state only.

## Decision

### 1. Persist one cursor position per Document

Store the last known caret offset per stable `document_id` in device-local Android preferences/storage.

The persisted value contains only editor position metadata, not Markdown content.

D-172 does not persist the full selection range. If the user currently has a non-collapsed selection, persist a single caret endpoint suitable for resuming editing.

Exact choice of selection endpoint is delegated as long as collapsed-caret behavior is deterministic and tested.

### 2. Survive app restart

The saved caret position must survive:

- leaving the Note and reopening it;
- navigation to another app surface and back;
- Android app process restart.

In-memory-only `remember` state is insufficient.

### 3. Restore safely against current canonical body

On opening a Document, read the saved offset and clamp it into:

`0..currentMarkdownBody.length`

If no saved value exists, use the existing default editor behavior.

If the body changed remotely or became shorter, never throw or create an invalid selection; clamp safely.

D-172 does not attempt semantic line matching, diff-based cursor rebasing, or content fingerprint migration.

### 4. Cursor state is not canonical Document state

The TaskChute Server remains authoritative for Document Markdown/revision.

Cursor position is not:

- part of Document content;
- part of revision/CAS;
- synced to Web;
- synced to another Android device;
- synced to Wear.

No Worker/API/schema/migration change is introduced.

### 5. Save timing

Update the local cursor record when editor selection/caret changes, using a lightweight local write strategy.

Do not send network requests for cursor movement.

Implementation may debounce/coalesce local preference writes if useful, but must persist the latest meaningful position before normal editor teardown/navigation whenever feasible.

Do not block autosave/CAS or navigation on a slow cursor-preference write.

### 6. New / not-yet-materialized Documents

A stable persisted cursor key requires a canonical/stable Document identity.

For a new Note or an unmaterialized Task/Project/Daily Note:

- do not invent a temporary cross-session cursor key that can collide with another Document;
- begin persisted cursor tracking once the editor has adopted its stable `document_id`.

Normal in-session editor selection remains available before materialization.

### 7. Restore must not force IME/focus

Restoring a saved caret position must not, by itself:

- force body focus;
- automatically open the IME;
- override existing title-focus behavior for newly created/renamed standalone Notes.

When the body becomes focused, the caret should resume from the restored selection unless the user explicitly places it elsewhere first.

Implementation may ensure the restored position is brought into view when appropriate, but must not introduce an unexpected keyboard pop-up merely to restore cursor state.

### 8. Interaction with Markdown live preview

D-135 live-preview behavior remains unchanged.

The restored source offset must be applied to the underlying Markdown source `TextFieldValue.selection`, not to rendered/transformed display offsets.

Checkbox/link tap preservation and toolbar command selection mapping must continue to work.

### 9. Principal/privacy boundary

Persist only Document identity plus numeric cursor metadata.

Do not persist Note title/body snippets as part of the cursor preference.

On sign-out or principal changes, a stale saved cursor record must never cause content from another principal to be displayed. Since cursor metadata is non-content presentation state, implementation may retain harmless orphaned records, but Document access/authorization remains canonical and no cursor lookup may bypass normal owner-scoped fetch/auth checks.

### 10. Storage hygiene

Use a dedicated Android local preference/storage namespace rather than mixing cursor records into canonical Document persistence.

Implementation may prune stale cursor records opportunistically if bounded cleanup is useful, but cleanup is not required for v0.1.

No destructive Document operation is implied by removing a cursor preference.

## Verification target

Future implementation should verify at minimum:

1. Standalone Note: move caret, close, reopen → caret restored.
2. Task Primary Note: move caret, close sheet, reopen → restored.
3. Project Primary Note: move caret, leave, reopen → restored.
4. Daily Note: move caret, leave Daily, reopen same date → restored.
5. app process restart → same Document restores previous caret.
6. saved offset greater than current body length → clamped safely to body end.
7. no saved offset → existing default position remains.
8. cursor restore does not automatically open IME.
9. new/unmaterialized Note does not persist under an unstable key.
10. after stable Document adoption, subsequent cursor movement is persisted under its document ID.
11. checkbox/link tap preservation and Markdown toolbar selection behavior remain correct.
12. cursor movement creates no network request and does not affect Document revision/autosave/CAS.
13. no schema/migration/API dependency change.

## Implementation and verification status — 2026-10-06

Implemented in `07703dc440fae5f71a8376ff372517bbbb85f730`. The dedicated Android-private `DocumentCursorPreferences` store uses the `taskchute.document.cursor.v1` namespace and one integer caret-offset key per stable `document_id`. Non-collapsed selections persist `TextRange.end`.

`MarkdownLiveEditor` initializes the source `TextFieldValue.selection` from the stored offset once per editor session and clamps it to the current Markdown body. Notes use `NoteEditorState.sessionId` as the initialization key, independent of `document_id`: adoption of a canonical ID therefore retains the live caret and does not load an older saved position over it. Cursor callbacks use the current `editor.document?.documentId`, so later selection changes persist under the adopted ID. Daily uses `state.document?.documentId` for both its cursor key and editor-session key. Existing body-update behavior retains and clamps the active selection; restore does not request focus or show the IME.

Focused JVM tests pass: `DocumentCursorPreferencesTest` `5 / 5`, `MarkdownLiveEditorTest` `22 / 22`, `NotesScreenTest` `4 / 4`, and `DailyScreenTest` `2 / 2` (`33 / 33` total). `:app:compileDebugKotlin`, `:app:assembleDebug`, and `git diff --check` pass. Exact-SHA CI passed Android JVM, signed Phone/Wear APK builds, AndroidTest APK compilation, certificate checks, and artifact uploads. No compatible Phone AVD/device was available, so standalone/Daily UI reopen, no-IME, process-restart, checkbox/link UI, and Galaxy S23 manual verification remain `NOT_RUN / PRODUCT_OWNER_MANUAL`; the exact fresh Phone APK is identified in the task handoff. No Worker/API/shared contract/schema/migration/dependency, Web, Wear, production, or release change. The Decision remains approved as written; this implementation does not add cross-device or semantic cursor rebasing behavior.


## Device closeout — 2026-10-06

Product Owner installed the fresh D-172 Phone build on Galaxy S23 and reported `たぶんおけ` after the requested cursor-restore smoke. Record the representative Note/Daily reopen behavior as `PASS / USER_CONFIRMED`. This is not a full device matrix and does not separately prove every optional checklist item such as process-restart persistence, IME non-opening, and every checkbox/link/toolbar interaction. Phone AVD runtime remains `NOT_RUN / NO_COMPATIBLE_PHONE_AVD`. Production `NOT_RUN`; Released `NO`.
