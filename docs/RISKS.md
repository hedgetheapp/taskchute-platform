# Risks

## R-001 — Server authority increases sync responsibility
Related: D-002, D-011, D-012, D-020

Server authorityとoffline-capable clientを組み合わせるため、offline operation、retry、idempotency、conflict、multi-device convergenceがPlatform側の責務になる。

Mitigation direction:

- stable identity
- client-generated logical operation identity
- retry-safe lifecycle operation
- stale overwriteを黙ってlast-write-winsしないrevision / precondition
- local state/cache
- explicit conflict handling
- legacy Bridgeで得たoffline / Ack ambiguity / regression knowledgeの再利用

## R-002 — Image storage may increase cost / usage
Related: D-007, D-008

Notes/Commentsでimagesを扱うと、storage、operation、transfer量が増える。

Mitigation direction:

- D-008のstorage separation案を含むcost evaluation
- Android resize / compression
- orphan cleanup
- attachment metadata
- free-tier / quota monitoring

D-008は`Proposed`であり、object storage採用自体は未確定。

## R-003 — Markdown interoperability
Related: D-006, D-018

Web / Android editingと将来のObsidian projectionでMarkdown / image behaviorが乖離する可能性がある。

Mitigation direction:

- Markdown-native documents
- stable document / attachment identity
- Task / Project / Routine occurrence専用に相互非互換storageを乱立させず、shared Document capabilityを利用する
- explicit projection rules
- proprietary rich-text-only storageを避ける

## R-004 — Rebuilding too much at once
Related: D-013

legacy featureを一括で再実装すると、Domain / Architectureの誤りを早期に発見しづらくなる。

Mitigation:

- D-013のsmall Server + Web First vertical sliceを優先する
- Routine、Notes、Location、Review、Android等をFirst sliceへ持ち込まない
- D1 atomicity / concurrency assumptionsはProduct runtime前のfocused spikeで検証する

First Server + Web vertical sliceはPR #3 + #5でImplemented / Integrated済み。次sliceでも同じsmall vertical slice原則を維持する。

## R-005 — Legacy data migration
Related: D-009

既存Vault dataにはidentity / historyが含まれ、naive importではloss / collisionが発生する可能性がある。

Mitigation direction:

- dry-run
- validation
- preview
- import
- post-import verification

exact migration contractは未決。

## R-006 — Public repository leakage

新repositoryはpublicである。

Mitigation:

- secret、credential、個人情報、private production note/image、production dataをcommitしない
- Better Auth secret等はCloudflare secret / environment secretとして管理する
- 将来CI / artifact / logを導入する場合もpublic leakage riskを評価する

## R-007 — TaskChuteDay reclassification / boundary transition risk
Related: D-017

civil dateをlogical day authorityとして扱ったり、現在のtimezone / day boundary設定で過去historyを再計算すると、Entry所属、Routine streak、Review集計等のhistorical meaningが壊れる可能性がある。

Mitigation direction:

- TaskChuteDayをcanonical timezone + DayBoundaryPolicyによるcontinuous `[start, end)` intervalとして扱う
- historically establishedされたpast interval / assignmentをretroactiveに再分類しない
- transition時もlogical day間にgap / overlapを作らない
- Executionはactual instantを保持し、Reviewはinterval overlapで集計する
- future dayのfreeze / materialization policyを実装前に別途明確化する

PR #5ではTaskChuteDay境界をまたぐactive Executionを同一Execution factとして保持し、翌日のWebからもComplete可能にした。logical-day overlapによるReview / aggregation query自体は未実装。

## R-008 — Historical context loss
Related: D-016

Task / Project / Section等の現在metadata変更や削除によって、過去Execution / RoutineOccurrenceの意味が変わったり参照不能になる可能性がある。

Mitigation direction:

- historical factとcurrent metadataを同一視しない
- required historical contextをsnapshot / stable reference等で保持する
- historical chainへのdestructive cascade / hard deleteを前提としない
- Review testで過去classificationがretroactiveに変わらないことを検証する

Execution persistenceは実装済みだが、exact historical metadata snapshot fieldsはOpen。

## R-009 — Location privacy / accuracy risk
Related: D-019

位置情報は通常のTask metadataよりsensitiveであり、移動履歴の漏洩、providerへの不要な共有、不正確なGPS observation等のRiskがある。

Mitigation direction:

- explicit permission / opt-in
- locationなしでもCore TaskChuteを完全に利用可能にする
- Start / Complete captureをbest-effort enrichmentとしてlifecycle成功条件から分離する
- captured instant / accuracy等を保持できる設計
- map provider identityをcanonical Place identityにしない
- access control、deletion / export / retention / precision policyをLocation実装前に設計する
- continuous trackingは別のexplicit opt-in capabilityとして扱う

## R-010 — D1 concurrency / transaction assumption risk
Related: D-020

Cloudflare D1を採用するが、Worker request全体を暗黙のtransactionと考えたり、application-level read -> decision -> writeだけでconcurrency invariantを守ると、同時Start、retry、reorder race等で不整合が発生する可能性がある。

2026-08-22のcurrent-harness local + temporary remote feasibility spikeで、D1 `batch()` + conditional SQL + database constraintsによりD1-SPIKE-01〜08を満たせることはVerifiedした。これにより「D1で必要なatomicity / concurrency / idempotency strategyが成立可能か」というarchitecture gate riskはmitigatedした。

PR #3ではCreateProject / AddTaskToDay、PR #5ではReorderEntries / StartEntry / CompleteEntryについてproduction-shaped D1 implementationを実装・reviewした。

Current mitigation / implementation:

- Domain mutation + operation resultをexplicit `batch()`へ含める
- same-operation replay / different-semantic misuse rejectionを共通operation persistenceで扱う
- unexpected infrastructure failureをdeterministic Domain rejectionへ保存しない
- AddTaskToDay / ReorderでTaskChuteDay-level `placement_revision`を利用する
- Reorder conflict / rollbackをtransaction guard / assertionで確認する
- Reorderは`json_each`を使うset-based updateとし、Entry数ごとのUPDATE statementを避ける
- active Execution最大1をapplication codeだけでなく`executions(app_user_id) WHERE ended_at IS NULL` partial UNIQUE indexでもenforceする
- Start / Completeで`placement_revision`を変更しない
- Complete retryでfirst `ended_at`を維持する
- current lifecycle / ordering local suiteでstale conflict replay、cross-owner、concurrent Start、same-operation retry、64 Entry Reorder等をcoverageする

実装review中には、runtime bootstrapでbroad catch後のstate観測からunexpected infrastructure failureをdeterministic Domain rejectionへ誤分類し得るpath、およびsame-operation rejection raceでstored successを捨て得るpathを検出し修正した。lifecycle reviewではcross-day Complete UI欠落、ambiguous retained operationの誤再送、O(N) Reorder statements / 200 Entry capを検出し、PR #5 merge前に修正・回帰testを追加した。

残存Risk:

- current Product runtime evidenceはlocal中心で、PR #5 implementationに対するremote D1 / deployed Worker evidenceは未取得
- operation result retention / cleanup policyは未決
- overload時behavior、observability、backup / export、migration evolution等は未解決
- 64 KiB request-body protectionを維持しており、将来large board / API payload scaleは別途評価が必要
- D1 platform limits / pricingは変更され得るため、remote / production deployment前にcurrent値を再確認する

Mitigation direction:

- conditional SQL + database constraint + explicit transactional batchをProduct invariant enforcementの基礎として利用する
- spike PASSをProduct runtime verificationへ自動継承しない
- lifecycle / ordering local PASSをremote / deployed PASSへ自動継承しない
- current evidenceは`docs/TEST_MATRIX.md`へ記録する
- future commandでもinfrastructure failureとDomain rejectionを分離し、safe retry / reconciliation余地を残す

D1 feasibility gateはPASS / Verified。First Server + Web vertical sliceはImplemented + Integrated + local Testedだが、Product runtime全体はVerified / Releasedではない。

## R-011 — Authentication library / identity coupling risk
Related: D-021

Better Authのphysical schemaやlibrary behaviorへTaskChute Domain identityを直接結合すると、auth library upgrade / replacementがDomain dataへ波及する可能性がある。

Current bootstrap implementationではBetter Auth `1.7.1`をexact pinし、`AUTH_DB` physical schemaと`APP_DB` stable TaskChute app user identityをmappingで分離している。

Mitigation direction:

- stable TaskChute app user identityとauth subjectをmappingする
- auth-managed persistenceとDomain persistenceの責務を分離する
- Domain tableからauth library physical schemaへ強いFK dependencyを持たせない
- pinned version upgrade時はmigration / session / authentication regressionを評価する

## R-012 — Bootstrap endpoint lifecycle / exposure
Related: D-021, D-022

Current runtimeにはoperator-only initial user provisioning用の`POST /api/internal/bootstrap` endpointが存在する。

Current mitigation:

- `BOOTSTRAP_TOKEN`必須
- fixed-length digest後のtiming-safe token comparison
- token mismatch時はresource existenceを露出しない404 response
- public Better Auth signupは常時disabled
- bootstrap専用auth pathのみoperator invocation中にuser creationを許可
- password / token / session secretをtracked file、evidence、通常logへ保存しない
- AUTH_DB成功 / APP_DB失敗から同一subjectでrecoverable

残存Risk:

remote / production deployment時にbootstrap endpointを常時reachableなまま運用すると、bootstrap secret lifecycle、rotation、accidental exposure、post-bootstrap attack surfaceの管理が必要になる。

Mitigation direction:

- remote / production deploy前にbootstrap exposure / lifecycleをSecurity reviewする
- explicit bootstrap mode、post-bootstrap secret removal / rotation、outer deployment control等を候補として評価する
- production bootstrap lifecycleが決まるまで、このlocal implementationをproduction-ready security postureとみなさない

このRisk記録自体はproduction deployment方式をApprovedするDecisionではない。
