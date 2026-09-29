# D-149 — Android Project Primary Notes v0.1

Status: **Approved / Implemented / Integrated**

## Decision

Android NotesのProject Board itemを、Standalone Noteと同じNotes一覧に表示し、Project単位のbody-only editorで編集できるようにする。Project Primary Documentが未materializeでも候補を表示し、初回tap時だけ既存Ensureでlazyにmaterializeする。既存のWorker/API、Document authority、Markdown source、D-111 autosave/CAS/conflict/ambiguous retry/safe flushは変更しない。

## Notes list

- active Notes listは既存Standalone NoteにProject Boardの全Projectを追加し、Board `board_position ASC`、同値時`project_id`順で表示する。Project Boardがtitle、archive、orderのauthorityで、`project_documents`はdocument ID、revision、timestampのjoin sourceとする。
- materialized Project rowは`PROJECT NOTE`、current Project title、created/updated timestampを表示する。未materialized候補は同じrow familyで`作成日 --`、`更新日 --`を表示する。
- archived Projectはtitleに`（アーカイブ）`を付ける。Archived viewはStandalone Documentのみを表示する。
- Project rowにはStandalone用の`…` lifecycle menu、selection checkbox、swipe actionを表示しない。
- standalone selection mode中はProject rowを開かない。

## Project editor

- Project rowのtapでProject Primary Documentをbody-only editorとして開く。
- materialized rowは既存document IDをfetchし、未materialized候補は初回tap時にだけ`POST /api/v1/projects/{project_id}/primary-document`を1回実行する。Notes listのloadやbackground処理ではEnsureしない。
- Ensureの成功結果は`project_primary`かつ対象Project IDであることを確認して採用し、サーバー返却のcanonical document ID、revision、timestampを候補へ反映する。
- Ensureがambiguousの場合は同じoperation ID / project ID / document IDで指定documentをreconcileし、完全一致を確認できなければ同じrequestを再試行可能な未解決状態として保持する。別Project、別kind、別documentは採用しない。
- Project titleは編集せず、`Project名はProject側が管理します。`を表示する。
- `POST /api/v1/project-primary-documents/{document_id}`へ既存のProject update contract（operation、project、document、expected revision、markdown body）のみを送る。
- list responseに`project_documents`がない旧レスポンスは空リストとして扱う。
- fetch/update responseのkindとdocument/project identityを厳密に確認し、unknown kindや別Projectの文書は採用しない。
- ambiguous結果は既存のexact document identityとbody/revision確認によるreconcileを使う。誤文書を採用しない。

## Scope boundaries

Project title変更、archive/delete、Project selection、Project-wide mutation、Worker/API/shared contract、schema、migration、dependency、persistent nonprod、Productionは本Decisionの対象外とする。Project Primary DocumentのEnsureは既存D-103 endpointを初回tap時にlazy reuseするが、新しいEnsure commandやeager materializationは追加しない。

## Evidence

- Implementation: `97a9367fb1917b0b4f5b56a5ff9a4824b1fb86c4`
- Focused Android JVM: `DocumentHttpRepositoryTest` + `NotesControllerTest` 33 / 33 PASS
- D-149 instrumentation: materialized Project list/editor and selection guard 2 / 2 PASS on `TaskChute_API33`
- `:app:compileDebugKotlin`, `:app:compileDebugAndroidTestKotlin`, `:app:assembleDebug`, `git diff --check`: PASS
- Full Notes instrumentation was not fully completed because an existing `taskPrimaryAutosavesAndBackReturnsToToday` case hung; the two D-149 tests were rerun individually and passed.
- Exact-SHA CI `36556167363`: PASS. APK `taskchute-android-debug-97a9367fb1917b0b4f5b56a5ff9a4824b1fb86c4`, artifact ID `11027763308`, expires `2026-10-06T10:35:34Z`.
- Galaxy S23: `NOT_VERIFIED / PRODUCT_OWNER_MANUAL`; Production: `NOT_RUN`; Released: `NO`.

### Corrective: all Project candidates and lazy Ensure

- Supersedes the earlier materialized-only Notes-list boundary. Every Project Board item is now visible in the normal Android Notes list, including archived Projects; the archived Standalone view remains Standalone-only.
- Implementation: `a1d57de9cd60e79996ad7415ade08f7b8855b52d`
- Focused Android JVM: `DocumentHttpRepositoryTest` + `NotesControllerTest` `41 / 41 PASS`, including Board parsing, Board/document merge/order, archived-view no-load, wrong identity rejection, catalog fallback, exact Ensure retry, and legacy `project_documents` omission.
- `TaskChute_API33` focused instrumentation: unmaterialized candidate display/lazy Ensure plus materialized open and Selection Mode guard `3 / 3 PASS` (run individually). MainActivity/UI-tree smoke completed; target-app crash buffer contained no `FATAL EXCEPTION` / `AndroidRuntime` crash.
- `:app:compileDebugKotlin`, `:app:compileDebugAndroidTestKotlin`, `:app:assembleDebug`, `git diff --check`: PASS. Full Notes runner remains `PARTIAL / NOT_VERIFIED` because the pre-existing task-primary autosave case hangs.
- Exact-SHA CI `36562305310`: PASS; Web/Worker verification SKIP. APK `taskchute-android-debug-a1d57de9cd60e79996ad7415ade08f7b8855b52d`, artifact ID `11029803506`, expires `2026-10-06T11:34:38Z`.
- Worker/API/shared contract, Web, schema, migration, dependency, persistent nonprod: unchanged / not required. Galaxy S23: `NOT_VERIFIED / PRODUCT_OWNER_MANUAL`; Production: `NOT_RUN`; Released: `NO`.
