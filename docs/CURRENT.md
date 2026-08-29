# Current

Date: 2026-08-29

## Status

First Server + Web vertical sliceは`IMPLEMENTED / INTEGRATED`。D-023 bootstrap lifecycle security incrementも`IMPLEMENTED / INTEGRATED / LOCAL_TESTED`。D-024 persistent non-production verification environmentは`APPROVED`かつremote verification済み。

PR #3でruntime bootstrap sliceを、PR #5でReorder / Start / Complete / Execution lifecycle incrementを`main`へmergeした。PR #6でPR #5 merge後のcanonical docsをcurrent implementation / evidenceへ整合し、PR #7でcurrent-state maintenanceをmergeした。PR #8でD-023 bootstrap lifecycle security incrementを、PR #10でD-024 persistent non-production environment configurationを`main`へmergeし、PR #11でそのmerge後current stateを整合した。persistent non-production remote runtime verificationはPASS。production verificationは未実施。

その後、Day planning / Routine設計をcanonical docsへ進め、D-026〜D-037をApproved。2026-08-28にD-038をApprovedし、Section persistence foundationと次のDay dogfood implementation順を確定した。Dogfood Day v0.1-A UI shellとB1はPR #13で`main`へmerge済み。B1は`IMPLEMENTED / INTEGRATED`で、source review、local automated verification、real local APP DB migration、signed-in browser verification、persistent non-production migration / runtime / browser verificationはPASSした。B1 production verificationとreal Japanese IMEは`NOT_RUN`、Releasedは`NO`。B2 / B3は未実装。

Current main at this update base:

`779f9d18dab79062679dec696657a5addc6539b2`

Relevant implementation commits:

- runtime bootstrap: `3b9fb8b78f6311b63e7a8a6ccf29ddf74415d3f6`
- lifecycle / ordering: `09b1526f7f09554bd937aa446737a979868b779b`
- bootstrap lifecycle security: `ed6927ce23722d0e756e91eee29b4c326ca1eeb6`
- persistent nonprod config: `6f079f238dd4efd2717c4911c8701a72fc2b0d72`
- Dogfood Day B1 planning foundation: `1c14eef4695c2de2ced65f43250544159e039485`

Relevant merge commits:

- PR #3: `afcf1ef0e1ca36ee0ce962be288fef41331fd694`
- PR #5: `1b5917ad1caff6dd648856bf7a054fa43d040a65`
- PR #6 canonical docs alignment: `eeed503662c487a7691d7b82705079c89a3c8822`
- PR #7 current-state maintenance: `e26e3b167b8f79925d424275c68550c4e151a3fd`
- PR #8 bootstrap lifecycle security: `3d0d1cf64ddfcb17511bfd622713ed8f5473970d`
- PR #10 persistent nonprod environment configuration: `e969f45fd39e14d00e69632532897fb58011f9de`
- PR #11 current-state maintenance: `a1b342e0c07cffa1bbf38fbfd146e3912616d32a`
- PR #13 Dogfood Day v0.1-A + B1: `1609331ae32d3db36091ac0e4b0322c3757e3a9a`

D1 feasibility gateは引き続きPASS / Verified。current Product runtimeはFirst vertical slice scopeでImplemented + Integratedかつlocal automated evidence / implementation review / GitHub PR diff reviewがPASSしている。persistent non-production remote D1 Product runtime / deployed Worker verificationもPASSした。ただしproduction smokeは未実施であり、Product runtime全体をVerified / Releasedとは扱わない。

## Current source-of-truth state

- Project InstructionsはGovernance / Source of Truth / authority boundaryの正本。
- `AGENTS.md`と`docs/DEVELOPMENT_WORKFLOW.md`は具体的なAI / development workflowの入口。
- Product / Domain behaviorは`docs/SPEC.md`、Decision状態は`docs/DECISIONS.md`を正本とする。
- Verification requirement / evidenceは`docs/TEST_MATRIX.md`を正本とする。
- PR #3 runtime bootstrap sliceは`main`へIntegrated済み。
- PR #5 lifecycle / ordering incrementは`main`へIntegrated済み。
- PR #6でPR #5 merge後のcanonical docs整合は完了済み。
- PR #8でD-023 bootstrap lifecycle securityは`main`へIntegrated済み。
- D1 concurrency / atomicity feasibility gateはlocal + temporary remote spikeでPASS / Verified済み。
- Better Authはcurrent runtimeで`1.7.1`へexact pin済み。
- D-024により1つのpersistent Cloudflare non-production verification environmentをmaintainする方向はApproved済み。
- PR #10でpersistent non-production repository-side configは`main`へIntegrated済み。
- persistent non-production D1 / deployed Worker remote verificationは`PASS`。
- D-026〜D-037でEntry planning metadata、Section / planned-start / forecast、Routine、manual correction、Day move / duplicate / delete等のtarget semanticsはApproved済み。
- D-038でstable Section identity + versioned configuration + established TaskChuteDay context、legacy time-range unknown handling、`Sectionなし` physical absence、通常Section設定変更のnext-Day effective timing、およびB1→B2→B3 stagingはApproved済み。
- D-038 B1はPR #13でcurrent `main`へIntegrated済みで、Implemented / Integrated / Local Tested / Source Reviewed / Signed-in Local Browser Verified / Persistent Nonprod Remote Verified。B1 production verificationは`NOT_RUN`。
- D-038 B2 / B3 runtime implementationは未実施。
- production smokeは`NOT_RUN`。

## Dogfood Day v0.1-B / B1 integrated state

B1 implementation commitは`Implement Dogfood Day B1 planning foundation` / `1c14eef4695c2de2ced65f43250544159e039485`。PR #13 `Implement Dogfood Day v0.1-A and B1 planning foundation`はmerge commit `1609331ae32d3db36091ac0e4b0322c3757e3a9a`で`main`へmergeされ、v0.1-A UI shellとB1はIntegrated済み。

Observed evidence:

- Worker / D1 tests: `79 PASS`
- Web tests: `40 PASS`
- upgrade migration: `1 scenario / 15 checks PASS`
- typecheck / production build / `git diff --check`: `PASS`
- real local APP DB backup、`0003` migration、identity/history comparison、foreign-key integrity: `PASS`
- signed-in real local browserでSection表示、`Sectionなし`作成、見積、Section移動、Start時のactual current Section配置、Runner、Complete、reorder、reload persistence: `PASS`
- real Japanese IME: `NOT_RUN`
- B1 persistent nonprod migration / runtime / browser verification: `PASS`
- B1 remote exact same-operation initial configuration / unsectioned Start / Complete retries: `NOT_RUN`（remote実行済みとは扱わない。独立したcanonical retry requirementsはcurrent PASS evidenceを維持）
- B1 production verification: `NOT_RUN`
- Integrated to `main`: `YES`
- Released: `NO`

local dogfood verificationで利用したSection名・時間帯はuser-specific configuration dataであり、Product defaultではない。verification detailsの正本は`docs/TEST_MATRIX.md`を参照する。

Persistent nonprod B1 verificationは`main@779f9d18dab79062679dec696657a5addc6539b2`からWorker version `b8d7df82-baa3-4162-adbf-c0ecb65dcc84`へdeployした既存nonprod environmentで実施した。`0003_dogfood_day_b1.sql` migration、pre-existing identity / history preservation、initial Section configuration、historical Day context preservation、`Sectionなし`、見積、MoveEntry、Reorder / stale conflict、Start時のactual current Section配置、Runner、Complete、reload、最終integrityをPASSした。検証専用Section rangeはProduct defaultではなく、検証dataは削除せず残置している。

## Persistent non-production increment

Current `main`では、repository-side persistent non-production configを実装・統合済み。local検証・source review・GitHub PR diff reviewもPASS。2026-08-22にpersistent non-production remote environmentを作成してremote verificationを実施しPASSした。

- Worker: `taskchute-web-nonprod`
- URL: `https://taskchute-web-nonprod.taskfulness-sync.workers.dev`
- `AUTH_DB`: `taskchute-auth-nonprod` / `60085f8d-0c4e-4c15-98e9-3ce178398041`
- `APP_DB`: `taskchute-app-nonprod` / `6ad7e35f-5d03-4be3-9b00-46cd713a51c3`
- D1 location hint: `apac`
- jurisdiction: none
- observed placement: APAC; AUTH primary response HKG / APP primary response NRT
- remote migrations: AUTH `0001_better_auth_1_7_1.sql` PASS、APP `0001_runtime_bootstrap.sql` + `0002_lifecycle_ordering.sql` PASS、pending 0
- remote `PRAGMA foreign_key_check`: AUTH 0 / APP 0
- active Execution partial UNIQUE index: PASS
- bootstrap: PASS / HTTP 200 / `recovered=false`
- final `BOOTSTRAP_ENABLED=false`
- `BOOTSTRAP_TOKEN` removed; final Worker secret list contains `BETTER_AUTH_SECRET` only
- bootstrap route final posture: 404、old-token probe 5回連続404
- root 200 / unauthenticated protected API 401
- remote smoke: login / public signup rejection / Create Project / Add 3 Tasks+Entries / Reorder / stale revision 409 / Start / Start retry / second active Execution 409 / Complete / Complete retry / reload recovery / canonical state / logout / post-logout 401: PASS
- final active Execution: 0
- deployed Worker verification: PASS
- observed Free-plan-shaped usage: upload gzip 353.80 KiB、startup 37–44 ms、smoke中にCPU/request/D1 quota or overload errorなし

このincrementは`IMPLEMENTED / INTEGRATED / LOCAL_TESTED / SOURCE_REVIEWED / PR_DIFF_REVIEWED / REMOTE_VERIFIED / DEPLOYED_WORKER_VERIFIED`。

Remote verification中、bootstrap disable deploy直後に旧enabled version由来とみられる400を1回観測し、その後8回連続404へ収束した。今後のoperator procedureではdisable deploy後にdisabled postureへ収束したことを複数回確認してから完了扱いとする。

Smoke用test dataとsessionがnonprodに一部残っている。active Executionは0。cleanup / retention policyはOpen Questionとして扱い、承認なしに直接削除しない。

Production smokeは`NOT_RUN`。Product runtime overallは`NOT_VERIFIED`、Releasedは`NO`。

## Implemented First Server + Web vertical slice

Current `main`では以下を実装・統合済み。

- React + Vite SPA
- Cloudflare Worker API
- separate `AUTH_DB` / `APP_DB` D1 bindings
- Better Auth 1.7.1
- public signup disabled / operator-only bootstrap
- explicit `BOOTSTRAP_ENABLED` gate（default / missing / invalid disabled、exact `"true"`のみenabled）
- disabled bootstrapとenabled + token不備のinformation-disclosingしない404 posture
- Better Auth subject -> stable TaskChute `app_user_id` mapping
- rolling 7日 / update threshold 1日のbrowser session policy
- explicit IANA timezone / TaskChuteDay boundary / initial Sections bootstrap
- current TaskChuteDay resolution / lazy materialization
- Temporal-compatible DST ambiguous / nonexistent boundary handling
- CreateProject
- AddTaskToDay
- Task / Entry separate UUIDv7 identity
- explicit Entry ordering + `placement_revision`
- ReorderEntries with stale revision rejection and atomic rollback
- set-based Reorder SQL using D1 / SQLite `json_each`
- `planned -> running -> completed` lifecycle
- StartEntry / CompleteEntry
- Execution persistence
- DB-enforced user-wide active Execution max 1
- no implicit interrupt on normal Start
- Start / Complete same-operation retry safety
- Complete retryでfirst `ended_at` preservation
- Start / Completeで`placement_revision`を変更しない
- cross-TaskChuteDay active Executionを分割せずComplete可能
- lifecycle-aware Next projection
- logical operation replay / different-semantic misuse rejection
- unexpected infrastructure ambiguityとdeterministic Domain rejectionの分離
- Web move up/down / Start / Complete
- ambiguous Reorder / Start / Completeのexplicit Retry / client-side Discard
- unrelated mutationからretained operationを暗黙再送しないUI guard
- canonical refetch / conflict reconciliation / browser reload recovery

D-038 B1でImplementedしたSection time / `Sectionなし` / Entry見積等はPR #13でcurrent `main`へIntegrated済み。この一覧はFirst Server + Web vertical slice scopeのみを示す。B2 planned start / derived placement-orderとB3 Section settings lifecycleは未実装。

## Verification state

Current evidence:

- Runtime implementation: `IMPLEMENTED / INTEGRATED / LOCAL_TESTED`
- Worker / D1 tests: `55 PASS`
- Web tests: `18 PASS`
- total local automated tests: `73 PASS`
- `npm ci`: `PASS`
- npm audit vulnerabilities: `0`
- Generated Worker types: `PASS`
- Typecheck: `PASS`
- Production build: `PASS`
- Fresh AUTH_DB migration: `PASS`
- Fresh APP_DB migration `0001 -> 0002`: `PASS`
- Existing operation-row upgrade: `PASS`
- AUTH_DB foreign-key check: `0`
- APP_DB foreign-key check: `0`
- active Execution partial UNIQUE index: `PASS`
- `git diff --check`: `PASS`
- Bootstrap lifecycle source-only implementation review: `PASS`
- Bootstrap lifecycle GitHub PR diff review: `PASS`
- Persistent nonprod config source-only implementation review: `PASS`
- Persistent nonprod GitHub PR diff review: `PASS`
- Remote D1 Product runtime verification: `PASS`
- Deployed Worker verification: `PASS`
- Persistent nonprod bootstrap lifecycle verification: `PASS`
- Free-plan-shaped runtime feasibility evidence: `PASS` for observed smoke scope; actual account plan tier independently `NOT_VERIFIED`
- Production smoke test: `NOT_RUN`
- Product runtime overall: `NOT_VERIFIED`
- Released: `NO`

Local / nonprod PASSをproduction verificationへ自動拡張しない。

B1 integrated implementation / local verification evidence:

- Implementation: `IMPLEMENTED / INTEGRATED (PR #13 merge commit 1609331ae32d3db36091ac0e4b0322c3757e3a9a)`
- Source review: `PASS`
- Worker / D1 tests: `79 PASS`
- Web tests: `40 PASS`
- upgrade migration: `1 scenario / 15 checks PASS`
- signed-in real local browser verification: `PASS`
- real Japanese IME: `NOT_RUN`
- Integrated / remote verified / production verified / Released: `YES / PASS / NOT_RUN / NO`

## Important Risks / Gates

- D1 Worker request全体を暗黙のtransactionとみなさない。
- conditional SQL + database constraint + explicit `batch()`をcurrent invariant enforcementの基礎とする。
- active Execution max 1はpartial UNIQUE indexでもenforceしている。
- ReorderはEntry数ごとのUPDATEではなくset-based updateへ変更し、current mutation batchのstatement数をEntry数から分離した。
- unexpected infrastructure failureを確定Domain rejectionへ誤分類しない。
- AUTH_DB / APP_DB間のcross-database atomicityを仮定しない。
- repositoryはpublicであり、secret / credential / private content / production dataをcommitしない。
- D-023に従いnormal runtimeではbootstrapをdisabledとし、provisioning後のmode disable + token remove / rotateをoperator procedureで確実に行う。
- D-024のpersistent non-production environmentはproductionから分離し、default-disabled bootstrap、explicit D1 bindings、secret hygiene、Free-plan monitoringを維持する。
- bootstrap disable deployment後は複数回probeでdisabled postureへ収束したことを確認する。
- persistent nonprod test data / session retention・cleanup policyは未決。
- Integrated済みB1のschema migration / compatibility、Entry見積physical representation、local verificationはreview済み。未解決のestimate multi-device LWW、initial configurationのDay境界race、unusual DST transition recoveryは`RISKS` / `OPEN_QUESTIONS`を参照する。
- operation result retention / cleanup、observability、backup / export、production deployment posture等は未解決。

## Next

First Server + Web vertical slice、D-023 bootstrap lifecycle security、persistent non-production config incrementはcurrent `main`でImplemented / Integratedまで完了済み。persistent nonprod remote runtime / deployed Worker verificationもPASS。

次のrepository actionは、B1のImplemented / Integrated / local + persistent nonprod remote PASSを前提に、B2へ進むかを別途判断することである。このdocs task自体はB2実装を開始・承認しない。

1. **B2 — planned start + derived Section placement / order**
   - B1 integration prerequisiteは満たされた。D-031のapproved stagingとcurrent work-item decisionに従い、別途開始を判断する。
2. **B3 — Section settings lifecycle**
   - rename / boundary edit / add / delete / absorptionとhistory preservationを実装する。
3. real Japanese IME verificationは`NOT_RUN`のまま別scopeで実施判断する。
4. nonprod test data / session retention・cleanup policyは別Open Questionとして維持する。
5. production deployment strategy / production smoke contractは別途Material Decision / explicit approvalとして扱い、nonprod PASSを自動継承しない。

B1のpersistent nonprod remote PASSをproduction Verified / Product全体のVerified / Releasedと混同しない。B2 / B3はApproved design / implementation sequenceでありruntime未実装。
