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

### Active / archived lifecycle

A standalone Note is either:

- active
- archived

Archive is reversible.

The Notes UI exposes at least two views/tabs equivalent to:

- `使用中`
- `アーカイブ`

New standalone Notes are active by default.

Archiving a Note removes it from the active list and places it in the archived list. Restoring reverses that transition.

Archive/restore is a Server-authoritative persisted state change. It must use the existing operation identity / revision CAS safety model rather than a browser-only presentation flag.

### Title uniqueness across lifecycle states

The D-091 no-duplicate-title rule applies across all standalone Notes owned by the user, regardless of active/archive state.

Therefore:

- an archived Note still reserves its title;
- creating or renaming an active Note may not reuse the exact trimmed title of an archived Note;
- restoring an archived Note does not require a rename merely because of lifecycle state;
- after a Note is hard-deleted, its former title becomes available for reuse.

The initial equality rule remains trimmed exact string equality. Case folding, kana normalization, romaji normalization, Unicode normalization beyond existing storage behavior, and locale-specific collation are not introduced by D-092.

### Hard delete

Standalone Notes support irreversible hard delete.

Hard delete requirements:

- available for both active and archived standalone Notes;
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

Restoring from archive may keep the user in the archive view or move focus according to consistent existing board conventions; exact focus placement is delegated so long as the restored Note appears in the active list on subsequent query/reload.

## Persistence implications

D-092 requires persisted archive state for standalone Documents and additional operation command compatibility.

D-091 title uniqueness also requires a Server/DB authority strong enough to prevent races where two concurrent commands choose the same title.

The expected implementation direction is a new APP migration after 0029 that can provide:

- persisted active/archive state (for example `archived_at` or equivalent);
- database-enforced uniqueness for standalone titles within one owner across active and archived rows;
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

- active/archive query separation
- archive exact replay
- restore exact replay
- stale archive/restore rejection
- hard-delete confirmation UI
- hard-delete exact replay
- stale delete rejection
- active and archived title uniqueness
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
- D-092 adds active/archive lifecycle and confirmation-gated irreversible hard delete for standalone Notes only.
- Task/Project/RoutineOccurrence Document lifecycle remains undecided and separate.
