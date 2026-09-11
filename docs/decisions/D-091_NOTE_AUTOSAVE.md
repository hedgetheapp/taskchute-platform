# D-091 — Note Autosave

Status: Approved

Date: 2026-09-11

## Context

D-090 Standalone Markdown Notes v0.1 intentionally started with explicit Save only and explicitly excluded autosave. Product Owner now approves changing that behavior so standalone Notes save automatically while preserving D-090 server authority, revision CAS, exact operation replay, ambiguity barriers, and conflict safety.

D-091 supersedes only D-090 clauses that say autosave is not adopted / is a non-goal, plus D-090/D-091 initial behavior that a newly opened Note remains memory-only until the user enters a valid title. All other D-090 semantics remain in force unless explicitly changed here.

Task Primary Document / Project Primary Document / RoutineOccurrence Document naming semantics are not decided by D-091. The title allocation and uniqueness rules below apply only to standalone Notes and must not be generalized to Task / Project Note design without a separate Decision.

## Product semantics

### Autosave is the default

- Editing a standalone Note automatically persists changes to the Server after a short idle debounce.
- Initial target debounce is approximately 1 second after the last title/body edit. Exact millisecond tuning is a reversible implementation detail.
- Autosave uses the same retry-safe / revision-CAS principles as D-090.
- Autosave does not introduce Last-Write-Wins behavior.

### New Note creation is immediately persisted

- `＋ 新規ノート` creates a real standalone Document on the Server immediately; it no longer starts as a memory-only draft.
- The base title for a newly created standalone Note is exactly `notitle`.
- If `notitle` is already used by another standalone Note owned by the same user, allocate `notitle1`, then `notitle2`, and so on.
- The chosen title and Document identity must be established atomically enough that concurrent creates cannot produce duplicate standalone titles.
- New Note body starts as empty Markdown source text.
- Once Create succeeds, subsequent title/body edits use autosave Update semantics.
- If Create is infrastructure-ambiguous, retain the exact operation/document identity and reconcile by exact Document ID under the existing D-090 ambiguity rules; do not issue a replacement Create simply to obtain another title.

### Standalone Note title uniqueness

Standalone Notes are owner-scoped and title-unique.

- Two standalone Notes for the same owner must not have the same canonical title.
- Uniqueness applies only within `kind = standalone` for that owner.
- Requested title is trimmed using the existing D-090 title rule before allocation.
- For D-091 initial scope, duplicate comparison follows exact stored-title equality after trim. No case-folding, Unicode normalization, kana normalization, or locale-specific equivalence is introduced.
- If the requested base title is unused, keep it unchanged.
- If it is already used, append the smallest positive decimal suffix that produces an unused title: `title1`, `title2`, `title3`, ...
- The suffix is appended to the requested base string as-is. D-091 does not parse or reinterpret an existing numeric suffix in the requested title.
- During Update, the current Document itself does not count as a conflicting other Document.
- The Server returns the final canonical allocated title; the editor/list must converge to that returned title.
- A race between create/create, create/rename, or rename/rename must not leave duplicate canonical standalone titles.

Examples:

- existing: none → new Note: `notitle`
- existing: `notitle` → new Note: `notitle1`
- existing: `notitle`, `notitle1` → new Note: `notitle2`
- existing: `会議メモ` → rename/create request `会議メモ` → `会議メモ1`
- existing: `会議メモ`, `会議メモ1` → next collision → `会議メモ2`

### Existing Note updates

- After a saved Note changes, autosave issues Update using the canonical current revision.
- Only one logical Document mutation may be in flight for a Note at a time.
- If the user edits again while a save is in flight, the in-flight request remains immutable; after it resolves successfully, the latest local draft is compared with the new canonical baseline and, if still dirty, another autosave is scheduled.
- Do not mutate a sent request in place.
- If a title collision is detected, canonical title allocation is part of the Server-authoritative save result and must remain retry-safe.

### Explicit Save remains

- The existing Save button and `Ctrl+S` / `Cmd+S` remain available as an immediate flush action.
- Explicit Save cancels the pending debounce and submits the current eligible draft immediately.
- It must not create a second logical operation when the same logical save is already in flight.
- Saving an already canonical-clean Note should not create a gratuitous new revision merely because the user pressed Save.

### Leaving / switching Notes

Autosave must not create a false sense that data is safe when a user leaves immediately after typing.

For Note switching, leaving Notes, and logout:

- if there is no dirty/pending/unresolved state, transition normally;
- if there is a dirty draft and no mutation is in flight, attempt an immediate save flush before completing the transition;
- while the flush is in flight, hold the requested transition;
- on successful save, continue the deferred transition;
- on revision conflict, infrastructure ambiguity, validation failure, or other save failure, do not leave automatically; preserve the local draft and show the relevant state;
- unresolved ambiguous state remains a hard transition barrier independent of dirty state.

Because new Notes are now immediately created, there is no D-091 concept of an unsaved empty-title new Document draft.

### Browser unload

Browser reload / tab close cannot reliably wait for an asynchronous Server save. Therefore:

- `beforeunload` protection remains active whenever there is dirty, saving/pending, or unresolved ambiguous state;
- D-091 does not use `sendBeacon` or a separate unsafe unload mutation protocol.

### Ambiguity and retry

D-090 corrective barriers remain authoritative.

- `infrastructure_ambiguous` retains the exact operation identity and exact payload.
- exact-ID canonical reconciliation is attempted under the existing D-090 rules;
- while unresolved, editor mutation and unsafe navigation remain blocked;
- autosave must never replace an unresolved exact request with a new operation;
- title-allocation retry must converge to the original operation result, not re-run allocation as a new logical mutation.

### Revision conflict

- Autosave stops on revision conflict.
- Local draft is preserved.
- Latest canonical Server state may be fetched/displayed using the existing D-090 conflict path.
- D-091 does not automatically merge or automatically resubmit against a newer revision.
- No collaborative editing / CRDT behavior is introduced.

### Save status UX

The Notes editor should make persistence state understandable with concise states such as:

- `保存中…`
- `保存しました`
- `未保存`
- conflict / ambiguous error states

Exact wording and placement are reversible UI details, but the UI must not display `保存しました` while local edits remain unsaved.

## Persistence / API

The new standalone-title uniqueness rule is a persisted invariant and must be enforced in a race-safe way.

- APP 0029 remains the base Document schema authority.
- A follow-up APP migration is expected to add the minimum owner + standalone-title uniqueness constraint/index required for D-091.
- At Decision update time, expected next APP migration slot is `0030`.
- Migration `0030` is **not approved by this Decision update alone**; explicit Product Owner approval is required before implementation/apply.
- Before adding a uniqueness constraint, implementation must verify whether any existing owner has duplicate standalone titles. Existing persisted Documents must not be silently renamed or deleted to make the migration pass.
- No AUTH migration.
- No new external service or dependency.
- Existing 64 KiB bounded JSON request protection remains unchanged.

If implementation would require broader schema/API changes than minimum standalone title uniqueness, STOP and return to Product Owner.

## Non-goals

D-091 does not add:

- Task Primary Document naming/uniqueness semantics
- Project Primary Document naming/uniqueness semantics
- RoutineOccurrence Document naming/uniqueness semantics
- offline draft persistence / offline mutation queue
- localStorage / IndexedDB canonical draft storage
- collaborative editing / CRDT
- automatic merge on revision conflict
- attachment / image upload
- delete/archive/trash
- revision-history UI
- production operation

## Verification contract

Required evidence includes:

- immediate new Note Server creation
- `notitle`, `notitle1`, `notitle2` allocation
- owner-scoped standalone title uniqueness
- duplicate user-entered title suffix allocation
- deterministic concurrent create/create title allocation
- create/rename and rename/rename race protection
- exact replay preserves the originally allocated canonical title
- debounce coalescing
- existing Note autosave Update
- edits during in-flight save produce a later follow-up save, not request mutation
- explicit Save flushes debounce without duplicate mutation
- clean Save does not gratuitously increment revision
- Ctrl/Cmd+S same immediate-flush path
- Note switch / app navigation / logout flush and deferred-transition behavior
- revision conflict pauses autosave and preserves draft
- infrastructure ambiguity preserves exact request and existing barrier
- browser unload guard for dirty / saving / unresolved states
- full D-090 exact replay / CAS / ambiguity regressions
- migration fresh/upgrade and duplicate-preflight evidence if APP 0030 is approved
- full Web / Worker tests and static/deploy gates

Persistent authenticated browser evidence may remain `NOT_VERIFIED` while no valid authenticated session is available; this must not be promoted from local tests.

## Relationship to prior Decisions

- D-091 supersedes D-090 where D-090 says autosave is not adopted / is a non-goal.
- D-091 also supersedes D-090/D-091 initial behavior that `＋ 新規ノート` remains memory-only until a user-entered valid title exists.
- D-090 Document identity, Markdown source authority, operation identity, revision CAS, ambiguity handling, owner isolation, and APP 0029 foundation remain unchanged unless the separately approved minimal title-uniqueness migration extends them.
- D-020 server-authoritative command/retry semantics remain unchanged.
- Task / Project / RoutineOccurrence Document naming remains explicitly undecided here and requires separate design.
