# D-169 — Android Today Task Note Presence Indicator v0.1

Status: **Approved / Not implemented**

Date: 2026-10-04

## Context

Android Today Task rows already show a Routine metadata icon in the third line. The Routine icon is always present and uses the accent blue treatment when the row is Routine-derived, otherwise the secondary/gray treatment.

The Product Owner requested an equivalent Note-presence indicator so it is immediately visible whether the Task already has a Task Primary Note.

Current canonical data already exposes nullable `primary_document_id` in the Day/Today projection. D-101 defines at most one owner-scoped Task Primary Document relation per Task, and the Day projection intentionally carries only the nullable relation identity rather than Markdown body content.

## Decision

### 1. Add Note metadata icon to Android Today Task row

Android Today Task row third-line metadata becomes:

`Routine icon → Note icon → Project / Mode context`

The existing Routine icon remains unchanged.

### 2. Note presence state

The Note icon is always rendered as part of the Task-row metadata strip.

Color semantics:

- `primaryDocumentId != null` → Note icon uses the same canonical accent blue treatment as the active Routine icon;
- `primaryDocumentId == null` → Note icon uses the same secondary/gray treatment as the inactive Routine icon.

The indicator represents **Task Primary Note relation existence**, not body non-emptiness.

An existing Task Primary Document with an empty Markdown body still counts as "Note exists" and therefore renders blue.

### 3. Canonical authority

Use the canonical Today projection's `primary_document_id` / Android `primaryDocumentId` as the authority.

Do not fetch Document body content just to determine icon color.

Do not infer Note existence from:

- cached NotesController state;
- Task title;
- local editor state;
- body text;
- whether the user has opened the Note in the current app session.

### 4. Icon

Use the existing Material Symbols vocabulary already used by Android TaskChute. Prefer the existing `description` / Note-compatible Material symbol so the row indicator is visually consistent with the Notes surface/footer.

Exact drawable reuse/import is an implementation detail as long as it uses the official Material Symbols Rounded style already adopted by the app.

The icon should match the Routine metadata icon's visual scale and spacing rather than introducing a larger action-style control.

### 5. Presentation only, no new tap affordance

The Note indicator is informational only in D-169.

It does not become a new click/tap target.

Existing Note access remains authoritative:

- Task-row left-swipe Note action under D-110 / D-123 / D-124;
- existing Today Task Primary Note sheet/editor behavior.

A future direct-tap Note icon affordance would require a separate Product Decision.

### 6. Lifecycle / Routine / date coverage

The indicator follows the visible Task row wherever Today already displays that row and its `primaryDocumentId`.

It does not grant new Note editing or planning eligibility.

Running, Completed, Routine-derived, future, or past rows keep their existing command boundaries. The icon only reflects whether a Task Primary Note relation exists.

### 7. Realtime / refresh behavior

Because Note existence is projected through canonical Today data, normal canonical Day reload/reconciliation controls the indicator.

If another surface creates/ensures the Task Primary Note and the Day projection is later refreshed, the icon becomes blue.

D-169 does not add a new realtime protocol or synchronization mechanism.

Existing D-152 document invalidation behavior remains unchanged.

### 8. Scope

D-169 is Android Today presentation only.

It does not change:

- Task Primary Note persistence;
- Document body/title semantics;
- Ensure/Update API behavior;
- Note autosave/CAS;
- Worker/API contracts;
- schema/migrations;
- Web Today;
- Wear Today;
- production/release state.

## Verification target

Future implementation should verify at minimum:

1. Task row without `primaryDocumentId` renders gray Note icon.
2. Task row with `primaryDocumentId` renders blue Note icon.
3. empty-body existing Task Primary Note still renders blue.
4. Routine + Note both present → both icons blue.
5. non-Routine + no Note → both icons gray.
6. Project / Mode text still ellipsizes correctly with the additional icon.
7. Running / Completed / Routine-derived row presentation remains otherwise unchanged.
8. Note icon itself is not a new clickable action.
9. existing Task-row left-swipe Note action still works.
10. no Document body fetch is introduced into Today rendering.

Until implemented and tested, this remains **Approved / Not implemented / Not verified**.
