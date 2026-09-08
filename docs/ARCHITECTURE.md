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

## D-072 Mode Settings command flow

Mode BoardのsearchはWeb clientの現在tab内filterであり、Worker queryを増やさない。Board queryはowner-scoped Mode definitionをarchive join付きで返し、各projectionは`archived` booleanを持つ。Webはvisible rowsから操作後のcanonical full `mode_ids` orderを再構成して既存のrevision/CAS reorder commandへ渡す。

Archive / restoreは`mode_archives`のowner + mode primary keyを使うreversible stateである。Delete対象のlive Mode definitionへ直接FKを張るguardは置かず、`mode_command_guards`にowner / operation / command identityを一時保持する。これにより、command batch内でlive `entry_modes`をclearし、archive / Board item / definitionをdeleteしてもtransaction assertionとoperation replay identityを検証できる。既存の`entry_mode_snapshots`、Task / Entry / Execution、Day placementは削除対象外である。

Worker routesは`POST /api/v1/modes/:mode_id/archive`と`POST /api/v1/modes/:mode_id/delete`で、server authority、owner、expected settings / board revision、operation fingerprintを検証する。Archiveはassignment historyを変更せず、AddTaskToDayはactive Modeだけを新規候補とする。SetEntryModeはarchived targetを新規setできないが、既存archived relationのexact no-op、clear、activeへのreplaceは許可する。

APP migration `0022_mode_archive_delete.sql`はarchive state、delete command guard、既存operations command CHECKへの`SetModeArchived` / `DeleteMode`追加だけを行う。AUTH schema、production binding、offline queueは変更しない。Migration適用後はquick check、foreign-key check、orphan guard / assertion checkをread-onlyで確認する。

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

## D-066 client mutation scheduler

The ordinary current-Day Web mutations use a client-only scheduler layered over the existing Server-canonical command contract. The scheduler is intentionally ephemeral: it owns no persistence, service worker, offline queue, or cross-tab coordination.

```text
user intent
  -> optimistic overlay / provisional row
  -> one global serial dispatcher
  -> existing operation command with frozen identity + precondition
  -> canonical Day reconciliation
  -> overlay convergence / retry barrier
```

There is at most one ordinary Day command in flight. Unsent intents may be replaced by a newer intent for the same coalesce key; once dispatched, the operation identity and semantic payload are immutable for retry safety. The queue rebases only the latest expected placement revision immediately before dispatch and never rewrites a sent operation.

Conflict scopes are represented separately from the global barriers used for authentication, navigation, initial Section configuration, and settings. This permits unrelated Task metadata / estimate / placement intents to be accepted while another command is in flight while still preventing unsafe dependent execution transitions. A revision conflict or ambiguous response pauses the serial queue, reconciles against the Server projection, cancels unsent dependents, and retains the exact sent operation until deterministic success or explicit retry/discard.

Dependency edges inside the ephemeral queue are treated as a graph rather than a direct-child hint. Deterministic failure computes the full queued descendant closure and removes that subtree with its pending overlays; an ambiguous root preserves the full descendant closure and original queue order until the exact root retry converges. This remains client-only orchestration and does not create a server dependency, persistent queue, or new operation semantics.

The scheduler is a Web presentation/orchestration concern. No Worker route, D1 table, migration, operation command type, dependency, binding, or security posture is introduced by D-066.

## D-067 deletion boundary and reference graph

D-067 uses the existing current-Day serial mutation dispatcher and the existing operation fingerprint/replay infrastructure. The Worker performs server-authoritative current-Day, owner, lifecycle, active-execution, canonical-relation, and placement-CAS checks before a single D1 batch. The target `executions` rows are deleted before `entries` because `executions.entry_id` is `ON DELETE RESTRICT`; `lifecycle_command_guards.entry_id` and `entry_project_snapshots.entry_id` are also Entry-bound `ON DELETE RESTRICT` references and are removed only for the target Entry. `operations` has no Entry FK and remains retained. Routine occurrence, occurrence snapshots, definitions, schedules, suppressions, Tasks, Projects, and unrelated Entry/Execution rows are not deletion targets.

The transaction assertion verifies target absence, expected revision `+1`, retention of the command result and unrelated identity, then removes temporary guards/assertions. `DeleteCompletedEntry` is added only to the operations command allow-list by APP `0020_delete_completed_entry.sql`; no domain table, column, index, FK policy, binding, or dependency is added. Retaining `routine_occurrences` makes the existing current-Day materializer's occurrence-exists predicate prevent same-day rematerialization.

The corrective Web path keeps completed-delete orchestration inside the same dispatcher: confirmation creates an unsent queue intent, pre-dispatch reconciliation rebases only the latest placement revision, and the sent request is frozen before calling the existing API client. The sent operation is the only delete state exposed as retryable. Ambiguous response pauses the global queue and retains the exact request; revision conflict cancels stale queued work after canonical reconciliation. This preserves the max-one-in-flight invariant and the existing navigation/settings/logout/unload barriers without introducing a persistent client queue.

## D-070 future established-Day Mode path

D-070 reuses the existing `SetEntryMode` command, Entry-scoped `entry_modes` relation, operation replay record, and D-066 current-Day scheduler. Current-Day Mode mutations remain inside the global serial dispatcher; established future-Day Mode mutations use the Web's existing direct scoped path and do not broaden the scheduler or add a persistent queue. The Worker binds the observed TaskChuteDay ID and exact logical date in every relation / operation guard so a concurrent Day move, lifecycle change, or live relation change cannot leave relation-only success. No table, migration, command, API schema, dependency, or binding is introduced.

## D-073 Interrupt / Continuation data and transaction boundary

D-073 adds APP migration `0023_interrupt_continuation.sql`. `executions.terminal_outcome` records explicit `completed` or `interrupted` outcomes while pre-0023 rows remain NULL as legacy unknown. `entries.continuation_chain_id` and `continuation_parent_entry_id` provide stable chain identity; ordinary legacy entries receive singleton chains without fabricating historical continuation facts. `entry_task_snapshots` is written only for newly started executions, and historical projection prefers that snapshot only when present. `interrupt_command_guards` is a temporary idempotency / assertion guard and is cleaned after success.

The Worker pre-reads current-Day identity, source active Execution identity, target planned identity, frozen Section context, placement revision, chain estimate facts, and operation replay state. The mutation batch then inserts the guard, shifts only affected placement positions, ends A with interrupted outcome, preserves its historical Entry row, inserts one continuation and B's snapshots, starts B, copies the source live Mode relation, increments Day revision once, asserts one active Execution and exact identities, and stores the operation result. Any failed assertion or D1 error is treated as conflict or ambiguity; no lifecycle / Entry / Execution / operation partial success is accepted.

Same-minute placement uses B's immediate successor position. Different-minute placement uses the canonical end of the interruption-minute cohort, preserving unrelated order. The client treats InterruptEntry as one D-066 queued mutation scoped by execution lane, source / target Entry, and placement Day; a sent payload is immutable for exact retry.

## D-077 dispatcher / projection corrective

D-077 reuses the D-066 in-memory coordinator. `dayMutationQueueRef` remains the single serial HTTP queue; ordinary queued operation state is no longer treated as an ambiguous retained scope merely because it is waiting behind another request. Active scope conflicts, global transition barriers, revision conflicts, and retained ambiguity continue to block or pause only where required.

After a successful reconcile, the imperative `dayRef` is updated before React render/effect completion so the next queued dispatch rebases from the latest canonical projection. Metadata overlays and drafts merge title / Project intent per field, while sent payloads remain immutable. The logical save count is derived from active mutation scopes plus queued logical items, with unsent coalescing represented once.

No Worker/API/schema/migration/dependency/binding change is introduced. Placement D&D keeps an explicit queued-placement guard, so D-077 does not change reorder acceptance semantics.
