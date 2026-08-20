# Decisions

Statuses: Approved / Proposed / Superseded

## D-001 — Independent TaskChute Platform
Status: Approved

TaskChute evolves from an Obsidian-plugin-only product into an independent platform.

## D-002 — Server-centric target authority
Status: Approved

The new platform targets TaskChute Server as canonical authority for structured TaskChute state.

This does not rewrite the current authority of the legacy Obsidian implementation.

## D-003 — Android is a first-class client
Status: Approved

Build a dedicated Android app as a major client. Widget reuses Android client architecture.

## D-004 — Obsidian becomes optional
Status: Approved

Obsidian is not required runtime. It remains a future synchronized client/integration.

## D-005 — Single-user first
Status: Approved

Initial product assumes one user across multiple devices. Multi-user/team/org/billing complexity is excluded from initial scope.

## D-006 — Markdown-native documents
Status: Approved

TaskChute owns Notes/Documents while keeping Markdown-native content semantics.

## D-007 — Shared attachment capability
Status: Approved

Project Notes, Task Notes, and Comments share one Attachment capability for images/files.

## D-008 — Split binary object storage
Status: Proposed

Structured data, Markdown, and attachment metadata should be separated from binary image/file storage. D1 + R2 is a leading candidate, not yet final.

## D-009 — Legacy reuse by semantics first
Status: Approved

Use the legacy repository primarily for domain semantics, data migration, and regression knowledge. Do not wholesale-copy the legacy codebase.
