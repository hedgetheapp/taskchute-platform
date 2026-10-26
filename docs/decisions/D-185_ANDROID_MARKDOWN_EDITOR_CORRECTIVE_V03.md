# D-185 — Android Markdown editor corrective v0.3

Date: 2026-10-26
Status: **Approved; implementation verification in progress**

## Decision

D-185 v0.3 supersedes only the v0.2 presentation rule that an active thematic-break row must remain raw and receive no divider overlay. A toolbar-inserted horizontal rule must immediately appear as one continuous, non-wrapping line across the editor body width, including while the editor is focused, the IME is visible, or the caret/selection is on or beside the rule. It remains one logical display row and must not draw into the line-number gutter.

The source remains ordinary Markdown (`---`). A contextual toolbar action, `区切り線ソースを編集`, explicitly selects and reveals the source row for editing. Returning with `区切り線プレビューに戻る` restores the divider. Toggling either mode does not mutate or persist source text. Existing source/display mapping and D-135 behavior on other active rows remain unchanged.

Toolbar insertion adds only the paragraph boundary needed to prevent a new hyphen rule from becoming a Setext underline. Inserting at a paragraph boundary before a nonempty prose row produces a blank separator before `---`; the prior paragraph and its text remain unchanged. Existing `Title\n---` is still classified as a Setext heading candidate. Invoking the toolbar while on that underline inserts a separate thematic-break row after the existing title/underline pair; it does not reclassify or rewrite the old pair. Empty notes, existing blank rows, source ending, LF/CRLF style, selection direction and offset mapping are covered by the command tests.

No source schema, persistence/autosave/CAS behavior, dependency, Web/Wear/API/Worker/database, production, or release change is authorized by this correction.

## Verification boundary

Focused JVM command/transformation tests, API 33 Compose pixel-layout tests, the Notes instrumentation surface, and exact-SHA CI/signed Phone artifact verification are required. Daily and Task Note shared-editor focused smoke is required where applicable. Synthetic Compose IME/insets are not evidence of a physical OS keyboard. Keep Product Verified **NO** until the owner checks the intended device; Galaxy S23 evidence must be reported separately.

## Implementation verification record

Pending implementation commit and exact-SHA CI closeout. Do not mark this decision verified based only on local emulator evidence.
