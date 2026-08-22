# Current

Date: 2026-08-22

## Status

Architecture / Pre-implementation。

Runtime implementationはまだ開始していない。

Core Domain foundations、TaskChuteDay、First Server + Web vertical slice、initial technology / authentication architectureまでApprovedとして設計した。

Cloudflare D1のatomicity / concurrency / idempotency feasibility gateは、current harnessによるlocal D1 + temporary remote D1の`D1-SPIKE-01`〜`D1-SPIKE-08`でPASSし、implementation reviewも完了した。

2026-08-22に、runtime foundation investigationを踏まえ、First Server + Web runtime実装開始前に必要だったMaterial DecisionをD-022としてApprovedした。

次のimplementation workは、D-022を前提に、authentication + APP persistence + current TaskChuteDay + CreateProject + AddTaskToDay + Web DayBoard / reload recoveryを最小end-to-end sliceとして実装することである。

## Current source-of-truth state

- Project Instructionsはfreeze方針で確定済み。
- `AGENTS.md`と`docs/DEVELOPMENT_WORKFLOW.md`はProject Instructionsへ整合済み。
- Runtime codeは未実装。
- D1 concurrency / atomicity feasibility gateはPASS / Verified。current evidenceは`spike/d1-feasibility` branchの`eda694e22fd742827da5b90967c6b0305b885033`および`spikes/d1-feasibility/EVIDENCE.md`を参照する。
- D1 spikeのPASSはexact production SQL / command-specific transaction algorithm / Product runtime verificationを意味しない。
- D-022でinitial runtime foundationのID、Section scope、APP persistence baseline、TaskChuteDay bootstrap / DST、initial-user bootstrap、session policy、AUTH_DB / APP_DB boundaryをApprovedした。
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
- initial runtimeのentity IDはUUIDv7とし、opaque identityとして扱う。
- Taskはinitial scopeで0..1 Projectに所属できる。
- First sliceのSectionはuser-global stable entity、order authorityはEntry identityとする。
- user全体でactive Executionは最大1つとする。
- normal Startは別active Executionをimplicit interruptしない。
- First slice lifecycleは`planned -> running -> completed`とする。
- RoutineDefinition -> RoutineOccurrence -> Entryのfoundationを採用し、Occurrence origin TaskChuteDayを延期後も保持する。
- configurable TaskChuteDayをcivil dateと分離し、continuous `[start, end)` intervalとして扱う。
- initial bootstrapではIANA timezone / TaskChuteDay boundary / initial Sectionsを明示し、暗黙のProduct defaultを適用しない。
- DST ambiguous / nonexistent local timeのinitial disambiguationはTemporal-compatibleな`compatible` semanticsとする。
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

実装はsmall vertical sliceで段階投入する。最初のruntime bootstrap sliceではauthentication、current TaskChuteDay、CreateProject、AddTaskToDay、DayBoard / reload recoveryまでを通し、Reorder / Start / Completeは次incrementへ分ける。

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
- initial user: operator-only one-shot bootstrap
- browser session: rolling 7日 / update threshold 1日
- persistence: same Worker内でseparate `AUTH_DB` / `APP_DB`
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
- First runtime bootstrap slice: `NOT_IMPLEMENTED`
- Auth: `NOT_IMPLEMENTED`
- Web: `NOT_IMPLEMENTED`

Approved Decisionや設計が存在することを理由にTested / Verified扱いしない。

D1 feasibility gateのVerifiedは、D1で必要なatomicity / concurrency / idempotency strategyが成立可能であることのverificationであり、Product runtime自体のImplemented / Integrated / Tested / Verifiedを意味しない。

## Important Risks / Gates

- D1 Worker request全体を暗黙のtransactionとみなさない。
- conditional SQL + DB constraint + explicit transactional batchによるstrategyはlocal + temporary remote spikeでfeasibleとVerified済み。
- active Execution max 1、same-operation retry、Complete retry、reorder conflict、rollback、FK safetyはspikeでcurrent-harness PASS済み。
- exact production migration SQL / command-specific transaction algorithmはD-022のbaselineを満たす形で実装・reviewする。
- unexpected infrastructure failureを確定Domain rejectionへ誤分類しない。exact API表現は実装時にreviewする。
- AUTH_DB / APP_DB間のcross-database atomicityを仮定せず、bootstrapはpartial failureからrecoverableにする。
- repositoryはpublicであり、Better Auth secret、bootstrap password、session token等をcommit / evidence /通常logへ残さない。

## Next

1. current `main`とD-022を再確認し、First production runtime bootstrap slice用branchで実装を開始する。
2. React + Vite + Workerの最小runtime scaffold、local `AUTH_DB` / `APP_DB` bindings、review済みmigrationを作る。
3. Better Auth local D1 smoke test後にexact versionをpinし、operator-only bootstrapとPrincipal mappingを実装する。
4. explicit timezone / boundaryからcurrent TaskChuteDayを解決・materializeする。
5. `LoadCurrentTaskChuteDay`、`CreateProject`、`AddTaskToDay`をServer + Webでend-to-endに通し、browser reload recoveryを確認する。
6. Product runtime向けのunit / persistence / auth / API / Web testsを実施し、D1 spike PASSを自動継承せずcurrent evidenceを記録する。
7. 実装review後にTEST_MATRIX、CURRENT、RISKS / OPEN_QUESTIONSをimpact analysisベースで更新する。
