# Specification

この文書は、明示的にApprovedされたProduct / Domain behaviorを定義する。

exact DB schema、SQL、UI component library、Android local DB、offline conflict algorithm等は、別途DecisionされるまでOpenとする。

## D-119 Future Day Routine materialization v0.1

認証済みownerがfuture logical dateを明示的にDay surfaceとして開いた場合、その選択日だけを
既存のTaskChuteDay establishment semanticsでestablishし、frozen Section contextとeligible Routine
occurrence / initial planned Entryを既存のrecurrence authorityでexactly onceにmaterializeする。既に
establishされたfuture Dayの後続loadも同じ選択日だけをreconcileし、隣接日やdate-pickerの表示だけでは
materializeしない。current-Day D-040、past unestablished Dayのrecord-none/read-only、future execution
禁止、D-118 disable/delete cleanup、operation / revision / retry / historical authorityは維持する。

D-119はD-041の「future Dayをviewしてもnon-materializing」という境界を、明示的に開いたfuture Dayに
限ってsupersedeする。unbounded future pre-generation、new API / schema / migration / dependency、
production rolloutは追加しない。

## D-117 Web Today / Sidebar / Routine UX Refinement v0.1

D-117は既存canonical command / projectionを使うWeb presentation refinementである。TodayのProject列は
Projectの有無によらず一定幅のProject Note icon slotを持ち、未設定時はdisabled、設定時は既存Project
Primary Noteを開く。current established Dayのordinary running TaskではProject / Modeだけを既存CAS付き
metadata commandで編集できる。Routine列はnon-Routineをgray icon、Routineをaccent icon onlyで示し、
背景色は状態表現に使わない。

TodayのRoutine列から明示操作でRoutine化、completed Entryからfuture Routine作成、既存Routineの設定編集を
開始できるmodalを提供する。recurrence、planned start、estimate、Project、Mode、Section、開始日などの
入力は既存Routine command / revision / reconciliationへ委譲し、自動Routine化は行わない。TodayのD&D
target feedbackを明確化し、empty Section / empty `Sectionなし`への移動は既存`MoveEntry`のplacementなし
semanticsを使う。Todayの`TaskChuteDay`見出しは表示しない。

Sidebarはicon付きの`Taskchute` / `Note` / `Rotuine` / `Setting`表示と、expanded / compact / collapsedの
3状態を持つ。`＋ Taskを追加`と`表示`の位置は維持する。D-117は新しいcommand、schema/migration、dependency、
Android、production semanticsを追加しない。running metadata capabilityを成立させるため、後続correctiveで
既存`UpdateTaskMetadata` / `SetEntryMode`のserver eligibilityとcurrent projectionを整合させる。
current established Dayのordinary running EntryだけがProject / Modeを変更でき、Task title、lifecycle、Section、
planned start、estimate、placement、Day `placement_revision`、Routine relation、開始時Mode snapshotは変更しない。

D-117のrunning Mode projectionは、明示的なlive Mode変更がsnapshotのMode IDと異なる場合だけlive relationを表示する。
Mode定義のrenameだけでは開始時snapshot表示を変えず、completed Entryのhistorical snapshot authorityも維持する。

## D-118 Routine enabled / delete lifecycle v0.1

Routineの`有効 / 無効`と`削除`は、mutation時にserverが解決するcurrent logical dateを境界とする。無効化・
削除では当日以降にmaterialize済みのRoutine-derived Entry / Execution / occurrence関連データを既存の
atomic commandでcleanupし、planned / running / completedの区別で残存させない。境界より前のEntry、
Execution、actual、historical factとRoutineDefinition identityは保持する。無効期間のbackfillはせず、
再有効化後はそのlogical dateから既存のrecurrence eligibility / exactly-once materializationへ戻る。

user-facing Routine lifecycleは`有効 / 無効`と`削除`で表し、削除後のarchive / restore surfaceは提供しない。
既存のowner scope、operation identity、settings / board revision、CAS、exact replay、retry / reconcileを
維持する。これは既存Routine commandとschemaの利用に限定したWeb UI / Worker実装であり、新API、schema /
migration、dependency、Android semantics、production rolloutは追加しない。

## D-114 Android Settings Management v0.1

Androidの`設定` destinationは、既存canonical APIを利用するSettings hubである。Sectionは全体
configuration updateとD-038の時間境界・隣接吸収、ProjectはD-065のboard / archive / delete、Routineは
D-064のdefinition / enabled / soft-delete semanticsへ委譲する。Androidは独自のDomain storageや
ordering authorityを持たない。下部navigationは`今日` / `ノート` / `設定`で、Project管理はSettings内で
提供し、Projectの独立bottom destinationやfake screenは追加しない。D-114はWorker/API、schema、migration、
dependency、realtime protocol、offline、notification、production semanticsを変更しない。

## D-109 Android Today Planning v0.2

Android Todayのcurrent established Dayでは、ordinary planned Taskに限り、Quick Addと
同じbottom sheetからTask名、Project、Mode、Section、開始予定、見積を編集できる。Quick
Addは`+`から開き、最初のSaveで既存の`AddTaskToDay`を呼ぶ。編集は既存の
`UpdateTaskMetadata`、`SetEntryMode`、`SetEntryEstimate`、`SetEntryPlannedStart`を
構成して利用する。各commandのpending / retry / error / operation / CAS semanticsは
既存Server contractを維持し、成功後はcanonical Today projectionを再取得する。

future / past Day、running / completed Entry、Routine-derived Entryはread-onlyとする。
Section選択とplanned startは既存D-043 synchronizationへ合わせ、未establish Dayをこの
操作だけで作成しない。Today shellはdate navigationを直接表示し、Project / Notesは
disabled、Settingsは既存logoutへ接続する。D-106 auth、D-108 foreground realtimeの
pending / refetch boundary、Start / Complete、migration / schema / API command boundaryは
変更しない。Android planningのoffline、background、reorder、Routine編集は含まない。

## D-110 Android Today direct manipulation and native Notes

D-110では、current established Dayのordinary planned Taskだけがlong-press dragの対象となる。
同一Sectionの合法なplanned-start cohort内の並び替えは`ReorderEntries`、Section跨ぎは
`MoveEntry`、複製は`DuplicateEntry`を利用する。空のnormal Sectionまたは空の`Sectionなし`へ
dropする場合はrelative placementを送らず、既存commandのSection / planned-start同期へ委譲する。
running / completed / Routine-derived / future / past / pending rowとinvalid dropはno-writeである。

Androidの`ノート` destinationはD-090のstandalone Markdown Documentをnative list/editorで
扱う。D-111により、standaloneの`＋`はcanonical Document Createを即時実行し、既存standalone
およびTask Primary bodyは約1秒のidle debounceでautosaveする。送信中も入力を継続でき、成功後に
残ったlocal差分はfollow-up Updateでcanonical revisionへ収束させる。Back / navigation / logoutは
safe flushとdeferred transitionを使い、failure / conflict / ambiguousではdraftを保持する。
memory-only draft、revision/CAS、explicit Saveは維持し、安全な状態での明示discardだけがlocal
draftを破棄してoriginへ戻れる。
Todayのvisible rowにvalidな`taskId`があれば、lifecycleやDayにかかわらずD-101 Task Primary
Noteを開ける。この入口はEdit / Duplicate / Dragのeligibilityと独立し、Task titleはTask側の
authorityであり、Note operationはEntry lifecycle / placement metadataを変更しない。standalone
Note editorのBackはNotes listへ、Todayから開いたTask NoteのBackはTodayへ戻る。API、schema、
migration、dependency、realtime protocol、offline persistenceは変更しない。D-111はD-110の
Android Notesに限るexplicit-only Save / memory-only new draft / 通常dirty discard confirmation
の境界をsupersedeする。

## D-112 Android Today bulk selection and day operations

D-112では、current established Dayのordinary planned Entryに限り、常時表示のselection
controlとbottom bulk action barを提供する。bulk day moveは既存の
`BulkMoveEntriesToDay`、bulk deleteは既存の`BulkDeleteEntries`を利用し、row overflowの
前日 / 翌日 / 日付選択 / 削除も同じcanonical commandとoperation / placement revision
semanticsへ委譲する。過去日の移動先は既にestablishされたDayだけを許可し、未確立の過去Dayを
移動操作だけで作成しない。削除は確認を要求する。

TodayはPull-to-Refreshを利用でき、single-entry long-press dragは既存D-110のeligible
boundaryとcanonical placement semanticsを維持する。multi-selectの選択自体は提供するが、
既存APIに複数Entryを一つの相対placement operationとして安全に処理するcommandがないため、
group D&DはこのDecisionでは有効化しない。Androidが複数のsingle-entry mutationを暗黙に
送信して部分成功を作ることも禁止する。Worker/API、schema、migration、dependency、realtime
protocol、production boundaryは変更しない。

## D-107 Android Today v0.1

Android Todayは既存のauthenticated HTTP Query / lifecycle commandを利用するnative
projectionであり、server canonical stateを保持・再実装しない。current DayはSection順に
表示し、Entryはplanned / running / completed state、Task title、Project / Mode、estimate、
planned startを表示する。planned EntryはStart、running EntryはCompleteを既存のEntry
command contractで実行し、success後にDayを再取得する。active current-Day Executionが
ある間はfloating running-task panelをbottom navigationの上に表示する。

前日 / 翌日 / 今日 / refreshは既存のcurrent / by-logical-date read routeを利用する。
future / pastのnon-current DayではD-041 / D-042に従ってexecution mutationを提供しない。
loading、empty、retryable error、401 auth handoff、pending mutationは画面stateとして
明示する。Android TodayはTask creation/editing、reorder、Notes、realtime、offline DB /
queue、Project / Mode / Routine settings、widget、notificationを含まない。

## D-108 Android realtime invalidation boundary

D-108はD-105のinvalidate-only realtimeをforeground Android Todayへ拡張する。
Realtime notificationはfreshness acceleratorであり、canonical authorityではない。
AndroidはD-106のdynamic cookie sessionをWebSocket handshakeへ渡し、Workerが既存の
sessionとserver-derived app-user identityを検証して同じapp userの`RealtimeHub`へ
routingする。native Android markerはOrigin欠落を限定的に許可するためだけに使い、
user identityやauthentication authorityにはしない。非emptyなwrong Origin、未認証、
通常HTTP requestは引き続き拒否する。

signed-in + foreground Todayではconnection managerが一つのsocketを維持し、bounded
exponential reconnect / jitter、logout・lifecycle stop、resume / reconnect後の
canonical HTTP refetchを行う。`day` scopeはmounted logical Dayをrefetchし、Start /
Completeまたはreloadがpendingの間は既存のsafe boundaryまでcoalesce / deferする。
protocolはversion/type/scopeをstrict parseし、WebSocketはinvalidate notificationだけを
扱う。Androidのdomain state、command、body、offline queue、background socket、FCM、
polling、APP/AUTH schema / migrationは追加しない。

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
- historically establishedされた過去TaskChuteDayは、後のboundary / timezone設定変更でretroactiveに再分類しない。
- initial bootstrapではcanonical IANA timezone、TaskChuteDay boundary、initial Section configurationを明示入力する。
- `Asia/Tokyo`、civil midnight等を暗黙のProduct defaultとして適用しない。test fixtureとして明示利用することは許容する。
- ambiguous / nonexistent local timeはinitially Temporal-compatibleな`compatible` semanticsで解決する。
- day startとnext-day boundaryをそれぞれtimezone ruleからinstantへ解決し、`end = start + 24h`とは計算しない。
- materialized TaskChuteDayはactual `[start, end)` intervalと、そのintervalをestablishしたtimezone / boundary contextを保持する。
- future Dayのread-vs-establishment timingはD-041に従う。travel時timezone UX、per-day override等はOpenとする。

### Future Day navigation and establishment — historical D-041 baseline

Status: Approved historical baseline (D-041); explicit future-Day open is superseded by D-119.

以下の箇条書きはD-041当時のnon-materializing preview boundaryを記録するhistoryであり、D-119の
明示的なfuture Day openには適用しない。

- 未establishの未来logical dateへのview / repeated read / previous-next / calendar navigationはnon-materializingで、TaskChuteDay、timezone / boundary context、Section historical context、RoutineOccurrence、Routine-derived Entryを作成しない。
- Day UIは、その時点でestablishした場合に適用されるinterval / Section configurationからnon-persistent planning previewをderiveしてよい。previewはhistorical authorityではなく、establishment前の設定変更を後のpreviewへ反映してよい。
- 最初のsuccessful day-specific planning mutationは、その時点でeffectiveなtimezone / boundary / Section contextを持つowner-scoped TaskChuteDayをexactly one establishし、triggering mutationと一つのlogical atomic outcomeとしてcommitする。
- validation rejection、stale conflict、deterministic failureではnewly established Dayだけを残さない。retry / concurrencyはDay、context、mutation effectのduplicateなしへ収束する。
- establish後のDay contextはhistorical authorityであり、後のtimezone / boundary / Section設定変更でretroactiveにrewriteしない。
- D-040はcurrent-Day lazy Routine materializationを維持する。未来日viewはRoutineをmaterializeせず、Day Navigation v0.1はfuture Routine previewを提供しない。既にmanual planningでestablishされたDayがcurrentになった場合、R1 ensureはそのhistorical contextを利用する。
- Day Navigation v0.1はnon-current DayのStart / Completeを有効化しない。current-Day execution semanticsは変更しない。

### Past Day navigation and historical gaps

Status: Approved (D-042). Runtime: NOT_IMPLEMENTED.

- established past logical dateはexisting canonical TaskChuteDay / frozen context / historyを表示し、後のsettingsからrewriteしない。
- TaskChuteDayが存在しないpast logical dateはempty / record-none read-only projectionとして表示する。normal established Dayのempty stateとは区別する。
- past unestablished view / reload / repeated readはTaskChuteDay、interval / timezone / boundary context、Section historical context、RoutineOccurrence / Entry、Task / Entry / planning stateをcreate / synthesize / persist / backfillしない。
- Day Navigation v0.1はpast unestablished DayのAdd Task、placement、estimate / planned start、reorder、Start / Complete、Routine conversionを提供せず、direct mutationもDB変更なしでrejectする。
- D-040 current-Day lazy ensureをpast unestablished dateへretroactiveに実行しない。established past Dayへのnew editing / historical correction / backfillは別scopeとする。
- future unestablished DayはD-041、past unestablished DayはD-042に従い、current TaskChuteDay behaviorは変更しない。

## Entry placement and ordering

EntryはTaskChuteDay / Section上のplacement / execution targetとする。

- order authorityはEntry identityとする。
- 同一Taskが複数Entryとして存在してもordering semanticsを壊さない。
- Next Entryはexplicit order上のplanned Entryから計算するprojectionであり、hard lockではない。
- active Executionが存在しない限り、Next以外のplanned Entryも明示Startできる。
- stale stateによるplacement overwriteが危険なmutationではrevision / preconditionを利用し、silent last-write-winsを行わない。

### Planned start persistence, synchronization, and canonical order

Status: Approved (D-031, D-039, D-043). D-039 runtime baseline and D-043 full synchronization: IMPLEMENTED / INTEGRATED.

- Entryの開始予定はnullableな`planned_start_minute INTEGER`として保存する。`NULL`は開始予定なし、non-nullはestablished TaskChuteDayの`logicalDate`を基準にしたextended wall-clock minuteであり、Day開始を0とするoffsetやactual timestampではない。
- Section contextの`logical_start_minute` / `logical_end_minute`と同じ座標系を使い、valid rangeは`[establishment_boundary_minutes, establishment_boundary_minutes + 1440)`とする。
- 05:00 boundaryでは05:00 = `300`、翌03:00 = `27:00` = `1620`、翌05:00 = `29:00` = `1740`となり、Day end boundaryの`1740`はplanned startとしてexclusiveである。
- extended wall-clock timeを許容する。non-null値は上記range内のintegerで、authoritative time rangeを持つexactly one timed Sectionの`[logical_start_minute, logical_end_minute)`へ属する必要がある。legacy unknown timingから値やSectionを推測しない。
- D-043 targetでは`Sectionなし`と開始予定`NULL`を同期し、real Sectionとそのrange内のnon-null開始予定を同期する。通常のuser-editable planned stateでreal Section + `NULL`、`Sectionなし` + non-null、開始予定と異なるSection placementを作らない。
- 開始予定の設定・変更は、そのminuteを含むreal Sectionを`[start, end)`でderiveする。boundary minuteは後続Sectionへ属し、extended-time coordinateを維持する。
- real Sectionを明示選択した場合は、そのSectionへ移動すると同時に開始予定をSectionの`logical_start_minute`へ設定し、以前の開始予定を置き換える。
- 開始予定を直接clearした場合は`Sectionなし`へ移す。`Sectionなし`を明示選択した場合も開始予定を`NULL`へclearする。
- real Section内では開始予定minute昇順、同minuteを`position`順で置き、`position`をmanual / stable tie-break authorityとして再利用する。`Sectionなし`は`NULL`開始予定としてplacement absenceのmanual orderを持つ。
- Section / planned-start、canonical placement / order、manual tie-break consistency、placement revision exactly +1、operation resultをatomicに確定し、partial同期状態を残さない。
- manual Reorderは開始予定なしcohort内または同一minute cohort内だけを許可し、異なるcohort / minuteやhistorical boundaryを越えない。
- running / completed等のhistorical rowはplanned-start mutation / reorder対象にしない。
- D-045 transitionでは、editable planned stateのlegacy `real Section + planned start NULL`を、established Dayのauthoritative historical Section contextにある当該Section startへnormalizeする。authoritative startを一意に解決できない場合は推測やpartial rewriteを行わずfail safelyとする。`Sectionなし + NULL`とhistorically protected rowはrewriteしない。

`SetEntryPlannedStart` logical commandは`operation_id`、`entry_id`、`taskchute_day_id`、integerまたは`null`の`planned_start_minute`、`expected_placement_revision`を受け取る。ownerはauthenticated principalから解決する。同じoperation + semantic requestはreplayし、different-semantic reuseとstale revisionをpartial effectなしでrejectする。planned-start、Section、order、revision increment、operation resultはatomicに確定する。

Startはplanned-startのnot-before制約を持たず、早期Startを許可する。Sectionなし Startのactual current Section配置は開始予定が`NULL`の場合だけ適用する。

Routine由来Entryにも同じSection / planned-start synchronization ruleを適用する。D-044はcurrent-Day planned Routine-derived Entryを対象とする最初のoverride/default propagation sliceを確定し、Section / planned-startを分割不能な一unitとして扱う。integrated implementation commit `7d3c0cb0881dfc11725af6ff45eabad69f86a22a`はordinary EntryとRoutine selected-scopeへD-043同期を実装し、Routine由来Entryはdedicated R2A commandだけで変更する。APP `0007` migration、local automated、real-local migration / browser、persistent nonprod migration / preservation / deployed runtime / authenticated representative browser evidenceはPASSである。remote multi-Day propagationと詳細reliability subcaseはこのPASSへ含めない。

### Duplicate first slice

Status: Approved (D-037, D-050). Runtime / APP migration: `IMPLEMENTED / INTEGRATED`.

- `DuplicateEntry`はcurrent established Dayまたはfuture established Dayのplanning-enabledなplanned Entryだけをsourceにできる。past Day、running、completed、interruptedその他historically protected stateは対象外とする。
- 新しいTask / Entry identityを作り、title、Project、Section、estimate、planned startをcopyする。Routine relation / RoutineOccurrence、history、Execution、actual state、forecast、operation recordはcopyせず、duplicateは通常Taskのplanned Entryとする。Mode / Noteは未実装でありcopyしない。
- duplicateはsourceとsame Day、same Section、same canonical planned-start cohortに置き、sourceのimmediate-afterをinitial insertion pointとする。
- source / duplicateのcanonical order、Day `placement_revision`のexactly once increment、operation resultはatomicに確定する。same-operation replay、misuse rejection、stale revision、source change、identity collision、concurrency、unexpected infrastructure ambiguityはD-020のsafe retry / canonical reconciliation boundaryに従い、partial effectを残さない。
- APP migration `0009`は`operations.command_type` CHECK compatibility extensionとして`DuplicateEntry`を追加し、全existing operation / data / identity / historyを保持する。追加schema、destructive migration、既存command rename、operation row rewriteはfirst sliceに含めない。
- implementation commits `1d68a74148da211bfae76b6f36b86cb18f23e7fc` / `47d998e37bd12fc591b43c3624324ad237f3ca46` / `3573aaafcfcda651bc850dae706f8dd5157efe65`で`main`へIntegrated済み。local automated、real-local migration / browser、persistent nonprod migration / deploy / authenticated browser / integrityは`PASS`、productionは`NOT_RUN`、Releasedは`NO`。詳細retry / misuse / stale revision / concurrency / ambiguityはlocal automated evidenceに限定する。

D-037のMode、day-specific Task Note、long-term duplicate / move / delete targetは本first sliceによって狭めない。exact HTTP / DTO / SQL / iconはimplementation detailとする。

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

`Task -> 0..1 RoutineDefinition -> RoutineOccurrences -> 0..* Entries`

- RoutineDefinitionはTaskの繰り返し定義であり、Task noteとは別の重複noteを必須にしない。
- RoutineOccurrenceは特定のTaskChuteDay分として成立するlogical occurrenceである。
- Occurrence成立後にEntryを別TaskChuteDayへ延期・移動しても、そのOccurrenceが何日分だったかを失わない。
- 8/21分を8/22へ延期した場合、actual executionは8/22として残しつつ、origin occurrenceは8/21分として区別できる。
- 8/21分の持越しと本来の8/22分は別Occurrence / Entryとして同じ日に存在できる。
- 遅延実施をstreak上の当日達成とみなすか等のachievement semanticsはOpenとする。

### Minimal Routine R1 daily slice

Status: Approved (D-040). Runtime: IMPLEMENTED / INTEGRATED.

R1はcurrent-Dayのplanned non-Routine Entryを起点とするdaily-only Routine dogfood sliceとする。

- conversionはexisting Task / Entry identity、current TaskChuteDay、Sectionまたは`Sectionなし`、見積、開始予定を維持し、duplicate Task / Entryを作らない。
- current valuesをRoutineDefinitionのdefault Section / estimate / planned startとしてsnapshotし、current DayをoriginとするRoutineOccurrenceをmaterializeしてexisting Entryへ関連付ける。
- scheduleはconversion Dayをinclusive startとする毎日で、終了なしまたはinclusive end logical dateを持つ。
- persistenceはowner-scoped stable RoutineDefinition / RoutineOccurrenceとnullable Entry relationを持ち、same Routine + origin Dayのduplicate Occurrenceを防ぐ。Occurrenceは将来`0..* Entries`を共有できるrelationとする。
- current-Day queryはapplicable daily Routineをlazy ensureし、未materializeならOccurrenceとinitial planned Entryをexactly one作る。future Dayをunboundedにpre-generateしない。
- one ensureで1件以上作成した場合だけDay `placement_revision`をatomicにexactly once増やし、0件なら変更しない。concurrent / repeated loadはduplicateやpartial stateを残さない。
- generated Entryはsame stable Taskを参照し、default estimate / planned startをcopyする。integrated R2A runtimeはD-043に従い、ordinary EntryとRoutine selected-scopeでnon-null planned startからreal Sectionをderiveし、nullなら`Sectionなし`へ同期する。
- generated Entryは既存B2 canonical cohortのmanual member後へstable appendし、複数Routineはstable RoutineDefinition dataでdeterministicに並べる。UUID timestampをProduct ordering authorityにしない。
- `Routineを終了`はcurrent logical Day後のgenerationを止め、current/past Occurrence、Entry、Execution historyとRoutineDefinitionを保持する。
- conversion / endはD-020 logical operation replay / misuse / ambiguity / atomicity contractに従う。
- Webはeligible Entryの`Routine化`、終了なし/inclusive end date、Routine indicator、`Routineを終了`とcanonical reload/reconciliationを提供する。
- D-034の`今回だけ / Routineへ反映` choiceとfield override persistenceはR1 scope外だった。integrated R2A runtimeはcurrent-Day planned Entryだけをdedicated command / explicit scope UXで編集可能にし、既存の`MoveEntry` / `SetEntryPlannedStart` / `SetEntryEstimate`によるRoutine-derived bypass mutationはserver mutation-timeでrejectする。Reorder / Start / Complete / `Routineを終了`は既存canonical ruleに従う。

non-daily recurrence、future-range projection UI、schedule editing、field-level override、Skip、Day move、temporary stop/resume、Documents、Interrupt、statistics、native/offline clientはR1 scope外であり、broader Approved semantics / Open Questionを維持する。

### Routine R2A current-Day override slice

Status: Approved (D-044, D-045, D-046). Runtime / APP migration: IMPLEMENTED / INTEGRATED. Local automated / real-local migration and browser: PASS. Persistent nonprod migration / preservation / deploy / authenticated representative browser: PASS. Remote multi-Day propagation and detailed retry / misuse / concurrency / ambiguity / rollback: NOT_RUN. Production: NOT_RUN. Released: NO.

- current logical TaskChuteDayのplanned Routine-derived Entryだけを対象に、`Section + 開始予定`の同期unitと、独立した見積unitを編集できる。
- editはlocal candidateを先に作り、Server write前にunitごとの`今回だけ / ルーティンに反映`をexplicitに選択する。scopeはpreselectせず、cancel / Escape / dismissはno-writeでcanonical valueへ戻す。
- `今回だけ`はreload後も残るfield-level occurrence overrideであり、no overrideとexplicit NULL overrideを区別する。estimate `NULL`と`Sectionなし + planned start NULL`はいずれもvalid explicit overrideである。
- `ルーティンに反映`はcurrent effective valueとRoutineDefinition defaultを更新し、current occurrenceの同unit overrideをclearする。already-materializedなcurrent / futureのplannedかつnon-overridden occurrenceへnew defaultを反映するが、override済みまたはhistorically protectedなstateは変更しない。
- default updateだけでfuture Day / Occurrenceをmaterializeしない。unmaterialized future occurrenceは後のD-040 materialization時にcurrent defaultを使う。
- overrideから`ルーティンの設定に戻す`場合、current RoutineDefinition defaultを適用してoverrideだけをclearする。RoutineDefinition更新やscope再選択は行わない。
- Section-plan edit / override / reset / propagationはD-043 pair invariantを維持する。
- normal Day Tableへpermanent override badgeを要求しない。override stateはediting contextでreset等に必要な範囲だけ示す。
- future / past Day、running / completed / interrupted、Task名 / Project / Mode / Note、schedule / Skip / stop-resume / broader recurrenceはfirst slice対象外とする。
- D-045に従い、editable legacy Routine defaultのreal Section + NULLはauthoritative origin / establishment contextからSection startを一意に解決できる場合だけnormalizeし、解決不能ならno-partial-effectで停止する。
- occurrence override persistenceにAPP migrationを利用する。D-046に従い、first sliceは`routine_occurrences`上のtyped Section-plan / estimate override columnsとunitごとのoverride-present stateを持ち、no overrideとexplicit `NULL`を区別する。`routine_definitions`はnon-negative・initial `0`のdefault revisionを持ち、Routine default editのsilent last-write-winsを防ぐ。exact SQL statement、HTTP / DTO / command naming、operation command string、propagation queryとevidenceのない追加indexはimplementation detailである。

Physical invariant:

- Section-plan override absentではSection / planned-start override valueをともに`NULL`とする。
- Section-plan override presentでは`Sectionなし + NULL`、またはreal Section + non-null planned-startだけを許可する。
- estimate override absentではvalueを`NULL`とし、presentではexplicit `NULL`またはpositive integerを許可する。
- Section referenceはowner-scoped FKを維持し、planned minuteのhistorical Day Section membershipはapplication transactionで検証する。
- migration前Occurrenceはno override / inheritとしてidentityを維持する。D-045 normalization authorityを解決できない場合はpartial migrationしない。

### Routine R2B Board slice

Status: Approved (D-047, D-048). Runtime / APP migration: IMPLEMENTED candidate (local working tree only). Integrated / remote / production: NO / NOT_RUN / NOT_RUN.

- Sidebar `ルーティン`からRoutine Boardを開き、initial columns、local-only blank add、inline defaults / recurrence / period editing、search、使用中 / 期間終了tabs、ON/OFF、independent D&D orderを提供する。
- createはTask + RoutineDefinitionをatomicに作成しOFFで開始する。毎日 / N日ごと / 曜日指定とinclusive periodをtyped persistenceへ保存する。
- pause/resume、current-Day lazy materialization、schedule suppression / restoreはD-047のexactly-once / no-backfill / historical-protection boundaryに従う。
- Task title / Projectはcurrent authority、occurrence snapshotはhistorical authorityとし、editable planned current/futureだけを更新する。
- Section / planned start / estimate propagationはD-043 / D-044 override boundaryを維持し、default editだけでfuture Dayをmaterializeしない。
- Day Table上のmanual Routine終了UIは表示しない。legacy operation endpointはcompatibilityのため維持する。

### D-086 Routine recurrence expansion

Routine schedule authorityはtyped `routine_schedules`とし、`daily` / `every_n_days` / `weekly`の意味を変更しない。D-086では`every_n_weeks`、monthly day / last day / nth weekday / last weekday、every-N-months day / last dayを追加した。`every_n_weeks`のanchorだけはD-087でcalendar-week semanticsへ狭くsupersedeされ、他のfamilyは変更しない。periodはinclusiveで、Gregorian logical civil dateを評価し、存在しない月日や第5曜日はskipする。

recurrence eligibilityはshared pure evaluatorを唯一のcalendar authorityとする。current-Day lazy materialization、missing candidate count、Routine Board schedule updateによるplanned occurrence suppression / restoreは同じevaluatorを使用し、DB transaction guardはschedule / period snapshot、pause / archive、occurrence identity、placement revisionをCASで再確認する。旧SQL predicateを別のrecurrence algorithmとして維持しない。

APP migration `0026_routine_recurrence_expansion.sql`は既存`routine_schedules` rowとhistoryを保持し、typed CHECKでinvalid field combinationを拒否する。Routine Boardのrecurrence editorは全patternを日本語表示し、incomplete draftを送信せず、Cancel / Escapeはno-writeとする。unestablished future Dayのmaterialization、legacy recurrence marker書換え、AUTH migration、historical rewriteは行わない。

### D-087 Calendar-week anchored N-week recurrence

`every_n_weeks`は、開始日を含む月曜日〜日曜日のcalendar weekをphase 0とする。`startWeekMonday`と`candidateWeekMonday`のcivil day差を7で割った`weekIndex`について、`weekIndex >= 0 && weekIndex % interval_weeks === 0`のweekだけをactiveとし、candidateの既存Sunday=0〜Saturday=6 weekday maskが選択されている場合にeligibleとする。`candidate < start_logical_date`はperiod lower boundで必ず除外する。locale、device、browser timezone、Temporalの外部weekday numberingはauthorityにしない。

D-087はD-086のN-week phase anchorだけを変更し、simple `weekly`、他のrecurrence family、typed schedule shape、shared evaluator、materialization / suppression / CAS / race semantics、historyを変更しない。schema migration、API command、dependency、historical rewriteは不要である。

## Historical facts and projections

DayBoard、Calendar、Timeline、Review、Mapはcanonical task stateを別系統で保持するauthorityではなく、Domain / historical factsから構築するprojectionとする。

- planned placementとactual Executionを区別する。
- Task / Project / Routine等の現在metadata変更で、過去Execution / RoutineOccurrence等の意味を黙って再分類しない。
- historical factsを参照不能にする破壊的hard deleteを前提としない。
- 初期の一般Task / Entry sliceではdestructive hard-delete APIを提供しない。D-065はこの境界のProject限定例外であり、Project hard delete後もTask / Entry / Execution / RoutineOccurrence / operation historyを保持し、Task assignmentだけを`NULL`へ更新するbounded commandを提供する。
- Reviewはlogical day / week / month、Project、Task、Routine、Section、estimate / actual等へ将来集計できることをtargetとする。

historical contextのgeneral exact snapshot / reference fields、Review UI、qualitative Review semanticsはOpenとする。D-065で追加したbounded `entry_project_snapshots`（既にExecutionを持つordinary Entryの初回Project ID / title）と、live Project FKをauthorityとしないRoutine occurrence snapshotのProject ID / title pairはこのgeneral Review modelへ昇格させない。Execution時点のTask / Section metadata等の未定義snapshot fieldsは、rename / move / delete / Reviewのbroader scopeで別途Decisionする。

### D-065 Project lifecycle and historical identity

- Projectはstable owner-scoped identityを持ち、active / archived stateとProject Board orderを別のserver-owned management stateとして持つ。archiveはreversibleで、Task / Routine assignmentやhistoryを変更しない。
- active Projectだけを新規assignment候補とする。既存のarchived assignmentはcurrent projection上でProject名とarchive状態を表示し、restore後は再び通常候補となる。
- hard deleteは明示確認付きの不可逆Project commandであり、現行TaskのProject FKだけをNULLへする。Task、Entry、Execution、RoutineDefinition、RoutineOccurrence、operation、historical snapshotは削除しない。
- Routine occurrence snapshotのProject ID / titleはProject hard delete後もhistorical factとして利用可能であり、ordinary executed Entryはbounded entry snapshotで同じ意味を保持する。Project-owned DocumentはこのDecisionのscope外である。
- Project Board commandはowner、Project / Board revision、operation fingerprint、atomicityを検証し、同一operationのretryは既存command conventionに従って同じ結果へ収束する。

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

## D-106 Android native authentication foundation

D-106は既存Better Authのemail/password + cookie sessionを利用するKotlin +
Jetpack Composeのnative Android signed-in shellを追加する。既存の
`/api/auth/sign-in/email`、`/api/auth/get-session`、`/api/auth/sign-out`を
使用し、Serverのsession / stable app-user mappingをauthorityとする。

Android clientは`Set-Cookie`の名前を固定せずopaque cookie jarとして扱う。
保存時はAndroid Keystoreのnon-exportable AES-GCM keyと
`Context.noBackupFilesDir`を使い、password、app-user ID、Markdown、Domain
dataを保存しない。startup restoreではvalid session、authoritative `401`、
network/5xxを区別し、network/5xxは明示的retryまでsigned-outへ落とさない。
explicit logoutのnetwork ambiguityではlocal sessionを保持する。

これはauth foundationだけを対象とし、Today、offline sync、realtime、Widget、
通知、Domain screen、JWT / OAuth / passkey / MFA、API / schema / migrationは
含まない。Android offlineのoperation範囲、local DB、sync、conflict、clockは
D-011に従い未決のまま維持する。

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

## D-066 Non-blocking ordinary Day mutation UX

D-066はcurrent Dayのordinary Task mutationに限るWeb UX contractである。Server stateをcanonicalとし、clientはmemory-onlyのoptimistic / pending overlayを表示する。永続queue、offline/PWA、realtime、multitab同期、API / Domain / schema変更は含めない。

- Task add、Task title / Project、Section、planned start、estimate、planned reorder、current-Day Start / Completeを対象とする。Bulk、Routine scope変更、Project Board、日付移動、duplicate、destructive delete、manual execution correctionは対象外。
- Clientはsingle global serial dispatcher（同時in-flight最大1）で、受理済みintentをqueueする。未送信intentは同一field / targetの最新値へcoalesceできるが、送信済みoperationの`operation_id`、payload、expected revisionは凍結する。
- Addはclient UUIDv7のprovisional Task / Entryを即時表示し、dependent mutationを後続queueへ積む。Add failure時はprovisional rowとdependent intentを取り消す。
- Section / planned startはpairとしてoptimistic表示し、reorderはvisible orderを先に更新する。各command後にcanonical Dayを再取得してoverlayを収束させる。
- Start / Completeは既存Domain commandを再利用し、clientでactual timestampやlifecycle stateを捏造しない。pending Start後のCompleteは同じexecution identityでqueueし、Start failure時はCompleteを送らない。
- `dependsOnOperationId`はqueued dependency graphとして扱う。deterministic failureではrootの全queued descendantsを送信せずcancelし、ambiguous rootではfull descendant subtreeを保持する。rootのexact retry / canonical convergence後にだけ、保持したdescendantsをqueue orderどおりdispatchする。root discard時はsubtreeもclearする。
- mutation scopeはtarget / dependent target単位で衝突判定し、ordinary Day全体を`mutationLocked`でfreezeしない。auth、Day navigation、initial Section、settings等のglobal barrierは維持する。
- sent operationのrevision conflict / ambiguous outcomeではoverlayと未送信queueを止め、canonical reconcile後に成功を確定できなければexact operationを保持してretryする。navigation / reloadではpending stateを誤って破棄しない。

## D-067 Completed Entry hard delete contract

`DeleteCompletedEntry` accepts `{ operation_id, taskchute_day_id, entry_id, expected_placement_revision }` and returns `{ entry_id, deleted_execution_ids, taskchute_day_id, placement_revision }`. The authenticated principal is derived server-side. The Worker accepts the command only for the server-authoritative current Day and an Entry owned by that principal whose lifecycle is exactly `completed`, whose Executions have no active row, and whose execution relation is canonical. Past/future Day, planned/running Entry, owner mismatch, stale revision, changed target, and active-execution anomalies reject.

The command is one atomic D1 mutation. It deletes all target Executions first, removes Entry-bound `lifecycle_command_guards` and `entry_project_snapshots` required by existing `ON DELETE RESTRICT` references, deletes the Entry, increments `placement_revision` exactly once, and stores the success operation. On any failure the transaction leaves the Entry, Executions, revision, and operation state converged; the operation is not inferred as successful from an absent Entry. Exact operation replay returns the original result, while operation-id misuse rejects.

The target Task, Project, unrelated Entries/Executions, RoutineDefinition, RoutineOccurrence, occurrence snapshot, schedule and future materialization remain. Routine occurrence identity is retained so current-Day routine materialization does not recreate the deleted Entry. D-067 does not create Skip semantics, undo/restore, or a completed bulk path. `0020_delete_completed_entry.sql` is a compatibility-only operations CHECK migration.

## D-069 Future-Day Project assignment

Status: Approved. Runtime / APP migration: IMPLEMENTED / INTEGRATED / NO MIGRATION.

- The Web and Worker accept Task-level Project set / clear only for an authenticated owner's established current or future TaskChuteDay Entry whose lifecycle is `planned`, whose `routine` relation is `NULL`, and whose Day is planning-enabled. Unestablished preview, record-none / past, running, completed, Routine-derived, missing, and cross-owner targets reject without a write.
- Project remains `Task.project_id`; `NULL` is displayed as `Projectなし`. An active owner-scoped Project can be newly assigned, an archived Project cannot be newly assigned, and an existing archived assignment remains readable. Project assignment does not create an Entry-specific relation.
- On future Days, Task title is read-only and any requested title / expected title must match the canonical Task title. Section, planned start, estimate, Mode, Entry / Task / Day identity, and Day `placement_revision` remain unchanged. Future Day mutation reuses `UpdateTaskMetadata` with an atomic guard over the TaskChuteDay ID, logical date, Entry, Task, lifecycle, and Routine relation; no new command, queue, or migration is introduced.
- Current-Day dispatch remains D-066's global serial dispatcher. Future-Day dispatch uses the existing direct/scoped path with the same exact operation identity, ambiguity retention, retry, navigation / reload / logout / unload guard, and canonical reconciliation boundary. Production verification is separate from this contract.

## D-070 Future established-Day Mode assignment

`SetEntryMode`はauthenticated ownerのestablished currentまたはfuture Dayに属するordinary planned Entryへ適用できる。future previewにはcanonical Entryが存在しないためMode editorを表示せず、established past、record-none past、running、completed、Routine-derived、owner外、missing targetはWorkerでrejectしWebでread-onlyとする。

- `mode_id = null`はrelation clear、owner-scoped existing ModeDefinitionはset / replaceである。Mode Boardのserver orderをoptionsへ使い、same-title Modeはstable IDで扱う。assignmentはEntry、Task、Day、Section、planned start、estimate、Project、`placement_revision`を変更せず、future assignment時にhistorical snapshotを作らない。

## D-116A Completed Entry historical Project / Mode correction

On the current established Day, an owner may correct Project and Mode for an
ordinary completed Entry with completed Execution history. Routine-derived,
past/future, and otherwise ineligible Entries remain read-only. D-117 additionally
allows Project / Mode metadata changes for an ordinary running Entry on the current
established Day; this does not make its planning, lifecycle, or placement controls
editable. Task title, lifecycle, Section, estimate, planned start, placement, and Day
`placement_revision` do not change. A running Mode change updates the live Entry
relation while the start-time historical snapshot remains authoritative after completion.

Completed Project authority is the Entry's `entry_project_snapshots` row, not
the shared Task's `tasks.project_id`. Set / replace / clear updates only that
Entry's historical snapshot and preserves its capture time. A missing
historical Project snapshot fails closed rather than being inferred from the
Task. Completed Mode correction atomically converges the Entry's existing
`entry_modes` relation and `entry_mode_snapshots`; clear removes both and a
first snapshot uses the original Execution start time. Existing command
operation identity, CAS, exact retry, and canonical reload semantics remain in
force; no command, API route, or migration is added.

## D-116B Completed Entry to future Routine

From the current established logical Day, an owner may create one new
future-facing daily Routine from an ordinary completed Entry with completed
Execution history. The source remains an ordinary completed Entry with its
original Task and Execution history and `routine_occurrence_id = NULL`.

The new Task title comes from the source Task. Project comes only from the
source Entry's `entry_project_snapshots`, never from a shared Task's current
`tasks.project_id`; a missing snapshot fails closed. A non-null historical
Project or Mode must still be active and owner-scoped. Mode comes from the
Entry's `entry_mode_snapshots`; absent history means no default. Archived or
deleted references must be corrected or cleared with D-116A before conversion.
Entry Section/planned-start are copied together only when valid in current
Section configuration; otherwise both defaults are null. Entry estimate is
copied.

The Routine starts on the next logical TaskChuteDay, is daily, active, and has
no end date. No current-Day RoutineOccurrence or Entry is created. One atomic
`CreateFutureRoutineFromCompletedEntry` command creates the new Task,
RoutineDefinition, defaults, Board item and revision, and owner-scoped
`completed_entry_future_routines` correlation. Exact operation replay and
source correlation prevent duplicate creation; the correlation is not a
RoutineOccurrence identity. Source Task, Entry, Execution, and historical
snapshots remain unchanged.

The source correlation remains after the linked Routine is archived or soft-deleted,
and prevents creating a replacement from the same Entry. A correlated completed
Entry cannot be hard-deleted; the existing delete command reports a deterministic
conflict so historical correlation is not lost or misreported as an ambiguous
database failure.

## D-072 Mode Settings search / archive / restore / delete

D-072はMode Settingsのcurrent behaviorを次のように定義する。Searchは現在選択中のtabだけを対象にしたclient-side title filterで、case-insensitiveである。Search queryは永続化せず、server search endpointも追加しない。既定tabはactive `使用中`、archived tabは`アーカイブ`である。

Active Modeはarchiveまたはdelete、archived Modeはrestoreまたはdeleteをrow menuから開始できる。既存のtitle click renameは維持し、archive / deleteをrename操作へ混在させない。

Archiveはowner-scoped reversible stateである。Mode definition、Board item、existing `entry_modes`、historical snapshot、Task / Entry / Executionは保持する。Archived Modeは新規のAddTaskToDayまたは新規assignment候補にならないが、既存assignmentの表示は許可する。既存assignmentのclear、またはactive Modeへのreplaceは許可する。Archived Modeへの同一ModeのSetは新しいAssignmentを作らず、restore後は通常候補へ戻る。

Deleteは明示確認付きの不可逆live Mode commandである。command成功時はowner-scoped live `entry_modes`をclearし、Mode archive、Board item、Mode definitionを削除して、残るModeのpositionをcompactし、Mode board revisionを一度だけincrementする。Task、Entry、Execution、`entry_mode_snapshots`、Day placement / placement revision、他のmetadataは削除・更新しない。結果は`mode_id`、新しい`board_revision`、`cleared_entry_count`を返す。対象が既に存在しないexact operation replayは既存operation resultへ収束し、別意味のoperation-id再利用は拒否する。

Mode Boardのreorderはvisible subsetの操作をserver-owned canonical full orderへ復元して送る。検索、active / archived tabで隠れているModeの相対順は保持し、archiveはboard位置を保持し、restoreは保持位置へ戻す。Deleteだけは削除後にpositionをcompactする。

Mode archive / deleteのAPI、権限、revision、target identity、operation replay、DB保存後検証のexact detailsは実装と`docs/ARCHITECTURE.md`を正本とする。Productionでの破壊的deleteはD-072のscope外であり、nonprod検証では明示したdisposable fixtureだけを対象にする。
- Workerはread時のTaskChuteDay IDとexact logical date、Entry lifecycle、Routine relation、expected live relationをmutation batchのDELETE / INSERT / success operation全てでguardする。EntryのDay move、lifecycle change、expected relation changeとの競合はdeterministic conflictまたはtrue ambiguityへ収束し、relationだけのpartial successを残さない。canonical no-opもtarget authorityをguardしてsuccessを保存する。
- current DayはD-066のglobal serial dispatcher、unsent coalesce、latest canonical expected relation rebase、sent exact retry、canonical reconcileを維持する。future established Dayは同一Entry scopeのdirect mutationで一件ずつ実行し、D-066 queueへ投入しない。ambiguous outcomeではcanonical requested relationならsuccessへ収束し、それ以外は同じoperation ID / exact payloadをretryする。
- planned future rowはlive Mode titleを表示し、Mode rename後は新titleへ追随する。Start時だけその時点のlive titleをsnapshotへ保存する。move / duplicate、D-068 current behavior、D-069 Project assignment、AddTaskToDayの既存Mode pathは変更しない。
- D-070はexisting command / request / result / relation / operationsを再利用し、APP / AUTH migration、schema変更、新command、API schema、dependency、persistent queue、future executionを追加しない。

## D-073 Interrupt / Continuation v0.1

Status: Approved / implemented / persistent nonprod corrective verified.

- Current logical Dayのrunning ordinary Entry Aから、同じDayのordinary planned Entry Bを通常のStart controlで開始する場合、確認modalを出さずdedicated `InterruptEntry`を送信する。Routine source / target、Quick Interrupt、non-current Day、auto-resume、pause-resumeは対象外で既存boundaryを維持する。
- Requestは`operation_id`、source / target Entry、source active Execution identity、target Execution UUIDv7、continuation Entry UUIDv7、Day、`expected_placement_revision`を含む。source Executionは`terminal_outcome = interrupted`で終了し、Bはplanned startを変えず新しいactive Executionへ遷移する。active Executionは常に最大一件とする。
- Aの同じTaskのcontinuationを一つだけplannedで作成する。planned startは実際のinterrupt instantのlogical minute、Sectionはその時点のfrozen current-Day Section context。Bと同じminute cohortならBの直後、異なるminuteならinterrupt minute cohortの末尾へ置き、unrelated same-minute orderは書き換えない。
- Continuation estimateはchain rootのoriginal estimateからchain内累積actualを控除し、original estimateがNULLまたは残量が`<= 0`ならNULL。stable chain / parent relationとsourceのlive Mode relationを引き継ぐ。BのTask / Project / Mode snapshotは新規実行時に作り、legacy historical Task title snapshotはbackfillしない。
- 成功、replay、operation-id misuse、stale active / placement、同時実行、D1 failure ambiguityはいずれも一つのatomic batchと既存D-066 exact retry / reconcile boundaryで扱う。APP `0023_interrupt_continuation.sql`のみを追加し、AUTH、既存active Execution制約、production境界は変更しない。

## D-074 Day keyboard S / I insertion

The current-Day DayBoard accepts `S` on a focused ordinary Entry without requiring focus reacquisition after reconciliation. The effective action is `StartEntry` for planned, `CompleteEntry` for the active running Entry, and `CompleteEntry` dependent on a pending normal Start when the Start operation already owns the Entry's execution identity. Starting another ordinary planned Entry while an ordinary Entry is active reuses D-073 `InterruptEntry`; no confirmation modal is introduced. Repeat, modifier, IME, text-editing controls, completed / non-current / Routine rows, and modal surfaces are no-write boundaries.

The current-Day DayBoard accepts `I` on a focused ordinary planned Entry to create a draft directly after that Entry in the same Section and planned-start cohort. It accepts `I` on a focused Section summary to create a draft at the top of that Section's scheduled area; planned-start-NULL rows stay before scheduled rows, and `Sectionなし` uses the NULL planned-start cohort. The draft inherits no Project, estimate, or other metadata. Escape cancels without an Add operation and restores the source focus. Existing `N` and plus-button additions remain append additions.

`AddTaskToDayRequest.placement` is an optional backward-compatible intent: `{ kind: "after_entry", anchor_entry_id }` or `{ kind: "section_start" }`. The Worker validates the intent, reads the authoritative anchor / frozen Section context and current placement revision, derives the final planned start and position, shifts only planned rows in the same Section within one atomic D1 batch, inserts exactly one Task / Entry, and increments `placement_revision` once. It rejects historical-row crossing and stale or changed authority without partial state. Normal Add requests and future-Day Add requests without the intent retain their existing behavior. No APP or AUTH migration is required.

## D-076 Established future-Day keyboard I parity

An authenticated owner may use `I` on an established, planning-enabled future Day for an ordinary planned Entry or Section summary. A focused ordinary Task opens a memory-only draft directly after the focused Entry in the same Section and planned-start cohort. A focused Section opens a draft at the top of that Section's scheduled area using the frozen Section logical start; planned-start-`NULL` rows remain before scheduled rows. Enter submits the existing `AddTaskToDayRequest.placement` intent, and Escape is no-write with focus restoration.

The future established path sends the existing TaskChuteDay identity, logical date, placement revision, and either `{ kind: "after_entry", anchor_entry_id }` or `{ kind: "section_start" }`. The Worker accepts the logical date with placement only when it identifies the same established Day, then reuses the existing atomic placement command. It derives final position and planned start server-side and does not copy Project, estimate, Routine relation, or execution facts.

Past Days, running / completed / Routine-derived Entries, and unestablished future previews remain no-write for `I`. Preview navigation does not materialize a Day solely to support this shortcut. No APP / AUTH migration, schema, dependency, command, or security change is introduced.

## D-077 current-Day planning interaction

Eligible scope is an established, planning-enabled current Day ordinary planned Entry. The client accepts title, Project, Mode, Section, estimate, and planned-start intents immediately into the existing memory-only pending model; it does not create a persistent or offline queue. The global D-066 dispatcher remains serial and canonical Server state remains authoritative.

- For unsent same-field work, latest intent wins where the existing command/CAS contract permits coalescing. A sent operation's identity and exact semantic request remain frozen.
- `UpdateTaskMetadata` title / Project work is merged per field from latest canonical state plus still-valid pending field intent. Reconcile of an earlier request cannot erase a later title or Project value.
- Section / planned-start dependencies are accepted visually when safe and dispatched only after the required placement prerequisite can rebase against the latest canonical Day. Start follows accepted planning intent when its historical or eligibility authority depends on that result; no client-generated actual timestamp is allowed.
- The effective projection is canonical state plus valid pending / in-flight intents. Deterministic rejection rolls back only affected work; revision conflict and infrastructure ambiguity retain the existing D-066 stop/retry boundary.
- A transient `保存中 n件` status counts unresolved logical active + queued work once after coalescing. It is non-blocking, does not steal focus, and reaches zero only after convergence or deterministic rejection/rollback. Retained ambiguous work is not reported as successfully saved.

Past, future, Routine-derived, completed/running, Project Board / Mode Board, offline persistence, multi-tab coordination, and D&D/reorder semantics are outside this slice. D&D retains the existing placement busy boundary and is a follow-up candidate rather than a D-077 behavior expansion.

## D-078 Non-blocking repeated same-Section reorder v0.1

Current established Dayでmanual reorderが既に許可されているEntryについて、同一Sectionかつ同一planned-start cohort内のpointer D&D / `Shift + ArrowUp / ArrowDown`を、先行ReorderのServer convergence前でも受理する。visible orderはgesture直後に更新し、保存は既存のserial current-Day dispatcherで順序を保って進める。

Effective orderはcanonical Section全体のEntry sequenceとpending Reorder intentの合成である。hidden completed / running rows、historical segment、planned-start cohort境界を越えない。次のgestureはstale canonical rowsではなくeffective orderから計算する。running / completed Entry、cross-Section、future / past / previewはこのqueue capabilityの対象外とする。

同じreorder segment内のunsent latest desired orderはcoalesceできるが、Start / Complete / Interrupt、Add、Section move、planned-start変更、Duplicate / delete / bulk、Routine placement等のnon-commutative barrierを跨がない。sent Reorderのoperation identity、payload、expected revisionは変更しない。unsent no-opは送信せず除去し、sent operation後のreturn-to-baseは後続intentとして扱う。

successful reconcile後は最新canonical orderに対して後続intentを再検証する。deterministic error / revision conflictは依存intentをcancelしてcanonical表示へ戻し、ambiguous resultはexact retry identityを保持して後続Reorderを停止する。unexpected external order changeをrevision番号だけでsilent rebaseしない。`保存中 n件`はsent + latest unsentのlogical unresolved workを重複なく表示する。

## D-079 cross-Section Move interaction

Current established Dayのordinary planned Entryは、既存`MoveEntry` commandの意味を変えずに、pointer D&DまたはSection selectorでcross-Sectionへ即時移動できる。effective projectionはcanonical Dayへstill-valid pending MoveとD-078 Reorder overlayを重ね、row membership、Section、planned start、Section summary、Next / forecastを同じprojectionから導出する。real SectionへのMoveはfrozen Section logical start、`Sectionなし`へのMoveは`NULL` planned startへ同期する。

sent Moveのoperation identity / destination / payload / expected revisionはimmutableであり、後続Moveは別logical intentとする。unsent same-Entry Moveのcoalesceは同一order-preserving tail segment内に限り、different-Entry MoveやStart等のbarrierを跨がない。different-Entry Moveはglobal serial dispatcherでユーザー順を維持し、same-Entryのeffective destinationを次のsourceとして扱う。unsent return-to-canonicalはcancelし、sent済みのreturnは後続Moveとして扱う。

Move unresolved中は同じEntryのsame-Section Reorder / `Shift + Arrow`、planned-start direct edit、Move→target-Section Reorder chainを許可しない。StartはMove成功後の最新canonical stateからdispatchし、Move failure / ambiguityではstale Section stateで実行しない。running / completed / Routine-derived / future / past / preview / provisional Addの既存eligibilityは不変である。API、Worker semantics、schema、migration、dependency、security postureは変更しない。

## D-080 Provisional Add → I keyboard chaining

Current established Dayのordinary planned Taskへ`I`でAdd draftをcommitした直後、そのprovisional rowをlogical focus targetとして扱う。provisional row上の`I`は同じSection・同じplanned-start cohort内でrow直下へchild draftを作り、親provisional Entryのstable IDを`{ kind: "after_entry", anchor_entry_id }`へ使用する。child Addは親Addのoperationへ依存し、親成功後にcanonical placement revisionを使ってdispatchする。A→B→Cのような連鎖では、各childは直前のeffective provisional orderをanchorとして計算し、parent-before-child orderを保持する。

sent / retained parent requestのoperation identity、payload、placement intentは変更せず、後続draftで上書きしない。Add成功はexact rootだけをreconcileし、newer draftとfocusを消さない。deterministic failure / revision conflictは依存childと親anchor上のopen draftをcancelし、ambiguous outcomeは親のexact retry identityとdescendant subtreeをretainして後続dispatchをholdする。unsent dependent Addを親なしで独立送信しない。

provisional rowには`aria-busy`とstable Entry identityを持つpending表示を出すが、`S`/lifecycle、reorder、move、delete、duplicate、Routine、bulk、actual-time操作はno-writeである。pending Section Moveなどplacement anchorを不安定化するbarrier中の`I`は受理しない。EscapeはAddを送信せずsource focusをrestoreする。既存のcurrent-Day D-074、future established-Day D-076、past / preview read-only境界は変更しない。Worker/API、schema、migration、dependency、security postureの変更はない。

有効なcurrent established-Day Add draftのEnter commitでは、clientは親AddのServer responseを待たず、同じrender-safe focus handoffで確定したprovisional Entryをkeyboard focus targetにする。従って`保存中…`中でもそのrowへの`I`はchild draftを開ける。これはfocus timingの補正であり、Add placement、parent dependency、exact operation identity、retry / ambiguity、failure/conflict、future/past eligibilityの意味は変更しない。

## D-081 Actual-Section Start + execution-first Day Table

D-081ではplanned stateのD-043同期を維持し、Start / Interruptの実際の開始時点で確定するSectionをrunning / completed Entryへ保存する。Workerはestablished Dayのfrozen Section contextから`[actual_start_instant, actual_end_instant)`でactual Sectionを一意に解決し、client時刻や表示中Sectionをauthorityにしない。解決不能時は推測・partial writeをせずfail safelyする。actual Sectionがplanned Sectionと同じならplanned startとphysical placement、placement revisionを維持し、異なる場合またはSectionなしの場合だけEntry移動とplacement revision `+1`をStartのatomic outcomeへ含める。

running / completed Entryは元の`planned_start_minute`（Sectionなしは`NULL`）を保持する。Day TableはSection順を最優先し、各Section内でrunning / completedを`execution_summary.first_started_at`昇順、同値・欠損時はstable physical position / Entry identityで先頭に表示し、planned EntryをD-043のplanned-start昇順、同一minuteの`position`順で後段に表示する。Next / Start Forecastはplanned-onlyの既存semanticsを維持する。

Reorderはrunning / completedを対象外とし、historical physical positionを変更しない。planned Entryだけを同一planned-start cohort内で並べ替え、display indexをphysical positionへ直接変換せず、各cohortの既存physical position slotsをtie-break再割当へ再利用する。D-078 / D-079のbarrier、revision/CAS、exact retry、external order protectionを維持する。

Interrupt targetにもactual Section解決とplanned start保持を適用する。continuationはinterrupt actual logical minuteの通常planned Entryとしてcohort tailへ置き、D-073のB-direct-after special placementを廃止する。D-060のSetExecutionTimes、既存historical rows、retroactive backfillは変更しない。Routine-derived normal Startにもactual Section ruleを適用するが、Routine Definition / occurrenceのplanned defaultsは変更しない。新command、API schema、schema / migration、dependency、security postureは追加しない。

## D-082 Auto-carry overdue planned Tasks to current Section

`未実行Taskを現在Sectionに自動移動する`はaccount / Server canonical settingで、default OFFとする。ON/OFFは複数deviceで共有し、localStorage / IndexedDBへcanonical valueを保存しない。OFFへの変更は既存placementをrollbackせず、ON保存成功後はcurrent-Dayを安全にreconcileする。

ON時のcarryはcontinuous invariantではなく、Section boundaryまたはsetting enableによるedge-triggerである。同一current Section・同一setting versionの成功eventは既存`operations`へ`AutoCarryOverduePlanned`として記録し、同じDay loadで再度Entry mutationを行わない。複数Sectionを跨いだ閉鎖後の次回current-Day loadでは一度のcatch-upで全past timed Sectionを処理する。non-current Day queryでは実行しない。

対象はcurrent established Dayのplanned Entryで、frozen context上の過去timed Sectionに所属するnormal Entryおよび当日materializeされたRoutine occurrence。current / future Section、Sectionなし、running、completed、past / future Day、suppressed / unavailable Routine occurrence、historical protected stateは対象外とする。current timed SectionはWorkerが`actual_start_instant <= now < actual_end_instant`を満たすunique contextから解決し、解決不能ならloadを壊さずcarryとcheckpointをno-opにする。

carry結果は`section_id = current Section`、`planned_start_minute = current Section logical_start_minute`。source Section orderとsource内のplanned start / physical position orderを維持し、target Sectionの同一planned startに存在するplanned cohortより前へ置く。D-081 historical physical positionsは固定し、planned slotsだけをsafeに再割当する。placement revisionは1 logical outcomeにつきexactly once増分し、candidateなしでも成功checkpointを保存する場合は増分しない。

Routine-derived Entryでは当日の`routine_occurrences`へ`section_plan_override_present = 1`、current Section、current logical startをEntry placementと同じatomic outcomeで保存する。Routine Definition、default Section / planned start、defaults revision、schedule、recurrence、enabled state、Task / Routine identity、他日のOccurrenceは変更しない。cross-Dayへ移動済みのRoutine Entryはcandidateから除外し、load failureやordinary化を起こさず、Entry / Occurrence / Definitionを変更しない。同一Day-origin Routineは従来どおり対象とする。

Settings APIはauthenticated owner scopeのread / updateを提供し、updateは`operation_id`、enabled、expected `updated_at`を受ける。same-operation exact replay、different-payload misuse、stale CAS conflict、ambiguous exact retryを既存operation semanticsで扱う。Settings > Sectionの独立subsectionはaccessible checkbox / switchとし、保存中はdouble submitを防ぎ、Section configurationの「次のDayから反映」と混同させない。current-Day loadはmaterialize → Routine ensure → auto-carry → latest Day reload → projectionの順とする。D-043 planned synchronization、D-078 / D-079 placement barriers、D-081 execution-first projectionは維持する。

### D-082 corrective boundary

candidate setから除外したcross-Day moved Routineが存在してもcurrent-Day loadは成功する。candidateが0件のboundaryでは、candidate-read placement revisionをCAS preconditionとして既存operationsへ空結果のsuccess checkpointを保存し、競合時はbounded re-read/retryする。exact replayは同じ空結果を返し、placement revisionを増分しない。carry対象はtarget same-time planned cohortより前へ配置する。

## D-083 Free planned placement with D&D + Shift cross-Section movement

Current established Dayのordinary planned EntryだけがD-083のdrag / keyboard sourceとなる。Routine-derived、running、completed、historical、provisional Add、future / past / previewはsourceとして移動しない。planned Routine rowはordinary sourceのanchorとして利用できるが、Routine Definition、Occurrence override、Routine planned semanticsは変更しない。

Task rowへのdropはanchorのplanned Section / planned startをServer authorityとして使い、`placement: { kind: "relative_to_entry", anchor_entry_id, edge }`でbefore / afterを表す。same Section・same cohortはD-078 Reorder、same Section・different cohortとcross-Sectionは既存MoveEntryのatomic extensionとして処理し、clientからplanned startやraw positionをauthorityとして送らない。Section areaはtarget Section logical startのplanned tail、SectionなしはNULL-start cohortのtailとする。existing Section-only MoveEntry requestは後方互換で維持する。

Move validationはowner、same Day、ordinary planned source、planned anchor、target Section一致、anchor availability、placement revisionをServer側でguardする。historical physical positionは変更せず、planned cohort slotsだけをsafeに再割当し、cross-Sectionではsafe unique positionを使う。position uniqueness、D-081 historical boundary、D-043 planned synchronization、placement revision exactly once、true no-op no revisionを維持する。guard失敗はpartial effectなしでreject / conflictする。

Focused sourceの`Shift + ArrowUp / ArrowDown`はplanned area内でcohortおよびSection境界を越えて移動できる。Sectionなしは存在する場合のみtraversalに含める。successful moveはsame Entry identityへのfocusをrestoreし、failureはcanonical reconcileしてghost indicatorを残さない。D&D previewはsource rowのleft / widthを固定してpointer Yだけ追従し、vertical auto-scrollは`.day-surface` edgeのみ、`scrollLeft`は不変とする。

Sent MoveEntryのoperation identity、destination、anchor、edge、expected revisionはimmutable。unsent same-Entry intentのcoalesceはorder-preserving segment内だけに限定し、Start / Complete / Interrupt、Add、planned-start edit、delete、Duplicate、bulk、Routine placement、D-082 reconcile、retained ambiguityを跨がない。D-078 / D-079 queue、retry、ambiguity、future/past no-write境界は変更しない。新command、schema、migration、dependencyは追加しない。

## D-084 Routine-derived planned placement D&D / Shift

Current established Dayのplanned Routine-derived Entryも、D-083と同じrow-level pointer D&Dおよび`Shift + ArrowUp / ArrowDown`のsourceになれる。対象外はrunning / completed / interrupted history、future / past / preview / unestablished、provisional、suppressed / unavailable occurrence、mutation-locked stateである。

同一Section・同一planned-start cohortではposition-only reorderを行う。scope chooserは表示せず、Routine OccurrenceのSection plan override、Routine Definition、planned Section / startを変更しない。cross-cohort / cross-Section / Section-area placementでは既存`SetRoutineSectionPlan`へoptional relative placement（anchor Entry ID + before / after）を渡し、anchorのplanned Section / startをServer authorityとして利用する。historical anchor、cross-Day anchor、Sectionless invalid pairはrejectする。

first-timeのSection / planned-start変更で`section_plan_override_present = false`の場合、UIはcandidateをmemory-onlyで保持し、`今回だけ`または`ルーティンに反映`を明示選択するまでwriteしない。Escape / Cancel / dismissはno-writeで元Entryへfocusを戻す。overrideがtrueの場合はchooserなしのOccurrence-only direct pathとする。Definition pathはcurrent selected placementを尊重し、Definition default / defaults revision / existing eligible materialized propagationを更新し、selected occurrence overrideをclearするが、relative before / afterをrecurring Definitionへ保存しない。

SetRoutineSectionPlanの旧request形状・exact operation / replay / retryを維持し、placement / defaults revision CAS、Routine scope / placement / propagation / resultを一つのatomic outcomeとして扱う。D-078 / D-079 placement barrier、D-081 historical display / physical-position boundary、D-082 auto-carry override、future / past no-write、D-083 drag preview / vertical auto-scrollを変更しない。新command、schema、migration、dependency、future materialization、historical backfillは追加しない。

## D-085 Routine Mode default / occurrence override

Routine Definitionにはowner-scopedな任意のdefault Modeを持たせ、default rowがない状態をModeなしとする。Routine Occurrenceにはoverride rowのpresenceを保持し、rowが存在して mode_id がNULLならそのOccurrenceだけの明示的なModeなしとする。planned Routine-derived Entryのeffective live Modeは、override、default、Entryへの既存Modeの順で解決し、実行後のsnapshot / historyは変更しない。

current established Dayのplanned Routine-derived Entryでoverrideが未設定の場合、Mode変更はmemory-only candidateから 今回だけ または ルーティンに反映 を明示選択するまでwriteしない。今回だけはOccurrence override、ルーティンに反映はRoutine default更新とeligible planned no-override occurrenceへのpropagationを既存CAS / atomic operationで確定する。overrideが存在する場合はOccurrence-only direct pathとし、ModeなしもNULL overrideとして保持する。

Routine BoardはProjectの隣にMode列を表示し、default Modeを編集する。Routine化はordinary Entryの現在Modeをdefaultとして継承し、Mode削除はRoutine defaultとOccurrence overrideを安全にclearしてlive Entry ModeをNULLにするが、snapshots / historyを変更しない。APP migration 0025_routine_mode.sqlで関係とoperations CHECKを追加するが、AUTH migration、既存API semanticsを越える新command、dependency、security posture、future materializationの拡張、historical rewriteは行わない。D-068のRoutine Mode out-of-scopeはこの狭いdefault / occurrence override機能に限りsupersedeする。

## D-088 effective workday / holiday calendar foundation

Runtime holiday authorityはCabinet Office公式CSVのtracked normalized snapshotとし、runtime / ordinary buildからupstream networkへ接続しない。snapshotはsource page、CSV URL、coverage start/end、source SHA-256、logical date、source labelを保持し、明示的な`npm run update:jp-holidays`だけが取得・strict decode・date validation・duplicate検査・deterministic generationを行う。CSVの`休日`を含む全entryをofficial holiday factとして扱い、未発表日やequinoxを推測しない。

`classifyEffectiveDay`がlogical `YYYY-MM-DD`をauthorityとする共有pure classifierであり、coveredな月〜金は`workday`、土日は`holiday`、公式entryは曜日にかかわらず`holiday`、coverage外の月〜金は`unknown`とする。user overrideは`workday`または`holiday`をbaseへ適用するが、official entryは保持する。browser timezone / locale parsing / Date rolloverは使わない。

APP `0027_workday_holiday_calendar.sql`はowner-scoped `effective_day_overrides`（user/date primary key、kind CHECK、optional reason、non-negative revision、timestamps）と既存operations command CHECKの互換拡張を追加する。Settings APIはauthenticated ownerのcoverage、date classification、override list、upsert、delete/resetだけを公開し、raw CSVやunauthenticated calendar endpointを公開しない。D-088はRoutine materialization eligibilityを変更せず、営業日・休日recurrenceへの統合は後続Decisionとする。

## D-089 Routine workday / holiday recurrence

D-089でD-088のcalendar authorityをRoutineへ接続した。typed scheduleは`workday`（effective workday）、`holiday`（effective holiday）、`official_holiday`（official snapshot entry）、`monthly_last_workday`（同一月内で最後のeffective workday）で、coverage外weekdayのunknownはeligibleではない。`monthly_last_workday`は月末までの全日を同じbulk calendar snapshotで評価し、later unknownをブロックする。

既存10 recurrence kindは`isRoutineScheduleEligible()`のpure civil-date evaluatorを継続利用し、D-089 kindだけを`isRoutineScheduleEligibleWithCalendar()`のshared adapterで評価する。Routine Board、current-Day materialization、UpdateRoutine suppression / restore、D-088 override reconciliationは同じadapterとowner-scoped bulk override contextを使う。override mutationとplanned D-089 reconciliationはAPP 0028後の同一D1 batch / assertion boundaryでcommitし、moved / skipped / paused / overridden / historical stateを変更しない。

## D-090 Standalone Markdown Notes v0.1

`Document`はTask / Project / Routineへ従属しないowner-scoped shared entityであり、v0.1では`kind = standalone`だけを許可する。必須のcanonical fieldsはstable `document_id`、owner、title、Markdown source body、non-negative `revision`、`created_at`、`updated_at`である。Markdown sourceが正本であり、rich-text-only representation、attachment、binary、Task-specific storageは作らない。

Authenticated Webのtop-level `ノート`はstandalone Documentの一覧・取得・新規draft・明示Save・既存編集を提供する。Createは一つのoperation identityでexact replayし、Updateはowner-scoped `expected_revision` CASでrevisionを一度だけ進める。同一operation IDのpayload変更、stale revision、owner外アクセスは拒否する。Ctrl+S / Cmd+SはSaveと同じ経路を使い、dirty draftはin-memoryに保持され、競合・navigation・logoutで黙って破棄しない。Notesは既存のbounded JSON request-size protectionを維持する。

`documents` queryはstandaloneだけを`updated_at DESC`とstable tie-breakで返し、arbitrary hidden capを設けない。D-090の初期sliceではdelete/archiveとautosaveを定義しなかったが、これらのstandalone Note semanticsはD-091 / D-092で狭くsupersedeされる。preview、search/backlinks、Task/Project/Routine relation、localStorage/IndexedDB、offline queue、public shareは引き続きscope外である。

## D-091–D-093 Standalone Note implementation boundary

D-091により、`＋ 新規ノート`はServerへ初期Createを送り、要求title `notitle`をowner内でtrimmed exact comparisonし、必要なら連番suffixを付けて一意化する。既存Noteのtitle / Markdown bodyはmemory draftをcanonical baselineと比較し、約1秒のautosaveまたは明示SaveでUpdateする。Updateは`expected_revision` CAS、exact operation replay、same-operation misuse rejectionを使い、in-flight requestを変更しない。ambiguous outcomeはexact operationを保持し、exact-ID reconciliationまたはRetryでのみ解消する。

D-092により、通常一覧と分離した`アーカイブ`一覧、archive / restore、明示確認付きhard deleteをstandalone Noteへ追加する。archived_atが設定されたNoteは通常一覧から除外されるがtitleを予約し、deleteでDocument rowが消えた後だけ再利用可能になる。APP `0030_standalone_note_lifecycle.sql`はこの状態とoperation allow-listを永続化する。D-093は既存data / operation historyをrewriteせず、AUTH migrationを追加しない。
## D-101 Task Primary Note and Document Permalinks

Taskはowner-scoped shared `Document`を0または1つの`task_primary` relationとして持てる。Documentのstable `document_id`はTask identityと別で、Markdown source body、non-negative revision、server timestampsを保持する。Task titleはTask rowのauthorityであり、Task Primary Documentは第二のtitle、archive/delete lifecycle、attachment、preview、search/backlinkを持たない。Routine共通の長期noteも同じTask Primary Documentを参照できるが、RoutineOccurrence Documentをこのsliceで追加しない。

Todayの`ノート`列からの初回Ensureは明示クリック時にだけ行われ、成功したTask/Document pairはsharedな`/?view=note&document=<document-id>`で再訪できる。認証済みowner-scoped resolverがDocument kindを識別し、standalone / `task_primary`をexact identityで開く。missing / cross-owner IDは明示的に利用不可とし、別の表示中Noteへfallbackしない。side-peek / new-tabは同じcanonical identityを使い、Day projectionにはbodyを含めない。Task Noteのbody編集はmemory-only draftから既存operation/CAS boundaryへ送信し、ambiguous/conflictではexact request、revision、navigation barrierを保つ。APP 0031は既存standalone Documents、Task/Entry/Execution/Routine/calendar data、operations identityをrewriteせず、AUTH migrationを追加しない。

## D-102 Multi-Task Note Windows v0.1

Task Primary Noteのdesktop side-peekはTask stable identityごとに複数instanceを許可し、同一Taskの再表示は同一windowを再利用する。各instanceは独立したDocument title/body draft、save/unresolved barrier、geometry、minimized state、focusを持つ。App shellはz-order、active route、outside-click、navigation/logout barrierをwindow単位で調整し、window外クリックはfrontmost expanded windowだけを最小化する。別windowのクリックはそのwindowだけを前面化し、他windowを閉じたり最小化したりしない。

window identity、stack order、minimized/maximized stateはserver/localStorageへ保存しない。canonical URLはactive windowのDocumentだけを指し、reload/fresh tabはrouteから最大1つを復元する。preferred geometryを基準に24px cascadeし、mobileではsingle full-sheet、Hit-a-Hintではsingle active/local keyboard ownerを維持する。D-102は既存Document/API/Worker/schema/migration、Task Note Ensure、save/autosave/CAS/ambiguity semanticsを変更せず、Preview、offline/multi-tab state、Task/Project/Routine relation拡張も含めない。
## D-104 Web reliability boundary

初期Day/bootstrapの通信・Worker・D1・parse失敗はsigned-outとは別のrecoverable error stateとして扱い、明示的な再試行を提供する。認証済み状態でのauthoritative `401`はreauthentication-required barrierへ遷移し、Standalone / Project Primary inline / Task Primary floating / Project Primary floatingのdirty Note draftをこのtabのbrowser memoryだけに保持する。同一principalを確認できるまでserver mutationとeditorを凍結し、再認証後はcanonicalをreconcileして既存のCAS/conflict/ambiguity semanticsを再利用する。Note本文・titleはlocalStorage、IndexedDB、Cache API、service worker、URL/history、remote draftへ保存しない。

WorkerのJSON request ceiling `64 * 1024` bytesは維持する。Note Create/Updateのclientは実際に送るserialized JSONのUTF-8 byte lengthを共通helperで測定し、warning thresholdとhard stopを同じsave経路へ適用する。hard stopではdraftを保持して送信しない。

## D-105 Realtime invalidation boundary

Realtime notificationはfreshness acceleratorであり、canonical authorityではない。authenticated same-origin `/api/v1/realtime` WebSocketはserver-derived app userの`RealtimeHub`へ接続し、versioned invalidate scopeだけを受信する。Task/Entry/Document body等のcanonical dataやdomain commandをWebSocketで送らず、clientは通知後に既存HTTP Queryをrefetchする。

対象はToday / selected Day、Project、Mode、Routine、Notes / Documents。成功したcanonical mutationのcommit後にだけbest-effort publishし、publish failureはmutation resultへ影響させない。401 handshake/probeはD-104 `reauth-required`へ接続するが、socket/network failureはsigned-outやreauthとは扱わずbounded reconnectを行う。dirty/pending/unresolved editorやD-066 retained operationをnotificationで破棄せず、safe boundaryでreconcileする。APP/AUTH schema、polling、offline sync、production rolloutは追加しない。

## D-103 Project Primary Document v0.1

Projectはowner-scoped shared `Document`を0または1つの`project_primary` relationとして持てる。relationとDocumentはProject Note affordanceまたはProject/Document routeからlazyにEnsureされ、Document coreはProject FKを直接持たず、relation tableでProject identityを表す。Project rowのtitleが唯一のtitle authorityであり、Project Primary Documentの`title`はNULL、Markdown source `body`だけを保存する。Documentはnon-negative revisionとserver timestampsを持ち、body Updateはowner-scoped expected-revision CAS、operation fingerprint/exact replay、operation-id misuse rejectionを使う。

Project PrimaryはNotes一覧の`プロジェクトノート` filter、Project Board、TodayのProject cellから共通`/?view=note&document=<document-id>` resolverで開く。list projectionはbodyを含めず、resolverはrelationと現在のProject titleをowner scopeで再解決し、missing/cross-owner identityへ別Note fallbackをしない。Notes一覧でのProject Note選択はNotes editor内のbody-only inline editor、Today / Project Board / direct routeはshared floating editorを使用し、同一Projectのfloating windowが既にあればそれをactivate / restoreしてinline editorを二重にmountしない。Project Primaryはtabごとに最大1つのeditable writerを持つ。Project archiveはrelation/Documentを保持し、Project hard deleteは既存dirty/in-flight/unresolved barrierの後、Project・relation・linked Project Primary Documentを一つのatomic outcomeとして削除し、Task/Entry/Execution/historyを変更しない。APP `0032_project_primary_documents.sql`は既存Document/Task Primary/operationsを保持してこのkind・relation・guardを追加し、AUTH migration・新規dependency・Task/Project-specific parallel Document storageは追加しない。
