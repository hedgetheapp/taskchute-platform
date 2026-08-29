# Open Questions

ここにある項目は未決であり、記載されているcandidateやdirectionをApproved Decisionとして扱わない。

Resolved Decisionの正本は`docs/DECISIONS.md`を参照する。

## Infrastructure / persistence

Cloudflare Workers + D1のinitial adoption自体はD-020でApproved済み。

2026-08-22のcurrent-harness local + temporary remote D1 spikeにより、D1 `batch()` + conditional SQL + database constraintsで要求されたatomicity / concurrency / idempotency invariantを満たせるfeasibilityはVerified済み。

D-022によりFirst vertical slice全体のAPP persistence baseline responsibility、separate `AUTH_DB` / `APP_DB` boundary、UUIDv7 entity identity、user-global Section scopeはApproved済み。

D-024により、継続的なverificationではtracked / reusable configを利用する1つのpersistent Cloudflare non-production environmentを維持し、stable namingとseparate non-production `AUTH_DB` / `APP_DB` resourcesを使うことがApproved済み。date-scoped disposable environmentをverification cycleごとに再作成する方式は採用しない。

D-038によりSection persistenceではstable Section identity、versioned Section configuration、established TaskChuteDayごとのhistorical Section contextを責務分離し、`Sectionなし`をnormal timed Sectionのsentinelではなくplacement relationのabsenceとして扱う方向がApproved済み。authoritative time rangeを持たないlegacy historyからSection時間を推測せずunknownとして保持し、通常のSection設定変更はestablished current Dayをretroactiveに書き換えず原則次TaskChuteDayから有効にする。Dogfood実装順はB1（Section time foundation + `Sectionなし` + Entry見積）→B2（planned start + derived placement/order）→B3（Section settings lifecycle）でApproved済み。

D-039によりB2 planned-startの`planned_start_minute INTEGER NULL`、既存`entries.position`を使うmanual tie-break、derived Section / canonical order、SetEntryPlannedStart requestとatomic retry / conflict contractはApproved済み。B2 runtimeはcommit `316ad0d88f0f88d1445991904da587b1e0987dab`で`main`へImplemented / Integrated済みで、source review、automated verification、real local `0004` migration、signed-in browser、persistent nonprod `0004` migration / runtime / authenticated browser verificationはPASS。production verificationは`NOT_RUN`である。

Current First vertical slice implementation / nonprod verification fact:

- `AUTH_DB`にはBetter Auth 1.7.1 physical schemaをmigrationとして実装済み
- `APP_DB`にはapp user / auth mapping / settings / projects / sections / taskchute_days / tasks / entries / operations / executions / temporary command guard・assertionを実装済み
- `operations`は`(app_user_id, operation_id)` owner scopeとfingerprint versionを保持
- current fingerprint canonicalizationはrecursive deterministic JSON canonicalization + SHA-256、version 1
- current placement revision physical representationは`taskchute_days.placement_revision`
- `0002_lifecycle_ordering.sql`で既存operation rowを保持しつつlifecycle command typeとExecution persistenceを追加済み
- `0003_dogfood_day_b1.sql`でversioned Section configuration / established Day context、nullable Section placement、Entry見積を追加済み
- `0004_dogfood_day_b2.sql`でnullable `entries.planned_start_minute`、Sectionなし + non-null禁止constraint、planned-start / canonical-order index、`SetEntryPlannedStart` operation typeを追加済み
- active Execution uniquenessのcurrent physical strategyは`executions(app_user_id) WHERE ended_at IS NULL`のpartial UNIQUE index
- CreateProject / AddTaskToDay / ReorderEntries / StartEntry / CompleteEntryのcurrent transaction algorithmはimplementation review済み
- Reorderのcurrent physical strategyは`json_each`へordered Entry IDsを渡すset-based update
- current Reorder mutation batchはEntry数に比例してstatementを増やさない
- current B2 canonical projectionはSection内でplanned start NULLを先に`position`順、non-nullをminute昇順・同minute `position`順で返す
- SetEntryPlannedStartはestablished Day contextからSectionを解決してplacement / order / revision / operation resultをatomicに確定し、MoveEntryはplanned startをclear、ReorderはNULLまたは同一minute cohort内へ制限する
- persistent nonprod remote migration / schema / FK / active Execution partial UNIQUE indexはPASS
- persistent nonprod remote runtime smokeでCreate Project / Add Task+Entry / Reorder / Start / Complete / retry / conflict / reload recoveryをPASS

上記はcurrent implementation / verification factであり、将来永続化方式を固定する新しいApproved Decisionではない。

以下はOpen:

- operation result retention / cleanup policy
- B1統合後を含むfuture schema evolution / compatibility migration strategy
- backup / export strategy
- overload / observability strategy
- current Execution / lifecycle physical schemaを将来どの条件で見直すか
- custom domainを採用する時期
- D1 read replicationを将来導入するentry criteria
- Durable Objects / external PostgreSQLを将来再評価する条件
- Final R2 / binary object storage adoption
- D-031〜D-037で追加されたRoutineOccurrence override、workday override、manual Execution correction、cancelled / removed historyのphysical schema（D-038で確定したSection configuration / Day context / `Sectionなし` foundationとD-039で確定したplanned-start representation / tie-breakを除く）

## API / Command / Query

Command / Queryをconceptualに分離し、client-issued mutationへlogical operation identityを持たせる方向はD-020でApproved済み。

unexpected infrastructure failureをdeterministic Domain rejectionとして保存せず、安全なretry / canonical Query reconciliation余地を残す原則はApproved済み。

Current implementationでは以下を実装済み。

- `POST /api/auth/sign-in/email`
- `POST /api/auth/sign-out`
- `POST /api/internal/bootstrap`
- `GET /api/v1/taskchute-days/current`
- `POST /api/v1/projects`
- `POST /api/v1/taskchute-days/current/entries`
- `POST /api/v1/taskchute-days/current/entries/reorder`
- `POST /api/v1/entries/:entry_id/planned-start`
- `POST /api/v1/entries/:entry_id/start`
- `POST /api/v1/entries/:entry_id/complete`
- CreateProject / AddTaskToDay / ReorderEntries / StartEntry / CompleteEntryのcurrent DTO / error mapping
- lifecycle endpointのpath Entryとbody Entry一致validation
- `503 infrastructure_ambiguous` + reconciliation hint

これらのexact path / DTO / status mappingはcurrent implementation factであり、長期API compatibilityを固定するApproved Decisionではない。

以下はOpen:

- long-term API versioning policy
- public compatibility / deprecation policy
- rate-limit / abuse-protection policy
- pagination / large payload policy
- future command追加時のendpoint naming / compatibility rule
- manual actual correction / historical overlap validation commandのexact API / retry contract
- running delete / Routine Skip / Routine stop-resume-delete commandのexact atomicity / retry contract

## Authentication / authorization

Better Auth + initial email/password + public signup disabled + secure browser sessionはD-021でApproved済み。

D-022により以下はApproved済み。

- initial userはoperator-only one-shot bootstrap
- public signupはbootstrap中も有効化しない
- browser sessionはrolling 7日、update / renewal threshold 1日
- same Workerでseparate `AUTH_DB` / `APP_DB` D1 bindingsを利用する
- bootstrapはcross-DB partial failureからidempotent / recoverableにする

D-023によりbootstrap availabilityはexplicit modeで制御し、default / missing / invalidはdisabled、enabled中もtoken必須、provisioning後はmode disable + token remove / rotateとすることがApproved済み。Cloudflare Accessは必須ではない。

Current implementation / verification fact:

- Better Auth exact pin: `1.7.1`
- minimal Web login / logout UIを実装済み
- local operator bootstrap script / endpointを実装済み
- exact `BOOTSTRAP_ENABLED=true` gateとdisabled 404 postureを実装・local test済み
- stable auth subject -> app user mappingを実装済み
- persistent nonprodでtemporary enable -> bootstrap -> disable -> token removalを実行しPASS
- final nonprod bootstrap route 404、旧token probe 5回連続404、`BOOTSTRAP_TOKEN`削除済み

以下はOpen:

- production operator bootstrap UX / packaging
- password reset / recovery UX
- Passkey導入時期
- OAuth / MFAの必要性
- future native client token format / storage / refresh / revocation
- Wear OS credential handoff
- Cloudflare Accessをpreview outer gateへ使うか
- bootstrap disable deployment後のversion convergence確認をproduction operator procedureへどう固定するか

## Web client

React + Vite SPAとasync HTTP mutationはD-020でApproved済み。

Current First vertical slice implementationではReact Router、server-state library、general offline queueを追加せず、component-local state + canonical refetchで最小sliceを構成している。これはcurrent implementation choiceであり、将来library追加を禁止するDecisionではない。

Current implementation fact:

- move up/downによるminimal Reorder UI
- Start / Complete UI
- pending feedback + canonical reconcile
- ambiguous Reorder / Start / Completeの元operation専用Retry
- client-side retained operation Discard
- retained operation中はunrelated lifecycle / reorder mutationをdisableし、旧operationを別操作から暗黙再送しない
- current DayBoard外のEntryに属するactive Executionもheader actionからComplete可能
- current Day planned Entryのplanned-start editor、blank clear、extended-time入力 / 表示、derived Section placement / orderを実装済み
- explicit Section move時にvisible planned start editor / valueをclearし、canonical reconcile後に`—`を表示する
- planned-start NULL / different minuteを越えるillegal Reorder controlを抑止し、same-minute cohort内のmanual reorderを提供する
- running / completed Entryではplanned-start編集を提供しない

D-031〜D-037でDay planning / Routine target semanticsが追加され、D-038で次のDay dogfood persistence stagingとしてB1 / B2 / B3がApprovedされた。B1はPR #13で、D-039のB2 planned-start persistence / command runtimeはcommit `316ad0d88f0f88d1445991904da587b1e0987dab`で`main`へImplemented / Integrated済み。B1 / B2のlocal + persistent nonprod evidenceはPASS。B1 / B2 production、real Japanese IMEは`NOT_RUN`。`docs/DESIGN.md` Draftのbroader Day Table interactionとB3 runtimeは未実装。

以下の具体方式・scopeはOpen:

- supported browser baseline
- React Router等のclient routing exact choice / scope
- Client state / Server-state management libraryを追加する条件
- responsive / adaptive layout scope
- mobile browserでのinteraction方針
- final drag-and-drop library / implementation detail
- PWA install support
- Web offline capabilityをいつ含めるか
- service worker / cache strategy
- Web clientのlocal persistence scope
- browser reloadをまたいでambiguous logical operation identityを保持する必要性 /方式
- exact optimistic / pessimistic UI strategy per future command
- accessibility baseline / shortcut conflictのbrowser実機検証
- Hit-a-Hint hint alphabet / assignment algorithm
- exact icon set / pixel metrics / animation

## Offline / Sync

Androidをoffline-capableとすること自体はD-011でApproved済み。

Web offlineはinitial First slice外。

以下はOpen:

- Android offline中に許可するoperation範囲
- Android local DB technology
- command queue / delivery mechanism
- reconnect時のconvergence / recovery behavior
- entity-level / aggregate-level revisionを追加する条件
- conflict resolution UX
- client clockをどこまで信用するか
- actual occurred timeとServer recorded timeのexact semantics
- push vs poll vs realtimeを導入する条件

## Core Domain

D-015でCore Domain foundationsはApproved済み。

D-022によりinitial runtime entity IDはUUIDv7、First slice Sectionはuser-global stable entityとしてApproved済み。

D-028でexplicit Interrupt / continuation、D-029でcurrent Start取消、D-030でSection semantics、D-031でplanned startとSection placement / ordering、D-032で開始見込、D-033でmanual actual correction / non-overlap、D-037でDay move / duplicate / deleteの主要semanticsはApproved済み。D-038でSection persistence責務分離、legacy unknown handling、`Sectionなし` physical absence、normal Section configのnext-Day effective timing、B1/B2/B3 stagingがApproved済み。D-039でplanned-start physical representation、manual tie-break persistence、SetEntryPlannedStart / MoveEntry / Reorder / Startのcommand boundaryとretry / atomicityをApprovedした。

Current implementationではEntry `position`を同一user / TaskChuteDay / Section内のexplicit manual / tie-break authorityとして保存し、AddTaskToDayでappend、ReorderEntriesで許可されたcohort内のrequested orderへ更新する。B2 planned Entryはplanned start NULLを先に`position`順、non-nullをminute昇順・同minute `position`順でderiveする。Reorderのcurrent physical implementationはset-based `json_each` updateだが、これを長期Domain Decisionへ昇格しない。

Current lifecycle implementation fact:

- lifecycle stateはEntryへ`planned / running / completed`として保持
- StartEntryでExecutionを作成しrunningへ遷移
- CompleteEntryでactive Executionへfirst `ended_at`を設定しcompletedへ遷移
- user-wide active Execution最大1をDB partial UNIQUE indexでもenforce
- TaskChuteDay境界をまたぐExecutionを分割しない

以下はOpen:

- exact Project fields beyond current minimum
- Section delete/archive retention、icon / accent persistence、およびB1 foundation以後のschema evolution
- Section summary / collapse preferenceのphysical persistenceとaccount/device syncを将来行うか
- EntryをTaskChuteDay / Section間で移動するcommand / transaction algorithm
- future day-specific Section occurrence / override capabilityが必要になる条件
- Section / TaskChuteDay boundary設定変更時にD-031のplanned-start authorityを適用するexact transaction / recovery UX
- initial bootstrap / onboardingでuser-selected TaskChuteDay boundaryとdefault Section templateをどう整合させるか
- B1以後に見積の編集履歴 / re-estimation auditやEntry value revisionが必要になる条件（B1 physical representationはD-038で解決済み）
- completed stateを将来Execution historyからderiveするか、stored lifecycle stateとして維持するか
- Reopen semantics
- Pause / Resume representation
- Interrupt / Quick Interrupt commandのexact atomicity / retry contract
- interrupt continuation relationのexact physical model
- generic Cancel semantics（D-037のrunning deleteはApproved済みだが、独立したCancel operation全体は未定）
- D-037のdeleted / removed Entryとcancelled Executionを表現するarchive / tombstone / outcome model
- manual Execution correctionのaudit / revision / conflict semantics

## TaskChuteDay

D-017でlogical TaskChuteDayとcontinuous interval semanticsはApproved済み。

D-022によりinitial bootstrapではcanonical IANA timezone / boundaryを明示入力し、暗黙のProduct defaultを適用しない。ambiguous / nonexistent local timeのinitial disambiguationはTemporal-compatibleな`compatible` semanticsとする。

D-030によりSection時間はTaskChuteDay上のlogical timeとして扱い、Section configurationはTaskChuteDay全体をgapなくcoverする。`24:00`を超えるSection時間はextended-time notationで表現できることがApproved済み。

D-031により開始予定時間をSection placement authorityとして利用し、Section configuration変更後の未実行Entryは開始予定時間がある場合その時刻へ追従する。

D-038により、一度establishしたTaskChuteDayのSection contextは後のSection設定変更でretroactiveに書き換えず、通常のSection設定変更は原則次TaskChuteDayから有効にする。初回migration/onboardingでvalid Section configurationが未成立の場合だけ、明示したinitial configurationをcurrent Dayへ適用できる。

Current implementationではactual resolved boundary instantでday membershipを判定し、start / next-day endを別々にtimezone ruleからresolveする。materialized intervalとestablishment timezone / boundary contextを保存する。

PR #5ではactive ExecutionをTaskChuteDay境界で分割せず、current dayへ切り替わった後もsame Executionとしてprojection / Completeできる。

以下はOpen:

- Section以外を含むgeneral extended-time notationの入力range / UX
- unusual timezone transitionで`compatible` resolution後の内部Section intervalがzero / negativeになる場合のProduct recovery UX（B1の通常resolution ruleはD-038で解決済み）
- initial Section configuration commandがTaskChuteDay境界をまたぐrare raceでcurrent-Day判定を失った場合のexact retry / recovery UX
- timezone selection / onboarding UX
- travel / timezone change behavior
- boundary / timezone policy変更のeffective timing UX
- userがTaskChuteDay boundaryを変更した際、内部Section境界と衝突する場合のexact transaction / recovery UX
- future TaskChuteDayをいつmaterialize / historically freezeするか
- per-day boundary override
- work-shift / profile機能
- logical-day overlapによるReview / aggregation queryのexact implementation
- `compatible` ruleを含むDST / timezone transitionの追加acceptance scenario coverage

## Routine

RoutineDefinition -> RoutineOccurrence -> Entryとorigin TaskChuteDay preservationはD-015でApproved済み。

D-034でProjected / Materialized Occurrence、field-level day override、Routine default反映scope、Skip、明示日付移動、stop / resume / deleteの主要semanticsがApproved済み。

D-035 / D-036でeffective営業日 / 休日判定とinitial recurrence pattern setがApproved済み。

以下はOpen:

- RoutineDefinition / RoutineOccurrence / field override / schedule versionのexact persistence schema
- Projected Occurrenceをquery時に算出するexact algorithm / caching / pagination
- どの操作時点でphysical RoutineOccurrence rowをmaterializeするかのimplementation boundary（Product semanticsはD-034でApproved）
- Routine defaultからday-specific Task Note templateを適用するcopy / reference / revision strategy
- Routine Taskのday-specific Task名 / Project overrideをEntry / Occurrence / dedicated contextのどこへ保持するか
- schedule変更と既materialized Occurrenceをatomicにreconcileするcommand algorithm
- stop / resume / delete stateのphysical representation
- long-range recurrence projectionのperformance / query limit
- public holiday source / library / update mechanismとholiday data versioning
- 将来Japan以外のlocale / country calendarを扱うか
- overdue occurrenceをどう表示するか
- delayed completionをstreak上どう評価するか
- continuationによるachievement判定
- Rotation Routine等のscope
- Routine statistics / streakのexact relation（duplicateしたnon-Routine TaskはRoutine実績へ含めないこと自体はD-037でApproved）

## Review / historical context

Reviewをhistorical factsからのprojectionとする方向はD-016でApproved済み。

D-022によりFirst sliceではmaterialized TaskChuteDayのactual interval / establishment contextを保持し、destructive hard-delete APIは提供しない。

D-030によりSection rename/delete/time変更後も過去のEntry / Execution / Review用historical contextで当時のSection名と時間帯を保持し、現在設定へretroactiveに置換しないことはApproved済み。

D-038によりSection historical contextはstable Section identity + versioned configuration + established TaskChuteDay contextの責務分離で保持し、legacyでauthoritative time rangeが存在しないhistoryは時間帯unknownとして扱う方向がApproved済み。

D-033によりactual開始 / 終了の訂正後はvalid Execution intervalをauthorityとして実績 / Reviewを再計算し、同一userのvalid Execution overlapは禁止する。D-037によりrunning deleteで取消されたcurrent Executionを通常actualへ含めない一方、参照不能なhard deleteにはしない。

Current runtimeではExecutionの`id / app_user_id / entry_id / started_at / ended_at / created_at`を保存する。Execution時点metadata snapshotのexact fieldsはまだ未決。

以下はOpen:

- Section以外のhistorical contextをsnapshot / versioned reference等のどの方式で保持するか
- Executionに保存するProject / Section / Task contextのexact fields
- Project移動 / rename / delete後のReview display semantics
- Section delete/archive retentionのexact physical modelとlegacy time-range unknown contextのexact UI presentation
- corrected Executionのaudit trail / prior timestamp retention
- cancelled / removed Executionを通常Reviewとは別にどの程度表示するか
- Routine achievement / streak calculation rule
- logical day / week / month集計のexact timezone semantics
- qualitative Review Document model / UX
- Review query / caching strategy

## Documents

Primary Task / Project Documentとoptional RoutineOccurrence DocumentはD-018でApproved済み。

D-034によりRoutineDefinitionがday-specific Task Noteのtemplate/defaultを供給できる方向がApproved済み。ただしRoutine共通の長期noteはD-018のTask Primary Documentを維持する。

以下はOpen:

- Document identity exact format
- physical persistence schema
- lazy creationのexact lifecycle
- Document deletion / restore semantics
- Markdown editor library
- wiki-link compatibility scope
- backlink / link-index model
- general noteのinitial scope
- additional document types
- revision / version model
- revision-history UX
- autosave / conflict semantics
- Routine day-specific Note templateのcopy / reference / override semanticsのphysical implementation
- Entry / Execution単位の専用Documentを将来持つか

## Place / Location / Map

planned Placeとobserved LocationSnapshotの分離、optional best-effort Start / Complete capture、Map projectionはD-019でApproved済み。

以下はOpen:

- Planned Placeのowner: Task default / Entry placement / both with override
- Placeのexact fields
- GeoPoint representation
- Start only / Complete only / both等のcapture policy UX
- manual place / location correction
- reverse geocoding / place search provider
- map provider
- location precision controls
- location retention / deletion / export policy
- offline location capture / sync
- capture retry / late enrichment semantics
- canonical sampleを1つにするか複数観測を保持するか
- continuous location tracking / route history
- native background location behavior
- Place / Executionとphotos / Attachmentsのrelation
- travel journal export / share scope

## Attachments / Images

- Attachment identity / ownership / reference model
- D-008 storage separationをApprovedするか
- max image size
- camera-photo resize policy
- screenshot encoding policy
- keep-original option
- thumbnails
- deduplication
- orphan cleanup timing
- Obsidian export path / reference format
- deletion semantics

## Client roadmap

Native UIをWeb React codeの直接流用前提にしない方向はD-020でApproved済み。

First Server + Web vertical slice、D-038 B1、D-039 B2はImplemented / Integrated済み。B1 / B2 local + persistent nonprod evidenceはPASS。B1 / B2 production、real Japanese IMEは`NOT_RUN`、Releasedは`NO`。B3（Section settings lifecycle）は未実装。

以下はOpen:

- B1/B2/B3の後にRoutine / Documents / Review / Android等のどれへ優先的に進むか
- Android native implementationへ進むentry criteria
- Androidのinitial Compose architecture詳細
- Android Widgetのinitial scope
- Wear OS / Pixel Watchのinitial feature scope
- Wear OS standalone / companion dependencyの境界
- native iOS appへ進むentry criteria

## Deployment / verification

First Server + Web vertical sliceのlocal implementation / tests / reviewはPASS。2026-08-22にpersistent non-production D1 / deployed Worker remote verificationを実施しPASSした。

D-024により、1つのpersistent non-production verification environmentをmaintainすること、tracked / reusable config、stable non-production naming、separate non-production D1 resources、normal `BOOTSTRAP_ENABLED=false` postureはApproved済み。

Resolved / current fact:

- persistent nonprod D1 resourcesは`apac` location hint、jurisdictionなしで作成済み
- remote migrations / schema / FK / active Execution indexはPASS
- persistent nonprod Worker deploy / runtime smokeはPASS
- B1 `0003` migration / preservation / authenticated runtime / browser flowは2026-08-29にPASS
- B2 `0004` local migration / preservation / authenticated local browser flowは2026-08-29にPASS
- B2 persistent nonprod `0004` migration / preservation / deployed runtime / authenticated browser verificationは2026-08-29にPASS
- B2 verificationでdirect bootstrap POSTとpublic signup remote POSTは`NOT_RUN`。この2項目をremote PASSへ含めない
- temporary bootstrap enable -> bootstrap -> disable -> token removalはPASS
- final bootstrap postureはdisabled、`BOOTSTRAP_TOKEN`削除済み
- observed smoke scopeではFree-plan-shaped Worker/D1 limit errorなし

以下はOpen:

- exact production deployment strategyとproduction environmentをいつ作るか
- custom domainを採用する時期
- Cloudflare Accessをpersistent non-production environmentへ後から追加するか
- production smoke test contract
- persistent non-production test data / sessionのretention・cleanup policy
- current Free-plan limitsがruntimeをmaterialに阻害した場合にpaid planを採用するか
- actual Cloudflare account subscription tierを独立確認する必要性 / timing
- bootstrap disable deployment後のversion convergenceをproduction procedureで何回 / どの条件で確認するか
- deploy前のcurrent Cloudflare pricing / quota / platform restriction再確認

remote production writeは明示承認なしに実施しない。

## Legacy migration

- migration baseline version
- existing Task / Entry / Routine identityをどこまでpreserveするか
- legacy date-move entry rekeyをstable Entry identityへどうmapするか
- log / history import scope
- Routine occurrence / history import scope
- legacy Task Note / Project Note mapping
- legacy Obsidian versionとのcoexistence period
- importerのexact contract
