# Architecture

## Target overview

```text
                             TaskChute Server
                     Cloudflare Workers + D1
                    +--------------------------+
                    | Authentication / AuthZ   |
                    | Command / Query API      |
                    +--------------------------+
                    | Application / Domain     |
                    | Task / Entry / Execution |
                    | Project / Section        |
                    | TaskChuteDay / Routine   |
                    +--------------------------+
                    | Historical facts         |
                    | Documents / Attachments  |
                    +------------+-------------+
                                 |
       +-------------------------+--------------------------+
       |                         |                          |
       v                         v                          v
   Web Client              Android Client            Other Clients
 React + Vite SPA          native first-class        Wear OS companion
 primary / universal       Kotlin + Compose          iOS native future
 async HTTP                offline-capable target    Obsidian optional
```

TaskChute Serverをstructured TaskChute stateのcanonical authorityとし、各Clientは同じDomain / API semanticsを共有する。

WebのReact implementationをnative clientへそのまま流用することは前提としない。Android / Wear OS / native iOSはplatform-native UIを第一候補とし、共有対象はServer API、identity、lifecycle、Domain semanticsとする。

## Initial technology

D-020によりinitial Server + Web implementationは以下を採用する。

- Web UI: React
- build / development: Vite
- Web model: SPA
- Server runtime: Cloudflare Workers
- structured application database: Cloudflare D1
- normal Web mutation: async HTTP communication

Initial scopeではSSR、Durable Objects、external PostgreSQL、D1 read replication、realtime pushを必須にしない。

Cloudflare R2等のbinary storageはD-008のままProposedであり、採用未確定。

## Layering principle

Cloudflare固有APIをDomain semanticsへ侵食させない。

概念的に以下を分離する。

```text
Domain
- Task
- Entry
- Execution
- Project
- Section
- TaskChuteDay
- RoutineDefinition / RoutineOccurrence

Application
- AddTaskToDay
- ReorderEntries
- StartEntry
- CompleteEntry
- LoadTaskChuteDay

Infrastructure
- Cloudflare Worker HTTP adapter
- D1 persistence
- Better Auth adapter
```

D1から将来別databaseへ移行する必要が生じても、TaskChute Domain semanticsまで書き換える必要がない境界を維持する。

## Command / Query contract

APIは概念上CommandとQueryを分離する。

これはCQRS、Event Sourcing、別database等の採用を意味しない。

### Query

Server canonical stateからprojectionを返す。

First sliceでは少なくともcurrent TaskChuteDayのprojectionを取得できることを要求する。

概念response:

- TaskChuteDay interval / logical date
- placement revision
- Sections
- Tasks / Entries
- canonical Entry order
- active Execution
- Next Entry

browser reload、初回表示、mutation failure / conflict後のreconcile等で利用する。

### Command

Domain stateを変更するoperationを表す。

First sliceで必要なconceptual commands:

- CreateProject
- AddTaskToDay
- ReorderEntries
- StartEntry
- CompleteEntry

exact endpoint path、JSON schema、HTTP codeはimplementation contractとして確定する。

## Async Web behavior

通常mutationはfull-page reloadを要求しない。

```text
User action
  -> React transient UI state
  -> async Command
  -> Server authoritative result
  -> Client state partial update
```

Start / Complete等では`starting` / `completing`のようなClient-only pending stateを利用できるが、Domain lifecycleは`planned / running / completed`のままとする。

conflict、network ambiguity、Client state uncertainty等がある場合はQueryでcanonical projectionを再取得してreconcileする。

WebSocket / SSE等のpush方式はinitial requirementではない。

## Operation identity and retry

client-issued mutationはlogical `operation_id`を持つ。

- Clientは送信前にoperation identityを生成できる。
- Serverはauthenticated app user + operation identityで処理済みoperationを識別する。
- 同じoperation identity + 同じsemantic requestはstored resultをreplayできる。
- 同じoperation identityを別semantic requestへ再利用した場合はrejectする。
- network retryと、ユーザーが後でもう一度操作したnew operationを区別する。
- 確定したDomain rejectionを同一operation retryで突然successへ変えない方向とする。

request fingerprintのcanonicalization / hash方式はimplementation detailとする。

unexpected infrastructure failureを確定Domain rejectionとして保存せず、安全なretry / state reconciliation余地を残す。

## Conflict / revision principle

silent last-write-winsを避ける。

stale stateに基づくoverwriteが危険なmutationではrevision / preconditionを利用する。

First sliceではplacement mutationをTaskChuteDay単位の`placement_revision`で保護する方向とする。

- Entry追加、並び替え、Section / TaskChuteDay placement変更等はplacement revisionへ影響する。
- Start / Completeのようにplacement自体を変更しないoperationは、無関係なrevision conflictを増やすためplacement revisionへ連動させない。
- Reorder等はexpected revisionがcurrent revisionと一致する場合のみ適用し、競合時は一切変更せずClientが最新projectionへreconcileできるようにする。

revisionをglobal / entity / aggregateのどこまで細分化するかは、First slice以降の必要性に応じて再評価する。

## Atomic command principle

CommandはDomain mutationとoperation resultをlogical transactionとしてatomicに確定する。

Startの概念transaction:

```text
operation identity check
+ Entry startability
+ active Execution invariant
+ Execution creation
+ Entry -> running
+ operation result
```

Completeの概念transaction:

```text
operation identity check
+ exact active Execution check
+ ended_at finalization
+ Entry -> completed
+ operation result
```

途中だけ保存されたpartial stateを許可しない。

D1ではWorker codeの複数read/writeを暗黙の一transactionとは扱わない。conditional SQL、database constraint、D1 batch等を組み合わせ、exact transaction algorithmはlocal + remote D1 feasibility spikeで確認してから本採用する。

## D1 feasibility gate — PASS

Product runtime implementation前に、D1のatomicity / concurrency / idempotency前提を検証する。

Required spike scenarios:

- transaction failure時にpartial stateを残さない
- concurrent Startでexactly one active Execution
- same-operation Start retryでduplicate Executionを作らない
- operation IDのdifferent payload reuseをreject
- Complete retryでended_atが変化しない
- same placement revisionからのconflicting reorderでexactly one success
- reorder failure / conflictでmixed orderを残さない
- historical reference中のentityに対するunsafe hard deleteをconstraintで防ぐ

2026-08-22時点で、current harnessによるlocal D1とtemporary remote D1の双方で`D1-SPIKE-01`〜`D1-SPIKE-08`がPASSし、implementation reviewも完了した。current evidenceは`spike/d1-feasibility@eda694e22fd742827da5b90967c6b0305b885033`および`spikes/d1-feasibility/EVIDENCE.md`を参照する。

Spikeでfeasibleと確認できたstrategy:

- D1 `batch()`内でDomain mutationとoperation resultをatomicに扱う
- conditional SQLとdatabase constraintsを組み合わせてrace時のinvariantを守る
- partial unique constraint等をapplication codeだけに依存しないlast line of defenseとして利用する
- logical `operation_id`とserver-computed semantic fingerprintによりsame-operation replay / misuse rejectを成立させる
- placement revision guardによりconflicting reorderをsilent overwriteさせない
- FK `RESTRICT`等でhistorical chainへのunsafe hard deleteを防ぐ

このGateのPASSはD1をinitial structured persistenceとして利用するfeasibilityを支持する。ただし、spikeのexact SQL / schema / endpoint / broad error mappingをそのままProduct runtimeのfinal implementationとして承認したものではない。

Product runtimeでは特に、unexpected infrastructure failureをdeterministic Domain rejectionとして保存・分類しないこと、exact production schema / migration SQL / command-specific transaction algorithmを別途設計・reviewすることを要求する。

## Initial persistent model direction

D1 feasibilityはVerified済みだが、exact production migration SQL / schemaはspikeのtested shapeを参考に別途設計する。spike schema自体をfinal Product schemaとは扱わない。

First sliceのAPP persistenceは概念的に以下を必要とする。

- app users / auth-subject mapping
- user settings: TaskChute timezone / day boundary
- projects
- sections
- taskchute days
- tasks
- entries
- executions
- operations

TaskChuteDayはlogical dateだけではなくhistorically preservedできるactual interval、timezone / boundary contextを保持できる方向とする。

Executionはactual start / end factを保持し、Reviewで過去classificationを失わないために必要なhistorical contextを将来保持できる設計とする。exact snapshot fieldsはspike / schema設計で確定する。

historical chainへの安易なcascade deleteを避ける。

Routine、Documents、Place / Location等はDomain上の拡張余地を保持するが、First sliceのDB tableを先行作成しない。

## Identity generation direction

Task / Entry / Project等、将来offline中に新規作成し得るentity identityはClient側でも生成可能なopaque identityとする方向とする。

exact string formatはOpen。DB / API contractではopaque valueとして扱い、titleやposition等のmutable fieldをidentityにしない。

## Authentication / authorization

D-021によりapplication authenticationはTaskChute Serverが所有する。

Initial implementation:

- Better AuthをCloudflare Workers + D1上で利用する。
- Webはsecure DB-backed browser sessionを利用する。
- initial loginはemail + password。
- public self-signupは無効。
- initial userはbootstrapで作成する。

TaskChute Domain identityをBetter Authのphysical user schemaへ直接結合しない。

```text
Better Auth subject
  -> auth mapping
  -> stable TaskChute app user
  -> Domain Commands / Queries
```

Auth-managed persistenceとTaskChute Domain persistenceは責務を分離し、initially separate D1 bindings / databasesを利用する方向とする。Better Authのphysical auth schemaはlibrary管理領域として扱い、Domain tablesから強いFK dependencyを張らない。

Clientはuser IDをauthorityとして送らず、Serverがsession / tokenからAuthenticatedPrincipalを確定してownership / authorizationを検証する。

将来native clientでは同じprincipal modelへtoken-based authenticationを追加できる構成とする。

Cloudflare Accessはcanonical application authとして使用せず、必要ならpreview / internal environmentの追加outer gateとして利用できる。

Better Authのexact package versionはimplementation時に検証済みversionをlockfileでpinし、upgrade時はmigration / regression impactを確認する。

## TaskChuteDay architecture

TaskChuteDayはcanonical timezone + DayBoundaryPolicyから構成するcontinuous logical intervalである。

```text
TaskChute timezone
+
DayBoundaryPolicy
  -> TaskChuteDay [start, end)
```

civil midnight固定をDomainへ埋め込まない。

current TaskChuteDayは必要時にServerがlazy materializeできる。未来dayを閲覧しただけでhistorically freezeするか等のfuture materialization policyは未決。

Executionはactual instantを保持し、logical boundary crossing時も1つのExecution factとして残す。Reviewはinterval overlapでlogical dayへ配賦できる。

## Projection architecture

以下はcanonical task-state authorityではなくprojectionとする。

- DayBoard
- Calendar
- Timeline
- Review
- Map

planned placementとactual Execution、planned Placeとobserved LocationSnapshotを区別したDomain / historical factからprojectionする。

## Documents direction

DocumentsはTaskChuteが所有するMarkdown-native capabilityである。

Task / Projectはlogical Primary Documentを持て、RoutineOccurrenceはoptional Occurrence Documentを持てる。

Document identityはowner entity identityと分離する。

physical lazy creationを許容し、将来Review Document / general note等へ同じcapabilityを拡張できる構成とする。

Document / Attachment exact persistence、editor、revision model、binary storageは後続設計とする。

## Location direction

planned Placeとobserved LocationSnapshotを分離する。

Start / Complete location captureはoptional / best-effort enrichmentとし、Core lifecycle transactionをlocation availabilityへ依存させない。

map / geocoding providerをDomain identity authorityにしない。continuous trackingは後続capabilityとする。

## Obsidian principle

legacy Obsidian plugin architectureを新Platform coreへ持ち込まない。

将来のObsidian clientはadapterとしてServer stateとDocumentsをVault Markdown/filesへprojection / synchronizationする方向とする。

## Legacy reuse

identity、lifecycle、Routine、ordering、offline/retry、Ack ambiguity、idempotency、regression scenario等の知見を優先して再利用する。

以下のwholesale reuseは避ける。

- monolithic `main.js`
- Vault-as-platform-authority
- Obsidian DOM UI code
- `data.json`-centric runtime design
