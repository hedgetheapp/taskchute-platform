# D-110 — Android Today Direct Manipulation + Notes v0.3

Status: **Approved**

## Decision

D-110 extends the Android Today surface with the already approved direct
manipulation and native Notes capabilities while keeping the Server/API as the
canonical authority.

- An ordinary planned Task on the current established Day can be long-pressed
  and dragged. Legal same-cohort reorder uses canonical `ReorderEntries` and a
  cross-Section move uses canonical `MoveEntry`. An empty normal Section or
  empty `Sectionなし` target omits relative placement and lets the canonical
  command apply its existing placement synchronization.
- The eligible Task overflow menu exposes canonical `DuplicateEntry` as
  `複製`. The existing D-109 `編集` action and direct-manipulation eligibility
  remain independent.
- Android bottom navigation enables `ノート` with a native single-pane
  standalone Markdown source list/editor. It reuses D-090 owner-scoped
  Document APIs, explicit Save, revision/CAS, memory-only drafts, and dirty
  navigation protection.
- A visible Today row with a valid Task identity may open the D-101 Task
  Primary Note, regardless of its lifecycle or Day, without making that row
  planning-editable. Task title remains the title authority and only the
  shared Document Markdown body is edited.
- Standalone Note editor Back returns to the Notes list. Task Primary Note
  opened from Today returns to Today. Dirty confirmation preserves this origin
  and never autosaves on Back.

## Boundary

D-020 operation/retry/atomicity, D-039/D-043 placement semantics, D-050
duplicate semantics, D-090 Document semantics, D-101 Task Primary Note
semantics, D-104 auth/session handling, and D-108 invalidate-only realtime
remain authoritative. D-110 adds no Worker/API change, schema or migration,
new dependency, realtime protocol, offline persistence, Project/Routine Note
entry point, or production operation. No Android-local placement, duplicate,
or Document authority is introduced.
