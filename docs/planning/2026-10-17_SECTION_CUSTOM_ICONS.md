# User-configurable Section icon — product design note

**Recorded:** 2026-10-17  
**Status:** Product Owner chose **A: Material icons (2026-10-17)**. Icon family **AGREED** / remaining persistence and UX Material decisions **OPEN** / implementation **NOT_STARTED**.
**Investigation baseline:** GitHub `main` `b56d32b4b6d4b6e4b70509c0338844a556a51b41`.

## Request and context

Allow a user to set an icon per Section. Align with the Android Today two-line Section header proposal at [2026-10-17_ANDROID_SECTION_HEADER_PROGRESS.md](2026-10-17_ANDROID_SECTION_HEADER_PROGRESS.md), preserving its first-line `HH:mm - HH:mm` range, Section title and second-line progress/remaining workload metrics.

## Existing canonical boundary and implementation findings

- `docs/DESIGN.md` already sketches an `Icon` column as a future Section-settings target capability, but explicitly says not to invent a fake control before it is implemented. It sets **Material Symbols / Material Symbols Rounded** as the first-party cross-platform icon preference.
- `docs/OPEN_QUESTIONS.md` explicitly leaves **Section icon/accent persistence and future schema evolution** open.
- `docs/decisions/D-114_ANDROID_SETTINGS_MANAGEMENT_V01.md` approves Android Section create/rename/boundary/delete, not custom icon persistence.
- `apps/android/app/src/main/java/com/hedgetheapp/taskchute/settings/SettingsModels.kt` `AndroidSectionSetting` currently has id/title/start/end only. `apps/web/src/shared/contracts.ts` `SectionConfigurationItemProjection` currently has section_id/title/logical_start_minute/logical_end_minute only. Icon storage and API semantics do **not** currently exist.
- `docs/decisions/D-131_CURRENT_AND_FUTURE_SECTION_CONFIGURATION_RECONCILIATION_V01.md` approves latest Section configuration for the current established Day and established future Days, preserves past-day historical contexts, and does not establish unestablished future Days. Any icon persistence/propagation design must explicitly reconcile with these rules and preserved stable Section identity.

## Proposed UX for Product Owner review (not Approved)

1. Configure from **Android Settings → セクション設定 → create/edit Section**, via a selectable icon picker and a `なし` choice to remove/clear the icon.
2. Initial visual: place an optional 16–20dp icon **immediately before the Section name**, **after** the `09:00 - 12:00` range and Section collapse/expand chevron. Do not replace the expand/collapse chevron. Keep second line containing progress bar, completion icon/count and hourglass/remaining workload unchanged.
3. Default and legacy Section items: no custom icon until the user explicitly picks one, unless separately approved. Do not infer automatically from Section title or apply a default emoji.
4. **Product Owner decision (2026-10-17): A — Material icons only.** Use selectable **Material Symbols Rounded**, consistent with the existing first-party cross-platform visual system. Emoji, mixed emoji+Material, and arbitrary uploaded images are not included in this choice. A curated/searchable subset is a UI proposal; the exact supported catalog/picker UX remains to be designed.
5. Section-icon customization is **Section-level**, not Task/Entry/Routine-occurrence-level, and should sync through server-canonical configuration if approved, not device-only preferences. Persistence model, schema/migration, stored value validation, retry/compatibility are **not yet approved**.
6. Proposed history handling: existing past-Day frozen context should retain the effective historical icon when feasible; current and established future Days see the new icon according to D-131. Confirm with Product Owner before authorizing data model changes; an icon change must not mutate Task placement, Execution facts, or Section intervals.
7. Android Today is the initial visible UI context; Web and Wear icon display parity is not yet approved. Settings and Today should remain safe for older clients and existing icon-less rows. No new dependency or asset download service assumed.

## Material decisions and questions

- **Resolved (Product Owner 2026-10-17):** icon type A, **Material Symbols Rounded**; no emoji or both-mode. **Still open:** whether a `なし` option is explicitly required (recommended yes), and the specific catalog/search UX.
- **Scope:** globally owned Section settings vs date-specific override (recommended global Section definition, not per-Day).
- **Persistence/history:** server-canonical icon persisted in Section config with historical frozen-day presentation vs showing latest icon on every Day. D-131 strongly motivates considering frozen history; no decision made.
- **Color:** use existing subdued/secondary color or also allow per-Section accent customization? Section accent is already an independent open capability; do not bundle it silently.
- **UI parity:** Android-only rendering first vs immediate Web/Wear.
- A required schema migration/API/compatibility design is a new Material Decision. **STOP** for explicit user approval before implementing it.

## Status and future verification

This document is a *planning note recording the Product Owner's Material-icon family choice*, **not a canonical Approved Decision for the still-open storage/behavior details** or a Codex Task Contract. No code, schema, migration, rollout, user data or app behavior has been changed. When work resumes, inspect current branch/HEAD and canonical docs, draft an Approved Decision covering persistent semantics, then prepare a separate Codex `.md` Task Contract with narrowly targeted tests and Android APK delivery.
