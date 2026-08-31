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

### Initial production environment

D-049によりinitial productionはnamed Wrangler environment `production`として、Worker `taskchute-web-production`とseparate D1 `taskchute-auth-production` / `taskchute-app-production`を利用する。nonprod resourceやlocal sentinel IDを再利用せず、productionはclean stateから開始する。initial public endpointは`workers.dev`で、custom domain / Cloudflare Accessは初回releaseの必須要件にしない。

Public production Workerは`BOOTSTRAP_ENABLED=false`を維持する。initial bootstrapだけはloopback local Workerからproduction D1へper-binding `remote: true`で接続し、public bootstrap-enabled deploymentやremote Worker development sessionを行わない。AUTH_DB / APP_DBのcross-database atomicityを仮定せず、existing recoverable bootstrap contractを利用する。

Cloudflare R2等のbinary storageはD-008のままProposedであり、採用未確定。

D-022によりinitial Workerはseparate `AUTH_DB` / `APP_DB` D1 bindingsを同一Worker内で利用する。auth専用Worker/serviceの分離はinitial scopeでは行わない。

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
- ConvertEntryToRoutine
- EndRoutine
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

D1 feasibilityはVerified済みで、D-022によりFirst vertical slice全体のAPP persistence baselineとなる責務境界をApprovedとする。exact production migration SQL / indexes / statement orderingは実装時にreviewする。

TaskChute-owned APP persistenceは概念的に以下を必要とする。

- app users
- auth-subject mapping
- user settings: TaskChute timezone / day boundary
- projects
- user-global sections
- taskchute days
- tasks
- entries
- executions
- operations
- routine definitions
- routine occurrences

migrationはsmall vertical slice単位で段階投入できるが、spike schema自体をfinal Product schemaとは扱わない。R1 local candidateはApproved D-040 scopeに限って`routine_definitions` / `routine_occurrences`とnullable `entries.routine_occurrence_id`を追加し、Documents、Place / Location等のfuture feature tableは先行作成しない。

R1のcurrent-Day Query pathはfinal projection前にeligible daily Routineをlazy ensureする。missing RoutineOccurrence / initial Entryを1 batchで作成し、1件以上を作るensureごとにTaskChuteDay `placement_revision`をexactly +1、0件なら+0とする。conditional SQL guardはplanned set全件のschedule eligibility / absenceとDay revisionをmutation時に再検証し、stale planやconcurrent winnerではpartial stateを残さず再読込・再計算へ収束する。conversion / endは`ConvertEntryToRoutine` / `EndRoutine` operationとしてresult persistenceと同じD1 batchへ含める。これはD-020 / D-040を満たすcurrent D1 implementationであり、追加のProduct ordering authorityではない。

TaskChuteDayはlogical dateだけではなくhistorically preservedできるactual interval、timezone / boundary contextを保持する。

Executionはactual start / end factを保持し、Reviewで過去classificationを失わないために必要なhistorical contextを将来保持できる設計とする。First sliceではdestructive hard-delete APIを提供しない。Execution時点のTask / Project / Section metadata snapshotのexact fieldsは、rename / move / delete / Reviewを導入する前に別途Decisionする。

historical chainへの安易なcascade deleteを避ける。

## Section scope

D-022によりFirst sliceのSectionはuser-global stable entityとする。

- Section identityはTaskChuteDayごとに作り直さない。
- 複数TaskChuteDayのEntryが同一Sectionを参照できる。
- day-specific Section occurrence / overrideはinitial scope外とし、必要性が生じた場合に別capabilityとして設計する。

## Identity generation

D-022によりinitial runtimeで新規作成するTask / Entry / Project / Section / Execution等のentity identityはUUIDv7を使用する。

DB / APIではopaque stringとして扱い、UUIDv7に含まれるtimestamp情報をordering、priority、historical authorityとして利用しない。

Client側でも生成可能とし、将来offline中に新規作成するclientへ同じidentity contractを拡張できるようにする。

## Authentication / authorization

D-021によりapplication authenticationはTaskChute Serverが所有し、D-022によりinitial physical boundary / bootstrap / session policyを確定する。

Initial implementation:

- Better AuthをCloudflare Workers + D1上で利用する。
- Webはsecure DB-backed browser sessionを利用する。
- initial loginはemail + password。
- public self-signupは無効。bootstrap中も有効化しない。
- initial userはoperator-only one-shot bootstrapで作成する。
- browser sessionはrolling 7日、update / renewal threshold 1日とする。

TaskChute Domain identityをBetter Authのphysical user schemaへ直接結合しない。

```text
Better Auth subject
  -> APP_DB auth mapping
  -> stable TaskChute app user
  -> Domain Commands / Queries
```

Initial Workerはseparate D1 bindingsを利用する。

- `AUTH_DB`: Better Auth-owned physical auth schema / session persistence
- `APP_DB`: TaskChute app user、mapping、settings、Domain persistence

AUTH_DB / APP_DB間のcross-database FK / atomic transactionを前提にしない。bootstrapはAUTH_DB側だけ成功した場合等から安全に再実行できるidempotent / recoverable flowとする。

Clientはuser IDをauthorityとして送らず、Serverがsession / tokenからAuthenticatedPrincipalを確定してownership / authorizationを検証する。

将来native clientでは同じprincipal modelへtoken-based authenticationを追加できる構成とする。

Cloudflare Accessはcanonical application authとして使用せず、必要ならpreview / internal environmentの追加outer gateとして利用できる。

Better Authのexact package versionはimplementation時にlocal D1 integrationをsmoke-testしたversionをlockfileでpinし、upgrade時はmigration / regression impactを確認する。

password、secret、session token等をtracked file、evidence、通常logへ残さない。

## TaskChuteDay architecture

TaskChuteDayはcanonical timezone + DayBoundaryPolicyから構成するcontinuous logical intervalである。

```text
TaskChute timezone
+
DayBoundaryPolicy
  -> TaskChuteDay [start, end)
```

civil midnight固定をDomainへ埋め込まない。

D-022によりinitial bootstrapではcanonical IANA timezone、TaskChuteDay boundary、initial Section configurationを明示入力する。`Asia/Tokyo`、midnight等を暗黙のProduct defaultとして適用しない。

ambiguous / nonexistent local timeのinitial disambiguationはTemporal-compatibleな`compatible` semanticsを利用する。day startとnext-day boundaryをそれぞれtimezone ruleでinstantへ解決し、`end = start + 24h`とは計算しない。

current TaskChuteDayは必要時にServerがlazy materializeできる。materializeしたactual `[start, end)` intervalとestablishment contextを保存し、後のsetting変更でretroactiveに再分類しない。

未来dayを閲覧しただけでhistorically freezeするか等のfuture materialization policy、timezone / boundary変更UX、travel behaviorは未決。

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
