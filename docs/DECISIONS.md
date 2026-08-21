# Decisions

Statuses: Approved / Proposed / Superseded

## D-001 — Independent TaskChute Platform
Status: Approved

TaskChuteをObsidian plugin専用productから、Obsidianを必須としない独立Platformへ再構築する。

## D-002 — Server-centric target authority
Status: Approved

新Platformでは、structured TaskChute stateのtarget canonical authorityをTaskChute Serverとする。

これはlegacy Obsidian実装の現在のauthorityを遡って変更するものではない。

## D-003 — Android is a native first-class client
Status: Approved

dedicated Android appをnative first-class clientとして構築する。

Webをprimary / universal clientとした上で、AndroidではWidget、通知、native integration、offline capability等のplatform-specific experienceを提供できる方向とする。

Android WidgetはAndroid client architectureを再利用する方向とする。

## D-004 — Obsidian becomes optional
Status: Approved

Obsidianをrequired runtimeとしない。将来のsynchronized client / integrationとして扱う。

## D-005 — Single-user first
Status: Approved

初期Productはone user / multiple devicesを前提とする。

Multi-user、team、organization、billingは初期scope外とする。

## D-006 — Markdown-native documents
Status: Approved

TaskChute自身がNotes/Documents capabilityを所有し、content semanticsはMarkdown-nativeとする。

## D-007 — Shared attachment capability
Status: Approved

Project Notes、Task Notes、Commentsはimages/filesを扱う共通Attachment capabilityを利用する。

## D-008 — Split binary object storage
Status: Proposed

structured data、Markdown、attachment metadataとbinary image/file storageを分離する案をleading directionとする。

Cloudflare R2等のobject storageはcandidateであり、storage separation自体も含めてfinal Decisionではない。

## D-009 — Legacy reuse by semantics first
Status: Approved

legacy repositoryは主にdomain semantics、data migration、regression knowledgeのreferenceとして利用する。

legacy codebase / architectureをwholesale-copyしない。

## D-010 — Task identity and Entry identity are distinct
Status: Approved

Task definition identityとboard placement / execution identityを別概念として扱う。

TaskとEntryはそれぞれstable identityを持ち、mutable title等をidentityとして利用しない。

1つのTaskが複数のEntryとして現れることを許容する。

exact ID formatは別途設計する。

## D-011 — Android is offline-capable
Status: Approved

Android clientはtemporary network unavailabilityを考慮したoffline-capable designとする。

offline中に可能なoperation範囲、local DB、queue、sync、conflict resolution等の実現方式は別途Decisionする。

## D-012 — Start / Complete are retry-safe
Status: Approved

Start / Completeはnetwork ambiguity等による同一operationの再送で、二重実行やstate inconsistencyを起こさないretry-safe behaviorを満たす。

具体的なAPI / command mechanismはArchitecture detailとして別途設計する。

## D-013 — Initial Server + Web First vertical slice
Status: Approved

初期implementation sliceは、Server + Webで以下をend-to-endに通す。

- Projectを作成する。
- TaskとEntryを別stable identityとして作成し、TaskChuteDay / Section上へexplicit orderで配置する。
- Web DayBoardをServer canonical stateからprojectionする。
- Webの通常mutationはasync communicationで実行し、full-page reloadを要求しない。
- EntryをStartし、retry-safeにExecutionを作成する。
- user全体でactive Executionは最大1つとする。
- EntryをCompleteし、retry-safeにExecutionの終了factを確定する。
- explicit order上の次のplanned EntryをNextとしてprojectionする。Nextはhard lockではなく、別のplanned Entryも明示Start可能とする。
- browser reload後はServer canonical stateからcorrect stateを復元する。

First slice lifecycleは`planned -> running -> completed`に限定し、Pause / Interrupt / Cancel / Reopenは含めない。

Android、Android Widget、Wear OS、Routine generation、Notes/Documents、Location/Map、Review、Calendar、Timeline、Web offline / PWA、realtime pushはinitial First vertical sliceには含めない。

Acceptance criteriaとverification contractの正本は`docs/SPEC.md`と`docs/TEST_MATRIX.md`とする。

## D-014 — Web is the primary universal client
Status: Approved

Web appをinitial development priorityが最も高いprimary / universal clientとする。

対応browserを通じてWindows、Android、iOS等からCore TaskChute experienceを利用できることをtargetとし、native appをTaskChute利用の必須条件としない。

Androidはnative first-class client、Wear OS / Pixel Watchはcompanion target、native iOS appは将来対応のlow-priority clientとする。

supported browser baseline、PWA、Web offline capability等の具体方式は別途設計する。

## D-015 — Core Domain foundations
Status: Approved

Core Domainでは以下を基礎invariantとする。

- EntryはTaskとは別stable identityを持ち、TaskChuteDay / Section移動や並び替えでidentityを変更しない。
- Taskは初期scopeで0..1 Projectに所属できる。
- Sectionはstable identityを持つ独立entityとする。
- board orderのauthorityはTaskではなくEntry identityとする。
- user全体でactive Executionは最大1つとする。
- 別Entryがrunning中の通常Startは、既存Executionを黙って止めずrejectする。将来のInterruptは明示operationとして別途設計する。
- First slice lifecycleは`planned -> running -> completed`とする。
- RoutineDefinitionはTaskに対する繰り返し定義であり、1 Taskは0..* RoutineDefinitionsを持てる。
- RoutineOccurrenceは特定のTaskChuteDay分として成立するoccurrenceで、0..* Entriesを持てる。
- RoutineOccurrenceが成立した後、関連Entryを別TaskChuteDayへ延期・移動しても、そのOccurrenceが何日分として発生したかを失わない。

exact ID format、DB table boundary、ordering storage algorithm、Pause / Interrupt / Cancel等の後続lifecycleは別途設計する。

## D-016 — Views and Review are projections over Domain and historical facts
Status: Approved

DayBoard、Calendar、Timeline、Review、Mapはcanonical task stateを別系統で保持するentityではなく、Domainとhistorical factsから構築するprojectionとする。

planned placementとactual Executionは別semanticsとして保持する。

Task / Project / Routine等の現在metadataを後から変更しても、過去ExecutionやRoutineOccurrence等のhistorical meaningを黙って再分類しない。

historical factsを参照不能にする破壊的hard deleteを前提としない。

ExecutionがTaskChuteDay境界をまたぐ場合、Execution自体を境界で分割せずactual intervalを保持し、Review等ではTaskChuteDay intervalとのoverlapで集計できる設計とする。

historical contextのexact snapshot / reference方式、Review query/UI、qualitative Review Document等は別途設計する。

## D-017 — Configurable TaskChuteDay
Status: Approved

TaskChuteDayはcivil dateとは別のlogical activity dayとする。

TaskChuteDayはcanonical TaskChute timezoneとDayBoundaryPolicyから定義し、連続する`[start, end)` intervalとして扱う。各dayのendは次のlogical dayのstartと一致し、gap / overlapを作らない。

通常24時間であることを前提とせず、timezone / boundary policy transition等によりtransition dayの長さが24時間以外になることを許容する。

UIでは`30:00`等のextended-time notationを利用できる方向とするが、Execution timestamp等のactual instantを架空の30時刻へ書き換えない。

過去にhistorically establishedされたTaskChuteDay assignment / intervalを、後のtimezone / boundary設定変更でretroactiveに再分類しない。

未来TaskChuteDayをいつmaterialize / freezeするか、default boundary、timezone変更UX、travel behavior、per-day override / work profile、extended-time入力rangeはOpenとする。

## D-018 — Primary Documents and Routine occurrence notes
Status: Approved

TaskとProjectは、それぞれ1つのlogical Primary Documentを持てるmodelとする。Task / Project identityとDocument identityは別stable identityとする。

empty Primary Documentをentity作成時に物理生成する必要はなく、lazy creationは実装detailとして許容する。

Routine共通の長期noteはTaskのPrimary Task Documentを利用し、RoutineDefinition専用の重複noteを必須にしない。

RoutineOccurrenceは0..1 optional Occurrence Documentを持てる。同一Occurrenceにinterrupt continuation等で複数Entryが存在しても、同じOccurrence Documentを共有できる。

Document capabilityは将来Review Document、general note、その他document typeへ拡張可能とし、Task / Project / Routine専用の相互非互換storageを増やさない。

Markdown-native semanticsはD-006に従う。editor、backlink、revision history、autosave等のexact UXは別途設計する。

## D-019 — Place and Execution Location foundations
Status: Approved

将来、TaskChuteでplanned destinationとactual execution locationを扱えるようにする。

planned Placeとdeviceが観測したExecution Locationは別semanticsとする。

- Placeは意味のある目的地を表すprovider-independentなTaskChute identityを持つ方向とする。
- LocationSnapshotはcaptured instant、coordinate、accuracy等を持つobserved factとする方向とする。
- Start / Complete時のlocation captureはoptional / best-effortとし、permission denial、unavailable、capture failureによってCore Start / Completeを失敗させない。
- MapはD-016に従うprojectionとする。
- map / geocoding provider identityをcanonical Place identityにしない。
- continuous GPS trackingはinitial location capabilityに含めず、将来のexplicit opt-in featureとして別途設計する。

map provider、reverse geocoding、retention、precision、manual correction、native background behavior等はOpenとする。

## D-020 — Initial client/server technology and command architecture
Status: Approved

Initial Server + Web implementationでは以下を採用する。

- Web UI: React
- Web build / development: Vite
- Web model: SPA
- Server API runtime: Cloudflare Workers
- structured application database: Cloudflare D1
- Webの通常mutation: async HTTP communication

WebのReact UI codeをnative clientsへそのまま流用することは前提としない。AndroidはKotlin + Jetpack Compose、Wear OS / Pixel WatchはKotlin + Compose for Wear OS、native iOSは将来Swift + SwiftUIを第一候補とする。共有するauthorityはServer API / Domain semanticsとする。

APIは概念上Command / Queryを分離する。これはCQRSやEvent Sourcing採用を意味しない。

client-issued mutationはlogical `operation_id`を持ち、network ambiguityによる同一operation retryを識別できるようにする。offlineで新規作成し得るentity identityはclient生成可能なopaque IDとする方向とし、exact ID formatはOpenとする。

stale stateによるsilent overwriteが危険なmutationではrevision / preconditionを利用し、silent last-write-winsを行わない。First sliceのplacement競合はTaskChuteDay単位のplacement revisionで扱う方向とする。

CommandによるDomain mutationとoperation resultはlogical transactionとしてatomicに確定する必要がある。D1のexact SQL / constraint / transaction algorithmは、本実装前のlocal + remote concurrency / atomicity spikeで成立を確認してから確定する。

Initial implementationではD1 read replicationを必須にしない。Durable Objects、external PostgreSQL、SSR、realtime pushはinitial scopeに採用しない。必要性が生じた場合に再評価する。

R2等のbinary object storage採用はD-008のままProposedとする。

## D-021 — Application authentication is owned by TaskChute Server
Status: Approved

TaskChuteのapplication authenticationはTaskChute Serverが所有し、Cloudflare Accessをcanonical application identity authorityにはしない。

Initial implementationではBetter AuthをCloudflare Workers + D1上で利用し、Webはsecure DB-backed browser sessionを使用する。初期loginはemail + passwordとし、public self-signupは無効化する。initial userはbootstrapで作成する。

TaskChute Domain identityはauthentication providerのphysical user tableへ直接依存させず、authenticated subjectをstable TaskChute app userへmappingする。auth-managed persistenceとTaskChute Domain persistenceは責務を分離する。

Clientからuser IDをauthorityとして送らせず、Serverがauthenticated principalからowner identityを確定し、Query / CommandのauthorizationをServer側で検証する。

将来native clientは同じTaskChute identity / authorization modelへtoken-based authenticationを追加できる構成とする。Cloudflare Accessは必要に応じてpreview / internal environment等のinfrastructure-level outer gateとして利用できる。

Passkey、OAuth、MFA、password reset UX、native credential handoff等は後続scopeとする。
