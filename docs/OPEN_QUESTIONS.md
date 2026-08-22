# Open Questions

ここにある項目は未決であり、記載されているcandidateやdirectionをApproved Decisionとして扱わない。

Resolved Decisionの正本は`docs/DECISIONS.md`を参照する。

## Infrastructure / persistence

Cloudflare Workers + D1のinitial adoption自体はD-020でApproved済み。

2026-08-22のcurrent-harness local + temporary remote D1 spikeにより、D1 `batch()` + conditional SQL + database constraintsで要求されたatomicity / concurrency / idempotency invariantを満たせるfeasibilityはVerified済み。

D-022によりFirst vertical slice全体のAPP persistence baseline responsibility、separate `AUTH_DB` / `APP_DB` boundary、UUIDv7 entity identity、user-global Section scopeはApproved済み。

Current bootstrap implementation fact:

- `AUTH_DB`にはBetter Auth 1.7.1 physical schemaをmigrationとして実装済み
- `APP_DB`にはapp user / auth mapping / settings / projects / sections / taskchute_days / tasks / entries / operations / temporary command guard・assertionを実装済み
- `executions`はStart / Complete未実装のため次incrementへ延期
- `operations`は`(app_user_id, operation_id)` owner scopeとfingerprint versionを保持
- current fingerprint canonicalizationはrecursive deterministic JSON canonicalization + SHA-256、version 1
- current placement revision physical representationは`taskchute_days.placement_revision`
- CreateProject / AddTaskToDayのcurrent transaction algorithmはimplementation review済み

上記はcurrent implementation factであり、将来永続化方式を固定する新しいApproved Decisionではない。

以下はOpen:

- Reorder / Start / Completeを含むFirst vertical slice残りのexact schema / migration SQL
- Reorder / Start / Completeのcommand-specific transaction algorithm
- Execution indexes / active Execution uniquenessのexact physical strategy
- operation result retention / cleanup policy
- schema evolution / compatibility migration strategy
- backup / export strategy
- custom domainを採用する時期
- preview / staging environment strategy
- D1 read replicationを将来導入するentry criteria
- Durable Objects / external PostgreSQLを将来再評価する条件
- Final R2 / binary object storage adoption

## API / Command / Query

Command / Queryをconceptualに分離し、client-issued mutationへlogical operation identityを持たせる方向はD-020でApproved済み。

unexpected infrastructure failureをdeterministic Domain rejectionとして保存せず、安全なretry / canonical Query reconciliation余地を残す原則はApproved済み。

Current bootstrap implementationでは以下を実装済み。

- `POST /api/auth/sign-in/email`
- `POST /api/auth/sign-out`
- `POST /api/internal/bootstrap`
- `GET /api/v1/taskchute-days/current`
- `POST /api/v1/projects`
- `POST /api/v1/taskchute-days/current/entries`
- CreateProject / AddTaskToDayのcurrent DTO / error mapping
- `503 infrastructure_ambiguous` + reconciliation hint

これらのexact path / DTO / status mappingはcurrent implementation factであり、長期API compatibilityを固定するApproved Decisionではない。

以下はOpen:

- Reorder / Start / Complete endpoint / DTO / status mapping
- lifecycle command-specific transactional SQL
- long-term API versioning policy
- public compatibility / deprecation policy
- rate-limit / abuse-protection policy

## Authentication / authorization

Better Auth + initial email/password + public signup disabled + secure browser sessionはD-021でApproved済み。

D-022により以下はApproved済み。

- initial userはoperator-only one-shot bootstrap
- public signupはbootstrap中も有効化しない
- browser sessionはrolling 7日、update / renewal threshold 1日
- same Workerでseparate `AUTH_DB` / `APP_DB` D1 bindingsを利用する
- bootstrapはcross-DB partial failureからidempotent / recoverableにする

Current bootstrap implementation fact:

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

Current bootstrap implementationではReact Router、server-state library、general offline queueを追加せず、component-local state + canonical refetchで最小sliceを構成している。これはcurrent implementation choiceであり、将来library追加を禁止するDecisionではない。

以下の具体方式・scopeはOpen:

- supported browser baseline
- React Router等のclient routing exact choice / scope
- Client state / Server-state management libraryを追加する条件
- responsive / adaptive layout scope
- mobile browserでのinteraction方針
- PWA install support
- Web offline capabilityをいつ含めるか
- service worker / cache strategy
- Web clientのlocal persistence scope
- deployment / preview environment strategy
- exact optimistic / pessimistic UI strategy per command
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

Current bootstrap implementationではEntry `position`を同一user / TaskChuteDay / Section内のexplicit integer orderとして保存し、AddTaskToDayでappendしている。Reorderは未実装であり、current representationを長期Domain Decisionへ昇格しない。

以下はOpen:

- exact Project fields beyond current bootstrap minimum
- exact Section fields beyond current bootstrap minimum
- ReorderEntriesのproduction transaction / position update algorithm
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

Current bootstrap implementationではactual resolved boundary instantでday membershipを判定し、start / next-day endを別々にtimezone ruleからresolveする。materialized intervalとestablishment timezone / boundary contextを保存する。

以下はOpen:

- extended-time notationの入力range
- timezone selection / onboarding UX
- travel / timezone change behavior
- boundary / timezone policy変更のeffective timing UX
- future TaskChuteDayをいつmaterialize / historically freezeするか
- per-day boundary override
- work-shift / profile機能
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

以下はOpen:

- Android native implementationへ進むentry criteria
- Androidのinitial Compose architecture詳細
- Android Widgetのinitial scope
- Wear OS / Pixel Watchのinitial feature scope
- Wear OS standalone / companion dependencyの境界
- native iOS appへ進むentry criteria

## Legacy migration

- migration baseline version
- existing Task / Entry / Routine identityをどこまでpreserveするか
- legacy date-move entry rekeyをstable Entry identityへどうmapするか
- log / history import scope
- Routine occurrence / history import scope
- legacy Task Note / Project Note mapping
- legacy Obsidian versionとのcoexistence period
- importerのexact contract
