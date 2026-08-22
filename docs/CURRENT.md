# Current

Date: 2026-08-22

## Status

First Server + Web vertical sliceは`IMPLEMENTED / INTEGRATED`。

PR #3でruntime bootstrap sliceを、PR #5でReorder / Start / Complete / Execution lifecycle incrementを`main`へmergeした。PR #6でPR #5 merge後のcanonical docsをcurrent implementation / evidenceへ整合した。current runtimeはauthentication、Project、Task + Entry、current TaskChuteDay、Section / explicit ordering、Web DayBoard、ReorderEntries、StartEntry、active Execution、CompleteEntry、lifecycle-aware Next、retry / conflict handling、browser canonical reload recoveryまでをend-to-endに持つ。

Current main at this update base:

`eeed503662c487a7691d7b82705079c89a3c8822`

Relevant implementation commits:

- runtime bootstrap: `3b9fb8b78f6311b63e7a8a6ccf29ddf74415d3f6`
- lifecycle / ordering: `09b1526f7f09554bd937aa446737a979868b779b`

Relevant merge commits:

- PR #3: `afcf1ef0e1ca36ee0ce962be288fef41331fd694`
- PR #5: `1b5917ad1caff6dd648856bf7a054fa43d040a65`
- PR #6 canonical docs alignment: `eeed503662c487a7691d7b82705079c89a3c8822`

D1 feasibility gateは引き続きPASS / Verified。current Product runtimeはFirst vertical slice scopeでImplemented + Integratedかつlocal automated evidence / implementation review / GitHub PR diff reviewがPASSしている。ただしremote D1 Product runtime verification、deployed Worker verification、production smokeは未実施であり、Product runtime全体をVerified / Releasedとは扱わない。

## Current source-of-truth state

- Project InstructionsはGovernance / Source of Truth / authority boundaryの正本。
- `AGENTS.md`と`docs/DEVELOPMENT_WORKFLOW.md`は具体的なAI / development workflowの入口。
- Product / Domain behaviorは`docs/SPEC.md`、Decision状態は`docs/DECISIONS.md`を正本とする。
- Verification requirement / evidenceは`docs/TEST_MATRIX.md`を正本とする。
- PR #3 runtime bootstrap sliceは`main`へIntegrated済み。
- PR #5 lifecycle / ordering incrementは`main`へIntegrated済み。
- PR #6でPR #5 merge後のcanonical docs整合は完了済み。
- D1 concurrency / atomicity feasibility gateはlocal + temporary remote spikeでPASS / Verified済み。
- Better Authはcurrent runtimeで`1.7.1`へexact pin済み。
- remote D1 Product runtime、deployed Worker、production smokeは`NOT_RUN`。

## Implemented First Server + Web vertical slice

Current `main`では以下を実装・統合済み。

- React + Vite SPA
- Cloudflare Worker API
- separate `AUTH_DB` / `APP_DB` D1 bindings
- Better Auth 1.7.1
- public signup disabled / operator-only bootstrap
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

PR #5へmergeされたexact implementation contentに対するcurrent local evidence:

- Runtime implementation: `IMPLEMENTED / INTEGRATED`
- Worker / D1 tests: `49 PASS`
- Web tests: `18 PASS`
- total local automated tests: `67 PASS`
- `npm ci`: `PASS`
- npm audit vulnerabilities: `0`
- Typecheck: `PASS`
- Production build: `PASS`
- Fresh AUTH_DB migration: `PASS`
- Fresh APP_DB migration `0001 -> 0002`: `PASS`
- Existing operation-row upgrade: `PASS`
- AUTH_DB foreign-key check: `0`
- APP_DB foreign-key check: `0`
- active Execution partial UNIQUE index: `PASS`
- `git diff --check`: `PASS`
- source-only implementation review: `PASS`
- GitHub PR #5 diff review: `PASS`
- Remote D1 Product runtime verification: `NOT_RUN`
- Deployed Worker verification: `NOT_RUN`
- Production smoke test: `NOT_RUN`
- Product runtime overall: `NOT_VERIFIED`
- Released: `NO`

Local PASSをremote / deployed / production verificationへ自動拡張しない。

## Important Risks / Gates

- D1 Worker request全体を暗黙のtransactionとみなさない。
- conditional SQL + DB constraint + explicit `batch()`をcurrent invariant enforcementの基礎とする。
- active Execution max 1はpartial UNIQUE indexでもenforceしている。
- ReorderはEntry数ごとのUPDATEではなくset-based updateへ変更し、current mutation batchのstatement数をEntry数から分離した。
- unexpected infrastructure failureを確定Domain rejectionへ誤分類しない。
- AUTH_DB / APP_DB間のcross-database atomicityを仮定しない。
- repositoryはpublicであり、secret / credential / private content / production dataをcommitしない。
- remote / production deployment前にbootstrap endpoint exposure / lifecycleをSecurity reviewする。
- operation result retention / cleanup、observability、backup / export、production deployment posture等は未解決。

## Next

First Server + Web vertical sliceの実装とPR #5 merge後のcanonical docs整合はcurrent `main`で完了済み。

次の進行は以下を分けて扱う。

1. remote verification preparationとして、R-012 bootstrap endpoint lifecycle / exposureをSecurity reviewし、current Cloudflare Workers / D1 limits・pricing・platform restrictionsを確認する。
2. 上記preconditionを満たした後、明示承認されたnon-production environmentでremote D1 Product runtime / deployed Worker verificationを実施し、evidenceを`docs/TEST_MATRIX.md`へ記録する。production write / production smokeは別途明示承認を必要とする。
3. 次のProduct feature sliceはまだ確定しない。Routine、Documents、Android、Review等のroadmap候補から、ユーザーが優先順位を決めた後にsmall vertical sliceを設計する。
4. 未実装のcross-day / cross-Section Entry move、Section rename、historical snapshot等をFirst vertical sliceの完了と混同しない。
