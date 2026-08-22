# Current

Date: 2026-08-22

## Status

Architecture / Pre-implementation。

Runtime implementationはまだ開始していない。

Core Domain foundations、TaskChuteDay、First Server + Web vertical slice、initial technology / authentication architectureまでApprovedとして設計した。

Cloudflare D1のatomicity / concurrency / idempotency feasibility gateは、current harnessによるlocal D1 + temporary remote D1の`D1-SPIKE-01`〜`D1-SPIKE-08`でPASSし、implementation reviewも完了した。

次のimplementation workは、spikeのexact SQLをそのままProductへ移植することではなく、VerifiedになったD1 feasibilityを前提にFirst Server + Web vertical sliceのproduction persistence / command / auth foundationを設計・実装することである。

## Current source-of-truth state

- Project Instructionsはfreeze方針で確定済み。
- `AGENTS.md`と`docs/DEVELOPMENT_WORKFLOW.md`はProject Instructionsへ整合済み。
- Runtime codeは未実装。
- D1 concurrency / atomicity feasibility gateはPASS / Verified。current evidenceは`spike/d1-feasibility` branchの`eda694e22fd742827da5b90967c6b0305b885033`および`spikes/d1-feasibility/EVIDENCE.md`を参照する。
- D1 spikeのPASSはexact production schema / migration SQL / command-specific transaction algorithm / infrastructure failure reconciliationの確定を意味しない。
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
- D1 feasibility spike: `PASS / VERIFIED`
- D1 current-harness local: `PASS`
- D1 current-harness temporary remote: `PASS`
- First vertical slice: `NOT_IMPLEMENTED`
- Auth: `NOT_IMPLEMENTED`
- Web: `NOT_IMPLEMENTED`

Approved Decisionや設計が存在することを理由にTested / Verified扱いしない。

D1 feasibility gateのVerifiedは、D1で必要なatomicity / concurrency / idempotency strategyが成立可能であることのverificationであり、Product runtime自体のImplemented / Integrated / Tested / Verifiedを意味しない。

## Important Risks / Gates

- D1 Worker request全体を暗黙のtransactionとみなさない。
- conditional SQL + DB constraint + explicit transactional batchによるstrategyはlocal + temporary remote spikeでfeasibleとVerified済み。
- active Execution max 1、same-operation retry、Complete retry、reorder conflict、rollback、FK safetyはspikeでcurrent-harness PASS済み。
- exact production schema / migration SQL / command-specific transaction algorithmはspikeのtest shapeを参考に別途設計する。
- unexpected infrastructure failureを確定Domain rejectionへ誤分類しないretry / reconciliation contractは引き続きOpen。
- repositoryはpublicであり、Better Auth secret等をcommitしない。

## Next

1. Verified D1 feasibilityを前提に、First slice用APP persistenceのexact schema / migrationとcommand transaction contractを設計する。
2. spikeのSQL / error mappingをそのままproductionへcopyせず、Domain invariant・operation replay・infrastructure failure reconciliationをProduct runtime向けに整理する。
3. Better Auth bootstrap、auth subject -> stable TaskChute app user mapping、APP/AUTH persistence boundaryを実装可能な形へ落とす。
4. First Server + Web vertical sliceをsmall vertical sliceで開始し、canonical Query / CommandをServer + Webでend-to-endに通す。
5. 実装に応じてTEST_MATRIX、CURRENT、RISKS / OPEN_QUESTIONSをimpact analysisベースで更新する。
