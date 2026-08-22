# Test Matrix

Product runtime bootstrap sliceは実装・main統合済み。First vertical slice全体は未完了。

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

Contractが`Approved`でも、実装やverificationが未実施ならPASS扱いしない。

## Current runtime bootstrap evidence

PR #3でmergeされたexact implementation contentに対するcurrent local evidence:

- implementation commit: `3b9fb8b78f6311b63e7a8a6ccf29ddf74415d3f6`
- merge commit: `afcf1ef0e1ca36ee0ce962be288fef41331fd694`
- Worker / D1 tests: `34 PASS`
- Web tests: `7 PASS`
- total local automated tests: `41 PASS`
- typecheck: `PASS`
- production build: `PASS`
- fresh local AUTH_DB migration: `PASS`
- fresh local APP_DB migration: `PASS`
- AUTH_DB foreign-key check: `0`
- APP_DB foreign-key check: `0`
- implementation bundle review: `PASS`
- GitHub PR diff review: `PASS`
- remote D1 Product runtime verification: `NOT_RUN`
- deployed Worker verification: `NOT_RUN`

PR #3 merge commitはreview済みimplementation commitをcanonical docs未変更のbaseへmergeしたもので、runtime code deltaを追加していない。このlocal evidenceをremote / deployed / production verificationへ自動拡張しない。

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
| CORE-ORDER-02 | Ordering | stale placement revisionによるreorderをsilent overwriteせずrejectする | Approved (D-020) | NOT_IMPLEMENTED |
| CORE-LIFE-01 | Lifecycle | Startは同一operation retryでduplicate Execution / inconsistencyを起こさない | Approved (D-012, D-020) | NOT_IMPLEMENTED |
| CORE-LIFE-02 | Lifecycle | Completeは同一operation retryで二重完了 / ended_at変更を起こさない | Approved (D-012, D-020) | NOT_IMPLEMENTED |
| CORE-LIFE-03 | Lifecycle | user全体でactive Executionは最大1つ | Approved (D-015) | NOT_IMPLEMENTED |
| CORE-LIFE-04 | Lifecycle | First sliceで`planned -> running -> completed`を正しく遷移する | Approved (D-013, D-015) | NOT_IMPLEMENTED |
| CORE-LIFE-05 | Lifecycle | 別Entryがrunning中の通常Startはimplicit interruptせずrejectする | Approved (D-015) | NOT_IMPLEMENTED |
| CORE-NEXT-01 | Next | explicit orderから次のplanned EntryをNextとして算出する | Approved (D-013) | PASS |
| CORE-NEXT-02 | Next | Next以外のplanned Entryもactive ExecutionがなければStart可能 | Approved (D-013) | NOT_IMPLEMENTED |

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

## Runtime command / retry semantics

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| RUNTIME-OP-01 | Operation | same operation identity + same semantic requestはstored resultへreplayする | Approved (D-020) | PASS |
| RUNTIME-OP-02 | Operation | same operation identityをdifferent semantic requestへ再利用するとrejectする | Approved (D-020) | PASS |
| RUNTIME-OP-03 | Failure | unexpected infrastructure failureをdeterministic Domain rejectionとしてpersistせず、retry / reconciliation余地を残す | Approved (D-020) | PASS |
| RUNTIME-OP-04 | Operation | persisted request fingerprint version incompatibilityをclient misuseへ誤分類しない | Approved (D-020) | PASS |
| RUNTIME-PLACEMENT-01 | Placement | AddTaskToDayのstale placement revisionはpartial Task / Entryを残さずrejectする | Approved (D-020) | PASS |

これらのPASSは現在実装済みのCreateProject / AddTaskToDay pathに対するevidenceであり、未実装のReorder / Start / Completeへ自動継承しない。

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
| WEB-02 | Web | Start成功後のrunning stateをfull-page reloadなしで表示する | Approved (D-013, D-020) | NOT_IMPLEMENTED |
| WEB-03 | Web | Complete後にNext Entryをprojectionして表示できる | Approved (D-013) | NOT_IMPLEMENTED |
| WEB-04 | Web | browser reload後もServer canonical stateからcorrect stateを復元する | Approved (D-013) | PASS |
| WEB-05 | Web | Project / Task+Entry作成、reorder、Start、Completeの通常mutationがfull-page reloadを要求しない | Approved (D-013, D-020) | NOT_IMPLEMENTED |
| WEB-06 | Web | async mutation failure / conflict時にClientだけのfalse-success stateを残さない | Approved (D-013) | PASS |

`WEB-05`はProject / Task+Entry部分のlocal evidenceはあるが、row全体がReorder / Start / Completeを含むため全面PASSにはしない。

## Authentication / Authorization

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| AUTH-01 | Auth | unauthenticated requestからTaskChute Domain data / mutationへアクセスできない | Approved (D-021) | PASS |
| AUTH-02 | Auth | initial production flowでpublic self-signupを許可しない | Approved (D-021) | PASS |
| AUTH-03 | AuthZ | Client申告user IDではなくauthenticated principalからownerを確定する | Approved (D-021) | PASS |
| AUTH-04 | AuthZ | 別owner resource IDを指定してもServer authorizationが拒否する | Approved (D-021) | PASS |
| AUTH-05 | Bootstrap | initial userをoperator-only bootstrapで作成し、bootstrap中もpublic signupを有効化しない | Approved (D-021, D-022) | PASS |
| AUTH-06 | Bootstrap | AUTH_DB / APP_DBの片側成功後もbootstrapを安全に再実行・reconcileできる | Approved (D-022) | PASS |
| AUTH-07 | Identity | Better Auth subjectをseparate APP_DB mappingからstable app_user_idへ解決し、physical auth user IDをDomain authorityにしない | Approved (D-021, D-022) | PASS |
| AUTH-08 | Session | initial browser sessionがrolling 7日、update / renewal threshold 1日で動作する | Approved (D-022) | PASS |

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

このPASSはD1で必要なatomicity / concurrency / idempotency strategyのfeasibility verificationであり、未実装のProduct runtime lifecycle commandやremote/deployed Product runtimeをVerifiedとするものではない。

## Android / Migration

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| ANDROID-OFFLINE-01 | Android | temporary network unavailableを考慮したoffline-capable behaviorを持つ | Approved (D-011) | NOT_IMPLEMENTED |
| MIG-01 | Migration | dry-runでsource / target dataを破壊しない | Proposed | NOT_IMPLEMENTED |

legacy ObsidianでのPASS結果を新PlatformのPASSへ自動継承しない。

一方、legacy regression scenarioは新Architecture向けTest contractを設計する際のreferenceとして利用する。

変更後の再verification範囲は`DEVELOPMENT_WORKFLOW.md`のimpact analysis原則に従う。
