# D-093 — APP 0030 Standalone Note lifecycle migration

Status: Approved

Date: 2026-09-11

## Context

D-091 approves standalone Note autosave and standalone-title uniqueness semantics, including automatic `notitle`, `notitle1`, `notitle2`, ... allocation and no duplicate standalone Note titles within one owner.

D-092 approves standalone Note archive/restore plus confirmation-gated irreversible hard delete, with the ordinary Notes view showing non-archived Notes only and a separate Archive destination for archived Notes.

These semantics require persisted lifecycle state and database-level uniqueness protection that are not present in APP 0029.

The Product Owner approves the required APP migration as APP `0030`.

## Approved migration scope

Expected migration:

`apps/web/migrations/app/0030_standalone_note_lifecycle.sql`

Exact physical filename may vary only if repository migration conventions require it, but migration number `0030` is reserved for this Approved scope.

APP 0030 may add only what is required for D-091 / D-092 standalone Note behavior:

- persisted standalone Note archive state, such as `archived_at` or an equivalent representation;
- database-enforced owner-scoped title uniqueness for `kind = standalone` Documents across both non-archived and archived Notes;
- operation command allow-list/schema compatibility required for archive, restore, and hard delete commands;
- indexes/constraints required to support the above safely.

AUTH_DB migration is not approved or required.

## Existing-data preflight

Before applying a uniqueness constraint, implementation must inspect existing standalone Documents read-only for duplicate titles under the approved equality rule.

The approved equality rule is trimmed exact string equality. Case folding, kana normalization, romaji normalization, locale collation, and new Unicode normalization are not part of D-093.

If duplicate standalone titles already exist in any target DB:

- STOP before applying APP 0030;
- do not delete a row;
- do not automatically rename a row;
- do not reinterpret existing title content;
- return the evidence to the Product Owner.

If no duplicates exist, migration may proceed within the approved development workflow.

## Compatibility

APP 0030 must preserve existing canonical Document rows and all unrelated TaskChute domain data.

It must not rewrite Task / Entry / Execution / Project / Mode / Routine / RoutineOccurrence / effective-day semantics.

Task Primary Document / Project Primary Document / RoutineOccurrence Document naming or lifecycle semantics are not defined by this migration and remain separate future work.

## Verification

Required migration evidence includes:

- fresh migration chain through 0030;
- upgrade from current APP 0029 state to 0030;
- pre-migration duplicate-title check;
- preservation of existing standalone Document identity/title/body/revision/timestamps;
- archive state default for existing Notes is non-archived;
- database uniqueness blocks concurrent duplicate standalone titles for one owner;
- archived Notes continue to reserve their title;
- hard-deleted titles become reusable after deletion;
- operation allow-list remains compatible with all prior command types;
- APP integrity / FK / quick_check;
- AUTH remains unchanged.

Persistent nonprod application is allowed under the standing approved development workflow after backup/recovery validation and the preflight checks above.

Production migration remains NOT APPROVED.

## Relationship to prior Decisions

- D-091 defines autosave and standalone-title naming/uniqueness Product semantics.
- D-092 defines standalone archive/restore/hard-delete Product semantics and UI information architecture.
- D-093 approves the APP 0030 persisted schema/compatibility changes required to implement D-091 / D-092.
- D-093 does not define Task/Project/RoutineOccurrence Document semantics.
