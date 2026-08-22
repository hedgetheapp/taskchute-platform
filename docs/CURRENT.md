# Current

Date: 2026-08-22

## Status

First Server + Web vertical sliceは`IMPLEMENTED / INTEGRATED`。D-023 bootstrap lifecycle security incrementも`IMPLEMENTED / INTEGRATED / LOCAL_TESTED`。D-024 persistent non-production verification environmentは`APPROVED`。

PR #3でruntime bootstrap sliceを、PR #5でReorder / Start / Complete / Execution lifecycle incrementを`main`へmergeした。PR #6でPR #5 merge後のcanonical docsをcurrent implementation / evidenceへ整合し、PR #7でcurrent-state maintenanceをmergeした。PR #8でD-023 bootstrap lifecycle security incrementを、PR #10でD-024 persistent non-production environment configurationを`main`へmergeし、PR #11でそのmerge後current stateを整合した。persistent non-production remote runtime verificationはPASS。production verificationは未実施。

Current main at this update base:

`a1b342e0c07cffa1bbf38fbfd146e3912616d32a`

Relevant implementation commits:

- runtime bootstrap: `3b9fb8b78f6311b63e7a8a6ccf29ddf74415d3f6`
- lifecycle / ordering: `09b1526f7f09554bd937aa446737a979868b779b`
- bootstrap lifecycle security: `ed6927ce23722d0e756e91eee29b4c326ca1eeb6`
- persistent nonprod config: `6f079f238dd4efd2717c4911c8701a72fc2b0d72`

Relevant merge commits:

- PR #3: `afcf1ef0e1ca36ee0ce962be288fef41331fd694`
- PR #5: `1b5917ad1caff6dd648856bf7a054fa43d040a65`
- PR #6 canonical docs alignment: `eeed503662c487a7691d7b82705079c89a3c8822`
- PR #7 current-state maintenance: `e26e3b167b8f79925d424275c68550c4e151a3fd`
- PR #8 bootstrap lifecycle security: `3d0d1cf64ddfcb17511bfd622713ed8f5473970d`
- PR #10 persistent nonprod environment configuration: `e969f45fd39e14d00e69632532897fb58011f9de`
- PR #11 current-state maintenance: `a1b342e0c07cffa1bbf38fbfd146e3912616d32a`

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
- production smokeは`NOT_RUN`。

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
- operation result retention / cleanup、observability、backup / export、production deployment posture等は未解決。

## Next

First Server + Web vertical slice、D-023 bootstrap lifecycle security、persistent non-production config incrementはcurrent `main`でImplemented / Integratedまで完了済み。persistent nonprod remote runtime / deployed Worker verificationもPASS。

次の進行は以下を分けて扱う。

1. 今回取得したpersistent nonprod D1 IDsをtracked `wrangler.jsonc`へpublishし、remote verification evidenceをcanonical docsへ記録する。
2. nonprod test data / session retention・cleanup policyを決める。
3. production deployment strategy / production smoke contractは別途Material Decision / explicit approvalとして扱い、nonprod PASSを自動継承しない。
4. 次のProduct feature sliceはまだ確定しない。Routine、Documents、Android、Review等のroadmap候補から、ユーザーが優先順位を決めた後にsmall vertical sliceを設計する。
5. 未実装のcross-day / cross-Section Entry move、Section rename、historical snapshot等をFirst vertical sliceの完了と混同しない。
