# Open Questions

ここにある項目は未決であり、記載されているcandidateやdirectionをApproved Decisionとして扱わない。

Resolved Decisionの正本は`docs/DECISIONS.md`を参照する。

## Infrastructure / persistence

Cloudflare Workers + D1のinitial adoption自体はD-020でApproved済み。

2026-08-22のcurrent-harness local + temporary remote D1 spikeにより、D1 `batch()` + conditional SQL + database constraintsで要求されたatomicity / concurrency / idempotency invariantを満たせるfeasibilityはVerified済み。

以下はOpen:

- exact D1 schema / migration SQL
- VerifiedになったD1 feasibility strategyをProduct runtimeへ落とし込むexact command-specific transaction algorithm
- operation result persistenceのexact schema
- request fingerprint canonicalization / hash方式
- placement revisionのphysical representation
- backup / export strategy
- custom domainを採用する時期
- preview / staging environment strategy
- D1 read replicationを将来導入するentry criteria
- Durable Objects / external PostgreSQLを将来再評価する条件
- Final R2 / binary object storage adoption

## API / Command / Query

Command / Queryをconceptualに分離し、client-issued mutationへlogical operation identityを持たせる方向はD-020でApproved済み。

以下はOpen:

- exact endpoint paths
- exact JSON request / response schema
- exact HTTP status / error-code mapping
- command-specific transactional SQL
- unexpected infrastructure failure時のretry / reconciliation contract詳細
- operation result retention / cleanup policy
- API versioning policy
- rate-limit / abuse-protection policy

## Authentication / authorization

Better Auth + initial email/password + public signup disabled + secure browser sessionはD-021でApproved済み。

以下はOpen:

- bootstrap initial userのexact procedure
- auth-managed D1 / app D1のexact binding / deployment構成
- Better Auth implementation-time pinned version
- login / logout UI
- session lifetime / renewal policy
- password reset / recovery UX
- Passkey導入時期
- OAuth / MFAの必要性
- future native client token format / storage / refresh / revocation
- Wear OS credential handoff
- Cloudflare Accessをpreview outer gateへ使うか

## Web client

React + Vite SPAとasync HTTP mutationはD-020でApproved済み。

以下の具体方式・scopeはOpen:

- supported browser baseline
- React Router等のclient routing exact choice / scope
- Client state / Server-state management libraryを追加するか
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

以下はOpen:

- exact Task / Entry / Project / Section / Execution ID format
- exact Project fields
- exact Section fields
- Entry position / ordering persistence algorithm
- completed stateを将来Execution historyからderiveするか、stored lifecycle stateとして維持するか
- Reopen semantics
- Pause / Resume representation
- explicit Interrupt operation semantics
- interrupt continuation relationのexact model
- Cancel semantics
- destructive delete / archive / tombstone UX

## TaskChuteDay

D-017でlogical TaskChuteDayとcontinuous interval semanticsはApproved済み。

以下はOpen:

- default day boundary
- extended-time notationの入力range
- timezone selection / onboarding UX
- travel / timezone change behavior
- boundary / timezone policy変更のeffective timing UX
- future TaskChuteDayをいつmaterialize / historically freezeするか
- per-day boundary override
- work-shift / profile機能
- DST / timezone transitionのexact acceptance scenarios

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
