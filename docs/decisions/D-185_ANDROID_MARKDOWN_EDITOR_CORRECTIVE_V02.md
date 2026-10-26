# D-185 — Android Markdown editor corrective v0.2

Date: 2026-10-26
Status: **Approved**
Scope: Android shared Markdown editor only.

## Decision

D-185 amends the Android behavior approved in D-184 while retaining D-135's raw-source authority, presentation-only preview, safe source/display mapping, and D-111 persistence behavior.

### Horizontal rule

An inactive standalone thematic-break source row (`---`, `***`, `___`, including supported spaced forms) remains one logical row in the visual transformation and is drawn as one continuous line across the available editor viewport. The active row remains raw Markdown and receives no divider overlay. Inline/malformed syntax and a hyphen row that can be a Setext heading underline are not classified as a thematic break. Rendering must not insert or normalize persisted source newlines.

### Ordered-list Enter

A single software-keyboard Enter at the end of a valid ordered-list item may insert the next number using the same indentation and `.` or `)` marker. Recognition is based on a single-newline `TextFieldValue` delta with collapsed selections and no active composition. Selected replacements, pasted/multi-line text, composition, external state changes, and ordinary prose do not trigger continuation. Existing rows and later numbering are not rewritten. A checked task item remains byte-for-byte intact. Enter on an empty numbered item removes that item's marker while preserving the newline and following source, allowing the user to leave the list.

### Line move and terminal newline

The D-184 no-op rule for moves that change terminal-newline presence is superseded. On 2026-10-26 the Product Owner explicitly chose: **exchange the adjacent blank logical row too, and allow the resulting terminal-newline state to change.** For example, moving the trailing `b` up in `a\n\nb` produces `a\nb\n`, with all row text retained and the blank row following the moved text. Moving `b` down in `a\nb\n` produces `a\n\nb`. Boundary moves remain no-ops. LF/CRLF source, line text, block order, and selection direction must remain valid.

The root-cause checks distinguish two conditions. At D-184, the terminal-newline guard compared the candidate source against the original and returned the original text/selection when their ending-newline booleans differed; this explains the `a\n\nb` trailing-`b` up-move. After approval removed that guard, the `a\nb\n` trailing blank still selected an extra phantom row because `sourceLines` appended the final empty row twice. D-185 now creates that logical row once. Exact tests cover both directions, terminal ending changes, boundary no-ops, separator-boundary carets, selected blocks/reverse selections, LF, and CRLF.

### Underline withdrawal

Remove the Android underline toolbar action, insertion/toggle command, icon, and special `<u>…</u>` preview recognition. Existing persisted Note source is not migrated, stripped, normalized, or rewritten; old `<u>` markers display literally. Standard Markdown link underline decoration remains. Do not add another underline syntax, generic HTML renderer, or Web preview. This explicitly supersedes only D-184's underline feature; the D-184 implementation record remains historical.

## Verification boundary

Focused JVM and API 33 Compose evidence is required for horizontal-rule layout/mapping, IME list continuation, line-move cases, toolbar removal, and retained link decoration. Notes runtime gate and focused Daily/Task Note checks cover the shared editor. Actual OS IME and Galaxy S23 verification remain separate; automated evidence must not mark Product Verified. No API, Worker, database/schema/migration, Web, third-party dependency, production, or release change is authorized.

## Implementation verification record

- `MarkdownLiveEditorTest`: 49 / 49 PASS, including both line-move root causes and approved terminal-newline behavior, LF/CRLF, selection direction, ordered-list Enter boundaries, literal `<u>` handling, and retained Markdown-link underline.
- API 33 focused Compose: narrow/fontScale 1.3 divider 1 / 1 PASS; input-connection ordered-list Enter 1 / 1 PASS, source `1. テスト\n2. ` and caret at the end.
- `scripts/android-qa.ps1 -Surface Notes`: 39 / 39 PASS; install/activity smoke PASS, instrumentation exit 0, crash log empty. The suite includes toolbar removal/reachability and the Task Note blank-tap toolbar case.
- Focused Daily heading-picker / IME-inset test: 1 / 1 PASS; connected-test XML reports zero failures and errors.
- AndroidTest compilation and Phone debug assemble PASS. Exact-SHA CI and matching signed Phone APK are pending. Actual OS IME NOT_VERIFIED; Galaxy S23 NOT_RUN; Product Verified NO.
