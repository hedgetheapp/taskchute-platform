# D-187 — Web Notes Android parity, Phase 1 — 2026-10-26

## Status and scope

**Status: Phase 1 is integrated on `main` at `5c18362c622c29055892fc84301b35b50d17e37d`; reviewed Phase 2 is integrated on `main` at `08a22d02d9aca4c354829389f8fa7afe6792b92e`, with exact-SHA CI run [40877129014](https://github.com/hedgetheapp/taskchute-platform/actions/runs/40877129014) PASS. Product Verified NO; Production NOT_RUN; Released NO.** This record captures the Phase 1 delivery and the later reviewed Phase 2 integration. It does not declare complete Web/Android parity or approve Phase 3.

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
- At the initial D-187 Phase 1 integration, no nonprod deployment or browser-based product QA had been performed because the change added no server/API behavior. The D187A follow-up below records the later authorized nonprod deployment and its incomplete native-browser acceptance. JSDOM tests do not establish native browser undo/redo history, real keyboard navigation in a narrow floating window, or visual behavior across browsers.

## Phase 2 recommendation — inline Markdown display while editing

The existing `textarea` remains the source authority. It cannot independently style inactive source rows as rendered Markdown, so first evaluate a small dependency-free mirror/overlay prototype before adopting a rich-text framework. A mirror may retain native text input, but line wrapping, font metrics, scrolling, selection-to-rendered-position mapping, Japanese IME, and tap-versus-scroll behavior need a focused feasibility check. Render Markdown through escaped text/DOM nodes and a narrow allow-list for HTTP(S) and D-186 internal routes; do not render untrusted raw HTML. Checkbox interaction and link clicks must use existing authorization and save/CAS paths.

If a mirror cannot meet those constraints, compare a long-term editor dependency's bundle/runtime cost, source mapping, undo behavior, IME support, and migration burden. **Do not add CodeMirror, ProseMirror, or another long-term dependency without a separate Product Owner decision.** A separate preview pane would not satisfy the requested inline-editing parity.

## Phase 2 implementation status — 2026-10-29

The reviewed F-01–F-06 implementation, including inactive preview during IME composition and geometry optimization, was integrated unchanged at `08a22d02d9aca4c354829389f8fa7afe6792b92e`. A dependency-free Markdown preview helper and mirror render inline while the existing `textarea` remains the source authority. Rendering stays within the reviewed escaped-text and narrow element/link allow-list; no raw-HTML renderer or new dependency was introduced. `package-lock.json`, Worker/API, schema/migration, Android, and Wear sources were unchanged.

The accepted local Web STANDARD evidence is **16 / 16 files and 533 / 533 tests PASS**, with typecheck, normal Web build, and `git diff --check` PASS. Focused editor/NotesBoard evidence is **71 / 71 PASS**. Exact-SHA [CI run `40877129014`](https://github.com/hedgetheapp/taskchute-platform/actions/runs/40877129014) passed changed-surface classification, typecheck, Web tests, Worker/D1 tests, and production build; Android verification was skipped by source classification. This automation evidence does not establish Product Verified.

The user reported a Windows Edge pass only for the controlled synthetic delayed-parent-echo sequence B→C→old B→latest C. Persistent authenticated nonprod browser acceptance remains **NOT_RUN**; no nonprod deployment, QA credential setup, or database mutation occurred. Product Verified **NO**; Production **NOT_RUN**; Released **NO**. The prior 532 / 533 Hit-a-Hint failure remains an unattributed intermittent risk: later isolated case, app-file, and clean-baseline checks passed, as did the final Web STANDARD run; this integration does not claim to repair it. Local Wrangler debug-log `EPERM` and Vite >500 kB chunk-size warnings were nonfatal. The existing `npm audit` set of 13 advisories (1 critical, 9 high) remains unresolved; no security conclusion or remediation is claimed.

## Phase 3 recommendation — caret and Notes list parity

Evaluate browser-local caret restore keyed by stable Document ID, plus the Web Notes list's create/update timestamps, rename, archive/restore, delete, and selection-mode differences. Preserve Web's keyboard/multi-window strengths; Android-only swipe and movable-FAB behavior need not be copied. Keep bulk Document mutation out of scope unless separately approved. Destructive operations, cross-tab writer behavior, and per-document local storage isolation need dedicated decisions and tests before implementation.

## Remaining questions

- Which Android Notes behaviors beyond the explicit Phase 1 contract define parity for Web?
- Which Markdown element/route allow-lists and checkbox persistence semantics are required for Phase 2?
- Which Notes list actions and multi-select operations are needed on desktop for Phase 3?

These are open for later Product Owner review; this document does not resolve them.

## D187A — nonprod rollout and browser closeout — 2026-10-26

The D187A contract authorized deploying current `main` to the existing nonprod Worker and recording focused browser acceptance. Immediately before deploy, GitHub `main`, local `origin/main`, and the detached worktree all matched `130bdb80b65aff0b7840c7cc80276eb92d534eee`. No Worker, API, schema, migration, or dependency source differed from the D186D deployed Worker baseline.

Gate A PASS: a fresh APP/AUTH export pair and manifest were retained in an ACL-protected operator-private directory. The exports were loaded into isolated in-memory SQLite databases; both passed `quick_check=ok` with zero foreign-key violations. APP-to-AUTH owner mapping was consistent. The D-182 baseline remained one orphan chain with one Completed Entry and one Completed Execution, zero active Executions, zero affected Quick pairs, and zero tombstones. The D-182 strict Gate 4 isolation status remains **NOT_VERIFIED**. No restore, remote migration, or database write was performed.

Local typecheck passed. The four affected Web files passed **83 / 83**; an initial run failed before test discovery due to `EPERM` renaming a sandbox temporary cache, and the rerun using an ignored workspace temp directory passed. The nonprod build completed with client bundle `740.36 kB` (`199.10 kB` gzip), producing the existing Vite >500 kB advisory. Wrangler also reported the known FCM secret name missing from the local process environment; the configured remote secret binding was present, and no secret value was read. `npm run verify:nonprod-deploy` passed after `CLOUDFLARE_ENV` was unset.

`npm run deploy:nonprod` published Worker version `3ef903aa-fa2e-47d9-b792-72940d4669ca` at 100% traffic on `taskchute-web-nonprod`. Canonical APP/AUTH resource IDs, `REALTIME_HUB`, `RUNTIME_ENV=nonprod`, `BOOTSTRAP_ENABLED=false`, and secret binding names matched. APP and AUTH migrations both reported no pending migrations; none were applied. Read-only HTTP checks returned root `200`, the deployed JavaScript asset `200` with a SHA-256 match to the local build, and unauthenticated document search `401`.

Native browser acceptance is **NOT_RUN / AUTH_FIXTURE_UNAVAILABLE** because no approved isolated QA authentication was available. No browser login, Note write, D-178 fixture access, D-182 orphan probe, QA session creation, or sign-out/revocation occurred. The requested four-surface toolbar, caret/selection, native undo/redo, real Japanese OS IME, save/CAS conflict and retry, and unresolved-marker route guard therefore remain **NOT_VERIFIED**. Existing unresolved D186B/D sessions were not touched. Product Verified **NO**; Production **NOT_RUN**; Released **NO**. Phase 2 and Phase 3 remain outside this authorization.
