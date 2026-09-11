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
- D-057の`RevertEntryStart` / `SetExecutionTimes`はlifecycle command guardとoperation fingerprintを使い、Revertはactive Executionだけを削除してEntryのSection / planned start / position / `placement_revision`を変更しない
- actual intervalのoverlap判定を同一のguarded D1 batch内で行い、planned / running / completedの訂正とderived forecast再計算をatomicに扱う。completed Entryの不正な再openはrejectし、取消Executionのhistoryは生成しない
- current lifecycle / ordering local suiteでstale conflict replay、cross-owner、concurrent Start、same-operation retry、64 Entry Reorder等をcoverageする
- D-057 focused Workerでsectioned / sectionless Revert、actual correction、overlap、forecast reconciliation、Execution preservation、same-operation replay、completed reopen guardをcoverageする
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
- D-057のpersistent nonprodではmigration / deploy / DB integrity / safety probeをPASSしたが、authenticated browser connectorがないためfeature mutation / reload persistence / remote replayは`NOT_VERIFIED`とし、local PASSをremote feature PASSへ自動継承しない
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

## R-016 — Established future Dayへの後続Task追加経路
Related: D-020, D-041

Start Forecast v0.1のreal-local browser regression中、未establish future Dayへの最初のTask追加はDay establishmentとともに成功したが、同じfuture Dayへの2件目のTask追加は既存Day Navigation mutation routeでrevision 0前提のvalidationによりrejectされた。原因はfuture Add経路がowner-scoped existing Dayを解決する前にrevision 0 validationとestablishment plan読込を行っていたことだった。Day / Task / Entryのpartial writeやforecast誤表示はなく、future forecastのread projection自体は正常だった。

Mitigation / current boundary:

- Start Forecast v0.1はmutation endpointを変更せず、このfindingをforecast semanticsのPASSから分離する
- failed requestでpartial stateを残さないD-020 / D-041 safetyは維持されている
- commit `04254f60b1dfb25e66550b940b9df6b28fdf616f`でowner-scoped existing Dayを先に解決し、既存Dayならcurrent canonical revisionとfrozen historical contextを使うestablished-Day mutationへ委譲した。未establish Dayだけがrevision 0のatomic establishmentへ進む
- sequential follow-up、stale revision rejection / no partial write、exact retry、configuration change後のfrozen context、concurrent distinct operationをautomated testで確認し、real-local browserでも同じfuture Dayへの1件目 → 2件目 → 3件目 → reload / navigation復元とAPP integrityを`PASS`した。2026-09-02にはexact `main@59fd1f97` / Worker `1cf68d11-b878-42f1-9a90-f9585d6f3d4d`のpersistent nonprod representative verificationでもsequential Add、DB / frozen context preservation、final APP/AUTH integrityを`PASS`した
- migration / dependency / Product semantics変更は不要。productionは`NOT_RUN`。remote detailed retry / misuse / concurrency / ambiguity / rollbackはlocal automated evidenceのみである

このRiskはcurrent `main`のlocal + persistent nonprod representative evidence範囲でmitigatedである。記録はfuture DayのProduct semanticsを変更せず、既存Approved Decisionを越えるfallbackやclient-side revision推測を承認しない。

## R-017 — Duplicate source eligibility / canonical convergence risk
Related: D-020, D-037, D-042, D-050

Duplicateはsourceのlifecycle、logical Day、planned-start cohort、Routine relationを誤って越えると、historical stateの書換え、Routine identityの複製、order revisionの競合を起こし得る。current / established futureのplanned Entryだけを対象とし、past / running / completed / interruptedを保護する境界が必要である。

Current implemented mitigation:

- mutation-timeにowner、Day establishment、source lifecycle、planned state、same-Day / same-Section / same-cohort placementを再検証し、1つのD1 batchでTask / Entry / order / operationを確定する
- Routine-derived sourceのduplicateはnormal Task / Entryとして作成し、Routine relation / Occurrence / history / Executionをcopyしない
- same-operation replay、semantic misuse、stale revision、source change、identity collision、same-base concurrency、infrastructure ambiguityはD-020のsafe retry / canonical reconciliation境界でpartial effectを残さない
- APP `0009` migrationで`DuplicateEntry` command typeだけを追加し、existing operations / identity / historyを保持する
- visible / accessible pending feedbackとcanonical reloadをWebへ提供し、established past / record-none pastではwrite surfaceを無効化する

Duplicate first sliceはcurrent `main`のlocal automated、real-local、persistent nonprod representative verificationでPASSした。remote detailed retry / misuse / concurrency / ambiguity、cross-Day move、protected-source mutation、production feature verificationは`NOT_RUN`であり、nonprod PASSをproductionへ自動拡張しない。Mode / Note / Bulk / Delete等のbroader semanticsは未実装のまま維持する。

## R-018 — Completed Entry hard-delete fact loss / reference integrity risk
Related: D-016, D-020, D-034, D-063, D-066, D-067

D-067 intentionally removes a completed Entry and its Execution facts, so an incorrect eligibility check or partial FK cleanup could cause irreversible historical loss, orphaned operation history, or routine rematerialization. Mitigations are a server-authoritative current-Day boundary, exact completed/no-active checks, placement CAS, frozen operation replay, one atomic transaction, explicit deletion ordering for `ON DELETE RESTRICT` references, and retention assertions for Task / Project / Routine identity. The same-day RoutineOccurrence is retained and materializer no-regeneration is tested. Persistent nonprod hard-delete E2E is a separate Product Owner approval gate; production remains untouched.

## R-019 — Future Mode direct-path verification boundary
Related: D-020, D-041, D-066, D-068, D-069, D-070

D-070 adds an established-future ordinary planned Entry Mode mutation while preserving current-Day serial dispatch. The future path is direct and Entry-scoped, so exact observed Day identity / logical date guards, live relation CAS, atomic relation + operation commit, ambiguity reconciliation, and same-entry retry must remain aligned with the current operation architecture. The required persistent nonprod authenticated browser run is now recorded below for the deployed future selector and reload/fresh-tab behavior.

Current mitigation / evidence:

- Worker focused `4 / 4`, D-070 Web focused `3 / 3`, D-068 Mode Web `5 / 5`, full Worker `199 / 199`, full Web `213 / 213`, Day Navigation `15 / 15`, typecheck / build / dry-run PASS
- local race proxies cover concurrent Day move, lifecycle, and relation changes with no relation-only partial mutation; APP / AUTH isolated recovery and persistent nonprod read-only integrity are PASS
- persistent nonprod exact deploy, safety probes, migration pending `0 / 0`, backup HARD GATE, quick check / FK / rows-written checks are PASS
- 初回runではpersistent authenticated set / replace / clear、reload / fresh-tab、live-rename browser evidenceが`NOT_VERIFIED`だったが、2026-09-07のD-070 unset-label corrective closeoutでauthorized existing nonprod sessionを使ったfuture Day set / replace / clear、fresh-tab persistence、final unset `—`、console log空集合をPASSした。credential retrieval / reset、bootstrap再有効化、direct SQL feature mutation、restore、production accessは引き続き行っていない。target Day `placement_revision`は`13 -> 13`、APP/AUTH quick check / FK / rows-writtenもPASSである。

This remains a verification boundary, not approval for a broader Mode capability. D-070-ENV-02 is now authenticated-browser verified for the established future ordinary planned Entry closeout; Mode search, bulk/default/archive/delete/Routine semantics, and production remain outside scope and `NOT_RUN`.

## R-020 — Interrupt / Continuation atomicity and historical-fact risk
Related: D-020, D-028, D-066, D-073

Interrupting a running Entry while starting another can otherwise lose the source history, create two active Executions, place the continuation in the wrong cohort, or fabricate legacy Task-title facts. D-073 mitigates this with a dedicated command, exact source active-Execution and placement guards, one D1 mutation batch, explicit interrupted outcome, stable continuation chain / parent fields, frozen Section context, snapshot-only historical title projection, and post-write assertions for one active Execution and exact operation identity.

Current mitigation / evidence:

- Worker full `24 files / 206 tests`、focused placement `6 / 6`、Web full `4 files / 229 tests`、focused D-073 Web `3 / 3`、migration `4 scenarios`、typecheck / exact nonprod build / dry-run PASS。focused integration covers same-minute / different-minute placement、same-Section later-minute B insertion、stale guards、replay / misuse、injected failure ambiguity、no-partial behavior。
- APP `0023`をbackup HARD GATE後にpersistent nonprodへ適用し、APP/AUTH pending `0 / 0`、final generated-config Worker `dfe9d4e3-99f9-4f23-bfe8-2be6a27b358f`、safety `200 / 401 / 404`、APP/AUTH quick_check `ok`、FK empty、all read-only rows_written `0`を確認した。
- Existing authenticated sessionでsame-SectionのA Start → 同一interrupt minute cohort → later-minute B normal Start（confirmationなし）を実施し、A visible `中断済み` / B running / continuation plannedを確認した。B Complete後もcontinuationはplannedのまま残り、reload / fresh authenticated tab、console warning / error emptyをPASSした。Persistent rowsでもsource outcome、target completion、same chain / parent、Section / position / logical minute、Bのplanned minute不変とinsertion後positionを突合した。複数continuationのProduct semanticsは引き続きOpen Questionであり、今回のplacement correctiveでは決定していない。

Routine / Quick Interrupt / non-current Day / auto-resume / Review UI / production remain outside the mitigated scope.

## R-021 — Day keyboard shortcut focus / insertion convergence risk
Related: D-020, D-031, D-039, D-066, D-073, D-074

Keyboard shortcuts combine browser focus, an in-memory draft, execution identity, interrupt routing, and server-authoritative placement. A regression could complete the wrong Entry, create a duplicate dependent execution, route a planned B through a confirmation modal instead of `InterruptEntry`, or place a new row outside the canonical NULL-first / planned-start / manual-position order.

Current mitigation / evidence:

- `S` is accepted only inside the existing safe current-Day ordinary Task boundary. A normal pending Start queues a dependent Complete against the same execution identity; a planned B while ordinary A is running uses the existing D-073 interrupt path. Modifiers, input / IME, repeat, modal, non-current, completed, and unsafe focus paths remain no-write.
- `I` opens only a memory-only draft. Task insertion uses an explicit `after_entry` intent; Section insertion uses `section_start`. The Worker revalidates Day / Section / lifecycle / planned-start authority and performs the shift, Task / Entry, optional Mode, assertion, operation, and revision exactly once in one batch. Existing metadata is not copied and N / append Add is unchanged.
- focused Web `4 / 4`、focused placement Worker `6 / 6`、full Web `4 files / 233 tests`、full Worker `24 files / 207 tests`、migration regression `4 scenarios`、typecheck / builds / dry-run / diff-check PASS。Persistent nonprod authenticated browserではS Start → S Complete、A/B Interrupt、Task I、Section I、same-tab reload / fresh-tabを確認し、console warning / errorは`0 / 0`。
- APP read-only evidenceはplacement revision `39`、target positions `17..21`、same Section / planned-start cohort、continuation chain / parent、duplicate positions empty、active Execution `0`、quick check `ok`、FK empty、rows_written `0`。AUTH quick check / FK / rows_writtenもPASSした。D-074ではnew migration / schema change、production、restore、cleanupは行っていない。

This is a current-Day ordinary-entry verification boundary, not approval for global keyboard commands, Routine insertion, non-current Day mutation, bulk insertion, auto-resume, or production rollout. Those broader semantics remain outside scope and `NOT_RUN`.

## R-022 — Day fixed-scroll viewport transition coverage boundary
Related: D-059, D-062, D-075

D-075 changes the Day-only presentation boundary from natural page growth to a single task-list scroll owner beneath fixed date/navigation, toolbar, and table heading regions. A regression at an untested viewport transition could reintroduce overlap, hide the heading, or create a second vertical scrollbar even when the 1280 × 720 long-Day case is correct.

Current mitigation / evidence:

- CSS uses `100dvh` flex sizing, `min-height: 0`, one `.day-surface { overflow: auto }`, opaque sticky heading, and no sticky Section summary. Focused layout / DOM tests and full Web / Worker regression pass.
- Persistent nonprod at `1280 × 720` measured top/middle/bottom scroll, fixed header / toolbar / heading rects, bottom row visibility, horizontal heading / row alignment, row overflow body portal, reload / fresh tab, D-074 keyboard / overlays, and console warning / error `0 / 0`.
- The current browser connector has no viewport resize API, so the actual resize gesture is `NOT_RUN`. Until a resize-capable browser run covers a shorter and taller viewport, this remains a verification boundary; it is not permission to change Day / Settings / Routine layout policy or introduce JS scroll synchronization.

### D-075 corrective / D-076 evidence update — 2026-09-08

The previously observed short-versus-long mismatch was reproduced and measured before the fix. It was caused by content-dependent flex shrink of the toolbar, not scrollbar width. The corrective now fixes header / toolbar shrink, gives the Day surface the available viewport with `flex: 1 1 0`, removes permanent Runner bottom reservation, and adds only conditional Runner escape space. Persistent nonprod at `1280 × 720` measured stable short / long fixed geometry, Runner overlay / last-row focus clearance, Runner removal, reload / fresh-tab persistence, and console `0 / 0`.

D-076 adds no new risk category or schema. Established future-Day Task / Section `I` reuses the existing AddTask placement command with an explicit established Day ID/date guard; preview, past, running / completed, Routine-derived, and historical insertion remain outside the boundary. The initial pre-fix future request was a deterministic domain rejection with no partial write and the post-correction request converged to success. Viewport resize gesture remains `NOT_RUN` because the available browser connector cannot resize the viewport; production, restore, destructive cleanup, credentials, and bootstrap changes remain `NOT_RUN`.

## R-023 — D-077 rapid current-Day planning coordination boundary
Related: D-066, D-073, D-074, D-075, D-076, D-077

D-077 increases the rate at which planning intents are accepted while the D-066 serial dispatcher is still draining. The main residual risk is a future regression that treats an operation's transport state as the rendered truth, loses a field in the shared `UpdateTaskMetadata` command family, lets Start overtake a required planning prerequisite, or double-counts logical save work.

Current mitigation / evidence:

- Effective rendering is canonical projection plus still-valid pending intent overlays. Unsent same-field work coalesces where safe; sent operation ID and exact payload are frozen. `dayRef` is updated before the next dispatch, and title / Project are merged per field from the latest canonical base. Deferred-response tests cover Project → title, title → Project, same-field no-rewind, and Mode → immediate Start ordering.
- One global serial Day mutation dispatcher remains the only current-Day D-066 HTTP sender. Queued ordinary scopes are not treated as retained ambiguous scopes; deterministic failure, revision conflict, ambiguity, provisional Add, navigation barrier, unload guard, and lifecycle dependencies remain under existing safety boundaries. The save indicator derives from logical unresolved queue work and is tested for coalescing / convergence.
- Focused Web `212 / 212`, full Web `244`, full Worker `207`, typecheck / build / exact nonprod build / dry-run, persistent authenticated browser rapid-edit / reload / fresh-tab, console `0 / 0`, and APP/AUTH read-only integrity all PASS. No API / Domain / schema / migration / dependency / security change was introduced.

Remaining boundary: D&D / reorder was deliberately left on its existing busy behavior because safe non-blocking placement acceptance would require additional semantic proof. Multi-tab coordination, true offline / persisted queues, future / past / Routine broadening, viewport resize gesture, production, credential operations, bootstrap changes, restore, and destructive cleanup remain outside this risk mitigation and `NOT_RUN`.

## R-024 — D-078 pointer D&D browser evidence gap (Closed)

D-078 automated deferred-response coverage verifies effective-order calculation, barrier-aware coalescing, sent-operation immutability, failure/conflict/ambiguity handling, and bounded save count. Persistent nonprod browser verification now also confirms real pointer D&D at a normal-width `1280 × 720` / DPR 1 / sidebar-closed viewport, repeated pointer burst behavior, Runner overlay invariants, trailing escape, valid same-side reorder, running-boundary rejection, reload/fresh-tab persistence, and console `0 / 0`.

The earlier `332px` in-app surface remains a limitation of that individual tab, but it is no longer the only browser surface used for evidence. Closing the product sidebar exposed a normal-width `1280 × 720` surface where the Task source and drop targets were genuinely pointer-reachable; the PASS claim is based on actual browser drag gestures, not synthetic DOM events. The Runner-visible regression was likewise exercised on that same normal-width surface.

No production action, credential operation, bootstrap change, restore, destructive cleanup, API/schema/migration/dependency change, or security posture change was performed. The prior browser evidence gap is closed; automated migration helper remains `NOT_RUN` as documented, while D-078 remains `MIGRATION_NOT_REQUIRED`.

## R-025 — D-079 cross-Section pointer browser evidence boundary

D-079's Section selector, effective placement, serial Move ordering, Runner-visible barriers, reload/fresh-tab persistence, and read-only integrity are verified. The normal-width authenticated browser surface was `1440 × 900`, DPR 1, Sidebar open, and the source/drop surfaces were visibly reachable. Actual pointer drag gestures were attempted, but the connector did not cause the application's custom cross-Section drop handler to accept the drop. Because synthetic DOM events and internal helpers are not valid browser D&D evidence, pointer D&D remains `NOT_VERIFIED`; automated deferred-response Move tests remain the race authority. This is an evidence/tooling boundary, not a Product CSS change or approval to broaden scope.

The remaining mitigation is explicit classification in `CURRENT.md` / `TEST_MATRIX.md`. Section selector browser behavior is PASS, same-tab/fresh-tab persistence and console `0 / 0` are PASS, and no production, credential, bootstrap, restore, destructive cleanup, API/schema/migration/dependency, or security action was performed. A Product Owner manual browser observation on `2026-09-08` additionally reported one real cross-Section pointer drag followed by reload persistence; this narrows the product-evidence gap but does not make the connector-run pointer result reproducible or establish repeated race timing. D-079 therefore retains `POINTER_DND_CONNECTOR_NOT_VERIFIED / POINTER_DND_USER_MANUAL_VERIFIED` rather than a synthetic connector PASS.

## R-026 — D-080 provisional Add → I chaining safety

D-080 increases the number of provisional Add intents that can exist before the first Add response. The residual risks are parent operation identity overwrite, a child being dispatched before its parent establishes canonical Entry identity, an earlier reconcile stealing a newer draft/focus, or failure/ambiguity leaving a ghost descendant.

Mitigation / evidence:

- Provisional rows use stable client Entry IDs and a dependency chain. Child `after_entry` requests retain the parent stable ID and dispatch only after the parent operation converges. Effective placement is recursively derived from canonical rows plus valid pending Adds, while sent/retained parent payloads remain immutable.
- Focus/draft generations prevent older Add success from clearing or focusing over newer drafts. Deterministic failure/conflict cancels dependent descendants and the anchored draft; ambiguous parent results retain the exact operation and descendant subtree for retry/discard. Pending Section Move blocks unsafe child insertion.
- Focused D080 tests, full Web/Worker suites, exact nonprod build/deploy, authenticated A/B/C/D chain, same/fresh-tab persistence, provisional `S` no-write, console `0 / 0`, and APP/AUTH read-only integrity passed. Browser natural-latency race timing was not observable; deferred tests remain the timing authority.

D-080 remains current-Day only and introduces no API/domain/schema/migration/dependency/security change. Future/past/preview, lifecycle, reorder, move, delete, duplicate, Routine, bulk, offline persistence, multi-tab coordination, production, credential operations, bootstrap, restore, and destructive cleanup remain outside scope and `NOT_RUN`.
## R-027 — D-080 immediate post-Enter focus handoff corrective

The prior D-080 browser chain PASS did not prove that `I` was accepted while the parent Add was still unresolved. The Product Owner subsequently observed the exact gap: after Enter the row remained in `照合中` and could not immediately continue to `I`. The cause was a Web focus handoff omission in `commitDraft()`: the provisional row was rendered with a stable focus target, but `pendingFocusKey` was only set by the later Add success path.

Corrective commit `98c9c39ac4f1ca7303b1c71c7c3d6f37f05f34f8` schedules the exact stable provisional Entry focus key at valid current established-Day commit time. The mandatory deferred regression proves DOM focus and child `I` acceptance while the parent promise remains unresolved, with no timer or Server wait. Existing focus-generation/no-rewind, parent dependency, failure/conflict cancellation, ambiguous retry, Section Move barrier, and provisional `S` no-write protections remain covered.

Persistent nonprod observed the focused `保存中…` row immediately before each A/B/C `I`; natural latency was too fast to keep the parent pending in the post-action snapshot, so browser prolonged race timing remains `NOT_OBSERVED` and deferred tests are authoritative. Same-tab/fresh-tab persistence and console `0 / 0` passed. APP/AUTH quick checks and FK checks passed, migrations were pending `0 / 0`, and every successful audit query reported `rows_written=0`. The corrective migration helper was safely interrupted on Windows and is `NOT_RUN`; D-080 remains `MIGRATION_NOT_REQUIRED`.

No API, Worker, Domain, schema, migration, dependency, binding, security, production, credential, bootstrap, restore, or destructive action was introduced or performed. Numeric browser viewport/zoom was not exposed by the connector and remains `NOT_AVAILABLE` for this evidence.

## R-028 — D-081 actual-Section and execution-first ordering boundary

D-081 introduces a compatibility boundary between stored physical `position` and displayed execution-first order. The residual risk is a future path that treats display index as physical position, loses planned start when Start moves an Entry, or reclassifies an Entry without a unique frozen Section context.

Mitigation / evidence:

- StartEntry resolves actual Section server-side from frozen Day intervals, preserves original planned start, and performs cross-Section Entry move, lifecycle, Execution, snapshots, position, and placement revision atomically. Same-Section Start does not increment placement revision. No historical backfill and no SetExecutionTimes semantic change are performed.
- Projection sorts historical rows by existing `first_started_at` facts and planned rows by D-043 planned start / physical tie-break. Reorder validates the historical prefix, preserves historical positions, and reuses only the existing planned cohort slots. D-078 / D-079 regression coverage remains green.
- Focused D-081 Worker `4 files / 44 tests`、full Worker `24 files / 210 tests`、full Web `4 files / 256 tests`、typecheck/build/exact nonprod build/dry-run/diff-check、persistent nonprod Start/Complete/Interrupt browser、same-tab reload / fresh authenticated tab、APP/AUTH integrity、console `0 / 0` pass. Browserでactual Section / planned start保持、Interrupt Source/Target、continuation、active execution `0`を確認した。real-local browserおよびpointer D&D / Shift reorder browser実測は、狭いconnector viewportのため`NOT_RUN`（対応する自動テストはPASS）。migration helperも`NOT_RUN`だがmigrationは`NOT_REQUIRED`。production、restore、destructive cleanup、credentials、bootstrap remain out of scope.

## R-029 — D-082 auto-carry verification and boundary risk

D-082 adds a persistent owner-scoped setting and a Server-authoritative current-Day catch-up path. The implementation keeps the approved safety boundary by resolving the current Section from frozen intervals, excluding lifecycle/historical/unsupported rows, excluding cross-Day moved Routine Entries without failing the Day load, using the existing operations checkpoint, preserving Routine definitions, and applying one placement revision per successful non-empty carry outcome. Candidate-zero is a successful exact-replay checkpoint with unchanged placement revision, protected by a candidate-read placement CAS and bounded reread/retry; target same-time carry ordering remains before the existing cohort.

Local focused/full suites, typecheck, builds, nonprod dry-run, authenticated browser ordinary carry/reload/fresh-tab evidence, and read-only APP/AUTH integrity all pass. Residual evidence is limited to the Windows migration helper (`NOT_RUN`), exact browser console counts (`NOT_VERIFIED` because the connector exposes no console API), moved cross-Day Routine browser subcase (`NOT_RUN`), natural browser race timing (`NOT_OBSERVED`), and full export / isolated recovery validation (`NOT_RUN`; no restore). The browser fixture `D082 Corrective Browser Ordinary 0909` moved from Morning to Evening with planned start `1200`, and remote placement revision/operation/position evidence is coherent. No production, credential, bootstrap mutation, restore, destructive cleanup, or release action was performed.

## R-030 — D-083 free planned placement browser and execution overlay boundary

D-083 extends current established-Day ordinary planned Entry movement to same-Section cohort changes, cross-Section placement, and Section-area placement while preserving D-078/D-079 queue barriers and D-081 execution-first physical/display separation. The residual risk is an absolute placement intent encountering an unexpected external canonical membership/order change; the implementation does not silently revision-only rebase such an order, and the existing deterministic conflict / ambiguous-retention boundary remains authoritative.

Mitigation / evidence:

- Worker validation uses the authoritative anchor Section and planned-start cohort, keeps running/completed physical positions unchanged, reuses only planned cohort slots, and commits Section / planned start / order / revision atomically. Web derives the next gesture from the effective pending order, keeps sent operation identity/payload immutable, coalesces only inside an order-preserving segment, and stops at non-commutative lifecycle / placement barriers.
- Focused deferred coverage and the full Web/Worker suites pass. Persistent nonprod used a dedicated four-entry fixture on a `1280 × 720` / DPR 1 / Sidebar-closed surface where real pointer source/drop gestures were reachable. Same-cohort, repeated, and cross-Section drag behavior, same/fresh-tab persistence, console `0 / 0`, and APP/AUTH read-only integrity passed. Natural browser response timing was too fast to prove a prolonged second-drag race; deferred automated evidence remains the race authority.
- Runner-visible verification on the same viewport confirmed identical Day header/toolbar/surface/sticky-header geometry, fixed overlay behavior, conditional trailing escape, valid planned reorder, focus preservation, and running-boundary rejection. The initial `332 × 910` clipped tab remains `NOT_VERIFIED` for pointer reachability and is not used as PASS evidence.

D-083 remains current established-Day scope only. Future/past/preview, Routine source movement, cross-Section generic nonblocking semantics beyond the approved placement command, true offline persistence, multi-tab coordination, production, credentials, bootstrap, restore, and destructive cleanup remain outside scope and `NOT_RUN`. Migration is `MIGRATION_NOT_REQUIRED`; dependency change is `NONE`.

## R-031 — D-083 no-op placement CAS corrective

The D-083 true no-op path previously saved a success operation directly after an initial placement-revision read. A concurrent placement mutation could therefore make a stale no-op appear successful even though no Entry data changed. The corrective closes this gap without changing D-083 product semantics.

Mitigation / evidence:

- No-op success now acquires the existing `placement_command_guards` row with the expected Day revision and unchanged snapshot, inserts the success operation only while that guard exists, and cleans the guard in the same batch. A stale guard produces the existing `revision_conflict`; an already committed operation remains exact-replayable; the placement revision is not incremented for a true no-op.
- Focused deterministic coverage is `13 / 13 PASS`, including relative and legacy no-op replay, operation-id misuse, and a concurrent Reorder advancing the revision between read and commit. Full Worker `25 files / 218 tests`, full Web `4 files / 259 tests`, typecheck/build/nonprod dry-run/diff-check, nonprod deploy, APP/AUTH quick/FK/migration integrity, and `rows_written=0` evidence pass.
- The persistent authenticated browser check is `NOT_VERIFIED` because no existing authenticated CUA tab was available and credential/login operations were prohibited. The no-op race is therefore classified by deterministic Worker evidence; no browser race claim is made. The bootstrap POST safety probe is also `NOT_RUN` because the execution policy blocked a state-changing POST; no bootstrap mutation occurred.

Migration is `MIGRATION_NOT_REQUIRED`; no dependency, security, production, restore, or destructive action was introduced. Browser evidence should be revisited only when the user provides an existing authenticated persistent tab.

## R-032 — D-084 Routine placement browser evidence boundary

D-084 extends current established-Day planned Routine-derived Entry placement gestures while preserving the existing scope chooser, occurrence override, Definition CAS, D-078/D-079/D-083 placement barriers, and atomic `SetRoutineSectionPlan` operation boundary. The remaining risk is evidence-only: the available CUA state had no authenticated persistent tab and no current-Day Routine fixture, so persistent browser D&D / Shift / chooser / Definition propagation / reload evidence was not collected.

Mitigation / evidence:

- Focused Worker `6 / 6`, focused Web `228 / 228`, full Worker/D1 `25 files / 219 tests`, full Web `4 files / 260 tests`, typecheck/build/exact nonprod build/dry-run/diff-check pass. Existing Routine contract, override, position-only reorder, anchor validation, revision CAS, operation replay/misuse, and no-migration boundary are covered by automated evidence.
- Exact nonprod deployment `fd79d23c-7249-4fa5-8fdb-4d260f61a6d9` uses the existing APP/AUTH bindings with `RUNTIME_ENV=nonprod` and `BOOTSTRAP_ENABLED=false`. Root `GET /` returned `200`; credential-free protected `GET /api/v1/routines` returned `401`; bootstrap POST was not sent. A UI attempt to create a disposable Routine returned an ambiguous outcome message, so no retry or credential operation was attempted. Read-only APP evidence found no new CreateRoutine or D-084 SetRoutineSectionPlan operation.
- APP/AUTH quick check is `ok`, FK violations are empty, active executions and duplicate positions are `0`, transient assertions/guards are `0`, remote migrations are pending `0 / 0`, and successful audit queries report `rows_written=0`. Browser console counts, Routine browser interactions, persistence, and natural race timing remain `NOT_VERIFIED` / `NOT_RUN`; no browser PASS is claimed.

Until an existing authenticated persistent tab with a disposable current-Day Routine fixture is available, D-084 remains `IMPLEMENTED / INTEGRATED / TESTED / NONPROD_DEPLOYED / DB_INTEGRITY_VERIFIED / BROWSER_NOT_VERIFIED`, not fully persistent-browser verified. No production, credential, bootstrap, restore, destructive cleanup, or release action was performed.

## R-033 — D-084 placement ambiguity reconciliation corrective

The original D-084 Web convergence check could clear an ambiguous placement-bearing `SetRoutineSectionPlan` operation when only Section, planned start, and the Routine override bit matched. That projection did not prove the relative anchor edge or authoritative physical position, and the same-cohort position-only path legitimately keeps `section_plan_override_present=false`.

Corrective commit `e67297009d4f2c92d4e3b8d607716b861cf477b5` now retains every placement-bearing ambiguous operation with its immutable exact request and retry action. The non-placement pair heuristic remains unchanged. Focused Web `3 / 3`, full Web `263 / 263`, Routine Worker `6 / 6`, full Worker/D1 `220 / 220`, typecheck/build/nonprod dry-run, nonprod deployment, APP/AUTH quick/FK/migration integrity, and `rows_written=0` evidence pass. No Worker/API/schema/migration/dependency/security change was introduced.

The code correctness gap is resolved. Persistent authenticated Routine browser D&D / Shift / chooser / Definition / retry evidence and exact console counts remain `NOT_VERIFIED` because the available CUA state had no tab; no credential or login action was attempted. This is the remaining D-084 evidence boundary described in R-032, not a browser PASS claim.

## R-034 — D-085 Routine Mode corrective and migration-helper boundary

D-085 separates Routine Definition default Mode from per-Occurrence override presence while retaining Entry live Mode as the effective materialized value. Corrective commit `863f41c31901bd5e285037ad157fa337b5f77950` closes the same-value occurrence no-op gap and excludes suppressed occurrences from Routine Board default-Mode propagation.

Mitigation / evidence:

- APP migration 0025_routine_mode.sql applied remotely with 21 commands; D-085 status is `PERSISTENT_NONPROD_MIGRATED`; APP/AUTH pending migrations are 0 / 0, both quick checks are ok, FK checks are empty, active executions are 0, duplicate positions are empty, routine guards / transaction assertions are 0, and successful audit queries report rows_written=0.
- Focused Routine Board 13 / 13, focused Routine Worker 3 files / 19 tests, corrective integration 5 / 5, and full Worker/D1 26 files / 225 tests pass. Typecheck, normal/exact nonprod build, Wrangler dry-run, and diff-check pass. Existing authenticated persistent browser confirmed same-value default operation, explicit occurrence Modeなし preservation across default changes, same-tab reload, fresh authenticated tab, and empty console logs (`0 / 0`). Worker version `39b39929-3c9a-4b1e-a3ab-a4fb1919e479` ran with `RUNTIME_ENV=nonprod` and `BOOTSTRAP_ENABLED=false`.
- Pre-migration evidence is concretely verified from existing ignored artifacts: APP backup `d085-pre-0025-app-20260910.sql` (544381 bytes, SHA-256 `71ED2F31C84828E207F9D961A634AC00CD40A04B8E3F7539DDB495CF84F5040C`) and AUTH backup `d085-pre-0025-auth-20260910.sql` (5136 bytes, SHA-256 `1CEE1A8372F94D8DBF067085450555C41F03AF716E78809C2E6E3FDB5A7C62E2`); pre-apply isolated `node:sqlite` recovery validation reported quick_check ok and FK 0 for both. No persistent restore/recovery was executed.
- `npm run test:migrations` remains NOT_RUN because it produced no output and hung on Windows. This does not change the remote migration result. No new migration was added; AUTH migration remains not required.

No production, credential, bootstrap, restore, destructive cleanup, or release action was performed. No new dependency or AUTH migration was introduced. The previously recorded migration-helper and console evidence gaps are respectively `MIGRATION_HELPER_NOT_RUN` and now closed by empty browser console-log reads.

## R-035 — D-086 recurrence migration and persistent evidence boundary

D-086 replaces duplicated recurrence predicates with a shared pure logical-date evaluator and adds APP migration `0026` for typed week/month schedule fields. The approved recurrence and persistent nonprod evidence gaps are closed: fresh APP/AUTH exports were isolated-readability validated, APP 0026 was applied, and authenticated browser / DB evidence passed. The existing Windows migration helper repeatedly produced no output and was safely interrupted, while bounded `node:sqlite` validation passed; the helper remains a local tooling gap rather than an unvalidated remote migration.

Mitigation / evidence:

- Legacy daily / N-day / weekly compatibility, all approved new calendar families, exact period bounds, invalid dates, and materialization idempotency are covered by shared evaluator and Worker/Web tests. Full Worker/D1 `27 files / 233 tests`, full Web `4 files / 265 tests`, typecheck, and diff-check pass.
- Bounded upgrade validation preserved representative legacy N-day / weekly rows, rejected an invalid N-week combination, reported `quick_check=ok`, empty FK check, and no temporary migration table. Fresh-chain migration application is exercised by the Worker test harness; the comprehensive Windows helper remains `NOT_RUN`.
- Persistent nonprod evidence: APP/AUTH migration pending `0 / 0`, quick_check `ok`, FK empty, typed schedule integrity and duplicate checks empty/zero, active executions `0`, audit queries `rows_written=0`; authenticated browser editing for all ten families, Escape no-write, same-tab / fresh-tab persistence, and empty console logs passed. The disposable `D086 Browser Recurrence` fixture remains in nonprod.
- A pre-existing CreateRoutine collision was reproduced against an isolated APP export when a detached routine occupied a materialization order not represented in Board items. Corrective `f944031` now allocates Board position and materialization order independently; regression and nonprod redeploy passed. This does not change recurrence semantics or schema.
- Remaining evidence gap: the normal Windows `npm run test:migrations` helper is `NOT_RUN` after a bounded no-output hang, and browser does not exhaustively simulate every calendar date; authoritative date coverage remains in the pure evaluator / Worker suites. No production, credentials, bootstrap, restore, destructive cleanup, or release action was performed.

## R-036 — D-086 UpdateRoutine reverse-race and recurrence editor corrective

The D-086 review found that `UpdateRoutine` guarded captured occurrence rows but did not prove that the entire relevant current/future planned occurrence set was unchanged. A concurrent old-schedule materialization could therefore appear after the read and evade the stale plan guard. The corrective also made focused recurrence-control Escape behavior explicit and tightened typed schedule DTO validation to exact key sets.

Mitigation / evidence:

- Corrective commit `013e125ed2d5d919aa9309154880fe4fb04ae2e0` adds an absence/completeness CAS check for planned Routine occurrences not present in `occurrencesJson`, plus identity, Day/origin, lifecycle, placement, override, suppression, and placement-revision checks for captured rows. No second recurrence calendar algorithm was introduced; the shared evaluator remains the only recurrence semantics authority.
- Deterministic Race 1 and Race 2 tests pass. Race 1 rejects an obsolete ensure plan after schedule update; Race 2 rejects the stale UpdateRoutine plan after ensure materializes first, then exact retry rereads and suppresses the now-ineligible occurrence without duplicate identity or false success. The same test suite covers captured placement drift and strict DTO shapes.
- Focused Web Escape coverage passes for recurrence controls with focus inside the popover. Full Worker `27 files / 237 tests`, full Web `4 files / 266 tests`, typecheck, builds, nonprod dry-run, deployment, browser same/fresh-tab persistence, console logs, and APP/AUTH read-only integrity pass. Worker `33b3f81d-cca9-4662-9f99-15ef8b2ef055` is nonprod-only; APP 0026 remains applied and no corrective migration was added or applied.

Residual tooling boundary: the normal Windows `npm run test:migrations` helper remains `NOT_RUN` after its prior bounded no-output hang; the existing bounded 0026 validation and persistent migration evidence remain valid. No production, credentials/reset, bootstrap mutation, restore/recovery execution, destructive cleanup, or Release action was performed.

## R-037 — D-087 N-week calendar-week compatibility

D-087 narrows the D-086 compatibility boundary for `every_n_weeks`: the week containing `start_logical_date` is now Monday-start phase 0, while dates before the start date remain ineligible. This is an approved evaluator-only semantic correction; simple `weekly`, all other recurrence families, typed persistence, materialization identity, suppression / restore, race/CAS, and historical facts remain unchanged.

Mitigation / evidence:

- The only recurrence algorithm remains `apps/web/src/shared/routine-recurrence.ts`; no SQL, Web, or Board duplicate was introduced. Table-driven tests cover the exact 2026-10-01 required example, Monday through Sunday starts, lower/inclusive bounds, 2/3-week sequences, month/year boundaries, and unaffected recurrence regressions.
- Persistent nonprod read-only compatibility inventory before implementation found `every_n_weeks` schedule count `0` and affected old-semantics current/future planned materialized occurrence count `0`. No data rewrite or migration was needed. APP 0026 remains `PERSISTENT_NONPROD_MIGRATED`, and D-087 exact nonprod deployment/browser persistence/DB integrity passed.
- Residual evidence boundary: calendar-phase exhaustiveness is automated-test authority rather than browser date simulation. The normal Windows `npm run test:migrations` helper remains `NOT_RUN` after its existing bounded no-output hang; no migration was changed or applied by D-087.

## R-038 — D-088 official holiday snapshot and effective-day coverage

D-088 introduces a tracked Cabinet Office holiday snapshot and owner-scoped effective-day overrides. The shared classifier explicitly distinguishes `workday`, `holiday`, and `unknown`; it must not silently treat weekdays outside snapshot coverage as workdays, and official facts must remain visible when a user override changes the effective result.

Mitigation / evidence:

- Snapshot updater `npm run update:jp-holidays` is explicit, strict, deterministic, provenance-preserving, and fails on invalid/duplicate/empty/regressed source data. Runtime and ordinary build do not fetch upstream. Current snapshot has 1067 entries through 2027-12-31, including official `休日` rows, with source URLs and hash recorded in CURRENT.
- APP 0027 owner/date primary key, kind CHECK, reason normalization, revision CAS, operation fingerprint/replay, owner isolation, and atomic mutation are covered by focused Worker tests and bounded fresh/upgrade migration validation. Persistent nonprod APP 0027 apply passed only after APP/AUTH export and isolated quick/FK gate; post-apply pending is `0 / 0`, AUTH was unchanged, and read-only probes report rows_written 0.
- Authenticated same-tab Settings verification confirmed official, ordinary, unknown, holiday/workday override, official-fact preservation, reset, reload persistence, and empty console logs. Fresh authenticated tab evidence remains `NOT_VERIFIED` because CUA blocked opening/navigating a new tab; no credentials or login operation was attempted.

Residual open items remain intentionally narrow: future source coverage updates require reviewable snapshot diffs; other countries/locales and Routine business-day/holiday recurrence membership remain open and are not implemented by D-088. No historical TaskChute state is rewritten by snapshot updates.

## R-039 — D-088 override reverse-race false-success boundary

The original D-088 override implementation could record a stale update/delete/no-op as success after a concurrent command had already changed the row, because operation persistence was based on final-state equivalence or absence rather than proof that this command's expected precondition mutated atomically.

Mitigation / evidence:

- Corrective commit `ecb5b1ea118018891d1c6816d0cc5244a8fb1ba4` uses the existing D1 `transaction_assertions` convention in the same batch. Mutation changes exactly one row, operation insertion changes exactly one row, and failed assertions roll the complete batch back. The catch path distinguishes observed state drift (`revision_conflict`) from an unchanged state whose outcome remains ambiguous (`infrastructure_ambiguous`), preserving exact replay and ambiguity semantics.
- Deterministic tests cover same-result update, different-result update, concurrent delete, and no-op drift. They pass together with sequential replay/stale/owner regression and the full Worker/Web suites. The selected-date calendar read is independent of the removed list cap, so a valid override cannot be silently omitted from classification because of list ordering.

Residual evidence boundary: same-tab Settings verification and console reads passed, but fresh authenticated Settings persistence and final reset of one disposable override remain `NOT_VERIFIED` after the browser session was logged out without re-login. No credential retrieval or direct cleanup was performed. D-088 APP 0027 remains applied; no new migration, schema, API, dependency, or Product semantic change was introduced.

## R-040 — D-089 calendar-aware Routine reconciliation boundary

D-089 connects four Routine families to D-088 effective-day classification. The main risk is a split-brain result when an override edit, current-Day materialization, or UpdateRoutine reconciliation observes different override / planned-occurrence snapshots, especially when `monthly_last_workday` moves within a civil month.

Mitigation / evidence:

- One shared calendar-aware adapter consumes a bulk owner-scoped override snapshot; existing ten recurrence families remain on the pure civil-date evaluator. Unknown is never treated as workday, official snapshot facts survive effective overrides, and no SQL or UI duplicate calendar algorithm was added.
- APP 0028 adds only the four typed schedule kinds and forces irrelevant typed fields NULL. D-089 C1/C2/C3/C4 deterministic integration tests pass; D-088 C5 equal-final CAS plus D-086 complete-set race and D-087 recurrence regressions remain PASS. Moved, skip, paused, Section / Estimate / Mode override, and historical state are protected.
- Override mutation, affected planned Routine reconciliation, materialization, and operation success use calendar snapshot / completeness / protected-state assertions in one D1 batch. APP 0028 was applied to persistent nonprod only after isolated APP/AUTH backup validation; post-apply integrity and pending `0 / 0` are clean.

Remaining evidence gap: authenticated persistent browser verification of all four D-089 editors, save/reload, same/fresh-tab persistence, and console was not completed after the existing tab entered logged-out state during AX navigation. Credentials and re-login were intentionally not used. Browser status is `NOT_VERIFIED`; local automated and DB evidence remain the authority for implementation and migration correctness.

### D-089 corrective closure

Independent review reopened R-040 for three completeness gaps. The corrective at `478c1445d03cc73e6b3539ed66e13a0a0e1b32df` now distinguishes default Mode materialization from explicit `routine_occurrence_mode_overrides`, expands reconciliation to already-established current/future target Days in the edited date or affected month without creating Days, and captures/guards every newly-materialized candidate's Routine/task/schedule/period/archive/pause/default/Day/placement/Section/occurrence-absence source state in the existing atomic D1 boundary. A1–A3, B1–B5, C6–C9 and the D-086/D-087/D-088/D-089 regression gates pass.

The independent Sol Medium review route was unavailable in this environment; targeted self-review explicitly checked default-vs-explicit Mode protection, month target completeness, pause/archive/default drift, exact origin-Day uniqueness, suppression protection, replay, revision conflict, and infrastructure ambiguity. APP 0028 remains applied, no migration was added, and persistent authenticated browser evidence remains `NOT_VERIFIED` because the existing session is logged out and credentials/re-login are prohibited.

## Nonprod deployment name collision

An earlier D-089 corrective deployment retained `CLOUDFLARE_ENV=nonprod` while invoking Wrangler against an already environment-specific generated config, which published the accidental auxiliary Worker `taskchute-web-nonprod-nonprod`. The auxiliary was positively identified and deleted under the explicit cleanup approval; canonical `taskchute-web-nonprod` remained healthy and D1 data was untouched.

Mitigation: `env.nonprod.name` is explicit, and `scripts/verify-nonprod-deploy.mjs` validates the exact generated Worker name, nonprod vars, canonical APP/AUTH database names, and an unset deploy-time `CLOUDFLARE_ENV`. The recommended `deploy:nonprod` script also passes the canonical name explicitly. The guard's positive and intentional refusal checks passed; future deployments must use the generated config only after the build selector is unset.

## R-041 — Standalone Markdown Document foundation / Notes verification boundary

D-090 introduces the first persisted shared Document entity and a small Notes UI. The main correctness risks are accidentally creating an empty row when opening a draft, duplicating Create during retry, allowing stale Update to overwrite a newer revision, leaking owner-scoped Documents, or silently discarding dirty Markdown during navigation.

Mitigation / evidence: APP `0029_documents_v01.sql` adds only owner-scoped standalone Documents and extends the existing operation allow-list while preserving prior rows. Worker tests cover exact Create replay/misuse, Update revision CAS, same-result reverse race, owner isolation, deterministic list order, request validation, and atomic operation-result gating. Web tests cover zero-write draft creation, Create→Update, Save button/Ctrl+S/Cmd+S de-duplication, conflict draft retention, dirty navigation, and beforeunload. Existing 64KiB bounded JSON protection is unchanged; no new dependency, attachment storage, offline queue, or public endpoint was added.

Persistent nonprod evidence: APP/AUTH fresh exports were independently readable (`quick_check=ok`, FK empty), APP 0029 was applied once, pending is `0 / 0`, post-deploy schema/owner/operation probes are clean, root is `200`, and unauthenticated Documents API is `401`. APP/AUTH read-only probes report `rows_written=0`. The existing browser tab was logged out, so authenticated Notes CRUD, same/fresh-tab persistence, and console evidence remain `AUTHENTICATED_BROWSER_NOT_VERIFIED`; credentials and re-login were intentionally not used. This is the remaining D-090 evidence gap, not a claim of browser PASS. Production, restore, and destructive cleanup remain not run.

### D-090 corrective closure

Independent source review found that an ambiguous Notes mutation retained its exact request in one state path but ordinary title/body editing could clear that state before retry. The corrective `9e7353364edb2763bd9e20eace4edeb852e5980c` adds an unresolved-save barrier and exact-ID reconciliation: Create resolves only on exact owner-scoped identity/kind/revision/title/body match, while Update resolves only on exact payload at `expected_revision + 1`. Otherwise the original request remains frozen for exact retry; no new document identity can be generated while unresolved.

The barrier also makes title/body read-only, blocks Notes navigation/logout, and preserves dirty `beforeunload` protection until canonical resolution. Deterministic A1–A8 tests, existing D-090 regressions, full Worker/Web, and static gates pass. No Worker/API/schema/migration/dependency change was introduced; APP 0029 remains applied. Persistent authenticated browser evidence is still `AUTHENTICATED_BROWSER_NOT_VERIFIED` because the existing tab is logged out and credential retrieval/re-login is prohibited. This corrective closes the duplicate-Create and ambiguous-save correctness risk at the tested Web boundary; production, restore, and destructive cleanup remain not run.
