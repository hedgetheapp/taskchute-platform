# AGENTS.md

## Canonical docs

- `docs/CURRENT.md`
- `docs/PRODUCT.md`
- `docs/FEATURES.md`
- `docs/SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/RISKS.md`
- `docs/OPEN_QUESTIONS.md`
- `docs/COST.md`
- `docs/TEST_MATRIX.md`
- `docs/MIGRATION_FROM_OBSIDIAN.md`
- `docs/DEVELOPMENT_WORKFLOW.md`

## Legacy reference

Legacy repo: `hedgetheapp/taskchute-obsidian-mvp`.

The legacy repo is a reference source for current Obsidian behavior, migration data, and regression knowledge. It is not the source of truth for this new platform.

When reusing legacy assets, distinguish:

- `Referenced`: behavior/knowledge only
- `Adapted`: redesigned for the new architecture
- `Ported`: directly moved after compatibility review

Do not wholesale-copy the legacy monolithic `main.js`.

## Architecture guard

- Target architecture is server-centric.
- Android is a first-class client.
- Obsidian is optional, not a mandatory runtime.
- Notes/Documents remain Markdown-native.
- Initial scope is single-user, multi-device.
- Initial infrastructure should stay within free tiers when practical.
- Do not silently decide identity, sync, migration, destructive changes, API shape, schema, auth, or conflict semantics.
- Binary images should not default to relational-DB storage.

## Decision workflow

Preserve cause and effect: `A adopted -> B becomes possible -> C becomes a risk`.

Update the relevant canonical docs together: Decisions, Risks, Open Questions, Architecture/Spec, Current, and Test Matrix.
