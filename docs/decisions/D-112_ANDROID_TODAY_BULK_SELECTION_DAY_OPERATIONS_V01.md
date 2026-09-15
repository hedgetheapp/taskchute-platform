# D-112 — Android Today Bulk Selection + Day Operations v0.1

Status: **Approved**

## Decision

D-112 extends the Android Today surface with always-visible selection controls for
ordinary planned Entries on the current established Day. A restrained bottom action
bar provides canonical bulk move-to-day and bulk-delete operations. The same existing
canonical commands are reused for row-level previous/next/date move and delete
actions; no Android-local placement or day persistence rule is introduced.

Eligible row overflow actions include the existing D-109/D-110 `編集` and `複製`,
the D-101 `ノート` affordance, and the approved day operations. Non-current days,
unestablished past targets, running/completed Entries, and Routine-derived Entries
remain protected according to the existing server contracts. A past destination is
checked for an established TaskChuteDay before any mutation; an unestablished past
day is never created by this UI.

Today keeps pull-to-refresh semantics through the existing canonical reload path,
and eligible drag interaction remains short-hold, finger-following, and previewed.
Existing empty Section and empty `Sectionなし` targets continue to use the canonical
single-Entry `MoveEntry` with no relative placement.

## Boundary

D-020 operation/retry/atomicity, D-039/D-043 placement and planned-start
synchronization, D-050 duplicate semantics, D-066 pending placement safety,
D-090/D-101 Document semantics, D-104 auth/session handling, and D-108 invalidate-only
realtime remain authoritative. Android uses `BulkMoveEntriesToDay`,
`BulkDeleteEntries`, `MoveEntry`, `ReorderEntries`, and `DuplicateEntry` as already
implemented.

The existing API has no one-operation multi-Entry relative-placement command. To
avoid partial success and invented placement semantics, multi-selected drag-and-drop
is not enabled by this implementation; multi-selection is limited to the approved
bulk day move/delete bar. Single-Entry D&D remains available under D-110 eligibility.

D-112 adds no Worker/API semantic change, schema or migration, dependency, realtime
protocol, offline storage, production operation, or new lifecycle semantics.
