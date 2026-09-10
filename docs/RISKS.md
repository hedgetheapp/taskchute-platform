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
