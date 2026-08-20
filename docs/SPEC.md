# Specification

This document only defines the approved bootstrap-level behavior. API endpoint names, DB schema, auth, and conflict algorithms remain open unless explicitly decided.

## User model

- One user initially
- Multiple devices/clients
- Device identity and sync safety are required
- Registration, teams, organization, and billing are out of initial scope

## Core identity

Preserve the legacy lesson that Task definition identity and board placement/execution identity are separate concepts.

- Task identity must be stable.
- Entry identity must be stable.
- Mutable titles must not be identity.
- One Task may appear as multiple Entries.
- Ambiguous identity must not silently mutate a guessed target.
- Exact ID formats remain undecided.

## Notes/Documents

- TaskChute owns Documents.
- Document body is Markdown-native.
- Documents need stable identity.
- Revision/version semantics must remain possible.
- Android must eventually read/edit them.
- Future Obsidian projection should preserve Markdown semantics as faithfully as practical.

## Comments

- Comments should support Markdown.
- Comments should support images.
- Notes and Comments should use one shared Attachment model.

## Images / Attachments

Required capabilities:

- stable attachment identity
- metadata
- reference/ownership relation
- deletion/orphan-cleanup strategy
- Android upload
- future Obsidian file projection

Binary-storage provider is not yet final. Cloudflare R2 is a leading candidate.

## First vertical slice

1. Create one Project on Server.
2. Create three Tasks.
3. Place them in explicit Today-board order.
4. Android displays all three.
5. Android starts one Task.
6. Server records running state.
7. Android completes it.
8. Next Task is available.
9. Widget displays running/next.
10. Restart restores correct state.
