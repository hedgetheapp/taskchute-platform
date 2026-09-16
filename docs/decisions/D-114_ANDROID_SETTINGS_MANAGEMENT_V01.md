# D-114 — Android Settings Management v0.1

Status: **Approved**

## Decision

D-114 adds a native Android Settings management surface using the existing
canonical settings contracts and the Material 3 visual direction shown in the
approved Settings concept board.

The Android shell exposes exactly three bottom destinations: `今日`, `ノート`,
and `設定`. Settings is a hub for:

- Section configuration management, including create, rename, boundary edit,
  and delete through the existing full configuration update contract. Deleting
  a Section uses the canonical adjacent-interval absorption semantics.
- Project management, including active/archived views, create, rename,
  archive/restore, server-owned ordering, and hard-delete confirmation through
  the existing Project commands and revision checks.
- Routine management, including create, edit, enable/disable, and canonical
  soft-delete through the existing Routine commands and fields.

All mutations retain the existing owner scope, operation identity, revision/CAS,
retry, conflict, and authentication boundaries. Server timestamps, ordering,
and data authority remain canonical on the Worker/D1 APIs.

## Boundary

This decision adds no Worker/API semantic, APP/AUTH schema or migration,
dependency, realtime protocol, storage, offline, notification, or production
behavior. Android does not add arbitrary Section drag-and-drop, Routine restore,
Routine notifications, or a second persistence model. Existing D-038 Section,
D-064 Routine, D-065 Project, D-104 auth, and D-108 realtime semantics remain
authoritative.

The concept board is a visual/interaction reference. Its iconography is
represented with the existing Compose/Material surface without adding a third-
party icon library. Destructive Project and Section operations remain explicitly
confirmed where their canonical semantics require it.

## Evidence boundary

The implementation and verification status are recorded in `docs/CURRENT.md`
and `docs/TEST_MATRIX.md`. Galaxy S23 D-114 smoke remains `PENDING_SMOKE` until
the Product Owner tests a fresh final-main APK. Production and Release remain
outside this decision.
