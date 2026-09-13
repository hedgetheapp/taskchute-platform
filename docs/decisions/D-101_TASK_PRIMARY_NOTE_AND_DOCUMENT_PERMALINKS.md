# D-101 — Task Primary Note and Document Permalinks

Status: **Approved / implemented in the D-101 slice**

## Decision

TaskChute has one owner-scoped, Markdown-native `Document` entity. A Task may
have zero or one `task_primary` Document, shared by every Entry for that Task.
The Task title remains the title authority; a Task Primary Document stores its
Markdown body and does not introduce a second Task title or lifecycle.

The Today table exposes a non-mutating Note affordance for each Task. If the
Task has no primary document, an explicit click atomically ensures one and then
opens it. Existing and newly created Task Primary Documents are addressable by
the stable URL `/?view=task-note&task=<task-id>&document=<document-id>`.

Task Notes use Markdown source text, memory-only drafts, explicit/autosave
updates through the existing operation/CAS conventions, and a non-modal side
peek or a user-selected new-tab mode. Conflicts and ambiguous outcomes retain
the exact request and block unsafe navigation until resolved. A synchronous
same-origin bootstrap tab may ensure a missing document before replacing its
location with the canonical permalink; a GET never mutates.

## Boundary

This decision does not add Task/Project/RoutineOccurrence note relations,
backlinks, search, preview, attachments, deletion/archive lifecycle for Task
Primary Documents, or a new editor dependency. Standalone Notes retain their
existing D-090–D-093 semantics. No API command, schema, migration, security
posture, or persistence semantics are implied beyond the approved APP 0031
Task Primary relation and typed commands.

## Evidence

The implementation and verification state are recorded in `docs/CURRENT.md`
and `docs/TEST_MATRIX.md`.
