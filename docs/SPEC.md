# Specification

この文書は、明示的にApprovedされたProduct / Domain behaviorを定義する。

exact DB schema、SQL、UI component library、Android local DB、offline conflict algorithm等は、別途DecisionされるまでOpenとする。

## User model

- 初期はone user
- multiple devices / clients
- registration、team、organization、billingは初期scope外
- Serverはauthenticated principalからTaskChute app userを確定し、Clientが申告したuser IDをauthorityとして信用しない
- initial userはoperator-only one-shot bootstrapで作成し、public self-signupはbootstrap中も含めて有効化しない
- bootstrap endpoint availabilityは明示的bootstrap modeで制御し、modeがmissing / empty / disabled / invalidの場合は404 postureでunavailableとする。initial enabled valueはexact lowercase `"true"`のみとする
- bootstrap modeがenabledでもvalid `BOOTSTRAP_TOKEN`認証を必須とする。provisioning後はmodeをdisableし、通常運用前にtokenをremoveまたはrotateする
- initial browser sessionはrolling 7日、update / renewal threshold 1日とする

## Client availability

Web appをprimary / universal clientとし、initial development priorityを最優先とする。

- 対応browserを通じてWindows、Android、iOS等からCore TaskChute experienceを利用できることをtargetとする。
- native appをTaskChute利用の必須条件としない。
- Android dedicated appはnative first-class clientとして後続対応する。
- Wear OS / Pixel Watchはcompanion clientとして対応対象とする。
- native iOS appは将来対応するが、優先度は低い。
- supported browser baseline、responsive / adaptive behavior、PWA、Web offline capability等のexact scopeは未決。

## Core identity and ownership

Task definition identityとboard placement / execution identityは別概念とする。

- Task identityはstableでなければならない。
- Entry identityはstableでなければならない。
- mutableなtitleをidentityとして扱わない。
- 1つのTaskが複数のEntryとして現れることを許容する。
- EntryをTaskChuteDay / Section間で移動・並び替えしてもEntry identityを変更しない。
- identityが曖昧な場合、推測したtargetを黙ってmutateしない。
- Taskは初期scopeで0..1 Projectに所属できる。
- First sliceのSectionはuser-globalなstable entityとし、複数TaskChuteDayのEntryが同じSection identityを再利用できる。
- initial runtimeで新規作成するTask / Entry / Project / Section / Execution等のentity IDはUUIDv7を使用する。
- IDはDB / APIでopaque stringとして扱い、UUIDv7に含まれるtimestamp情報をDomain order、priority、history authorityとして利用しない。
- IDはClient生成可能とし、将来offline-capable clientでも同じidentity contractを利用できるようにする。

## TaskChuteDay

TaskChuteDayはcivil dateとは別のlogical activity dayとする。

- canonical TaskChute timezoneとDayBoundaryPolicyから定義する。
- 連続する`[start, end)` intervalとして扱い、consecutive day間にgap / overlapを作らない。
- day lengthを常に24時間とは仮定しない。
- UIでは`30:00`等のextended-time notationを扱える方向とするが、actual timestampを架空の30時刻へ変換して保存しない。
- historically establishedされた過去TaskChuteDayは、後のboundary / timezone変更でretroactiveに再分類しない。
- initial bootstrapではcanonical IANA timezone、TaskChuteDay boundary、initial Section configurationを明示入力する。
- `Asia/Tokyo`、civil midnight等を暗黙のProduct defaultとして適用しない。test fixtureとして明示利用することは許容する。
- ambiguous / nonexistent local timeはinitially Temporal-compatibleな`compatible` semanticsで解決する。
- day startとnext-day boundaryをそれぞれtimezone ruleからinstantへ解決し、`end = start + 24h`とは計算しない。
- materialized TaskChuteDayはactual `[start, end)` intervalと、そのintervalをestablishしたtimezone / boundary contextを保持する。
- future dayのmaterialize / freeze時点、travel時timezone UX、per-day override等はOpenとする。

## Entry placement and ordering

EntryはTaskChuteDay / Section上のplacement / execution targetとする。

- order authorityはEntry identityとする。
- 同一Taskが複数Entryとして存在してもordering semanticsを壊さない。
- Next Entryはexplicit order上のplanned Entryから計算するprojectionであり、hard lockではない。
- active Executionが存在しない限り、Next以外のplanned Entryも明示Startできる。
- stale stateによるplacement overwriteが危険なmutationではrevision / preconditionを利用し、silent last-write-winsを行わない。

### Planned start persistence and canonical order

Status: Approved (D-031, D-039). Runtime: IMPLEMENTED.

- Entryの開始予定はnullableな`planned_start_minute INTEGER`として保存する。`NULL`は開始予定なし、non-nullはestablished TaskChuteDayの`logicalDate`を基準にしたextended wall-clock minuteであり、Day開始を0とするoffsetやactual timestampではない。
- Section contextの`logical_start_minute` / `logical_end_minute`と同じ座標系を使い、valid rangeは`[establishment_boundary_minutes, establishment_boundary_minutes + 1440)`とする。
- 05:00 boundaryでは05:00 = `300`、翌03:00 = `27:00` = `1620`、翌05:00 = `29:00` = `1740`となり、Day end boundaryの`1740`はplanned startとしてexclusiveである。
- extended wall-clock timeを許容する。non-null値は上記range内のintegerで、authoritative time rangeを持つexactly one timed Sectionの`[logical_start_minute, logical_end_minute)`へ属する必要がある。legacy unknown timingから値やSectionを推測しない。
- `Sectionなし`とnon-null開始予定は共存しない。
- real Section内のplanned Entryは、開始予定なしを`position`順で先に置き、開始予定ありをminute昇順、同minuteを`position`順で置く。`position`をmanual / stable tie-break authorityとして再利用する。
- 開始予定の設定・変更は該当Sectionへのauto-placementとcanonical orderingをatomicに行う。clearは現在Sectionを維持して開始予定なしcohortへ移す。どちらもplacement revisionをexactly once増やす。
- explicit Section moveは開始予定をclearし、Sectionから時刻を推測しない。MoveEntry全体でplacement revisionをexactly once増やす。
- manual Reorderは開始予定なしcohort内または同一minute cohort内だけを許可し、異なるcohort / minuteやhistorical boundaryを越えない。
- running / completed等のhistorical rowはplanned-start mutation / reorder対象にしない。

`SetEntryPlannedStart` logical commandは`operation_id`、`entry_id`、`taskchute_day_id`、integerまたは`null`の`planned_start_minute`、`expected_placement_revision`を受け取る。ownerはauthenticated principalから解決する。同じoperation + semantic requestはreplayし、different-semantic reuseとstale revisionをpartial effectなしでrejectする。planned-start、Section、order、revision increment、operation resultはatomicに確定する。

Startはplanned-startのnot-before制約を持たず、早期Startを許可する。Sectionなし Startのactual current Section配置は開始予定が`NULL`の場合だけ適用する。

## Lifecycle and Execution

First vertical sliceのEntry lifecycleは以下に限定する。

`planned -> running -> completed`

- user全体でactive Executionは最大1つとする。
- planned EntryのStartは、別Entryにactive Executionが存在する場合、既存Executionを黙ってstop / interruptせずrejectする。
- Startはactive Executionを1つ作り、対象Entryをrunningにする。
- Completeは対象のactive Executionを終了し、対象Entryをcompletedにする。
- completedからplannedへ戻すReopen、Pause / Resume、Interrupt、Cancel等はinitial scope外とする。
- Start / Completeは同一logical operationのretryでExecution二重生成、ended_at書き換え、二重副作用等を起こさない。
- actual execution timestampとServerがoperationを受理した時刻を将来区別できる設計余地を残す。Android offline時のexact clock trust / sync semanticsはOpenとする。

ExecutionがTaskChuteDay境界をまたいでも、境界でExecution fact自体を分割しない。Review等ではlogical day intervalとのoverlapで集計できることを要求する。

## Routine foundations

Routineは以下のconceptual relationを前提とする。

`Task -> 0..* RoutineDefinitions -> RoutineOccurrences -> 0..* Entries`

- RoutineDefinitionはTaskの繰り返し定義であり、Task noteとは別の重複noteを必須にしない。
- RoutineOccurrenceは特定のTaskChuteDay分として成立するlogical occurrenceである。
- Occurrence成立後にEntryを別TaskChuteDayへ延期・移動しても、そのOccurrenceが何日分だったかを失わない。
- 8/21分を8/22へ延期した場合、actual executionは8/22として残しつつ、origin occurrenceは8/21分として区別できる。
- 8/21分の持越しと本来の8/22分は別Occurrence / Entryとして同じ日に存在できる。
- 遅延実施をstreak上の当日達成とみなすか等のachievement semanticsはOpenとする。

### Minimal Routine R1 daily slice

Status: Approved (D-040). Runtime: IMPLEMENTED IN LOCAL CANDIDATE / NOT_INTEGRATED.

R1はcurrent-Dayのplanned non-Routine Entryを起点とするdaily-only Routine dogfood sliceとする。

- conversionはexisting Task / Entry identity、current TaskChuteDay、Sectionまたは`Sectionなし`、見積、開始予定を維持し、duplicate Task / Entryを作らない。
- current valuesをRoutineDefinitionのdefault Section / estimate / planned startとしてsnapshotし、current DayをoriginとするRoutineOccurrenceをmaterializeしてexisting Entryへ関連付ける。
- scheduleはconversion Dayをinclusive startとする毎日で、終了なしまたはinclusive end logical dateを持つ。
- persistenceはowner-scoped stable RoutineDefinition / RoutineOccurrenceとnullable Entry relationを持ち、same Routine + origin Dayのduplicate Occurrenceを防ぐ。Occurrenceは将来`0..* Entries`を共有できるrelationとする。
- current-Day queryはapplicable daily Routineをlazy ensureし、未materializeならOccurrenceとinitial planned Entryをexactly one作る。future Dayをunboundedにpre-generateしない。
- one ensureで1件以上作成した場合だけDay `placement_revision`をatomicにexactly once増やし、0件なら変更しない。concurrent / repeated loadはduplicateやpartial stateを残さない。
- generated Entryはsame stable Taskを参照し、default estimate / planned startをcopyする。non-null planned startはestablished Day contextとD-031 / D-039でSectionをderiveし、nullならavailable default Sectionを使い、missingなら`Sectionなし`へfallbackする。
- generated Entryは既存B2 canonical cohortのmanual member後へstable appendし、複数Routineはstable RoutineDefinition dataでdeterministicに並べる。UUID timestampをProduct ordering authorityにしない。
- `Routineを終了`はcurrent logical Day後のgenerationを止め、current/past Occurrence、Entry、Execution historyとRoutineDefinitionを保持する。
- conversion / endはD-020 logical operation replay / misuse / ambiguity / atomicity contractに従う。
- Webはeligible Entryの`Routine化`、終了なし/inclusive end date、Routine indicator、`Routineを終了`とcanonical reload/reconciliationを提供する。
- D-034の`今回だけ / Routineへ反映` choiceとfield override persistenceはR1 scope外のため、Routine由来EntryのSection / 開始予定 / 見積はR1 Day UIでは表示のみとし、既存の`MoveEntry` / `SetEntryPlannedStart` / `SetEntryEstimate` commandもserver mutation-timeでrejectする。Reorder / Start / Complete / `Routineを終了`は既存canonical ruleに従い利用できる。

non-daily recurrence、future-range projection UI、schedule editing、field-level override、Skip、Day move、temporary stop/resume、Documents、Interrupt、statistics、native/offline clientはR1 scope外であり、broader Approved semantics / Open Questionを維持する。

## Historical facts and projections

DayBoard、Calendar、Timeline、Review、Mapはcanonical task stateを別系統で保持するauthorityではなく、Domain / historical factsから構築するprojectionとする。

- planned placementとactual Executionを区別する。
- Task / Project / Routine等の現在metadata変更で、過去Execution / RoutineOccurrence等の意味を黙って再分類しない。
- historical factsを参照不能にする破壊的hard deleteを前提としない。
- First sliceではdestructive hard-delete APIを提供しない。
- Reviewはlogical day / week / month、Project、Task、Routine、Section、estimate / actual等へ将来集計できることをtargetとする。

historical contextのexact snapshot / reference fields、Review UI、qualitative Review semanticsはOpenとする。Execution時点のTask / Project / Section metadata snapshotのexact fieldsは、rename / move / delete / Reviewを導入する前に別途Decisionする。

## Notes / Documents

- TaskChuteがDocumentsを所有する。
- Document bodyはMarkdown-nativeとする。
- DocumentにはTask / Project等とは別のstable identityが必要。
- Taskは1つのlogical Primary Task Documentを持てる。
- Projectは1つのlogical Primary Project Documentを持てる。
- empty Primary Documentのphysical recordはlazy creationしてよい。
- Routine共通noteはTaskのPrimary Task Documentを使う。
- RoutineOccurrenceは0..1 optional Occurrence Documentを持てる。同一Occurrenceの複数Entryは同じOccurrence Documentを共有できる。
- Documentsは将来Review Document、general note、その他typeへ拡張できる。
- revision / version semanticsを将来持てる設計余地を残す。
- Web / Androidは将来的にread / editできることを要求する。
- 将来のObsidian projectionでは、実用上可能な範囲でMarkdown semanticsを保持する。

editor、backlinks、revision-history UX、autosave等はOpenとする。

## Place / Location foundations

planned Placeとactual observed Execution Locationを別semanticsとして扱う。

- Placeは意味のあるplanned destinationを表すprovider-independent identityを持てる方向とする。
- LocationSnapshotはcaptured instant、coordinate、accuracy等のobserved factを保持できる方向とする。
- Start / Complete時のlocation captureはoptional / best-effortとし、permission denial / unavailable / capture failureでCore Start / Completeを失敗させない。
- location enrichmentによりStart / Completeのretry safetyを壊さない。
- Mapはprojectionとする。
- map / geocoding provider IDをcanonical Place identityにしない。
- continuous trackingはinitial location capability外とする。

## Web mutation behavior

First vertical slice内の通常mutationはasync Server communicationで実行し、成功のためにfull-page reload / navigationを要求しない。

対象には少なくともProject / Task + Entry作成、ordering変更、Start、Completeを含む。

- mutation処理中にClientは操作を受理したことが分かるtransient UI stateを持てる。
- `starting` / `completing`等のpending stateはClient UI stateであり、Domain lifecycle stateではない。
- initial canonical Day loadは実装用語を露出しない簡潔なuser-facing loading stateを表示できる。通常のmutation / reconciliation中もvisibleかつaccessibleなtransient feedbackを維持するが、その表示 / 非表示によってDayBoard直前のnormal layout flowを増減させたり、DayBoardを上下へ移動させたりしない。
- transient pending feedbackのlayout invariantは、Server canonical stateへのreconciliation、retained operationのretry、mutation locking、deterministic error / conflict feedbackを削除・弱化しない。error / conflictはtransient normal-pending feedbackと区別して表示する。
- Server成功後はauthoritative resultをClient stateへ反映する。
- failure / conflict時にClientだけがfalse-success stateのまま残らず、必要に応じてQueryでServer canonical stateへreconcileできる。
- realtime push、Web offline queue、PWA / background syncはinitial scope外とする。

## Command retry and conflict semantics

client-issued mutationはlogical operation identityを持ち、同じoperationのnetwork retryとユーザーによる新しい操作を区別する。

- 同じoperation identity + 同じsemantic requestは、確定済みresultをreplayできる。
- 同じoperation identityを別semantic requestへ再利用した場合はrejectする。
- Start / Complete以外のmutationについてもretry ambiguityを避けられる共通mechanismを利用する。
- stale overwriteが危険なplacement mutationではexpected revision等のpreconditionを利用する。
- conflict時は一切変更せず、Clientが最新projectionへreconcileできることを要求する。
- unexpected infrastructure failureをdeterministic Domain rejectionとして保存せず、安全なretry / canonical Query reconciliation余地を残す。

exact request hash、HTTP endpoint、status code、transaction SQLはArchitecture / implementation contractで管理する。

## Authentication persistence boundary

Initial runtimeでは同じWorkerがseparate `AUTH_DB` / `APP_DB` D1 bindingsを利用する。

- `AUTH_DB`はBetter Authのphysical auth / session persistenceを所有する。
- `APP_DB`はTaskChute app user、auth subject mapping、user settings、Domain dataを所有する。
- Better Auth physical user IDをTaskChute Domain identity authorityにしない。
- AUTH_DB / APP_DB間のcross-database FK / atomic transactionを前提としない。
- initial bootstrapは片側だけ成功したpartial failureから安全に再実行できるidempotent / recoverable flowとする。
- password、secret、session token等をtracked file、evidence、通常logへ保存しない。

## Android offline capability

Android clientはtemporary network unavailabilityを考慮したoffline-capable designとする。

offline中に許可するoperation範囲、local persistence、queueing、sync、conflict resolution、clock handling等の具体方式は未決。

Web clientをoffline-capable / PWAとするか、そのinitial scopeをどこまで含めるかは未決。

## Comments

- CommentはMarkdownを扱えること。
- Commentはimagesを扱えること。
- NotesとCommentsは共通のAttachment modelを利用する。

## Images / Attachments

必要capability:

- stable attachment identity
- metadata
- reference / ownership relation
- deletion / orphan-cleanup strategy
- Web upload
- Android upload
- future Obsidian file projection

binary-storage providerおよびstructured dataとのstorage separationは未確定。D-008は`Proposed`であり、R2等のobject storageはcandidateにすぎない。

## Approved First vertical slice

Status: Approved (D-013)

Initial implementation contract:

1. authenticated single userとしてServerへアクセスできる。
2. Server上に1つのProjectを作成できる。
3. 3つのTaskを作成し、それぞれ別Entryとしてcurrent TaskChuteDayへ配置できる。
4. Task / Entry stable identityを区別する。
5. EntryをSection内でexplicit orderに配置し、Web DayBoardが同じorderで表示する。
6. configured timezone / day boundaryからcurrent TaskChuteDayを解決でき、midnight固定をDomainへ埋め込まない。
7. Webから通常mutationをfull-page reloadなしで実行できる。
8. planned EntryをStartするとexactly one active Executionが作られ、Entryがrunningになる。
9. 別active Executionがある状態の通常Startはimplicit interruptせずrejectする。
10. Start retryでduplicate Executionを作らない。
11. running EntryをCompleteするとactive Executionの終了factが確定し、Entryがcompletedになる。
12. Complete retryでended_at変更や二重完了を起こさない。
13. explicit order上の次のplanned EntryをNextとして計算できる。
14. Next以外のplanned Entryもactive ExecutionがなければStartできる。
15. async mutation failure / conflict時にClientだけのfalse-successを残さない。
16. browser reload後もServer canonical stateからcorrect stateを復元する。

First sliceのNon-goals:

- Routine generation / streak
- Notes/Documents implementation
- Place / Location / Map
- Review / Calendar / Timeline
- Android / Android Widget / Wear OS / native iOS implementation
- Android / Web offline implementation
- Pause / Resume / Interrupt / Cancel / Reopen
- realtime push
- binary attachment storage
