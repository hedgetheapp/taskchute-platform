# D-186 — Cross-Note Internal Markdown Links v0.1

Date: 2026-10-26
Status: **Approved / implemented and integrated at `ae052751df8ff504e32f5072381a605dfe127f3f` / exact-SHA CI PASS / signed Phone APK artifact `12633393446` / Product Verified NO / Released NO**

## Decision

From an editable Standalone Note, Task Primary Note, Project Primary Note, or Daily Note, a user may create and follow a link to an existing, materialized Note of any of those four kinds. The persisted source is standard Markdown and uses stable identity for resolution:

- Standalone, Task Primary, and Project Primary: `[visible label](/?view=note&document=<document-id>)`.
- Daily: `[YYYY-MM-DD](/?view=daily&date=YYYY-MM-DD)`.

The Android `[[query` sequence is only a transient candidate-picker trigger. It is never persisted as wiki-link syntax. Dismissing the picker, active IME composition, stale input, or no selection must not rewrite source text. A selected candidate inserts ordinary Markdown without normalizing surrounding source. Visible labels are snapshots at insertion time; note identity is the stable Document ID and Daily identity is the logical date. Renames do not change target resolution, and title-based fallback is prohibited. Existing external HTTP(S) link behavior remains available.

Candidate search is read-only, authenticated, owner-scoped, bounded, and paginated. It returns at most 20 candidates and minimal metadata only; each request scans at most 101 Document metadata rows using existing ordering and tie-breakers. The cursor is bound to the normalized query and active/archive phase. Candidate metadata comes only from the owner's existing Standalone, Task Primary, Project Primary, and materialized Daily records. Task/Project Primary Documents are not ensured by search. Daily candidates require an established Day and an already-materialized Daily Document. Markdown body text and other owners' data are never returned. Active candidates precede archived Standalone and archived Project candidates, which are visibly labeled `アーカイブ済み`; existing archive semantics do not change.

Web supports the exact authenticated `/?view=daily&date=YYYY-MM-DD` route. Route resolution reads only the owner's established Day and existing Daily Document; it does not ensure or create either. Invalid, missing, unestablished, or unmaterialized targets show an unavailable state. Existing note permalink resolution remains exact and owner-scoped.

Android resolves only exact allow-listed internal note and Daily routes inside the app. Missing, deleted, cross-owner, malformed, and unsupported destinations never fall back to another Note. Note/Daily source drafts are safely flushed before navigation; conflict, ambiguous, failed, or unresolved writes block the transition. A bounded per-session back stack returns to the exact source Document or Daily date; caret restoration uses the existing D-172 identity-based behavior. Link browsing does not itself mutate Note content or open a duplicate writer.

## Boundaries

- No Wiki-link parsing, persisted `[[...]]` syntax, backlinks, link index, graph, general body search, rename rewrites, rich-text format, or broad HTML renderer is introduced.
- Search does not create Notes, Task/Project Primary relations, Day records, or Daily Documents.
- No schema/index migration, third-party dependency, new service, offline index, production operation, release, or broader archive/access change is authorized.
- Malformed or arbitrary routes, `javascript:`, `file:`, scheme-relative URLs, and hostile HTTPS values are not recognized as internal routes. Only the pre-existing external HTTP(S) handler may receive external URLs.
- D-090, D-101, D-103, D-135, D-136, D-137, and D-172 remain authoritative for their existing Document, editing, Daily, link-selection, and caret semantics. D-186 adds only the cross-Note link behavior above.

## Verification record

Implementation commit [`ae052751df8ff504e32f5072381a605dfe127f3f`](https://github.com/hedgetheapp/taskchute-platform/commit/ae052751df8ff504e32f5072381a605dfe127f3f) was fast-forward pushed to `main` from verified base `985b6c7ede6645746b0a45a43b73a8d8df5ac859`. Exact-SHA [Actions run `40284877373`](https://github.com/hedgetheapp/taskchute-platform/actions/runs/40284877373) passed changed-surface classification, Web typecheck/tests, Worker/D1 tests, production build, Android JVM tests, signed Phone/Wear builds, AndroidTest APK compilation, signer verification, and artifact upload. Phone artifact `12633393446`, `taskchute-android-debug-ae052751df8ff504e32f5072381a605dfe127f3f`, expires `2026-11-02T07:20:08Z`. GitHub artifact ZIP SHA-256 `F791353BBC5412B61C47D55EBFAB595BC1C1C9CE8634E1CA03983C641D9D7B76` matched the downloaded ZIP. The APK SHA-256 is `AF8E9FAFD1F5192E54CFEC134DA8B88D99E24327B9CB75E748944B5C065C9253`; actual package metadata is `com.hedgetheapp.taskchute`, versionCode `1310`, versionName `0.1`; `apksigner` verified the stable nonprod certificate SHA-256 `690c0ba4ec3c8c92c84883f54ba343ff37ac0b83cedcaeb626777885e8b602b3`.

Local verification is recorded in `docs/TEST_MATRIX.md`: focused Web `315 / 315`, Android JVM `91 / 91`, full Notes API 33 `41 / 41`, the focused Notes-link and Daily-date API 33 routes, Web typecheck/build, and AndroidTest compile/debug assemble passed. The local Worker/D1 runtime failed before test discovery because it could not load `cloudflare:test-internal`; exact-SHA CI Worker/D1 tests passed. A disposable local SQLite query-plan check used the existing owner-ordered index, and no schema/index migration was needed. No remote deploy, remote database mutation, or production operation was performed. Product Verified remains **NO** pending the Product Owner's manual device review; Galaxy S23 verification is **NOT_RUN**. Production remains **NOT_RUN**; Released remains **NO**.
