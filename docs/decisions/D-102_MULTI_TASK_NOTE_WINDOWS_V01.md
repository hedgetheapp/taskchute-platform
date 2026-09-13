# D-102 — Multi-Task Note Windows v0.1

Status: **Approved**

## Decision

Today may host multiple floating Task Note windows in one authenticated
browser tab. There is at most one window for each stable Task Primary
Document identity; opening the same Task again activates and restores its
existing window instead of creating another editor or Document.

On desktop, each window keeps its geometry, minimized/maximized presentation,
dirty/unresolved state, and flush barrier independently in memory. New windows
are seeded from the existing browser-local Task Note geometry preference with a
deterministic visible cascade. Window stacking is also in-memory and follows
the last activated Note. A pointer inside a sibling Note is not an outside
click; a pointer outside the Note group minimizes only the frontmost expanded
Note and does not stop the underlying interaction.

The active window remains addressable by the existing canonical
`/?view=note&document=<document-id>` permalink. Reload restores at most the
routed window, and the existing user-selected new-tab mode remains unchanged.
Mobile retains a single full-sheet Task Note presentation. Hit-a-Hint remains
a single application overlay and treats any expanded Task Note as the local
keyboard owner.

## Boundary

This is a Web-only presentation and interaction decision. It does not add
Document, Task, Project, Routine, API, Worker, database, migration, dependency,
offline, multi-tab, or persistence semantics. Existing save, autosave, CAS,
ambiguity, retry, navigation, logout, and unload barriers apply independently
to every open Task Note window. Note content and open-window state are not
persisted in localStorage.

## Evidence

Implementation and verification evidence are recorded in `docs/CURRENT.md`
and `docs/TEST_MATRIX.md`.
