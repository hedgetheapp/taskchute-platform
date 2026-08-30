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

PR #3ではCreateProject / AddTaskToDay、PR #5ではReorderEntries / StartEntry / CompleteEntryについてproduction-shaped D1 implementationを実装・reviewした。2026-08-22のpersistent non-production remote verificationでは、remote migration、schema/FK/index、Create Project、Add Task/Entry、Reorder、stale revision rejection、Start/Complete、same-operation retry、second active Execution rejection、reload recoveryまでPASSした。

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
- persistent nonprod remote runtimeでactual D1 / Worker behaviorをverificationする

実装review中には、runtime bootstrapでbroad catch後のstate観測からunexpected infrastructure failureをdeterministic Domain rejectionへ誤分類し得るpath、およびsame-operation rejection raceでstored successを捨て得るpathを検出し修正した。lifecycle reviewではcross-day Complete UI欠落、ambiguous retained operationの誤再送、O(N) Reorder statements / 200 Entry capを検出し、PR #5 merge前に修正・回帰testを追加した。

残存Risk:

- operation result retention / cleanup policyは未決
- overload時behavior、observability、backup / export、migration evolution等は未解決
- 64 KiB request-body protectionを維持しており、将来large board / API payload scaleは別途評価が必要
- D1 platform limits / pricingは変更され得るため、production deployment前にもcurrent値を再確認する
- persistent nonprodのsmoke scopeではCPU/request/D1 quota or overload errorを観測しなかったが、production loadを代表しない

Mitigation direction:

- conditional SQL + database constraint + explicit transactional batchをProduct invariant enforcementの基礎として利用する
- spike PASSをProduct runtime verificationへ自動継承しない
- local / nonprod PASSをproduction PASSへ自動継承しない
- current evidenceは`docs/TEST_MATRIX.md`へ記録する
- future commandでもinfrastructure failureとDomain rejectionを分離し、safe retry / reconciliation余地を残す

D1 feasibility gateはPASS / Verified。First Server + Web vertical sliceはImplemented + Integrated + local Testedで、persistent nonprod remote runtime / deployed Worker verificationもPASS。Product runtime全体はproduction未検証のためVerified / Releasedではない。

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
Related: D-021, D-022, D-023

Current runtimeにはoperator-only initial user provisioning用の`POST /api/internal/bootstrap` endpointが存在する。

Current mitigation:

- explicit `BOOTSTRAP_ENABLED` modeをexact `"true"`の場合だけenableし、default / missing / invalid valueはdisabled
- disabled時はrequest body parseやbootstrap logic invocationより前にresource existenceを露出しない404 response
- `BOOTSTRAP_TOKEN`必須
- fixed-length digest後のtiming-safe token comparison
- token mismatch時はresource existenceを露出しない404 response
- public Better Auth signupは常時disabled
- bootstrap専用auth pathのみoperator invocation中にuser creationを許可
- password / token / session secretをtracked file、evidence、通常logへ保存しない
- AUTH_DB成功 / APP_DB失敗から同一subjectでrecoverable

2026-08-22のpersistent nonprod remote verificationでは、temporary enable -> authenticated bootstrap -> disable -> token removalを実行し、bootstrap HTTP 200、final `BOOTSTRAP_ENABLED=false`、`BOOTSTRAP_TOKEN`削除、旧token probe 5回連続404を確認した。最終secret一覧は`BETTER_AUTH_SECRET`のみ。

残存Risk:

bootstrap disable deployment直後に旧enabled version由来とみられる400 responseを1回観測し、その後8回連続404へ収束した。deployment完了直後の一時的なversion convergenceを考慮し、operator procedureではdisable deploy後に複数回probeしてdisabled postureへの収束を確認してから完了扱いとする。

Remaining mitigation / verification:

- temporary enable -> authenticated bootstrap -> mode disable -> token remove / rotateをoperator procedureとして維持する
- disable deployment後の複数回404確認をprocedureへ組み込む
- Cloudflare Accessはpreview / internal environmentのoptional outer gateとして必要性を別途評価する
- production smokeでexact configuration / procedureを別途検証する
- nonprod PASSをproduction-ready security postureへ自動拡張しない

このRisk記録自体はproduction deployment方式をApprovedするDecisionではない。

## R-013 — Persistent non-production exposure / configuration drift
Related: D-023, D-024

Persistent non-production environmentは、verification cycleごとに削除するdisposable environmentと比べて、long-lived remote attack surfaceとconfiguration driftのRiskを持つ。

Mitigation direction:

- productionとstrictに分離する
- normal postureでは`BOOTSTRAP_ENABLED=false`を維持する
- bootstrap temporary enable中もtoken認証を必須とし、provisioning後はimmediately disableしてtokenをremove / rotateする
- secret、credential、private test data、personal credentialをtracked fileへ保存しない
- separate non-production `AUTH_DB` / `APP_DB` bindingsを明示し、local placeholderやfuture production resourcesを再利用しない
- current Free-plan limitsとusageをmonitorし、materialなblockが判明した場合は自動upgradeせずProduct Ownerへ判断を戻す
- remote D1 / deployed Worker verificationでactual configurationとruntime behaviorを確認する

2026-08-22のremote evidence:

- `taskchute-auth-nonprod` / `taskchute-app-nonprod`を`apac` location hint、jurisdictionなしで作成
- Worker `taskchute-web-nonprod`をdeployしremote runtime smoke PASS
- final bootstrap disabled + bootstrap token removed
- remote migrations / FK / active Execution partial UNIQUE index PASS
- upload gzip 353.80 KiB、startup 37–44 ms、observed smoke中にCPU/request/D1 quota or overload errorなし
- actual Cloudflare account subscription tierの独立確認は`NOT_VERIFIED`

残存Risk / Open:

- persistent nonprodのtest data / session retention・cleanup policyは未決
- smoke harnessの前提誤りにより追加test dataとsessionが残っている。active Executionは0で、承認外DELETEは実施していない
- Cloudflare Accessを後から追加するかはOpen
- production smokeは`NOT_RUN`
- observed Free-plan-shaped feasibility PASSはproduction traffic / sustained loadを代表しない

このRisk記録はproduction architecture、paid plan adoption、custom domain、cleanup policyを決定しない。

## R-014 — B1 Entry estimate concurrent update risk
Related: D-020, D-026, D-038

B1 local candidateのEntry見積編集はoperation retry safetyを持つが、Entry value revision / expected-value preconditionは導入していない。複数deviceが同じEntryの見積をconcurrentに編集した場合、確定順によるlast-write-winsとなり、一方の編集意図がsilentに上書きされる可能性がある。

Current mitigation / scope:

- B1では見積をEntry-scopedな`estimate_seconds INTEGER NULL`としてcanonical化し、同一operation retryによる重複副作用を避ける
- estimate editはplacement mutationと分離し、`placement_revision`を変更しない
- current single-user dogfood scopeでは既知のnon-blocking limitationとして明示する
- multi-device利用でMaterialな競合が観測された場合、Entry value revision、expected value、conflict UI等をB1以後の設計候補として評価する

このRisk記録はlast-write-winsを長期Product semanticsとしてApprovedするものではない。見積編集履歴 / re-estimation auditやEntry value revisionを導入する条件は`docs/OPEN_QUESTIONS.md`で管理する。

## R-015 — R1 future Day context / lazy materialization convergence risk
Related: D-020, D-031, D-034, D-039, D-040

Routine default planned startはconversion時のestablished Dayでは有効でも、将来のSection configurationでは対応intervalを持たない可能性がある。またlazy materializationのpre-readとRoutine終了・別loadが競合すると、stale planのcommitやduplicate生成を防ぐ必要がある。

Current implemented mitigation:

- mutation-time guardでplanned set全件のdaily schedule eligibility、same owner、same definition、missing occurrence、Day revisionを再検証する
- 1件でもstaleならbatch全体をno-opとし、再読込・再計算へ収束させる
- incompatible planned startはpartial Occurrence / Entry / revisionを残さずsafe failureする
- same Routine + origin Day uniquenessとD1 batch assertionをlast line of defenseとする

R1はruntime commit `f9324e866deb74277d2fd83c5945f2df4b2b95da`とevidence docs commit `c63a98f22ab685370d3e20f1f15f480fab951ae8`をPR #14 merge commit `ebaff6d156813ba78b4c5c28818f9f55db9fd970`で`main`へImplemented / Integrated済み。real local APP DB `0006` migration / preservationとsigned-in general browser flow、persistent nonprod `0006` migration / preservation / deploy / authenticated general browser flowは`PASS`した。controlled inclusive date-inputとdeployed non-null inclusive-date subcheckはbrowser automation event mismatchにより`TOOLING_BLOCKED / NOT_VERIFIED`、productionは`NOT_RUN`である。

残存Risk / Open:

- incompatible future Dayからdefaultを修正・skipするProduct recovery UXは未決
- verified current-Day scopeを越えるfuture-Day context change時のrecovery / convergenceとproduction behaviorは未検証であり、productionは`NOT_RUN`
