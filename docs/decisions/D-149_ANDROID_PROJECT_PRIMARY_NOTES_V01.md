# D-149 — Android Project Primary Notes v0.1

Status: **Approved / Implemented / Integrated**

## Decision

Android Notesのmaterialized Project Primary Documentを、Standalone Noteと同じNotes一覧に表示し、Project単位のbody-only editorで編集できるようにする。既存のWorker/API、Document authority、Markdown source、D-111 autosave/CAS/conflict/ambiguous retry/safe flushは変更しない。

## Notes list

- active Notes listは既存Standalone NoteにProject Primary Noteを追加する。
- Project rowは`PROJECT NOTE`、current Project title、created/updated timestampを表示する。
- archived Projectはtitleに`（アーカイブ）`を付ける。Archived viewはStandalone Documentのみを表示する。
- Project rowにはStandalone用の`…` lifecycle menu、selection checkbox、swipe actionを表示しない。
- standalone selection mode中はProject rowを開かない。

## Project editor

- Project rowのtapでProject Primary Documentをbody-only editorとして開く。
- Project titleは編集せず、`Project名はProject側が管理します。`を表示する。
- `POST /api/v1/project-primary-documents/{document_id}`へ既存のProject update contract（operation、project、document、expected revision、markdown body）のみを送る。
- list responseに`project_documents`がない旧レスポンスは空リストとして扱う。
- fetch/update responseのkindとdocument/project identityを厳密に確認し、unknown kindや別Projectの文書は採用しない。
- ambiguous結果は既存のexact document identityとbody/revision確認によるreconcileを使う。誤文書を採用しない。

## Scope boundaries

Project Primary DocumentのEnsure、Project title変更、archive/delete、Project selection、Project-wide mutation、Worker/API/shared contract、schema、migration、dependency、persistent nonprod、Productionは本Decisionの対象外とする。

## Evidence

- Implementation: `97a9367fb1917b0b4f5b56a5ff9a4824b1fb86c4`
- Focused Android JVM: `DocumentHttpRepositoryTest` + `NotesControllerTest` 33 / 33 PASS
- D-149 instrumentation: materialized Project list/editor and selection guard 2 / 2 PASS on `TaskChute_API33`
- `:app:compileDebugKotlin`, `:app:compileDebugAndroidTestKotlin`, `:app:assembleDebug`, `git diff --check`: PASS
- Full Notes instrumentation was not fully completed because an existing `taskPrimaryAutosavesAndBackReturnsToToday` case hung; the two D-149 tests were rerun individually and passed.
- Exact-SHA CI `36556167363`: PASS. APK `taskchute-android-debug-97a9367fb1917b0b4f5b56a5ff9a4824b1fb86c4`, artifact ID `11027763308`, expires `2026-10-06T10:35:34Z`.
- Galaxy S23: `NOT_VERIFIED / PRODUCT_OWNER_MANUAL`; Production: `NOT_RUN`; Released: `NO`.
