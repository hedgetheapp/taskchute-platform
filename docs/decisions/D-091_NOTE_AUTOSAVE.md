# D-091 — Note Autosave

Status: Approved

Date: 2026-09-11

## Context

D-090 Standalone Markdown Notes v0.1 intentionally started with explicit Save only and explicitly excluded autosave. Product Owner now approves changing that behavior so standalone Notes save automatically while preserving D-090 server authority, revision CAS, exact operation replay, ambiguity barriers, and conflict safety.

D-091 supersedes only D-090 clauses that say autosave is not adopted / is a non-goal. All other D-090 semantics remain in force unless explicitly changed here.

## Product semantics

### Autosave is the default

- Editing a valid standalone Note automatically persists changes to the Server after a short idle debounce.
- Initial target debounce is approximately 1 second after the last title/body edit. Exact millisecond tuning is a reversible implementation detail.
- Autosave uses the same `CreateStandaloneDocument` / `UpdateDocument` command semantics and existing operation identity / revision CAS rules as explicit Save.
- Autosave does not introduce Last-Write-Wins behavior.

### New Note creation

- `＋ 新規ノート` still starts as a memory-only local draft and does not immediately create an empty Server row.
- A new Note becomes eligible for autosave only after its title is valid under the existing D-090 title rules.
- Once eligible and idle, autosave performs the first Create.
- If the title is empty / whitespace-only, no Create occurs; the draft remains local and visibly unsaved.
- D-091 does not introduce an automatic `無題` canonical title.

### Existing Note updates

- After a saved Note changes, autosave issues Update using the canonical current revision.
- Only one logical Document mutation may be in flight for a Note at a time.
- If the user edits again while a save is in flight, the in-flight request remains immutable; after it resolves successfully, the latest local draft is compared with the new canonical baseline and, if still dirty, another autosave is scheduled.
- Do not mutate a sent request in place.

### Explicit Save remains

- The existing Save button and `Ctrl+S` / `Cmd+S` remain available as an immediate flush action.
- Explicit Save cancels the pending debounce and submits the current eligible draft immediately.
- It must not create a second logical operation when the same logical save is already in flight.

### Leaving / switching Notes

Autosave must not create a false sense that data is safe when a user leaves immediately after typing.

For Note switching, leaving Notes, and logout:

- if there is no dirty/pending/unresolved state, transition normally;
- if there is a valid dirty draft and no mutation is in flight, attempt an immediate save flush before completing the transition;
- while the flush is in flight, hold the requested transition;
- on successful save, continue the deferred transition;
- on revision conflict, infrastructure ambiguity, validation failure, or other save failure, do not leave automatically; preserve the local draft and show the relevant state;
- an invalid new draft such as an empty-title Note cannot be silently discarded by autosave and remains protected by the existing unsaved-change boundary.

### Browser unload

Browser reload / tab close cannot reliably wait for an asynchronous Server save. Therefore:

- `beforeunload` protection remains active whenever there is dirty, saving/pending, or unresolved ambiguous state;
- D-091 does not use `sendBeacon` or a separate unsafe unload mutation protocol.

### Ambiguity and retry

D-090 corrective barriers remain authoritative.

- `infrastructure_ambiguous` retains the exact operation identity and exact payload.
- exact-ID canonical reconciliation is attempted under the existing D-090 rules;
- while unresolved, editor mutation and unsafe navigation remain blocked;
- autosave must never replace an unresolved exact request with a new operation.

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

- No new APP migration is expected.
- APP 0029 remains the Document schema authority.
- No AUTH migration.
- No new external service or dependency.
- Existing 64 KiB bounded JSON request protection remains unchanged.

If implementation proves a schema/API compatibility change is actually required beyond current D-090 commands, STOP and return to Product Owner.

## Non-goals

D-091 does not add:

- offline draft persistence / offline mutation queue
- localStorage / IndexedDB canonical draft storage
- collaborative editing / CRDT
- automatic merge on revision conflict
- attachment / image upload
- Task / Project / RoutineOccurrence Document relation
- delete/archive/trash
- revision-history UI
- production operation

## Verification contract

Required evidence includes:

- debounce coalescing
- new Note no-write until valid title
- new Note autosave Create exactly once
- existing Note autosave Update
- edits during in-flight save produce a later follow-up save, not request mutation
- explicit Save flushes debounce without duplicate mutation
- Ctrl/Cmd+S same immediate-flush path
- Note switch / app navigation / logout flush and deferred-transition behavior
- invalid draft remains protected
- revision conflict pauses autosave and preserves draft
- infrastructure ambiguity preserves exact request and existing barrier
- browser unload guard for dirty / saving / unresolved states
- full D-090 exact replay / CAS / ambiguity regressions
- full Web / Worker tests and static/deploy gates

Persistent authenticated browser evidence may remain `NOT_VERIFIED` while no valid authenticated session is available; this must not be promoted from local tests.

## Relationship to prior Decisions

- D-091 supersedes D-090 only where D-090 says autosave is not adopted / is a non-goal.
- D-090 Document identity, Markdown source authority, operation identity, revision CAS, ambiguity handling, owner isolation, and APP 0029 remain unchanged.
- D-020 server-authoritative command/retry semantics remain unchanged.
