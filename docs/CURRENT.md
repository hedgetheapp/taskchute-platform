# Current

Date: 2026-08-22

## Status

Implementation / First runtime bootstrap integrated。

PR #3 `Add first runtime bootstrap slice` を2026-08-22にmergeし、current `main`にはauthentication、APP persistence、current TaskChuteDay、CreateProject、AddTaskToDay、Web DayBoard / reload recoveryまでの最初のproduction-shaped runtime bootstrap sliceが入っている。

Current main at this update base:

`afcf1ef0e1ca36ee0ce962be288fef41331fd694`

Runtime bootstrap implementation commit:

`3b9fb8b78f6311b63e7a8a6ccf29ddf74415d3f6`

D1 feasibility gateは引き続きPASS / Verified。Product runtime bootstrap sliceはImplemented + Integratedで、current local automated evidenceとimplementation / PR diff reviewはPASSしている。ただしremote D1、deployed Worker、production verificationは未実施であり、Product runtime全体をVerifiedとは扱わない。

First vertical slice全体は未完了で、ReorderEntries、StartEntry、CompleteEntry、Execution runtime、lifecycle-aware Next / reload recoveryが次incrementである。

## Current source-of-truth state

- Project Instructionsはfreeze方針で確定済み。
- `AGENTS.md`と`docs/DEVELOPMENT_WORKFLOW.md`はProject Instructionsへ整合済み。
- PR #3のruntime bootstrap sliceは`main`へIntegrated済み。
- D1 concurrency / atomicity feasibility gateはPASS / Verified。current evidenceは`spike/d1-feasibility` branchの`eda694e22fd742827da5b90967c6b0305b885033`および`spikes/d1-feasibility/EVIDENCE.md`を参照する。
- D1 spikeのPASSはProduct runtime verificationを意味しない。
- D-022でinitial runtime foundationのID、Section scope、APP persistence baseline、TaskChuteDay bootstrap / DST、initial-user bootstrap、session policy、AUTH_DB / APP_DB boundaryをApproved済み。
- Better Authはruntime bootstrap implementationで`1.7.1`へexact pin済み。
- `docs/DECISIONS.md`をApproved / Proposed Decisionの正本とする。
- Verification requirement / evidenceの正本は`docs/TEST_MATRIX.md`とする。

## Implemented runtime bootstrap slice

PR #3で以下を実装・統合した。

- React + Vite SPA
- Cloudflare Worker API
- separate local `AUTH_DB` / `APP_DB` D1 bindings
- Better Auth 1.7.1
- public signup disabled
- operator-only bootstrap
- Better Auth subject -> stable TaskChute `app_user_id` mapping
- rolling 7日 / update threshold 1日のbrowser session policy
- explicit IANA timezone / TaskChuteDay boundary / initial Sections bootstrap
- current TaskChuteDay resolution / lazy materialization
- Temporal-compatible DST ambiguous / nonexistent boundary handling
- CreateProject
- AddTaskToDay
- Task / Entry separate UUIDv7 identity
- explicit Entry position readback
- current planned Next Entry projection
- logical operation replay / misuse rejection
- fingerprint version 1
- AddTaskToDay placement revision conflict protection
- unexpected infrastructure ambiguityとdeterministic Domain rejectionの分離
- authenticated DayBoard
- browser canonical reload recovery
- ambiguous mutation reconciliation

このsliceでは`executions`をまだ作らず、Start / Complete incrementまで延期している。

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

bootstrap sliceでauthentication、current TaskChuteDay、CreateProject、AddTaskToDay、DayBoard / reload recoveryまでを通した。Reorder / Start / Complete / Executionは次incrementへ分ける。

## Verification state

Current runtime bootstrap evidenceはPR #3へ入ったexact implementation contentに対するlocal evidenceである。

- Runtime bootstrap implementation: `IMPLEMENTED / INTEGRATED`
- Runtime bootstrap local Worker / D1 tests: `34 PASS`
- Runtime bootstrap local Web tests: `7 PASS`
- Runtime bootstrap local automated tests total: `41 PASS`
- Typecheck: `PASS`
- Production build: `PASS`
- Fresh local AUTH_DB migration: `PASS`
- Fresh local APP_DB migration: `PASS`
- AUTH_DB foreign-key check: `0`
- APP_DB foreign-key check: `0`
- ChatGPT implementation bundle review: `PASS`
- GitHub PR diff review: `PASS`
- Remote D1 Product runtime verification: `NOT_RUN`
- Deployed Worker verification: `NOT_RUN`
- Product runtime overall: `NOT_VERIFIED`
- First vertical slice overall: `PARTIALLY_IMPLEMENTED`
- Reorder / Start / Complete / Execution: `NOT_IMPLEMENTED`

Approved Decisionや実装存在だけを理由にVerified扱いしない。詳細なcontract / evidenceは`docs/TEST_MATRIX.md`を正本とする。

## Important Risks / Gates

- D1 Worker request全体を暗黙のtransactionとみなさない。
- conditional SQL + DB constraint + explicit transactional batchによるstrategyはlocal + temporary remote spikeでfeasibleとVerified済み。
- CreateProject / AddTaskToDayのproduction-shaped command pathは実装・review済み。
- unexpected infrastructure failureを確定Domain rejectionへ誤分類しない原則をruntime implementationでも維持している。
- active Execution max 1、Start / Complete retry、reorder conflictのProduct runtime実装はまだ次increment。
- AUTH_DB / APP_DB間のcross-database atomicityを仮定せず、bootstrapはpartial failureからrecoverableにしている。
- repositoryはpublicであり、Better Auth secret、bootstrap password、session token等をcommit / evidence /通常logへ残さない。
- remote / production deployment前にbootstrap endpointのexposure / lifecycleを別途reviewする。

## Next

1. runtime bootstrap merge後のcanonical docsをcurrent evidenceへ整合する。
2. current `main`をbaseに、ReorderEntries + StartEntry + CompleteEntry + Execution foundationのnext incrementを開始する。
3. ReorderはTaskChuteDay-level `placement_revision`でconflict-safeにし、winner responseとfinal stored orderの一致を検証する。
4. Startはuser-wide active Execution最大1、no implicit interrupt、same-operation retry safetyを実装する。
5. Completeはfirst `ended_at` preservationとsame-operation retry safetyを実装する。
6. Start / Completeが`placement_revision`を変更しないことを検証する。
7. Webでreorder / running / completed / Next / reload recoveryをend-to-endに確認する。
8. impact analysisに基づきcurrent evidenceを`TEST_MATRIX`へ反映する。
