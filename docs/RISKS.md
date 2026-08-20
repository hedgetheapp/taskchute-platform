# Risks

## R-001 — Server authority increases sync responsibility
Related: D-002

Offline operation, retry, idempotency, conflicts, and multi-device convergence become platform responsibilities.

Mitigation direction: stable identity, idempotent commands, local cache, explicit conflict handling, and reuse of legacy Bridge test lessons.

## R-002 — Image storage may increase cost/usage
Related: D-007, D-008

Images in Notes/Comments increase storage, operations, and transfer volume.

Mitigation direction: object storage, Android resize/compression, orphan cleanup, attachment metadata, and free-tier monitoring.

## R-003 — Markdown interoperability
Related: D-006

Android editing and Obsidian projection may diverge in Markdown/image behavior.

Mitigation direction: Markdown-native documents, stable document/attachment identity, explicit projection rules, and avoiding proprietary rich-text-only storage.

## R-004 — Rebuilding too much at once

Porting all legacy features immediately may hide architecture mistakes.

Mitigation: keep the first vertical slice deliberately small.

## R-005 — Legacy data migration
Related: D-009

Existing Vault data may contain identity/history that can be lost or collided by a naive import.

Mitigation: dry-run -> validation -> preview -> import -> post-import verification.

## R-006 — Public repository leakage

The new repository is public.

Mitigation: never commit secrets, personal production notes, or real private images.
