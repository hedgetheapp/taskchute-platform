# D-092 — Standalone Note Lifecycle

Status: Approved

Date: 2026-09-11

## Context

D-090 introduced owner-scoped standalone Markdown Documents. D-091 adds autosave and standalone-note naming semantics, including automatic `notitle` / numeric suffix allocation and no duplicate titles within standalone Notes.

The Product Owner additionally approves lifecycle controls for standalone Notes: reversible archive/restore and confirmation-gated irreversible hard delete.

Task Primary Document / Project Primary Document / RoutineOccurrence Document lifecycle remains a separate design problem and is not decided by D-092.

## Product semantics

### Scope

D-092 applies only to `kind = standalone` Documents.

It does not define lifecycle behavior for:

- Task Primary Document
- Project Primary Document
- RoutineOccurrence Document
- Review Document
- future attachment/file entities

### Default Notes list and archive view

A standalone Note is either non-archived or archived. Archive is reversible.

The ordinary Notes surface shows non-archived standalone Notes by default. The UI does not expose an equal-weight `使用中` tab merely to represent the normal state.

The ordinary Notes surface provides a separate `アーカイブ` control/button. Activating it opens or switches to the archived Note list/view. The archived view provides a clear way to return to the ordinary Notes list.

New standalone Notes are non-archived by default.

Archiving a Note removes it from the ordinary Notes list and makes it appear in the archived list. Restoring reverses that transition.

Archive/restore is a Server-authoritative persisted state change. It must use the existing operation identity / revision CAS safety model rather than a browser-only presentation flag.

Exact visual treatment of the archive control, archived-view heading, back/navigation affordance, and row action placement is reversible UI detail, provided the information architecture remains:

- ordinary Notes view = non-archived Notes only;
- `アーカイブ` is a secondary destination/action from Notes;
- archived Notes are not mixed into the ordinary list.

### Approved UI/UX direction

The Product Owner approved the hand-drawn Notes concept based on the current two-pane Notes screen.

The implementation target is:

- keep the existing top-level `ノート` destination and two-pane structure: left Note list, right Markdown editor;
- ordinary Notes view shows only non-archived Notes;
- place a compact `アーカイブ` button/control near the Notes list/header area instead of an always-visible `使用中` tab;
- `アーカイブ` opens a dedicated archived Notes list/view with a clear `通常のノートに戻る` equivalent control;
- keep `＋ 新規ノート` readily accessible in the ordinary Notes view;
- each Note exposes a compact row/menu affordance such as `…` for lifecycle actions;
- ordinary Note actions include `アーカイブ` and `削除`; rename may remain available either via the title editor or menu according to existing editor conventions;
- archived Note actions include `復元` and `削除`;
- archive/restore should use a concise confirmation dialog if needed for clarity, with cancel and explicit action buttons;
- hard delete always uses a destructive confirmation dialog that clearly states the action cannot be undone;
- after archive/delete of the selected Note, selection/focus moves to a valid remaining visible Note or the empty state;
- autosave status remains understandable in the editor and lifecycle controls must not bypass pending/unresolved save safety.

The approved information architecture intentionally avoids an equal-weight `使用中` tab. The normal Notes list is the default state; archive is a secondary view opened only when needed.

Exact spacing, iconography, button placement, typography, and menu visual styling remain reversible UI implementation details and should follow the existing TaskChute shell / Project / Mode interaction conventions.

### Title uniqueness across lifecycle states

The D-091 no-duplicate-title rule applies across all standalone Notes owned by the user, regardless of archive state.

Therefore:

- an archived Note still reserves its title;
- creating or renaming a non-archived Note may not reuse the exact trimmed title of an archived Note;
- restoring an archived Note does not require a rename merely because of lifecycle state;
- after a Note is hard-deleted, its former title becomes available for reuse.

The initial equality rule remains trimmed exact string equality. Case folding, kana normalization, romaji normalization, Unicode normalization beyond existing storage behavior, and locale-specific collation are not introduced by D-092.

### Hard delete

Standalone Notes support irreversible hard delete.

Hard delete requirements:

- available for both non-archived and archived standalone Notes;
- always requires an explicit confirmation dialog before the delete command is issued;
- confirmation must clearly state that deletion cannot be undone;
- cancel leaves Server state unchanged;
- successful deletion removes the Document row from the standalone Note capability;
- there is no trash/recycle-bin restore in D-092;
- deleted title becomes available for future standalone Notes.

The exact visual location of archive/delete actions is reversible UI detail. A row-end menu or equivalent compact control is acceptable if consistent with existing Project/Mode patterns.

### Concurrency / autosave interaction

D-091 autosave remains authoritative for editing.

Archive/delete must not race unsafely with an in-flight or unresolved save.

Required boundaries:

- an unresolved `infrastructure_ambiguous` save blocks archive/delete until exact resolution;
- archive/delete commands use explicit expected revision / equivalent CAS protection;
- if the Note changed since the user acted, archive/delete must fail safely with revision conflict rather than applying to stale state;
- archive/delete must not borrow another concurrent operation's final state as its own success;
- a currently in-flight autosave must settle before archive/delete mutation can execute, or the lifecycle action must otherwise serialize against it with equivalent safety;
- no Last-Write-Wins behavior.

For hard delete, once the user has confirmed deletion, unsaved local editor text does not need to be persisted merely to then delete it. However, an in-flight or unresolved previously-sent mutation must still be resolved/serialized before delete so that mutation ordering is deterministic.

### Selection/focus after lifecycle mutation

After archiving/deleting the currently open Note, the UI should select a sensible remaining Note in the current visible list when available; otherwise show the empty state.

Exact previous/next preference is reversible UI detail, but focus must not land on a removed/hidden Document.

Restoring from archive may keep the user in the archive view or move focus according to consistent existing board conventions; exact focus placement is delegated so long as the restored Note appears in the ordinary Notes list on subsequent query/reload.

## Persistence implications

D-092 requires persisted archive state for standalone Documents and additional operation command compatibility.

D-091 title uniqueness also requires a Server/DB authority strong enough to prevent races where two concurrent commands choose the same title.

The expected implementation direction is a new APP migration after 0029 that can provide:

- persisted archive state (for example `archived_at` or equivalent);
- database-enforced uniqueness for standalone titles within one owner across non-archived and archived rows;
- operation command allow-list support for archive/restore/delete if required by the physical schema.

No AUTH migration is expected.

The exact migration number and physical schema are not approved by this Decision alone unless separately approved by the Product Owner before implementation.

Existing duplicate standalone titles must be checked before adding a uniqueness constraint. If duplicates already exist, implementation must STOP before destructive or automatic rename cleanup and return the evidence to the Product Owner.

## API / command direction

Expected typed mutations include equivalents of:

- SetStandaloneDocumentArchived
- DeleteStandaloneDocument

Exact names are architecture detail.

Archive/restore should carry operation identity, document identity, expected revision, and target lifecycle state.

Hard delete should carry operation identity, document identity, and expected revision.

All mutations remain owner-scoped and retry-safe under D-020 conventions.

## Non-goals

D-092 does not add:

- `使用中` tab for the ordinary Notes list
- trash/recycle bin
- delayed purge
- retention window
- bulk archive/delete
- Task/Project/RoutineOccurrence note lifecycle semantics
- attachments
- collaborative editing
- revision-history restore
- production operation

## Verification contract

Evidence should include:

- ordinary list contains non-archived Notes only
- `アーカイブ` control opens archived Notes list/view
- archived Notes do not appear in ordinary list
- archive exact replay
- restore exact replay
- stale archive/restore rejection
- hard-delete confirmation UI
- hard-delete exact replay
- stale delete rejection
- non-archived and archived title uniqueness
- released title reuse after delete
- `notitle`, `notitle1`, `notitle2` allocation considering archived Notes
- concurrent title-allocation race protection
- autosave-in-flight serialization with archive/delete
- unresolved ambiguity blocks archive/delete
- current-note selection/focus recovery after archive/delete
- reload persistence
- full D-090/D-091 regression where impacted
- persistent nonprod DB integrity

Authenticated browser evidence may remain NOT_VERIFIED if no valid authenticated session is available; local/nonprod DB evidence must not be promoted to browser PASS.

## Relationship to prior Decisions

- D-090 shared Document identity/Markdown/revision/operation semantics remain unchanged except lifecycle scope is expanded for standalone Notes.
- D-091 autosave and standalone-title uniqueness semantics remain authoritative.
- D-092 adds reversible archive/restore and confirmation-gated irreversible hard delete for standalone Notes only.
- Task/Project/RoutineOccurrence Document lifecycle remains undecided and separate.
