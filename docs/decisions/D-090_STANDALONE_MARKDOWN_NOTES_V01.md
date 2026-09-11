# D-090 — Standalone Markdown Notes v0.1

Status: Approved

Date: 2026-09-11

## Context

D-006でTaskChute自身がMarkdown-native Documents capabilityを所有すること、D-018でTask / Project Primary DocumentとRoutineOccurrence Documentを共通Document foundationへ載せること、D-025でTask / Project等へ従属しないstandalone Document / general noteをfirst-class capabilityとすることはApproved済みである。

D-090はその最初のvertical sliceとして、Webからstandalone Markdown Noteを作成・一覧・編集・明示保存できる最小Document foundationを実装する。

## Product semantics

### Shared Document foundation

- DocumentはTask / Project / Entry / Routine等とは別のstable identityを持つowner-scoped entityとする。
- initial runtimeで新規作成するDocument IDは既存entity identity方針に従いUUIDv7を利用し、DB / APIではopaque stringとして扱う。
- Document content semanticsはD-006に従いMarkdown-nativeとする。保存authorityはMarkdown source textであり、独自rich-text-only formatをcanonical sourceにしない。
- D-090で利用するDocumentは`standalone`であり、Task / Project / RoutineOccurrenceとのrelationは作らない。
- 将来Task Primary Document / Project Primary Document / RoutineOccurrence Document / Review Document等を同じDocument entityへ接続できるよう、Document本体へTask専用・Project専用の相互非互換storageを埋め込まない。

### Standalone Note v0.1

Web authenticated shellにtop-level `ノート` destinationを追加する。

Notes surfaceは最低限以下を提供する。

- standalone Note一覧
- `＋ 新規ノート`
- Note title
- Markdown本文editor
- Noteを開く
- title / bodyを編集する
- 明示的な`保存`
- `Ctrl+S` / `Cmd+S`で現在Noteを保存する
- 保存成功後はServer canonical stateへ収束する
- reload / fresh queryで保存済み内容を復元できる

D-090ではautosaveを採用しない。editor上の未保存draftはServer canonical stateではない。

新規Noteはlocal draftから開始してよく、最初の明示SaveでServerへ作成する方式を第一候補とする。exact local component structureは実装detailへ委任する。

Title / bodyはUTF-8 textとして扱う。本文はemptyを許容する。titleのempty / whitespace-only draftに対するexact presentation（save disabledまたは`無題`表示等）はreversible UI detailとして実装時に一貫したルールを選び、canonical stored titleをユーザー入力から無関係な文字列へ黙って変換しない。

### Ordering

v0.1の一覧は最新更新Noteを上位に表示する単純なserver-canonical orderとする。manual reorder / folders / pinned orderはscope外。

`updated_at`は一覧順と表示補助に利用できるが、Document identityやhistorical authorityにはしない。

### Concurrency / retry

Document mutationはD-020のServer authority / operation identity / retry-safe / stale overwrite protection原則に従う。

- Create / Save mutationはclient-issued `operation_id`を持つ。
- same-operation replayで二重Document creationや二重更新を起こさない。
- existing Document updateはDocument revision / expected revision等のexplicit preconditionでstale overwriteを拒否する。
- infrastructure ambiguityをdeterministic Domain rejectionとして保存しない。
- mutationとoperation success resultをatomicに確定する。
- owner外Documentをread / updateできない。

exact command / DTO / revision column名はArchitecture detailに委任する。

### Unsaved draft boundary

- editorの未保存変更はmemory-onlyでよい。
- D-090ではoffline queue、localStorage draft persistence、cross-device draft syncを実装しない。
- Note切替、Notes surface離脱、logout等で未保存変更が失われ得る操作には、既存Web interaction conventionに沿ったunsaved-change protectionを提供する。
- browser reload / tab close時のexact warning mechanismはWeb platform capabilityの範囲で実装し、保存済みServer stateを未保存draftで黙って上書きしない。

## Persistence — APP 0029 Approved

D-090の実装に必要なAPP schema migrationを明示承認する。

Expected next migration at Decision approval time:

`apps/web/migrations/app/0029_documents_v01.sql`

Migrationのscopeは共通Document foundationとD-090 command compatibilityに限定する。

Conceptual persistence requirements:

- owner-scoped `documents`
- stable `document_id`
- initial document kind capable of representing `standalone`
- title
- Markdown source body
- revision / optimistic concurrency authority
- created / updated timestamps
- owner + document identity uniqueness / access path
- required operation command allow-list extension if current physical schema requires it

Exact table / index / CHECK / timestamp representationは実装detailとする。

Migrationはexisting Task / Entry / Execution / Project / Mode / Routine / RoutineOccurrence / effective-day / operation historyを書き換えない。AUTH_DB migrationは行わない。

D-090ではbinary attachment storageを追加しない。R2等のobject storage adoptionはD-008のまま未決とする。

## Web UX direction

Desktop Notes surfaceのfirst sliceは2-paneまたは同等のcompact layoutを許容する。

Conceptual target:

```text
ノート

＋ 新規ノート

──────────────────────
開発アイデア
TaskChuteについて
旅行メモ
──────────────────────

開発アイデア

# TaskChuteアイデア

タイムラインビューを作りたい。

[保存]
```

Exact visual metricsはDESIGNの既存shell / typography / interaction conventionsへ合わせる。

Markdown preview、split preview、toolbar formatting commandsはv0.1必須ではない。canonical source editorとしてplain textarea等を利用してよい。

## Non-goals

D-090 v0.1には含めない。

- Task Primary Document接続
- Project Primary Document接続
- RoutineOccurrence Document接続
- day-specific Task Note / Comment
- internal `[[link]]` exact syntax
- backlinks
- Graph View
- full-text search
- folders
- tags
- pin / manual ordering
- revision history UI / version restore
- autosave
- collaborative editing
- attachment / image / file upload
- R2 / object storage
- Obsidian sync / import
- Android / Wear OS native Notes UI
- Web offline persistence
- soft delete / hard delete / archive / trash lifecycle
- public share
- production operation

Delete/archiveをv0.1へ含めないことで、Document retention / backlink / future relation semanticsを先に固定しない。

## Verification boundary

Required implementation evidence should include:

- migration fresh-chain and upgrade preservation
- owner isolation
- create exact replay
- update exact replay
- stale revision rejection
- infrastructure ambiguity / rollback safety
- list ordering
- reload query reconstruction
- unsaved draft does not mutate Server
- Ctrl/Cmd+S single logical save behavior
- full Worker/D1 regression
- full Web regression
- typecheck / build / exact nonprod build / Wrangler dry-run / diff-check
- persistent nonprod backup/recovery validation before APP 0029
- persistent nonprod APP 0029 apply, AUTH unchanged
- API/DB read-only integrity after deploy

Authenticated browser verification should be performed when an authenticated session is available. Current inability to authenticate through the available browser tooling may leave browser-specific evidence `NOT_VERIFIED`; local automated/nonprod DB evidence must not be promoted to browser PASS.

## Safety / compatibility

- public repositoryへNote content、personal/private content、credential等をcommitしない。
- browser / DB verification fixtureはnon-sensitive disposable contentだけを使用する。
- no production mutation.
- no restore execution.
- no new external service / dependency unless separately reviewed.
- migrationが既存canonical dataを破壊・reinterpretする必要が判明した場合はSTOPする。

## Relationship to existing Decisions

- D-006 Markdown-native documentsを実装方向へ具体化する。
- D-018 shared Primary / Occurrence Document foundationを変更せず、その共通Document entityのfirst sliceを提供する。
- D-025 standalone general noteをfirst-class capabilityとして実装する。
- D-007 attachment capabilityは将来scopeとして維持し、D-090では実装しない。
- D-008 object storage proposalは未変更。

D-090はTask / Project / Routine Note semanticsを新たに決定しない。