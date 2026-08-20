# Current

Date: 2026-08-20

## Status

Architecture / Bootstrap. Runtime code has not started.

## Approved direction

- Rebuild TaskChute as an independent platform.
- Target canonical authority is TaskChute Server.
- Android dedicated app is a first-class client.
- Android Home Screen Widget is part of the Android client architecture.
- TaskChute owns its own Notes/Documents capability.
- Notes/Documents remain Markdown-native.
- Initial user model is one user across multiple devices/clients.
- The legacy Obsidian repository remains available for current use, migration, behavior reference, and regression knowledge.

## Important distinction

This describes the target architecture of the new platform. It does not retroactively change the legacy Obsidian implementation, where Vault Markdown remains the current implementation authority.

## Next

1. Review/approve this canonical-doc baseline.
2. Design the core domain model.
3. Decide storage/API technologies.
4. Define the first vertical-slice contract.
5. Implement server core.
6. Implement minimal Android client.
7. Implement Android Widget.
