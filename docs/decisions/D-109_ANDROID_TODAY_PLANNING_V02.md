# D-109 — Android Today Planning v0.2

Status: **Approved**

## Decision

D-109 extends the existing Android Today surface for current-Day planning of
ordinary planned Tasks. The Android client reuses the existing server-canonical
HTTP commands and does not introduce an Android domain authority, offline
queue, background architecture, or schema change.

Today is presented as a restrained Material 3 planning surface. The shell
shows date navigation directly, without a TaskChute/Today header, manual reload
button, or logout action. Settings is an implemented bottom-navigation
destination with the existing D-106 logout behavior. Project and Notes remain
unimplemented destinations and must not navigate to fake screens.

The current established Day exposes a minimal Quick Add action. It opens a
bottom-sheet form for Task title, Project, Mode, Section, planned start, and
estimate. An ordinary planned current-Day Task row opens the same form for
editing. Running, completed, routine-derived, future, and past Entries remain
read-only for this slice.

The form composes existing `AddTaskToDay`, `UpdateTaskMetadata`,
`SetEntryMode`, `SetEntryEstimate`, and `SetEntryPlannedStart` commands with
explicit pending, retry/error, and final canonical Today refetch behavior.
Each command retains its existing operation, CAS, auth, and server semantics;
no new atomic server command is added. A pending form submission cannot be
duplicated, and realtime invalidation is deferred until the existing safe
mutation boundary.

## Boundary

D-107 execution, D-108 foreground invalidate-only realtime, D-106 auth/session
handling, D-041/D-042 current/future/past Day rules, and existing Worker API
contracts remain authoritative. This Decision adds no Routine editing, offline
storage, background socket, FCM, notification, widget, migration, dependency,
production deployment, or new persisted semantics.
