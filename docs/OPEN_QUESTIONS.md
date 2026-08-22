# Open Questions

ここにある項目は未決であり、記載されているcandidateやdirectionをApproved Decisionとして扱わない。

Resolved Decisionの正本は`docs/DECISIONS.md`を参照する。

## Infrastructure / persistence

Cloudflare Workers + D1のinitial adoption自体はD-020でApproved済み。

2026-08-22のcurrent-harness local + temporary remote D1 spikeにより、D1 `batch()` + conditional SQL + database constraintsで要求されたatomicity / concurrency / idempotency invariantを満たせるfeasibilityはVerified済み。

D-022によりFirst vertical slice全体のAPP persistence baseline responsibility、separate `AUTH_DB` / `APP_DB` boundary、UUIDv7 entity identity、user-global Section scopeはApproved済み。

Current First vertical slice implementation fact:

- `AUTH_DB`にはBetter Auth 1.7.1 physical schemaをmigrationとして実装済み
- `APP_DB`にはapp user / auth mapping / settings / projects / sections / taskchute_days / tasks / entries / operations / executions / temporary command guard・assertionを実装済み
- `operations`は`(app_user_id, operation_id)` owner scopeとfingerprint versionを保持
- current fingerprint canonicalizationはrecursive deterministic JSON canonicalization + SHA-256、version 1
- current placement revision physical representationは`taskchute_days.placement_revision`
- `0002_lifecycle_ordering.sql`で既存operation rowを保持しつつlifecycle command typeとExecution persistenceを追加済み
- active Execution uniquenessのcurrent physical strategyは`executions(app_user_id) WHERE ended_at IS NULL`のpartial UNIQUE index
- CreateProject / AddTaskToDay / ReorderEntries / StartEntry / CompleteEntryのcurrent transaction algorithmはimplementation review済み
- Reorderのcurrent physical strategyは`json_each`へordered Entry IDsを渡すset-based update
- current Reorder mutation batchはEntry数に比例してstatementを増やさない

上記はcurrent implementation factであり、将来永続化方式を固定する新しいApproved Decisionではない。

以下はOpen:

- operation result retention / cleanup policy
- schema evolution / compatibility migration strategy
- backup / export strategy
- overload / observability strategy
- current Execution / lifecycle physical schemaを将来どの条件で見直すか
- custom domainを採用する時期
- preview / staging environment strategy
- D1 read replicationを将来導入するentry criteria
- Durable Objects / external PostgreSQLを将来再評価する条件
- Final R2 / binary object storage adoption

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

## Authentication / authorization

Better Auth + initial email/password + public signup disabled + secure browser sessionはD-021でApproved済み。

D-022により以下はApproved済み。

- initial userはoperator-only one-shot bootstrap
- public signupはbootstrap中も有効化しない
- browser sessionはrolling 7日、update / renewal threshold 1日
- same Workerでseparate `AUTH_DB` / `APP_DB` D1 bindingsを利用する
- bootstrapはcross-DB partial failureからidempotent / recoverableにする

Current implementation fact:

- Better Auth exact pin: `1.7.1`
- minimal Web login / logout UIを実装済み
- local operator bootstrap script / endpointを実装済み
- stable auth subject -> app user mappingを実装済み

以下はOpen:

- remote / production bootstrap endpoint lifecycle / exposure / secret rotation policy
- production operator bootstrap UX / packaging
- password reset / recovery UX
- Passkey導入時期
- OAuth / MFAの必要性
- future native client token format / storage / refresh / revocation
- Wear OS credential handoff
- Cloudflare Accessをpreview outer gateへ使うか

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

以下の具体方式・scopeはOpen:

- supported browser baseline
- React Router等のclient routing exact choice / scope
- Client state / Server-state management libraryを追加する条件
- responsive / adaptive layout scope
- mobile browserでのinteraction方針
- final drag-and-drop等のordering UX
- PWA install support
- Web offline capabilityをいつ含めるか
- service worker / cache strategy
- Web clientのlocal persistence scope
- browser reloadをまたいでambiguous logical operation identityを保持する必要性 /方式
- deployment / preview environment strategy
- exact optimistic / pessimistic UI strategy per future command
- accessibility baseline

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

Current implementationではEntry `position`を同一user / TaskChuteDay / Section内のexplicit integer orderとして保存し、AddTaskToDayでappend、ReorderEntriesでrequested orderへ更新する。Reorderのcurrent physical implementationはset-based `json_each` updateだが、これを長期Domain Decisionへ昇格しない。

Current lifecycle implementation fact:

- lifecycle stateはEntryへ`planned / running / completed`として保持
- StartEntryでExecutionを作成しrunningへ遷移
- CompleteEntryでactive Executionへfirst `ended_at`を設定しcompletedへ遷移
- user-wide active Execution最大1をDB partial UNIQUE indexでもenforce
- TaskChuteDay境界をまたぐExecutionを分割しない

以下はOpen:

- exact Project fields beyond current minimum
- exact Section fields beyond current minimum
- EntryをTaskChuteDay / Section間で移動するcommand / transaction algorithm
- future day-specific Section occurrence / override capabilityが必要になる条件
- completed stateを将来Execution historyからderiveするか、stored lifecycle stateとして維持するか
- Reopen semantics
- Pause / Resume representation
- explicit Interrupt operation semantics
- interrupt continuation relationのexact model
- Cancel semantics
- destructive delete / archive / tombstone UX

## TaskChuteDay

D-017でlogical TaskChuteDayとcontinuous interval semanticsはApproved済み。

D-022によりinitial bootstrapではcanonical IANA timezone / boundaryを明示入力し、暗黙のProduct defaultを適用しない。ambiguous / nonexistent local timeのinitial disambiguationはTemporal-compatibleな`compatible` semanticsとする。

Current implementationではactual resolved boundary instantでday membershipを判定し、start / next-day endを別々にtimezone ruleからresolveする。materialized intervalとestablishment timezone / boundary contextを保存する。

PR #5ではactive ExecutionをTaskChuteDay境界で分割せず、current dayへ切り替わった後もsame Executionとしてprojection / Completeできる。

以下はOpen:

- extended-time notationの入力range
- timezone selection / onboarding UX
- travel / timezone change behavior
- boundary / timezone policy変更のeffective timing UX
- future TaskChuteDayをいつmaterialize / historically freezeするか
- per-day boundary override
- work-shift / profile機能
- logical-day overlapによるReview / aggregation queryのexact implementation
- `compatible` ruleを含むDST / timezone transitionの追加acceptance scenario coverage

## Routine

RoutineDefinition -> RoutineOccurrence -> Entryとorigin TaskChuteDay preservationはD-015でApproved済み。

以下はOpen:

- repeat ruleのinitial supported set
- RoutineOccurrenceをいつmaterializeするか
- Skip / Cancel / delete outcome model
- overdue occurrenceをどう表示するか
- delayed completionをstreak上どう評価するか
- continuationによるachievement判定
- future RoutineDefinition変更がmaterialized occurrenceへ与える影響
- Rotation Routine等のscope

## Review / historical context

Reviewをhistorical factsからのprojectionとする方向はD-016でApproved済み。

D-022によりFirst sliceではmaterialized TaskChuteDayのactual interval / establishment contextを保持し、destructive hard-delete APIは提供しない。

Current runtimeではExecutionの`id / app_user_id / entry_id / started_at / ended_at / created_at`を保存する。Execution時点metadata snapshotのexact fieldsはまだ未決。

以下はOpen:

- historical contextをsnapshot / versioned reference等のどの方式で保持するか
- Executionに保存するProject / Section / Task contextのexact fields
- Project移動 / rename / delete後のReview display semantics
- Routine achievement / streak calculation rule
- logical day / week / month集計のexact timezone semantics
- qualitative Review Document model / UX
- Review query / caching strategy

## Documents

Primary Task / Project Documentとoptional RoutineOccurrence DocumentはD-018でApproved済み。

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

First Server + Web vertical sliceはImplemented / Integrated済み。次のProduct feature sliceの優先順位はまだ確定していない。

以下はOpen:

- 次sliceでRoutine / Documents / Review / Android等のどれを優先するか
- Android native implementationへ進むentry criteria
- Androidのinitial Compose architecture詳細
- Android Widgetのinitial scope
- Wear OS / Pixel Watchのinitial feature scope
- Wear OS standalone / companion dependencyの境界
- native iOS appへ進むentry criteria

## Deployment / verification

First Server + Web vertical sliceのlocal implementation / tests / reviewはPASSしているが、以下はOpen / NOT_RUN:

- remote D1 Product runtime verificationをいつ実施するか
- deployed Worker verificationをいつ実施するか
- preview / production environmentをいつ作るか
- production smoke test contract
- bootstrap endpointをremote / productionでどうdisable / limit / rotateするか
- deploy前のcurrent Cloudflare pricing / quota / platform restriction再確認

remote / production writeは明示承認なしに実施しない。

## Legacy migration

- migration baseline version
- existing Task / Entry / Routine identityをどこまでpreserveするか
- legacy date-move entry rekeyをstable Entry identityへどうmapするか
- log / history import scope
- Routine occurrence / history import scope
- legacy Task Note / Project Note mapping
- legacy Obsidian versionとのcoexistence period
- importerのexact contract
