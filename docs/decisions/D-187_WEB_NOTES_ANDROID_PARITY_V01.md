# D-187 — Web Notes Android parity, Phase 1 — 2026-10-26

## Status and scope

**Status: user-requested Phase 1 implemented and integrated on `main` at `5c18362c622c29055892fc84301b35b50d17e37d`; exact-SHA CI run [40325481506](https://github.com/hedgetheapp/taskchute-platform/actions/runs/40325481506) PASS; Product Verified NO; Production NOT_RUN; Released NO.** This record captures the request to bring Web Notes closer to Android and the Phase 1 delivery in the attached task contract. It does not declare complete Web/Android parity or approve later phases.

The worktree started at `aef6b1df128d36736ea5c922f52188535964ae0f`, matching `origin/main`. The implementation was pushed as two fast-forward commits (`70f586eedd5c7632d44005d0cf93a445b22efe60`, then the focused CI correction `5c18362c622c29055892fc84301b35b50d17e37d`). The task worktree was detached at the expected base; the unrelated E-drive worktree and its local changes were left untouched.

## Phase 1 delivered

The common raw-source `textarea` editor now has an accessible Japanese Markdown toolbar used by Standalone, Task Primary, Project Primary (inline and floating), and Daily Notes. It supports bold, H1–H5, bullets, checklist, quote, external/internal links, horizontal rule, indent/outdent, ordered lists, and line movement. Underline was not added, consistent with D-185. Source transformations retain the existing save pipeline and include caret/selection mapping, direction, LF/CRLF, final-line behavior, and the D-185 Setext/horizontal-rule boundary.

Typing `[[query` or using the toolbar's `[[]]` action opens a debounced, cancellable picker over the existing read-only D-186 search endpoint. The picker handles the four existing document kinds, context/archive labels, cursor pagination, empty/error/401/404 results, IME composition, stale responses, and document-session changes. Selection replaces only the current marker range with a stable D-186 Markdown route; it escapes labels and does not fall back to title-based identity.

An unresolved marker remains in the draft and blocks autosave, explicit save, Ctrl/Cmd+S, and registered safe flush/navigation until the user chooses a candidate or removes the marker. Search remains separate from save errors. Existing CAS, operation identity/retry, authentication, and realtime coordination remain in use. A controlled-value echo race found by exact-SHA CI is fixed in `5c18362` and covered by a delayed-parent-echo test.

No Worker, server API, database/schema/migration, or package dependency changed. The Web API client only gained an optional `AbortSignal` for cancelling the existing search request. Search does not materialize Notes, Days, or Documents.

## Verification and limits

- `npm run typecheck`: PASS.
- Four affected Web test files: **83 / 83 PASS** (`NoteMarkdownEditor`, `NotesBoard`, `TaskNoteEditor`, `DailyNotesBoard`).
- Web production build: PASS; Vite reports the existing client chunk-size advisory (>500 kB).
- `git diff --check`: PASS.
- Exact-SHA CI at `5c18362`: [run 40325481506](https://github.com/hedgetheapp/taskchute-platform/actions/runs/40325481506) PASS. The repository's push workflow ran changed-surface classification, typecheck, all Web tests, Worker/D1 tests, and production build; Android verification was skipped. The first implementation run `40324793062` exposed the Daily editor's delayed parent-source echo race and failed; the fix was pushed and the final run passed.
- No nonprod deployment or browser-based product QA was needed or performed because this change adds no server/API behavior. Product Verified remains **NO**. JSDOM tests do not establish native browser undo/redo history, real keyboard navigation in a narrow floating window, or visual behavior across browsers; these remain NOT_VERIFIED.

## Phase 2 recommendation — inline Markdown display while editing

The existing `textarea` remains the source authority. It cannot independently style inactive source rows as rendered Markdown, so first evaluate a small dependency-free mirror/overlay prototype before adopting a rich-text framework. A mirror may retain native text input, but line wrapping, font metrics, scrolling, selection-to-rendered-position mapping, Japanese IME, and tap-versus-scroll behavior need a focused feasibility check. Render Markdown through escaped text/DOM nodes and a narrow allow-list for HTTP(S) and D-186 internal routes; do not render untrusted raw HTML. Checkbox interaction and link clicks must use existing authorization and save/CAS paths.

If a mirror cannot meet those constraints, compare a long-term editor dependency's bundle/runtime cost, source mapping, undo behavior, IME support, and migration burden. **Do not add CodeMirror, ProseMirror, or another long-term dependency without a separate Product Owner decision.** A separate preview pane would not satisfy the requested inline-editing parity.

## Phase 3 recommendation — caret and Notes list parity

Evaluate browser-local caret restore keyed by stable Document ID, plus the Web Notes list's create/update timestamps, rename, archive/restore, delete, and selection-mode differences. Preserve Web's keyboard/multi-window strengths; Android-only swipe and movable-FAB behavior need not be copied. Keep bulk Document mutation out of scope unless separately approved. Destructive operations, cross-tab writer behavior, and per-document local storage isolation need dedicated decisions and tests before implementation.

## Remaining questions

- Which Android Notes behaviors beyond the explicit Phase 1 contract define parity for Web?
- Which Markdown element/route allow-lists and checkbox persistence semantics are required for Phase 2?
- Which Notes list actions and multi-select operations are needed on desktop for Phase 3?

These are open for later Product Owner review; this document does not resolve them.
