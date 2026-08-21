# Current

Date: 2026-08-21

## Status

Architecture / Pre-implementation。

Runtime implementationはまだ開始していない。

Core Domain foundations、TaskChuteDay、First Server + Web vertical slice、initial technology / authentication architectureまでApprovedとして設計した。

次のimplementation workはProduct本体ではなく、Cloudflare D1のatomicity / concurrency / idempotency assumptionsを検証するfocused feasibility spikeである。

## Current source-of-truth state

- Project Instructionsはfreeze方針で確定済み。
- `AGENTS.md`と`docs/DEVELOPMENT_WORKFLOW.md`はProject Instructionsへ整合済み。
- Runtime codeは未実装。
- D1 concurrency / atomicity spikeは未実施。
- `docs/DECISIONS.md`をApproved / Proposed Decisionの正本とする。
- Verification requirement / evidenceの正本は`docs/TEST_MATRIX.md`とする。

## Approved Product / Domain direction

主要なApproved direction:

- TaskChuteをObsidian非依存の独立Platformとして再構築する。
- structured TaskChute stateのtarget canonical authorityはTaskChute Serverとする。
- Web appをprimary / universal clientとする。
- Android dedicated appはnative first-classかつoffline-capable targetとする。
- Wear OS / Pixel Watchはcompanion target、native iOSはfuture / low priorityとする。
- initial user modelはsingle-user / multi-deviceとする。
- TaskとEntryは別stable identityとし、Entryはplacement moveでidentityを変えない。
- Taskはinitial scopeで0..1 Projectに所属できる。
- Sectionはstable entity、order authorityはEntry identityとする。
- user全体でactive Executionは最大1つとする。
- normal Startは別active Executionをimplicit interruptしない。
- First slice lifecycleは`planned -> running -> completed`とする。
- RoutineDefinition -> RoutineOccurrence -> Entryのfoundationを採用し、Occurrence origin TaskChuteDayを延期後も保持する。
- configurable TaskChuteDayをcivil dateと分離し、continuous `[start, end)` intervalとして扱う。
- DayBoard / Calendar / Timeline / Review / MapはDomain / historyからのprojectionとする。
- historical factを現在metadata変更でretroactiveに再分類しない。
- Task / Project Primary Documentとoptional RoutineOccurrence Documentのfoundationを採用する。
- planned Placeとobserved Execution Locationを分離し、locationなしでもCore TaskChuteを利用可能とする。

## Approved First vertical slice

D-013をApproved implementation contractとする。

Server + Webで以下をend-to-endに通す。

- authentication
- Project
- Task + Entry
- current TaskChuteDay
- Section / explicit Entry ordering
- Web DayBoard
- async mutation without full-page reload
- Start / active Execution
- Complete
- Next Entry projection
- retry safety
- placement conflict safety
- browser reload recovery

First sliceにはRoutine generation、Notes/Documents implementation、Location/Map、Review、Calendar、Timeline、Android、Wear OS、Web/Android offline、realtime push等を含めない。

## Approved initial technology / architecture

- Web: React + Vite SPA
- Server API: Cloudflare Workers
- structured application persistence: Cloudflare D1
- API: conceptual Command / Query separation
- client-issued mutation: logical operation identity
- placement conflict: revision / precondition、silent last-write-wins禁止
- Auth: Better Auth + secure browser session
- initial login: email + password
- public self-signup: disabled
- TaskChute Domain identityとauth provider physical identityを分離

Native clientはWeb React codeの直接流用を前提としない。

- Android: Kotlin + Jetpack Compose第一候補
- Wear OS: Kotlin + Compose for Wear OS第一候補
- native iOS: Swift + SwiftUI第一候補

Cloudflare R2等のbinary object storageは未Approvedで、D-008は`Proposed`のまま。

## Verification state

- Runtime: `NOT_IMPLEMENTED`
- D1 feasibility spike: `NOT_RUN`
- First vertical slice: `NOT_IMPLEMENTED`
- Auth: `NOT_IMPLEMENTED`
- Web: `NOT_IMPLEMENTED`

Approved Decisionや設計が存在することを理由にTested / Verified扱いしない。

## Important Risks / Gates

- D1 Worker request全体を暗黙のtransactionとみなさない。
- conditional SQL + DB constraint + explicit transaction/batch strategyをfocused spikeで実証する。
- local D1だけでなくtemporary remote D1でもconcurrency evidenceを取る。
- active Execution max 1、same-operation retry、Complete retry、reorder conflict、rollback、FK safetyをspikeで確認する。
- spikeが成立しない場合はProduct runtimeをD1前提で強行せず、strategy修正後も成立しなければDurable Objects等を再評価する。
- repositoryはpublicであり、Better Auth secret等をcommitしない。

## Next

1. D1 feasibility spike用のminimal runtime / schema / test harnessを実装する。
2. `D1-SPIKE-01`〜`D1-SPIKE-08`をlocal D1で実施する。
3. temporary remote D1でも同じcontractを実施する。
4. evidenceをreviewし、D1 transaction / constraint strategyを確定または再設計する。
5. PASSした場合だけFirst sliceのexact migration / API foundation / Auth bootstrapへ進む。
6. 実装結果に応じてTEST_MATRIX、CURRENT、RISKS / OPEN_QUESTIONSを更新する。
