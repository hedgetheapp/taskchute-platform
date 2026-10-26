# D-185 — Android Markdown editor corrective v0.3

Date: 2026-10-26
Status: **Approved; implemented and exact-SHA CI verified; Product Verified NO; Released NO**

## Decision

D-185 v0.3 supersedes only the v0.2 presentation rule that an active thematic-break row must remain raw and receive no divider overlay. A toolbar-inserted horizontal rule must immediately appear as one continuous, non-wrapping line across the editor body width, including while the editor is focused, the IME is visible, or the caret/selection is on or beside the rule. It remains one logical display row and must not draw into the line-number gutter.

The source remains ordinary Markdown (`---`). A contextual toolbar action, `区切り線ソースを編集`, explicitly selects and reveals the source row for editing. Returning with `区切り線プレビューに戻る` restores the divider. Toggling either mode does not mutate or persist source text. Existing source/display mapping and D-135 behavior on other active rows remain unchanged.

Toolbar insertion adds only the paragraph boundary needed to prevent a new hyphen rule from becoming a Setext underline. Inserting at a paragraph boundary before a nonempty prose row produces a blank separator before `---`; the prior paragraph and its text remain unchanged. Existing `Title\n---` is still classified as a Setext heading candidate. Invoking the toolbar while on that underline inserts a separate thematic-break row after the existing title/underline pair; it does not reclassify or rewrite the old pair. Empty notes, existing blank rows, source ending, LF/CRLF style, selection direction and offset mapping are covered by the command tests.

No source schema, persistence/autosave/CAS behavior, dependency, Web/Wear/API/Worker/database, production, or release change is authorized by this correction.

## Verification boundary

Focused JVM command/transformation tests, API 33 Compose pixel-layout tests, the Notes instrumentation surface, and exact-SHA CI/signed Phone artifact verification are required. Daily and Task Note shared-editor focused smoke is required where applicable. Synthetic Compose IME/insets are not evidence of a physical OS keyboard. Keep Product Verified **NO** until the owner checks the intended device; Galaxy S23 evidence must be reported separately.

## Implementation verification record

Implementation/source commit: `e9b012f5ffa9e2bd3b095932e39dd12211ada19e`, fast-forward pushed to existing `main` from base `8baa29f5ce72dd0e7e15e29006b5b0108a8b4f76`.

Local verification: `MarkdownLiveEditorTest` 49 / 49 PASS; `:app:compileDebugAndroidTestKotlin :app:assembleDebug` PASS; API 33 HR focused tests 2 / 2 PASS; `scripts/android-qa.ps1 -Surface Notes` 40 / 40 PASS (instrumentation exit 0, post-test install/activity resolution PASS, no app crash entries); final-source Daily smoke 1 / 1 PASS; final-source Task Note smoke 1 / 1 PASS; `git diff --check` PASS.

Exact-source [GitHub Actions run `40269910487`](https://github.com/hedgetheapp/taskchute-platform/actions/runs/40269910487) completed successfully for changed-surface classification, Android JVM, signed Phone/Wear nonprod builds, instrumentation APK compilation, signer validation and artifact upload. Web/Worker verification was skipped by Android-only classification. Phone artifact ID `12628275712`, name `taskchute-android-debug-e9b012f5ffa9e2bd3b095932e39dd12211ada19e`, expires `2026-11-02T04:39:38Z`. ZIP SHA-256 `1412A092D14A6DF3DBFDABEFCD84EDF9890DAF675584DE2A56B56C388BB78D73`; APK SHA-256 `A01099092B59DFFA643C2BFEFE7F92212AED8E37D224322F63779E629CCC4BA9`; package `com.hedgetheapp.taskchute`; versionCode `1308`; versionName `0.1`; signer certificate SHA-256 `690c0ba4ec3c8c92c84883f54ba343ff37ac0b83cedcaeb626777885e8b602b3`. The ZIP digest matched the Actions artifact digest and the actual APK metadata and signer were inspected.

Synthetic Compose insets and API 33 AVD evidence do not constitute physical OS IME or Galaxy S23 verification. Actual OS IME NOT_VERIFIED / Galaxy S23 NOT_RUN / Product Verified NO / Production NOT_RUN / Released NO.
