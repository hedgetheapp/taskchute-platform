# Development Workflow

## Canonical-first

Important product/architecture decisions should be reflected in canonical docs before implementation.

## Decision / Risk / Open Question handling

- Decision: approved behavior/architecture/identity/sync/authority/migration/storage semantics.
- Risk: a concern created or changed by decisions; relate it back to the decision.
- Open Question: undecided item; do not silently promote it into SPEC.

## Implementation flow

1. Read canonical docs.
2. Define scope.
3. Define tests/contracts.
4. Implement.
5. Run static/unit/integration checks.
6. Review expected diff.
7. Commit.
8. PR.
9. Integrate.
10. Device/end-to-end verification.
11. Update TEST_MATRIX.

## Git rules

- Avoid large direct changes on `main`.
- Prefer feature branch + PR.
- Do not mix unrelated changes.
- Destructive migrations require explicit approval.
- Never commit secrets or real personal content.

## Legacy reference

Legacy behavior is a reference, not automatically the new specification. Reconcile any reused behavior against this repository's canonical docs.
