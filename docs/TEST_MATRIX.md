# Test Matrix

First Server + Web vertical sliceとD-038 B1は実装・main統合済み。B1 local evidenceはPASS、B1 remote / production verificationは`NOT_RUN`。persistent non-productionのpre-B1 remote runtime / deployed Worker verificationはPASS。Product runtime全体はまだVerified / Releasedではない。

この文書はverification requirementとcurrent evidenceの正本とする。

`Contract`は対象behavior自体のDecision状態を示す。

- `Approved`: canonical specification / Decisionとして確定済み
- `Proposed`: candidateであり、Approved implementation contractではない

`Evidence`は実装・検証状態を示す。

- `NOT_IMPLEMENTED`: 対象runtime behaviorが未実装
- `NOT_RUN`: test / spike contractは存在するが未実施
- `PASS`: current evidenceで要求を満たした
- `FAIL`: current evidenceで要求を満たさなかった
- `NOT_REQUIRED`: current change / scopeでは実施不要
- `LOCAL_PASS`: local working tree / commit candidateではPASSだが、mainへ未統合

Contractが`Approved`でも、実装やverificationが未実施ならPASS扱いしない。

## Current First Server + Web vertical slice evidence

`main@a1b342e0c07cffa1bbf38fbfd146e3912616d32a`に対するcurrent local / review evidence:

- lifecycle / ordering implementation commit: `09b1526f7f09554bd937aa446737a979868b779b`
- PR #5 merge commit: `1b5917ad1caff6dd648856bf7a054fa43d040a65`
- bootstrap lifecycle security: `IMPLEMENTED / INTEGRATED / LOCAL_TESTED`
- persistent nonprod config: `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / SOURCE_REVIEWED / PR_DIFF_REVIEWED`
- Worker / D1 tests: `55 PASS`
- Web tests: `18 PASS`
- total local automated tests: `73 PASS`
- `npm ci`: `PASS`
- npm audit vulnerabilities: `0`
- generated Worker types: `PASS`
- typecheck: `PASS`
- production build: `PASS`
- fresh AUTH_DB migration: `PASS`
- fresh APP_DB migration `0001 -> 0002`: `PASS`
- existing operation-row upgrade: `PASS`
- AUTH_DB foreign-key check: `0`
- APP_DB foreign-key check: `0`
- active Execution partial UNIQUE index: `PASS`
- `git diff --check`: `PASS`
- bootstrap lifecycle source-only implementation review: `PASS`
- bootstrap lifecycle GitHub PR diff review: `PASS`
- persistent nonprod config source-only implementation review: `PASS`
- persistent nonprod GitHub PR diff review: `PASS`
- remote D1 Product runtime verification: `PASS`
- deployed Worker verification: `PASS`
- production smoke test: `NOT_RUN`

この73 PASSはexplicit bootstrap mode、token rejection、cross-DB recovery、public signup regressionを含むcurrent local suiteである。local / nonprod evidenceをproduction verificationへ自動拡張しない。

## Persistent non-production remote verification evidence — 2026-08-22

Environment:

- Worker: `taskchute-web-nonprod`
- workers.dev URL: `https://taskchute-web-nonprod.taskfulness-sync.workers.dev`
- AUTH_DB: `taskchute-auth-nonprod` / `60085f8d-0c4e-4c15-98e9-3ce178398041`
- APP_DB: `taskchute-app-nonprod` / `6ad7e35f-5d03-4be3-9b00-46cd713a51c3`
- D1 creation location hint: `apac`
- jurisdiction: none
- observed region: APAC; AUTH primary response HKG / APP primary response NRT

Remote migration / schema evidence:

- AUTH migration `0001_better_auth_1_7_1.sql`: `PASS`
- APP migration `0001_runtime_bootstrap.sql`: `PASS`
- APP migration `0002_lifecycle_ordering.sql`: `PASS`
- pending migrations: AUTH 0 / APP 0
- AUTH `PRAGMA foreign_key_check`: 0
- APP `PRAGMA foreign_key_check`: 0
- `one_active_execution_per_user` partial UNIQUE index: `PASS`
- AUTH application tables observed: 5
- APP tables observed: 14

Deployment / bootstrap evidence:

- initial disabled deployment: `89b1da39-85c4-446b-864b-1e9661921f13` / version `b4894e25-a0e5-4da1-889b-428d1440f5c6`
- temporary enabled deployment: `8123e1e2-a330-491a-902e-608de7d88656` / version `fd7c32af-66f3-413b-81aa-137513665b11`
- disabled restore deployment: `1284c066-f202-43d6-9330-b1850d622732` / version `7a480b82-0e90-4eed-b0c1-6dfc7e671e05`
- final token-removed deployment: `44166465-52c6-418d-b8b2-d6034570563b` / version `98a11ea4-36b8-4177-8e38-d4a5dda81bde`
- bootstrap HTTP 200 / `recovered=false`: `PASS`
- final `BOOTSTRAP_ENABLED=false`: `PASS`
- `BOOTSTRAP_TOKEN` removed: `PASS`
- final secret list contains `BETTER_AUTH_SECRET` only: `PASS`
- final bootstrap route: 404
- old-token probe: 5 consecutive 404
- root: 200
- unauthenticated protected API: 401

Remote runtime smoke evidence:

| ID | Scenario | Evidence |
|---|---|---|
| NONPROD-REMOTE-01 | Login | PASS |
| NONPROD-REMOTE-02 | Public signup rejection | PASS |
| NONPROD-REMOTE-03 | Create Project | PASS |
| NONPROD-REMOTE-04 | Add 3 Tasks / Entries | PASS |
| NONPROD-REMOTE-05 | Reorder | PASS |
| NONPROD-REMOTE-06 | stale placement revision rejection | PASS (409) |
| NONPROD-REMOTE-07 | Start | PASS |
| NONPROD-REMOTE-08 | same-operation Start retry | PASS |
| NONPROD-REMOTE-09 | second user-wide active Execution rejection | PASS (409) |
| NONPROD-REMOTE-10 | Complete | PASS |
| NONPROD-REMOTE-11 | same-operation Complete retry | PASS |
| NONPROD-REMOTE-12 | reload / canonical order-state recovery | PASS |
| NONPROD-REMOTE-13 | active Execution converges to 0 | PASS |
| NONPROD-REMOTE-14 | Logout | PASS |
| NONPROD-REMOTE-15 | protected API after logout | PASS (401) |

Free-plan-shaped feasibility evidence for the observed smoke scope:

- Worker upload gzip: `353.80 KiB`
- startup observed: `37–44 ms`
- no observed CPU 1102, request 1027, D1 quota, or overload errors during smoke
- AUTH DB: 81,920 bytes / 176 rows read / 51 rows written over observed 24h window
- APP DB: 225,280 bytes / 1,518 rows read / 564 rows written over observed 24h window
- actual Cloudflare account subscription tier independently confirmed: `NOT_VERIFIED`
- paid-plan upgrade: `NOT_RUN`

Operational observation:

bootstrap disable deploy直後に旧enabled version由来とみられる400を1回観測し、その後8回連続404へ収束した。今後のbootstrap lifecycle verificationではdisable deployment後に複数回probeし、disabled postureへの収束を確認してから完了扱いとする。

Remote smoke harnessの前提誤りにより追加test dataとsessionが残ったが、active Executionは0。cleanup / retention policyはOpen Questionであり、このevidence取得時には承認外DELETEを実施していない。

## Core Domain

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| CORE-ID-01 | Identity | TaskとEntryを曖昧にcollapseしない | Approved (D-010) | PASS |
| CORE-ID-02 | Identity | EntryをTaskChuteDay / Section間で移動してもEntry identityを維持する | Approved (D-015) | NOT_IMPLEMENTED |
| CORE-ID-03 | Identity | initial runtime entity IDはUUIDv7を使用し、opaque identityとして扱いID timestampをordering authorityにしない | Approved (D-022) | PASS |
| CORE-PROJECT-01 | Project | Taskはinitial scopeで0..1 Projectに所属する | Approved (D-015) | PASS |
| CORE-SECTION-01 | Section | Sectionはrename等でidentityを失わないstable entityである | Approved (D-015) | NOT_IMPLEMENTED |
| CORE-SECTION-02 | Section | First sliceのSectionはuser-global stable entityとして複数TaskChuteDayで再利用できる | Approved (D-022) | NOT_IMPLEMENTED |
| CORE-ORDER-01 | Ordering | TaskではなくEntry identityによるexplicit orderをpreserveする | Approved (D-013, D-015) | PASS |
| CORE-ORDER-02 | Ordering | stale placement revisionによるreorderをsilent overwriteせずrejectする | Approved (D-020) | PASS |
| CORE-LIFE-01 | Lifecycle | Startは同一operation retryでduplicate Execution / inconsistencyを起こさない | Approved (D-012, D-020) | PASS |
| CORE-LIFE-02 | Lifecycle | Completeは同一operation retryで二重完了 / ended_at変更を起こさない | Approved (D-012, D-020) | PASS |
| CORE-LIFE-03 | Lifecycle | user全体でactive Executionは最大1つ | Approved (D-015) | PASS |
| CORE-LIFE-04 | Lifecycle | First sliceで`planned -> running -> completed`を正しく遷移する | Approved (D-013, D-015) | PASS |
| CORE-LIFE-05 | Lifecycle | 別Entryがrunning中の通常Startはimplicit interruptせずrejectする | Approved (D-015) | PASS |
| CORE-NEXT-01 | Next | explicit orderから次のplanned EntryをNextとして算出する | Approved (D-013) | PASS |
| CORE-NEXT-02 | Next | Next以外のplanned Entryもactive ExecutionがなければStart可能 | Approved (D-013) | PASS |

## TaskChuteDay / History

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| CORE-DAY-01 | TaskChuteDay | non-midnight boundaryでcivil instantを正しいlogical TaskChuteDayへ解決する | Approved (D-017) | PASS |
| CORE-DAY-02 | TaskChuteDay | historically establishedされたpast dayを後のboundary / timezone変更で再分類しない | Approved (D-017) | PASS |
| CORE-DAY-03 | TaskChuteDay | boundary / timezone transitionを含めconsecutive intervalにgap / overlapを作らない | Approved (D-017) | PASS |
| CORE-DAY-04 | TaskChuteDay | Execution crossing logical boundaryをfactとして分断せず、overlapでday別集計可能 | Approved (D-016, D-017) | NOT_IMPLEMENTED |
| CORE-DAY-05 | TaskChuteDay | initial bootstrapでIANA timezone / boundaryを明示し、暗黙のProduct defaultを適用しない | Approved (D-022) | PASS |
| CORE-DAY-06 | TaskChuteDay | ambiguous / nonexistent local boundaryを`compatible` semanticsで解決し、start/endを別々にtimezone ruleから決定する | Approved (D-017, D-022) | PASS |
| CORE-DAY-07 | TaskChuteDay | materialized dayがactual intervalとestablishment timezone / boundary contextを保持する | Approved (D-017, D-022) | PASS |
| HISTORY-01 | History | Task / Project等の現在metadata変更で過去Executionのhistorical meaningを黙って再分類しない | Approved (D-016) | NOT_IMPLEMENTED |
| HISTORY-02 | History | historical reference中のentityをunsafe hard deleteしてfactを参照不能にしない | Approved (D-016) | NOT_IMPLEMENTED |

Cross-day lifecycle testでは、前日Entryのactive Executionを翌TaskChuteDayでも同一Executionとして保持し、分割せずCompleteできることをPASSしている。ただしlogical day overlapによるReview / aggregation queryは未実装のため`CORE-DAY-04`全体はPASSへ昇格しない。

## Runtime command / retry semantics

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| RUNTIME-OP-01 | Operation | same operation identity + same semantic requestはstored resultへreplayする | Approved (D-020) | PASS |
| RUNTIME-OP-02 | Operation | same operation identityをdifferent semantic requestへ再利用するとrejectする | Approved (D-020) | PASS |
| RUNTIME-OP-03 | Failure | unexpected infrastructure failureをdeterministic Domain rejectionとしてpersistせず、retry / reconciliation余地を残す | Approved (D-020) | PASS |
| RUNTIME-OP-04 | Operation | persisted request fingerprint version incompatibilityをclient misuseへ誤分類しない | Approved (D-020) | PASS |
| RUNTIME-PLACEMENT-01 | Placement | AddTaskToDayのstale placement revisionはpartial Task / Entryを残さずrejectする | Approved (D-020) | PASS |
| RUNTIME-PLACEMENT-02 | Placement | Reorder conflict / failureでmixed orderを残さず、winner resultとfinal stored orderを一致させる | Approved (D-020) | PASS |
| RUNTIME-LIFE-01 | Lifecycle | concurrent Startでexactly one active Execution / running Entryへ収束する | Approved (D-015, D-020) | PASS |
| RUNTIME-LIFE-02 | Lifecycle | Section設定済みEntryのStartとCompleteはplacement変更を伴わず、`placement_revision`を変更しない | Approved (D-020) | PASS |
| RUNTIME-LIFE-03 | Lifecycle | SectionなしEntryのStartはexpected placement revisionを前提に、Section配置・revisionのexactly one increment・Execution・lifecycle・operation resultをatomicに確定する | Approved (D-020) | PASS |
| RUNTIME-LIFE-04 | Lifecycle | Complete requestはplacement revisionを要求せず、`placement_revision`を変更しない | Approved (D-020) | PASS |

Current lifecycle / ordering suiteではsame-operation retry / misuse、stale conflict replay、cross-owner Reorder、historical Entryを越えないplanned-only Reorder、atomic rollback、64 Entry set-based Reorder、sectioned lifecycle-only Start / Complete、SectionなしStartのplacement atomicityを明示的にcoverageしている。

## Dogfood Day v0.1-B / B1 integrated implementation evidence

以下は2026-08-28に実行・reviewされたlocal evidenceである。B1 implementation commit `1c14eef4695c2de2ced65f43250544159e039485`はPR #13 merge commit `1609331ae32d3db36091ac0e4b0322c3757e3a9a`でmainへIntegrated済み。integrationはこのevidenceのpost-merge rerun、deployed verification、remote D1 verification、Product全体のVerified状態を意味しない。

Implementation / review provenance and automated evidence:

- B1 implementation commit: `1c14eef4695c2de2ced65f43250544159e039485`
- PR #13 merge commit: `1609331ae32d3db36091ac0e4b0322c3757e3a9a`
- historical review base: `dogfood-day-v01a@b6419f522ee6cb643b5b01a1b1c70f37b3da10a9`
- historical reviewed patch: 26 files、`+2,135 / -110`、SHA-256 `2D0154230E253B3DB2916604C346AE902F1A7CF6524561F2F4921164653B116D`
- source review: `PASS`
- Worker / D1 tests: `79 PASS`
- Web tests: `40 PASS`
- upgrade migration: `1 scenario / 15 checks PASS`
- typecheck / production build / `git diff --check`: `PASS`

Real local evidence — 2026-08-28, `Asia/Tokyo`:

- real local APP DB backup + `0003` migration + identity/history comparison + `PRAGMA foreign_key_check = 0`: `PASS`
- signed-in real-browser B1 verification: `PASS` for the rows below
- reload persistence: `PASS`
- browser unexpected console errors: `0`
- real Japanese IME: `NOT_RUN`
- B1 persistent nonprod / production verification: `NOT_RUN / NOT_RUN`
- Integrated to `main` / Released: `YES / NO`

local dogfoodで利用したSection set / rangesはuser-specific verification dataであり、Product default evidenceとして扱わない。

| ID | Area | Requirement | Evidence |
|---|---|---|---|
| B1-ORDER-01 | Reorder | Section / Sectionなし双方でmutation-time lifecycle snapshotを検証し、running / completed Entryのnumeric positionを含むcanonical slotを固定してhistorical境界越えをrejectする | PASS |
| B1-CONTEXT-01 | TaskChuteDay | configured / legacy双方のconcurrent context materializationが単一集合へ収束し、60 Sectionでも単一set-based statementでmaterializeする。established contextはcurrent Section metadataやtimezone再解決に依存せずhistorical authorityとして読み、configured actual intervalの内部連続性は検証する | PASS |
| B1-START-01 | Lifecycle / Placement | SectionなしStartのstale / concurrent loserがrevision conflictとなり、配置・revision・Execution・lifecycle・operation resultにpartial effectを残さない | PASS |
| B1-START-02 | Lifecycle / Retry compatibility | Sectioned Startはplacement revisionを省略した単一canonical request shapeを強制し、0003 upgrade後もoptional B1 result fieldsを含まないpre-B1 fingerprint / resultをexact replayする。SectionなしStartだけがinteger placement revisionを送る | PASS |
| B1-CONFIG-01 | Section configuration | initial configurationはserver command timeのcurrentかつlegacy-unknownなTaskChuteDayだけへ適用し、historical Dayをrewriteしない。同一success operationはDay境界後もreplayする。hidden Section-count capを置かず、60 Sectionを固定6-statement mutation batchでatomicに確定する | PASS |
| B1-MOVE-01 | Placement | MoveEntryがold groupを再採番せずgapを保持し、stale loserは全Entry位置とrevisionを変更しない | PASS |
| B1-CONTEXT-02 | Authorization / Projection | real Section指定commandはDay Section contextを検証し、out-of-context Entryをprojectionから黙って欠落させない | PASS |
| B1-MIGRATION-01 | Migration | isolated local D1で`0001 -> 0002 -> v0.1-A fixture -> 0003`を適用し、identity / lifecycle / nullable fields / indexes / active unique / FKを検証する | PASS |
| B1-HTTP-01 | Worker HTTP | initial Section configuration / MoveEntry / SetEntryEstimate routeをsigned-in test sessionで検証する | PASS |
| B1-LOCAL-DB-01 | Migration / Integrity | real local APP DBをbackup後に0003へupgradeし、original identity/history/operationを保持してFK 0、legacy Section time非捏造を確認する | PASS |
| B1-BROWSER-01 | Section / Reload | signed-in real browserでauthoritative Section range、extended-time表示、Section estimate total、virtualなSectionなし、reload persistenceを確認する | PASS |
| B1-BROWSER-02 | Sectionなし / Estimate | SectionなしEntryをEnterでexactly one作成し、15分を900秒として保存・集計・reloadし、estimate editでplacement revisionが変わらないことを確認する | PASS |
| B1-BROWSER-03 | Placement | planned EntryをSectionなし↔real Sectionへ移動し、各mutationでplacement revisionがexactly one増え、reload後も保持される | PASS |
| B1-BROWSER-04 | Start / Runner | SectionなしStartがactual current Sectionへの配置、revision exactly one increment、running lifecycle、exactly one Execution、Runnerをatomicに確定し、reload後も保持する | PASS |
| B1-BROWSER-05 | Complete | CompleteがExecutionをexactly once終了しactive Executionを0へ戻し、placement revisionを変えず、reload / completed visibility toggleで保持される | PASS |
| B1-BROWSER-06 | Reorder | natural planned cohortでpointer / Shift+Arrow reorderを行い、running / completed boundaryを越えずcanonical orderへ復元できる | PASS |
| B1-IME-01 | Web / IME | real OS Japanese IME composition Enterがpremature submitせず、normal Enterでexactly one作成する | NOT_RUN |
| B1-REMOTE-01 | Remote nonprod | B1 migration / runtime / browser flowをpersistent nonprodで検証する | NOT_RUN |
| B1-PROD-01 | Production | B1 production migration / smokeを検証する | NOT_RUN |

## Routine / Documents

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| ROUTINE-01 | Routine | RoutineOccurrenceは成立時のorigin TaskChuteDayをEntry延期後も保持する | Approved (D-015) | NOT_IMPLEMENTED |
| ROUTINE-02 | Routine | 8/21持越しOccurrenceと本来の8/22 Occurrenceを別identityとして同日に保持できる | Approved (D-015) | NOT_IMPLEMENTED |
| ROUTINE-DOC-01 | Documents | Routine共通noteはTask Primary Documentを利用できる | Approved (D-018) | NOT_IMPLEMENTED |
| ROUTINE-DOC-02 | Documents | RoutineOccurrenceはoptional Documentを持ち、同一Occurrenceの複数Entryで共有できる | Approved (D-018) | NOT_IMPLEMENTED |
| DOC-01 | Documents | Markdown save/read round-tripでcontent semanticsを保持する | Approved (D-006) | NOT_IMPLEMENTED |
| DOC-02 | Documents | Task / Projectのlogical Primary Document identityをowner identityと分離する | Approved (D-018) | NOT_IMPLEMENTED |
| ATTACH-01 | Attachment | Noteでimage attachmentを扱える | Approved (D-007) | NOT_IMPLEMENTED |
| ATTACH-02 | Attachment | Commentでimage attachmentを扱える | Approved (D-007) | NOT_IMPLEMENTED |

## Place / Location / Projections

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| PROJ-01 | Projection | DayBoard / Calendar / Timeline / Review / Mapを別canonical task-state authorityとして扱わない | Approved (D-016) | NOT_IMPLEMENTED |
| LOC-01 | Location | location permission denial / unavailableでもStart / Complete lifecycleは成功可能 | Approved (D-019) | NOT_IMPLEMENTED |
| LOC-02 | Location | planned Placeとobserved Execution Locationを区別する | Approved (D-019) | NOT_IMPLEMENTED |
| LOC-03 | Location | LocationSnapshotでcapture instant / accuracy等のobservation contextを保持できる | Approved (D-019) | NOT_IMPLEMENTED |
| LOC-04 | Location | location enrichmentのretryがduplicate Executionを生成しない | Approved (D-012, D-019) | NOT_IMPLEMENTED |

## Web First vertical slice

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| WEB-01 | Web | DayBoardをcanonical Entry orderで表示する | Approved (D-013) | PASS |
| WEB-02 | Web | Start成功後のrunning stateをfull-page reloadなしで表示する | Approved (D-013, D-020) | PASS |
| WEB-03 | Web | Complete後にNext Entryをprojectionして表示できる | Approved (D-013) | PASS |
| WEB-04 | Web | browser reload後もServer canonical stateからcorrect stateを復元する | Approved (D-013) | PASS |
| WEB-05 | Web | Project / Task+Entry作成、reorder、Start、Completeの通常mutationがfull-page reloadを要求しない | Approved (D-013, D-020) | PASS |
| WEB-06 | Web | async mutation failure / conflict時にClientだけのfalse-success stateを残さない | Approved (D-013) | PASS |
| WEB-07 | Web | ambiguous Reorder / Start / Completeは元operationだけを明示retryでき、別操作から旧operationを暗黙再送しない | Approved (D-020) | PASS |
| WEB-08 | Web | current DayBoard外のEntryに属するactive ExecutionもWebからCompleteできる | Approved (D-013, D-017) | PASS |

Web suiteではdeterministic Reorder / Start conflict後のcanonical refetch、ambiguous operationのRetry / Discard、unrelated button guard、cross-day active Execution completionを明示的にcoverageしている。

## Authentication / Authorization

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| AUTH-01 | Auth | unauthenticated requestからTaskChute Domain data / mutationへアクセスできない | Approved (D-021) | PASS |
| AUTH-02 | Auth | initial production flowでpublic self-signupを許可しない | Approved (D-021) | PASS |
| AUTH-03 | AuthZ | Client申告user IDではなくauthenticated principalからownerを確定する | Approved (D-021) | PASS |
| AUTH-04 | AuthZ | 別owner resource IDを指定してもServer authorizationが拒否する | Approved (D-021) | PASS |
| AUTH-05 | Bootstrap | initial userをoperator-only bootstrapで作成し、bootstrap中もpublic signupを有効化しない | Approved (D-021, D-022, D-023) | PASS |
| AUTH-06 | Bootstrap | AUTH_DB / APP_DBの片側成功後もbootstrapを安全に再実行・reconcileできる | Approved (D-022, D-023) | PASS |
| AUTH-07 | Identity | Better Auth subjectをseparate APP_DB mappingからstable app_user_idへ解決し、physical auth user IDをDomain authorityにしない | Approved (D-021, D-022) | PASS |
| AUTH-08 | Session | initial browser sessionがrolling 7日、update / renewal threshold 1日で動作する | Approved (D-022) | PASS |
| AUTH-09 | Bootstrap | bootstrap modeがmissing / empty / disabled / invalidならbody parseやbootstrap logicより前に404 postureでunavailableとなる | Approved (D-023) | PASS |
| AUTH-10 | Bootstrap | bootstrap modeがenabledでもmissing / wrong tokenをinformation disclosureなしにrejectし、correct tokenでflowを実行できる | Approved (D-023) | PASS |
| AUTH-11 | Secrets | bootstrap rejection response / normal error logにprovided bootstrap tokenを出力しない | Approved (D-022, D-023) | PASS |

## D1 feasibility gate

以下はProduct runtime実装前にlocal D1とtemporary remote D1の両方で実施したfeasibility evidenceである。

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| D1-SPIKE-01 | D1 | intentional failure時にtransaction partial stateを残さない | Approved (D-020) | PASS |
| D1-SPIKE-02 | D1 | concurrent Startでsuccess / active Execution / running Entryがexactly oneになる | Approved (D-020) | PASS |
| D1-SPIKE-03 | D1 | same-operation concurrent retryでExecutionをexactly oneだけ作る | Approved (D-020) | PASS |
| D1-SPIKE-04 | D1 | same operation IDをdifferent semantic requestへ再利用するとrejectする | Approved (D-020) | PASS |
| D1-SPIKE-05 | D1 | Complete retryで最初のended_atを維持する | Approved (D-020) | PASS |
| D1-SPIKE-06 | D1 | same placement revisionからのconflicting reorderはexactly one success | Approved (D-020) | PASS |
| D1-SPIKE-07 | D1 | reorder failure / conflictでmixed orderを残さない | Approved (D-020) | PASS |
| D1-SPIKE-08 | D1 | historical reference中のunsafe hard deleteをconstraintで防ぐ | Approved (D-016, D-020) | PASS |

D1 feasibility gateは`spike/d1-feasibility@eda694e22fd742827da5b90967c6b0305b885033`のcurrent harnessでLOCAL / temporary REMOTE双方のevidenceが揃い、`D1-SPIKE-01`〜`D1-SPIKE-08`をPASSとしてreview済み。詳細evidenceは`spikes/d1-feasibility/EVIDENCE.md`を参照する。

このPASSはD1で必要なatomicity / concurrency / idempotency strategyのfeasibility verificationであり、Product runtimeのremote / deployed verificationを代替しない。

## Android / Migration

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| ANDROID-OFFLINE-01 | Android | temporary network unavailableを考慮したoffline-capable behaviorを持つ | Approved (D-011) | NOT_IMPLEMENTED |
| MIG-01 | Migration | dry-runでsource / target dataを破壊しない | Proposed | NOT_IMPLEMENTED |

legacy ObsidianでのPASS結果を新PlatformのPASSへ自動継承しない。

一方、legacy regression scenarioは新Architecture向けTest contractを設計する際のreferenceとして利用する。

変更後の再verification範囲は`DEVELOPMENT_WORKFLOW.md`のimpact analysis原則に従う。
