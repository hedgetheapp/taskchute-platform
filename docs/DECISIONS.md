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

initial runtimeのentity ID formatはD-022でUUIDv7として確定する。DB / APIではopaque stringとして扱い、IDに含まれるtimestamp情報をDomain ordering authorityとして利用しない。

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

initial runtimeのID formatとSection scopeはD-022で確定する。DB table boundary、ordering storage algorithm、Pause / Interrupt / Cancel等の後続lifecycleは別途設計する。

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

initial bootstrapではtimezone / boundaryを明示入力させ、暗黙のProduct defaultを適用しない。DST local-time disambiguationのinitial ruleはD-022で確定する。未来TaskChuteDayをいつmaterialize / freezeするかはD-041で確定する。timezone変更UX、travel behavior、per-day override / work profile、extended-time入力rangeはOpenとする。

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

client-issued mutationはlogical `operation_id`を持ち、network ambiguityによる同一operation retryを識別できるようにする。initial runtimeで新規作成するentity IDはD-022に従いUUIDv7とし、DB / APIではopaque stringとして扱う。

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

Passkey、OAuth、MFA、password reset UX、native credential handoff等は後続scopeとする。initial bootstrap、session policy、AUTH_DB / APP_DBのphysical boundaryはD-022で確定する。

## D-022 — Initial runtime foundation decisions
Status: Approved

First Server + Web runtimeを実装開始するためのfoundationとして、以下をApprovedとする。

### Entity identity

- initial runtimeで新規作成するTask / Entry / Project / Section / Execution等のentity IDはUUIDv7を使用する。
- DB / APIではopaque stringとして扱い、UUIDv7に含まれるtimestamp情報をDomain order、priority、history authorityとして利用しない。
- Client生成可能とし、将来のoffline-capable clientでも同じidentity contractを利用できるようにする。

### Section scope

- First sliceのSectionはuser-globalなstable entityとする。
- 複数TaskChuteDayのEntryが同じSection identityを再利用できる。
- day-specific Section occurrence / overrideはFirst sliceへ導入せず、必要になった時点で後続capabilityとして設計する。

### APP persistence baseline

First vertical slice全体のTaskChute-owned APP persistence baselineは、必要最小限のstable-reference modelとして以下の責務を持つ。

- app users
- auth subject -> app user mapping
- user settings: canonical timezone / TaskChuteDay boundary
- projects
- sections
- TaskChuteDays
- tasks
- entries
- executions
- operations

実際のmigrationはsmall vertical sliceに合わせて段階投入してよいが、spike schemaをfinal Product schemaとしてコピーせず、将来feature用tableを先行して増やさない。

materialized TaskChuteDayはlogical dateだけでなくactual `[start, end)` intervalと、そのintervalをestablishしたtimezone / boundary contextを保持する。

First sliceではdestructive hard-delete APIを提供しない。Execution時点のTask / Project / Section metadataをどこまでsnapshotするかは、rename / move / delete / Reviewを導入する前に別途Decisionする。

### TaskChuteDay bootstrap / DST

- initial user bootstrapではcanonical IANA timezone、TaskChuteDay boundary、initial Section configurationを明示入力する。
- `Asia/Tokyo`、civil midnight等を暗黙のProduct defaultとして適用しない。test fixtureとして明示利用することは許容する。
- ambiguous / nonexistent local timeのinitial disambiguationはTemporal-compatibleな`compatible` semanticsを使用する。
- day startとnext-day boundaryをそれぞれtimezone ruleからinstantへ解決し、`end = start + 24h`とは計算しない。
- established intervalを保存し、後のsetting変更でretroactiveに再分類しない。

### Initial-user bootstrap

- initial userはoperator-only one-shot bootstrapで作成する。
- public self-signupはbootstrap中も含めて有効化しない。
- bootstrapはAUTH_DB側だけ成功 / APP_DB側失敗等のpartial failureから安全に再実行できるidempotent / recoverable flowとする。
- password、secret、session token等をtracked file、evidence、通常logへ保存しない。

### Browser session policy

Initial browser sessionはrolling sessionとし、lifetimeを7日、update / renewal thresholdを1日とする。

将来このSecurity / UX balanceを変更する場合は、impactを確認した上で新たにDecisionする。

### AUTH_DB / APP_DB boundary

- Initial Workerは2つのseparate D1 database / bindingを利用する。
- `AUTH_DB`はBetter Authのphysical auth persistenceを所有する。
- `APP_DB`はTaskChute Domain / application persistenceを所有し、auth subjectからstable `app_user_id`へのmappingを保持する。
- Better Auth physical user IDをTaskChute Domain identity authorityにしない。
- AUTH_DBとAPP_DB間にcross-database FK / atomic transactionがあると仮定しない。
- initial scopeではauth専用Worker/serviceを別途分離せず、同じWorker内で両bindingを利用する。

Better Authのexact package versionはimplementation時のlocal D1 smoke test後にpinするimplementation detailとする。exact SQL、endpoint / JSON / HTTP mapping、operation retention cleanup、future timezone / boundary change UX等は引き続きOpenとする。

## D-023 — Bootstrap endpoint lifecycle / exposure
Status: Approved

Initial-user bootstrapは恒常的に有効化せず、通常runtimeではdisabledとする。

- bootstrap endpoint availabilityはtokenとは別の明示的bootstrap-mode configurationで制御する。
- configurationがmissing、empty、disabled、invalidの場合はdisabledとして扱う。initial canonical enabled valueはexact lowercase `"true"`のみとする。
- disabled時のbootstrap endpointはbootstrap stateやinitial userの存在を開示せず、unavailable resourceと同じ404 postureを返す。
- bootstrap modeをenableしただけでは実行を許可せず、valid `BOOTSTRAP_TOKEN`認証とtiming-safe comparisonを引き続き必須とする。
- initial provisioning成功後、operatorはbootstrap modeをdisableし、通常のremote / production operationへ移る前にbootstrap tokenをremoveまたはrotateする。
- public self-signupはbootstrap modeにかかわらず常時disabledとする。
- Cloudflare Accessはinitial postureの必須要件にせず、preview / internal environmentのoptional outer gateとして将来採用できる。

application codeはprovisioning後にenvironment configurationやsecretを自動変更しない。exact production operator UX / packagingとremote / production deployment procedureは別途決定・検証する。このDecisionはproduction deploymentをauthorizeしない。

## D-024 — Persistent non-production verification environment
Status: Approved

TaskChute Platformの継続的なdevelopment / verification用として、1つのpersistent Cloudflare non-production environmentを維持する。

- productionとは明示的に分離し、このDecisionはproduction deploymentをauthorizeしない。
- initial postureはCloudflare Free planとする。current Free-plan limitsがruntimeをmaterialに阻害する場合は自動upgradeせず、Product Ownerへ判断を戻す。
- verification cycleごとにdate-scoped disposable environmentを再作成せず、stable non-production resource namingを利用する。
- non-productionではseparate `AUTH_DB` / `APP_DB` resourcesを利用し、local placeholderや将来のproduction bindingを再利用しない。
- normal non-production postureは`BOOTSTRAP_ENABLED=false`とする。
- temporary bootstrapはD-023に従い、explicit enable、bootstrap token認証、provisioning、immediate disable、token remove / rotateの順で実施する。
- Cloudflare Accessはinitial non-production postureの必須要件にせず、optionalとする。
- secret、credential、private test data、personal credentialをcommitしない。
- Cloudflare remote writeは、実行する具体的scopeについてexplicit user approvalを必要とする。複数operationは、同じapproved scopeへ明示的に含まれる場合にまとめて承認できる。

このDecisionはproduction architecture、custom domain、paid plan adoption、destructive cleanup policyを決定しない。

## D-025 — Personal knowledge / life log and standalone Documents
Status: Approved

TaskChute Platformは、Task管理だけでなく、行動・実行履歴と、知識・思考・感情・メモ等のDocumentを同じPlatform上で蓄積し、後から時間軸と情報同士の関係の両方から辿れるpersonal knowledge / life log foundationを目指す。

- Task / Project等に従属しないstandalone Document / general noteをfirst-class capabilityとして扱う。
- standalone Document、Task / Project Primary Document、RoutineOccurrence Document等は共通Document foundationを利用し、document typeごとの相互非互換storageを増やさない。
- Document同士をlinkでき、link先からbacklinkとして逆方向の関係を辿れるcapabilityを持つ。
- NotesはTask / Projectの補助情報だけではなく、top-level Product capabilityとして扱う。
- 将来、Task / Project / Execution / TaskChuteDay等の行動・時間情報とDocumentを横断して振り返れる方向とする。ただしexact relation modelは別途設計する。

Markdown-native semanticsはD-006、Primary Document foundationはD-018に従う。

内部linkのexact syntax、rename時の解決、link authority、indexing / search、Graph View、autosave、revision history、standalone Documentのorganization / lifecycle、Task / Project / Execution等とのexact relation semanticsは後続設計とする。

## D-026 — Entry-scoped planning metadata and user-defined Mode
Status: Approved

DayBoard上でユーザーが扱う「その日のTask」に固有なplanned metadataは、Task definitionではなく、そのTaskChuteDay上のEntry文脈へ属するものとして扱う。

- Modeはユーザーが定義する再利用可能な分類であり、Product側で「感情」「作業難度」「場所」等の意味を固定しない。
- 1 Entryは0..1 Modeを選択できる。同じTaskでもEntryごとに別Modeを選択できる。
- 見積時間はEntryごとのplanned valueとする。同じTaskでも日ごとに異なる見積を持てる。
- 開始予定時間はEntryごとのplanned valueとし、各Entryについてユーザーが明示入力する。前Entryの見積時間やSection開始時刻から自動生成・上書きしない。
- 開始見込時間は開始予定時間とは別semanticsのderived projectionとする。現在の進捗・実績・残り見積等から算出できる方向とするが、exact計算式は後続設計とする。
- SectionはEntryのDay上の配置文脈であり、Taskの永久属性とはしない。

ModeDefinitionのexact persistence、Mode管理UI、開始見込時間のexact algorithm、見積の編集履歴 / re-estimation semanticsは後続設計とする。

## D-027 — Routine-centered cross-day reuse and day-specific task context
Status: Approved

TaskChuteでは、繰り返す行動を日をまたいで再利用する主要mechanismをRoutineとする。同じtitleが複数日に現れることだけを理由に、Task identityや関連情報を自動的に共有・統合しない。

- 非Routineのその日のTaskに付くLink、Comment、Note等は、defaultではその日の作業文脈に固有な情報として扱えるようにする。
- RoutineDefinitionは、繰り返し利用する見積、Mode、Link等のdefault / reusable informationを供給できる方向とする。
- Routineからその日のTaskが成立した後は、その日のLink、Comment、Note等を個別に変更できる。Routine側の後日の変更によって過去のday-specific historical contextを黙って書き換えない。
- Routine共通の長期DocumentはD-018のTask Primary Documentを利用でき、特定日のRoutineOccurrenceには同じくD-018のoptional Occurrence Documentを利用できる。
- Day UIから開くNoteは、その日の作業文脈を優先して扱う。cross-dayで共有するDocumentはRoutineまたは明示的なDocument relationとして扱い、title一致だけで共有しない。

非Routineのday-specific Note / Link / Commentをどのphysical entityへ保持するか、Routine defaultをcopy / reference / snapshotのどれでmaterializeするか、day-specific contextをinterrupt continuation間でどう参照するかは後続Domain / persistence設計とする。

## D-028 — Explicit interruption continuation and estimate review semantics
Status: Approved

TaskChuteの実行ではuser全体でactive Execution最大1つを維持しつつ、別Taskへの割り込みをfirst-class workflowとして扱う。

- running Entry Aが存在する状態でEntry Bへ割り込む操作は、通常Startとは区別された明示的Interrupt operationとして扱う。UIはBのStart操作からこのInterrupt operationへ遷移できる。
- InterruptはAのactive Executionをその時刻で終了し、終了理由をcompletedではなくinterruptedとしてhistorical factに残した上で、BのExecutionを開始する。
- Interrupt時にはAのcontinuation Entryを自動生成し、Dayのexplicit order上でBの直下へ配置する。
- continuationは元のその日の作業の続きとして扱い、Routine由来の場合は同じRoutineOccurrenceとの関係を維持する。
- continuationの開始予定時間は自動入力しない。D-026に従い開始予定時間はユーザー入力値であり、自動生成continuationでは未設定を許容する。
- continuationの見積表示値は、当初見積から同一continuation chainですでに実行したactual durationを差し引いた残り見積を基本とする。UIでは通常の時間値として表示してよく、「残」等のprefixを必須にしない。
- Reviewで見積を集計するときは、continuation Entryの残り見積を加算せず、その日のlogical work chainでユーザーが最初に立てた当初見積をbaselineとして1回だけ数える。
- Reviewのactual durationは、interrupt前後を含む同一continuation chainのExecution実績を合算できるようにする。
- Interrupt元のExecutionと通常Completeは別のhistorical outcomeとして区別する。
- 割り込み先BをCompleteしてもcontinuation Aを自動Startしない。
- Quick Interruptは明示Interruptの一形態とし、running Entryから即時に割り込み作業を記録できるようにする。Quick Interruptではdefault title `（割込）` のその日のTask / Entryを生成して直ちにStartし、元TaskのExecutionはinterruptedとして終了し、元Taskのcontinuationを通常のInterruptと同様に生成する。
- Quick Interruptで生成したTaskも通常のその日のTaskと同様にExecution / historical logへ残す。titleは実行中を含め後から変更でき、renameしてもQuick Interrupt由来であることやexecution historyを失わない。
- Quick Interruptで生成するEntryのSectionはD-030に従い、Interruptを実行した時刻に対応するcurrent Sectionとする。TaskChuteDay内のvalid Section configurationはgapを持たないため、current Sectionを必ず解決する。
- Quick Interrupt実行中にさらにQuick Interruptすることを許容し、人工的なnesting depth limitを設けない。各割り込みはそれぞれ独立したその日のwork chain / historical executionとして扱い、完了後も外側のcontinuationを自動Startしない。

当初見積を使い切った後も未完了の場合のremaining estimate、明示re-estimationとそのReview semantics、Interrupt / Quick Interrupt commandのexact atomicity / retry contract、continuation chainおよびQuick Interrupt originのphysical persistence model、Quick Interrupt生成時のSection以外のmetadata defaultは後続設計とする。

D-015の「別Entryがrunning中の通常Startはrejectする」は維持する。D-028はその通常Startを暗黙interruptへ変更するものではなく、別の明示Interrupt operationを定義する。D-013のFirst vertical sliceがInterruptを含まないこと、およびcurrent implementationが通常Startをrejectすることも変更しない。

## D-029 — Revert the current Start without erasing earlier execution history
Status: Approved

実行中Taskに対する「未実行に戻す」は、そのTaskのlogical work chain全体を巻き戻す操作ではなく、**現在activeなExecution / 今回のStartだけを取り消す操作**として扱う。

- 対象は現在activeなExecutionだけとし、そのExecutionを通常のactual / Review集計から除外した上で、現在のEntryを未実行状態へ戻す。
- 同じlogical work chainにInterrupt前等の過去のvalid Executionが存在する場合、それらは維持する。continuationを再Startした後に今回のStartを取り消しても、以前に確定したactualは失わない。
- Quick Interruptで生成したTaskのactive Executionにも同じルールを適用する。Quick Interruptの今回のStartを取り消した場合、そのQuick Interrupt Task / Entry自体は未実行として残し、元Taskがinterruptedになったhistorical factや元Task continuationを巻き戻さない。
- 「未実行に戻す」によって別Taskを自動Startしない。
- D-016に従い、取消されたExecutionを参照不能にする破壊的hard deleteを前提としない。実行開始後にユーザーが取り消したことを表現・監査できるhistorical representationを持つ方向とするが、exact outcome名、DB表現、retention、command atomicity / retry contractは後続設計とする。

D-013のFirst vertical sliceがCancel / Reopenを含まないこと、およびcurrent implementationがこの操作を未実装であることは変更しない。

## D-030 — Time-ranged Section semantics and current Section resolution
Status: Approved

Sectionはその日のEntry placement contextとしてstable identityを持つとともに、ユーザー設定として明示的な**Section名、開始時間、終了時間**を持つ。

- Sectionの時間範囲は`[開始時間, 終了時間)`として扱い、開始時刻を含み終了時刻を含まない。
- 基本Section configurationは、そのユーザーが設定したTaskChuteDayのlogical interval全体を**gapなく、overlapなく100% coverする**。TaskChuteDay内の任意の時刻には常にexactly one current Sectionが存在する。
- 最初のSection開始はTaskChuteDay開始、最後のSection終了はTaskChuteDay終了と一致し、隣接Sectionでは前Section終了と次Section開始が一致する。
- Sectionの表示順 / configuration orderは開始時間の昇順から決定し、独立したmanual orderを持たせない。
- current Sectionを必要とする操作では、その操作時刻が属するSectionを解決する。Quick InterruptではInterrupt発生時刻を使ってcurrent Sectionを解決し、自動生成EntryをそのSectionへ配置する。
- Section時間は、そのEntryが属するTaskChuteDayのlogical timeとして解釈する。TaskChuteDay boundaryが05:00の場合、そのlogical dayの時間表現は`05:00`から翌日のboundaryを表す`29:00`までを扱い、翌03:00は`27:00`として表現する。
- `24:00`を超えるSection時間はextended-time notationで表現するが、actual instant自体を架空の時刻として保存することを意味しない。
- Section名は変更可能とする。同じstable Section identityをrenameしても、過去のEntry / Execution等で表示するhistorical Section名を現在名へretroactiveに置換しない。
- Section時間を変更しても、過去TaskChuteDayでhistorically establishedされたSection名・開始時間・終了時間を現在設定へretroactiveに置換しない。過去DayのSection summary / capacityも当時のSection intervalを基準に再現できるようにする。
- Sectionを現在の基本configurationから削除しても、そのSectionを参照する過去のEntry / Execution / Review用historical contextを失わない。physical archive / tombstone / snapshot方式は後続persistence設計とする。
- Section追加は既存Sectionの時間帯を分割して行い、追加後もgap / overlapを作らない。Section削除は原則として削除Sectionの時間帯を次Sectionへ吸収し、最後のSectionを削除する場合は前Sectionへ吸収する。
- Section削除時、削除Sectionに属する未実行Entryは吸収先Sectionへ移動する。completed / interrupted等のhistorical rowは当時のSection contextを保持し、吸収先へretroactiveに移動しない。
- Sectionの時間境界を編集するときは隣接Sectionとの共有境界として扱える。Day boundary変更で端Sectionだけを伸縮してvalid configurationを維持できる場合は端Sectionを追従させられるが、内部Section境界を追い越す等でvalidityを壊す変更は黙って再構成せずrejectする。
- EntryはSection未設定を許容する。Section未設定は「今日行うが、実行時間帯はまだ決めていない」placementとして扱う。Section未設定EntryをStartすると、そのStart時刻のcurrent SectionへEntryを配置してから実行開始する。
- completed / interrupted等、既にhistorical executionを持つrowは後からSection間移動や並び替えの対象にしない。未実行EntryはSection内並び替え、Section間移動を許容する。
- Section summaryで扱うTask件数にはQuick Interruptで生成されたTask / Entryを通常Taskと同様に含め、Interruptで終了したhistorical rowも実行済み件数として扱える。
- Section summaryの合計見積は、そのSectionに所属するEntryの見積を合計するplanning指標とし、実行済みになっても当該見積を消さない。合計見積がSection容量を超える場合はcapacity overflowとしてUIで明示できる。
- Section capacityのactual使用量は、Taskの所属Sectionではなく**Executionのactual intervalと各Sectionのactual intervalとのoverlap duration**で計上する。ExecutionがSection境界をまたぐ場合は各Sectionへoverlap分だけ配分し、Execution自体を分割しない。したがってSection capacity usageは0〜100%の範囲であり、所属Taskのspilloverは別概念とする。

05:00 boundaryのvisual/default exampleとして、`朝 05:00–09:00`、`午前 09:00–12:00`、`昼 12:00–13:00`、`午後 13:00–18:00`、`夜 18:00–29:00（翌05:00）`を利用できる。ただしTaskChuteDay boundary自体はユーザー設定であり05:00へ固定しない。D-022のinitial bootstrapでuser-selected boundaryとinitial Section configurationをどのように提示・生成するかのexact onboardingは未決とする。

Section configurationのversioned persistence、established TaskChuteDayごとのhistorical Section context、legacy historyのtime-range unknown handling、`Sectionなし`のphysical absence representation、通常のSection設定変更のeffective timingはD-038で確定する。Section時間をcanonical timezoneのactual instantへ解決するexact algorithm / DST transition behavior、Section削除のarchive / tombstone exact retention、Section icon / accentのphysical persistenceは引き続きOpenとする。

## D-031 — Planned start, Section placement, and within-Section order
Status: Approved

Day上の開始予定時間は、D-026のEntry-scoped planned valueであると同時に、未実行EntryのSection placementとSection内表示順を決めるplanning authorityとして扱う。

- 開始予定時間を入力・変更した未実行Entryは、そのlogical timeを含むSectionへ自動的に配置する。Section境界はD-030の`[start, end)`に従うため、境界時刻は次Sectionへ属する。
- `Sectionなし`と開始予定時間は同時に成立させない。SectionなしEntryへ開始予定時間を設定した場合は該当Sectionへ移動する。
- 開始予定時間を空にした場合、現在のSection placementはそのまま維持する。
- Section dropdownやSection間drag等でSectionを明示変更した場合は、既存の開始予定時間をclearする。Sectionなしへ移す場合も同じとする。Section変更からexact開始時刻を推測して自動入力しない。
- Section configuration変更時、未実行Entryに開始予定時間がある場合はその時刻をauthorityとして新しいSectionへ追従させる。開始予定時間がないEntryは、Section削除等で不可能にならない限り現在Sectionを維持する。
- Section内では、開始予定時間がない未実行Entryを先に表示し、その集合内はexplicit manual orderを持つ。開始予定時間がある未実行Entryはその後に開始予定時間昇順で表示する。同一開始予定時間は許容し、その同時刻集合内はstableなmanual orderをtie-breakとする。
- 開始予定時間の編集によりEntryは自動的に正しい位置へ移動する。開始予定ありEntryをmanual dragで時刻順に反する位置へ固定しない。同時刻Entry間はmanual reorder可能とする。
- Section間dragはSection変更と同様に開始予定時間をclearするため、移動先Sectionの開始予定なし領域へ入り、そこでmanual orderを持つ。
- completed / interrupted等のhistorical rowはD-030に従い後からSection移動・reorderしない。

開始予定時間は実行開始を禁止する`not-before` constraintではない。開始予定より早く実行順が到達すること自体は許容し、開始見込時間とは別semanticsとする。

## D-032 — Start forecast projection semantics
Status: Approved

開始見込時間は、開始予定時間とは独立したderived projectionとして、現在の進行状況、Day上の実行順、見積から「このまま進んだ場合にいつ開始できそうか」を表す。

- 開始予定時間を待機barrierとして扱わない。例として開始予定`10:00`のEntryに開始見込`09:45`が表示されてもvalidとする。
- current Dayでは現在時刻と現在の進捗をforecastのbaseとする。future DayではTaskChuteDay開始をbaseとする。past Dayでは開始見込を再計算・表示しない。
- completed / interrupted historical rowはfuture forecast計算対象から外し、自身の開始見込表示を持たない。
- running Entry自身はactual開始済みのため開始見込を表示しない。その後続Entryのforecastでは、running workの残り見積を考慮する。
- running workに見積がある場合、残り見積はそのlogical work chainで既に消費したvalid actualを考慮し、少なくとも`max(estimate - actual, 0)`を基礎とする。見積超過中は後続forecastを過去へ戻さず、少なくともcurrent timeから先へ進める。
- 見積がないfuture Entryはforecast上の追加durationを0として扱う。見積がないrunning Entryは、実行が継続する間、後続forecastのbaseがcurrent timeとともに進む。
- forecastはSection境界でresetしない。前Sectionの遅延は後続Sectionへ連続して伝播する。
- `Sectionなし` Entryはforecast計算対象外とし、開始見込を表示しない。
- Quick Interrupt / continuationは通常の実行順・valid actual・remaining estimate semanticsに従ってforecastへ参加する。
- order、見積、Start、Complete、Interrupt、actual time correction等、forecast入力が変われば再計算する。

UI上で開始見込がowning Section終了を超えた場合はplanning warningを表示できるが、開始予定と開始見込の単純な差だけではwarningとしない。

exact rounding、秒精度、timezone表示等のpresentation detailはDesign / implementationで定める。

## D-033 — Manual Execution time correction and non-overlap invariant
Status: Approved

Start / Complete操作による自動記録に加え、ユーザーが押し忘れ等を修正できるよう、Executionのactual開始・終了時刻を明示的に入力・修正できるようにする。

- 実績時間は手入力する独立authorityとせず、valid Execution intervalからderivedする。
- 未実行Entryへactual開始だけを入力する操作は、その時刻からrunning Executionを開始する意味を持つ。user全体のactive Execution最大1 invariantは維持する。
- 未実行Entryへvalidなactual開始・終了をまとめて与えることで、過去に完了したExecutionを記録できる方向とする。
- running Entryへ終了時刻を入力すると、その指定時刻でCompleteしたものとして扱う。現在時刻まで引き延ばさない。
- completed Entryのactual開始・終了は後から訂正可能とし、訂正後のintervalから実績、Review、Section capacity usage等を再計算する。
- 同一userのvalid Execution interval同士はoverlapを許可しない。新規入力または訂正で他Executionと重なる場合はrejectし、既存Executionを自動shift / truncateしない。
- validationでは可能な範囲で衝突相手のTask / Executionを特定してユーザーへ示す。
- running Executionは終了未確定として扱い、終了時刻を通常inline editでclearしてcompleted EntryをReopenする操作は提供しない。Reopenは別semanticsとしてOpenのままとする。
- D-029等で取消されたExecutionはvalid actualから除外されるため、通常のoverlap / Review集計対象とは区別する。

manual correctionのcommand atomicity / retry contract、historical correction audit、timezone / DST ambiguity入力UX、複数Execution segmentを直接編集するadvanced UXは後続設計とする。

## D-034 — Routine projection, materialization, defaults, and day-specific override semantics
Status: Approved

Routineは無期限の未来Taskを物理的に大量事前生成するのではなく、RoutineDefinitionから必要な日付範囲の予定Occurrenceをprojectionできるmodelとする。

### Projection / materialization

- Routine scheduleに該当する未来Occurrenceは、必要なDay / query範囲でProjected Occurrenceとして算出できる。
- その日固有の編集、日付移動、Skip、実行開始等、persistent day-specific stateが必要になった時点でRoutineOccurrenceをmaterializeできる。
- UIは通常、Projected / Materializedの内部差をユーザーへ意識させず「その日に予定されたRoutine Task」として一貫表示してよい。
- RoutineOccurrenceのorigin TaskChuteDayはD-015に従い保持し、別日へ移動しても「何日分として発生したOccurrenceか」を失わない。

### Routine defaults / occurrence overrides

RoutineDefinitionは、そのRoutine Taskのdefaultとして少なくともTask名、Project、Mode、Section、見積、開始予定時間、day-specific Task Note template/defaultを供給できる方向とする。Link等の既存D-027 reusable informationも引き続き許容する。

- 開始予定時間defaultがある場合はD-031に従い、その時刻をauthorityとしてOccurrenceのSectionを決める。Section defaultは開始予定時間がない場合のplacement defaultとして利用する。
- その日のOccurrenceでは項目単位のoverrideを持てる。Task名やProject等のoverrideを持ってもTask / Routine identity自体をmutable文字列へ置き換えない。
- Routine由来TaskをDay UIでdefault対象項目について編集するときは、ユーザーが「今回だけ」か「Routineへ反映」かを明示選択できるUXとする。黙ってRoutine本体へ書き戻さない。
- 「今回だけ」はそのOccurrenceの当該項目overrideとする。「Routineへ反映」はRoutine defaultを変更し、その項目をoverrideしていないfuture / unstarted Occurrenceへ新defaultを反映する。
- past Day、running / completed / interrupted等のhistorical contextはRoutine default変更でretroactiveに書き換えない。
- Task Noteについて、Routine共通の長期DocumentはD-018のTask Primary Documentを維持する。本DecisionのTask Note defaultはday-specific Occurrence Documentへ供給するtemplate/defaultとして扱い、長期共通Documentを複製する意味ではない。

### Schedule changes / explicit day intent

- Routine schedule自体を変更した場合、new scheduleに該当しないfuture / unstartedのProjected Occurrenceは表示対象から外す。
- field-level overrideだけを持つfuture Occurrenceも、発生日そのものはRoutine scheduleをauthorityとする。scheduleから外れた日をfield overrideだけで自動保護しない。
- ユーザーがOccurrenceを別日へ明示移動した場合、そのscheduled-date overrideはexplicit intentとして保護し、後からRoutine scheduleを変更してもその移動済みOccurrenceを自動削除しない。
- 明示移動したOccurrenceと新scheduleから発生するOccurrenceが同じ日に重なっても、自動dedupe / mergeしない。必要ならUIで重複予定を通知する。
- Routine由来Taskをその日だけ削除する操作は、そのOccurrenceのSkipとして扱い、RoutineDefinitionや他日のOccurrenceを削除しない。同じDayを再表示してもそのOccurrenceを勝手に再生成しない。

### Stop / resume / delete

- Routineは停止できる。停止日以降はnew schedule Occurrenceを発生させず、RoutineDefinition自体は保持する。
- 停止済みRoutineは明示的な再開日から再開でき、停止期間を後から自動backfillしない。
- Routine削除は今後の発生ruleを無効化する操作とし、RoutineDefinitionはhistorical relationを保てるsoft-delete / archived相当を基本とする。
- Routine削除後、過去・実行済み・running・明示移動済み、およびpersistentなday-specific stateを持つmaterialized Occurrenceはhistorical / explicit user stateとして保持できる。未materializedなProjected future Occurrenceは消える。
- Routine削除や停止によってExecution historyを破壊しない。

Routine materializationのexact DB schema、projection query caching、field override representation、schedule versioning、Routine statistics / streakは後続設計とする。Calendar View自体の具体UX / implementationはこのDecisionでは要求しない。

## D-035 — Effective workday / holiday calendar semantics
Status: Approved

Routine等で「営業日」「休日」を判定できるよう、civil weekday / public holiday factと、ユーザー固有のeffective day classificationを分離する。

- base classificationは、月〜金を営業日、土日を休日とし、日本の公的祝日は曜日にかかわらず休日とする。
- ユーザーは任意の日付を`指定休日`として登録できる。通常なら営業日の平日でも、代休、会社休日、有給、個人休日等としてeffective休日にできる。
- ユーザーは土日・公的祝日・指定休日を含む任意の日付を`営業日扱い`へoverrideできる。休日出勤等を表現する。
- ユーザー指定には`日付`と任意の自由入力`理由`を持たせる。理由は固定categoryへ限定しない。
- 同一日付についてユーザーの`指定休日`と`営業日扱い`を同時に成立させない。設定は排他的なday overrideとして扱う。
- public holidayであるというcalendar factはeffective営業日overrideで失わない。したがって「祝日Routine」と「営業日Routine」の双方に該当する日を表現できる。
- effective workday / holiday classificationを使う機能は、user override適用後の最終判定をauthorityとする。

日本の祝日データをどのprovider / library / update mechanismから取得するか、将来locale / country calendarを拡張するか、祝日法変更へのversioningは後続Architecture / Product設計とする。

## D-036 — Initial Routine recurrence patterns
Status: Approved

Routineのinitial recurrence UX / Domainは、少なくとも以下のpatternを扱えるようにする。

- **毎日**: 開始日以降の毎civil date。
- **日ごと**: 開始日をanchorとして`N` calendar daysごと。営業日判定は挟まない。
- **営業日**: D-035のeffective classificationが営業日の日すべて。
- **休日**: D-035のeffective classificationが休日の日すべて。
- **祝日**: 日本のpublic holiday factを持つ日。effective営業日override後も祝日属性自体で判定する。
- **毎週**: 1つ以上のcalendar weekdayを選択し、毎週その曜日に発生する。祝日 / effective休日であることだけを理由に除外しない。
- **週ごと**: `N`週ごと + 1つ以上のweekday。開始日を含む月曜始まりのweekをanchorとし、開始日より前のcandidateは発生させない。
- **毎月指定日**: 毎月1つ以上のday-of-monthを指定する。存在しない日付はその月では発生させず、月末へ丸めない。
- **月ごと**: `N`か月ごと + day-of-month。開始日を含む月をanchorとし、開始日前candidateは発生させない。存在しない日付はskipする。
- **毎月第N曜日**: 第1〜第5または最終 + weekday。第5等が存在しない月はskipする。
- **月末**: civil monthの最終日。曜日 / holiday classificationで移動しない。
- **月末営業日**: civil month末から後方へ探索し、D-035のeffective classificationで最後の営業日を選ぶ。

Routineは開始日を持つ。終了条件のinitial scopeは`終了なし`または`日付まで`とし、終了日はinclusiveとする。`N回完了まで`等のcount-based終了条件はinitial scopeへ含めない。

Routine stop / resume / deleteとOccurrence overrideはD-034に従う。recurrence ruleのtimezone resolution、DST、祝日data update、非常に長いprojection rangeのperformanceは後続設計とする。

## D-037 — Day-task move, duplicate, and delete semantics
Status: Approved

Day UI上のTask / Entryに対するmove、duplicate、deleteは、historical factを破壊しない範囲で以下のsemanticsとする。

### Move to another Day

- 別Dayへの通常移動対象は未実行Entryとする。running / completed / interrupted historical rowは通常の日付移動対象にしない。
- 前日、翌日、任意日付への移動を許容し、過去Dayへの未実行Entry移動も禁止しない。
- 移動先ではSectionを`Sectionなし`、開始予定時間を未設定へclearする。Task名、Project、Mode、見積、day-specific Task Note等の内容は維持する。
- RoutineOccurrence由来Entryを移動する場合、RoutineDefinitionとのrelationとorigin Occurrence dayを維持したままscheduled Dayだけを明示overrideする。Routine全体のschedule変更とは扱わない。

### Duplicate

- duplicateは新しいTask / Entry identityを作り、元Entryの直下をinitial insertion pointとする。
- Task名、Project、Mode、Section、見積、開始予定時間、day-specific Task Noteを複製できる。
- actual開始・終了、Execution、実績、completed / interrupted状態、開始見込等のderived / historical stateは複製しない。複製先は未実行とする。
- Routine由来TaskをduplicateしてもRoutine relationは複製しない。複製先は通常Taskとし、必要なら別途Routine化する。
- 元Routine Taskと複製通常Taskを両方実行した場合、両方のactual historyを保持するが、Routine単位の将来集計では元RoutineOccurrenceに紐づく実績だけをそのRoutineの実績として扱う。

### Delete / remove from Day

- 未実行Entryは通常delete可能とする。
- running Entryも、ユーザーが「開始したが実際にはやめてTask自体をDayから消す」explicit操作としてdelete可能とする。この場合current active Executionを通常のvalid actual / Review集計から除外してactive stateを解消し、Entryをnormal Day projectionから除外する。
- running deleteでもD-016に反してhistorical factを参照不能にするhard deleteは行わない。開始後に削除されたことを表現できるcancelled / removed historical representationを保持する方向とする。
- completed / interrupted historical rowは通常delete不可とする。
- Routine由来の未実行 / running Taskをその日だけdeleteする場合はD-034のOccurrence Skip semanticsを併用し、RoutineDefinition自体は削除しない。
- bulk deleteは同じeligibilityを適用する。running Entryを含む場合は確認UIでその旨を明示する。

exact archive / tombstone schema、cancelled Execution outcome名、deleted EntryをReview / audit UIへどの程度露出するか、retentionは後続設計とする。

## D-038 — Versioned Section configuration and staged Day-planning persistence foundation
Status: Approved

D-030のtime-ranged Section semanticsとhistorical stabilityを実装するpersistence foundationでは、stable Section identity、Section configuration version、established TaskChuteDayごとのhistorical Section contextを分離して扱う。

- Section identityは長期のstable identityとして維持し、mutableなSection名・時間帯をidentityそのものへ埋め込まない。
- Section名・時間帯等のcurrent configurationはversioned configurationとして扱い、既にestablishされたTaskChuteDayのSection contextを後の設定変更でretroactiveに書き換えない。
- TaskChuteDayで利用したSection contextは、そのDayで再現に必要なSection identity / 表示名 / logical range等をhistorical contextとして保持できる構造とする。exact table名、column名、index、snapshotとreferenceの細部はこの責務分離を壊さない範囲でimplementation detailとする。
- 通常のSection設定変更は、既にSection contextが成立しているcurrent TaskChuteDayを途中で再構成せず、原則として**次のTaskChuteDayから**有効にする。
- migration / onboardingでvalid Section configurationがまだ一度も成立しておらず、current TaskChuteDayへnormal historical contextを確定できていない初回設定では、ユーザーが明示したinitial configurationをcurrent TaskChuteDayへ適用してよい。一度establishしたDay contextは以後固定する。
- migration前のlegacy historyにauthoritativeなSection time rangeが存在しない場合、既存のSection名や`sort_order`等から過去時間帯を推測しない。保持できるSection identity / name contextは保持し、時間帯はunknownとして扱う。
- `Sectionなし`はD-030のplacement未決定を表すため、normal timed Sectionを表すsentinel rowを作らず、physical persistenceでもSection relationの**absence / nullable placement**として表現する方向を採用する。exact nullable column / context relationはreferential integrityを維持する範囲でimplementation detailとする。
- Section configuration version / Day context導入時点からhistorical context preservationを行い、将来rename / boundary edit / deleteを実装するときに過去Section semanticsを後付けで推測し直す構造を前提としない。

Dogfood Dayの次のimplementationはsmall vertical sliceを維持し、以下の順序をApprovedする。

1. **B1 — Section time foundation + `Sectionなし` + Entry見積**
   - versioned Section configuration foundation
   - TaskChuteDayごとのhistorical Section context foundation
   - Section time range表示
   - Section未設定Entryのplacement
   - `Sectionなし` EntryをStartした時刻のcurrent Sectionへ配置してからStart
   - D-026のEntry-scoped見積
2. **B2 — planned start + derived Section placement / order**
   - D-031のplanned-start authority
   - planned-startによるSection auto-move
   - planned-startなし / あり / 同時刻tie-breakを含むcanonical order
3. **B3 — Section settings lifecycle**
   - rename / boundary edit / add / delete / absorption
   - config versionのeffective timing UX
   - archive / historical presentation

B1へplanned startまで同時投入せず、Section configuration / nullable placement / Start placement / estimateを先にdogfood可能にする。

D-026のEntry見積はB1 persistenceで`estimate_seconds INTEGER NULL`として保存する。`NULL`を見積なし、positive integerを秒単位durationとし、blank / user input `0`はrequest fingerprint生成前に`NULL`へnormalizeする。negative valueは禁止し、persisted/API canonical stateで`0`を見積なしの別表現として保持しない。SQLite / JSON / JavaScriptの安全な整数範囲によるtechnical validationは行うが、根拠のないProduct-visible上限を設けない。

D-031のplanned-start physical representation、manual tie-break persistence、planned-start mutationのexact command / retry contractはD-039で確定する。

Section logical boundaryをactual instantへ解決するときはTaskChuteDay boundaryと同じTemporal-compatibleな`compatible` disambiguationを利用する。`day.start + logical minutes`ではなく、logical dateから対応するlocal civil date + wall-clock timeをcanonical timezoneで個別に解決し、established Day contextへactual intervalを保存する。Section delete/archive retentionのexact physical model、icon / accent persistence、legacy unknown contextのUI presentation detailは引き続きOpenとする。

## D-039 — B2 planned-start persistence and mutation contract
Status: Approved

D-031でApprovedしたplanned-start authorityをB2で実装するため、Entry persistence、canonical ordering、mutation / retry contractを次のとおり確定する。

### Persistence and validation

- Entryはnullableな`planned_start_minute INTEGER`を持つ。`NULL`は開始予定なし、non-nullはestablished TaskChuteDayの`logicalDate`を基準にしたextended wall-clock minuteを表す。Day開始を0とするoffsetではない。
- `planned_start_minute`はSection contextの`logical_start_minute` / `logical_end_minute`と同じ座標系を使い、valid rangeは`[establishment_boundary_minutes, establishment_boundary_minutes + 1440)`とする。
- 05:00 boundaryでは、05:00は`300`、翌03:00は`27:00` = `1620`、翌05:00は`29:00` = `1740`である。`1740`はDay end boundaryなのでplanned startとしてはexclusiveである。
- `planned_start_minute`はactual timestampではない。`24:00`以降を含むextended wall-clock timeを表現でき、既存Entryはmigration時に`NULL`とする。
- non-null値はintegerであり、上記valid range内かつauthoritative time rangeを持つexactly one timed Sectionの`[logical_start_minute, logical_end_minute)`へ属さなければならない。legacy time-range unknown contextからSectionや時刻を推測せず、根拠のないProduct-visible最大値も設けない。
- `Sectionなし`のEntryとnon-null `planned_start_minute`は同時に成立しない。
- manual / stable tie-break authorityには既存の`entries.position`を再利用し、planned-start専用の新しいtie-break columnは追加しない。

### Canonical placement and ordering

同一real Section内のplanned Entryは、次の順をcanonical orderとする。

1. 開始予定なし（`planned_start_minute IS NULL`）を`position`順で先に置く。
2. 開始予定ありを`planned_start_minute`昇順で置く。
3. 同じ開始予定minute内は`position`をmanual tie-breakとして使う。

running / completed等のhistorical rowとそのcanonical slotは後から書き換えず、既存のhistorical protectionを維持する。

開始予定を設定・変更すると、そのlogical minuteを含むexactly one Sectionをestablished Day contextの`[start, end)`から解決し、境界時刻は次Sectionへ配置する。Section placementとcanonical orderを同じmutationで確定し、`placement_revision`をexactly once incrementする。

開始予定を`NULL`へclearした場合は現在Sectionを維持し、そのSectionの開始予定なしcohortへmanual authorityに従って配置し直し、`placement_revision`をexactly once incrementする。Sectionなし + `NULL`はvalidである。

Section dropdown、Section間move等でSectionを明示変更した場合は開始予定をclearし、Sectionから時刻を推測しない。既存のMoveEntry command内でclearとplacement changeをatomicに行い、`placement_revision`はcommand全体でexactly onceだけincrementする。

manual Reorderは開始予定なしcohort内、または同じnon-null minute cohort内だけ許可する。開始予定なしと開始予定ありの間、異なるminute間、historical boundaryを越えるReorderはrejectする。既存ReorderEntriesをこのvalidationへ拡張できる限り、新しいReorder commandは追加しない。

### SetEntryPlannedStart command

B2は次のlogical request shapeを持つ`SetEntryPlannedStart` commandを利用する。

- `operation_id`
- `entry_id`
- `taskchute_day_id`
- `planned_start_minute`: integerまたは`null`
- `expected_placement_revision`

owner identityはClient requestから受け取らず、authenticated Server principalから解決する。

- same operation identity + same semantic requestは確定済みresultをreplayする。
- same operation identityをdifferent semantic requestへ再利用した場合はrejectする。
- stale `expected_placement_revision`はpartial effectなしでconflictとする。
- planned-start value、Section placement、manual position / canonical order consistency、`placement_revision`のexactly one increment、operation resultをatomicに確定する。
- retryでrevisionを二重incrementしたりorderを二重変更したりしない。unexpected infrastructure ambiguityはsafe retry / canonical Query reconciliation余地を残す。

### Lifecycle and UI boundary

- Startにplanned-startのnot-before制約は設けず、開始予定より早い明示Startを許可する。
- B1のSectionなし Startによるactual current Section配置は`planned_start_minute IS NULL`のEntryだけへ適用する。
- Web B2 UIはcurrent Dayのplanned Entryだけに開始予定編集を提供し、blankを開始予定なしとして扱い、extended-time notationを表示・入力できるようにする。
- 設定時はSection auto-placementとcanonical orderを反映し、clear時はSectionを維持する。explicit Section move後は開始予定表示もclearし、許可されないcohort間Reorder controlは提供しない。
- running / completed Entryにはplanned-start編集を提供しない。

本DecisionはB2 implementation contractをApprovedにするが、runtime実装・migration・verificationの完了を意味しない。B2は実装とevidenceが揃うまで`NOT_IMPLEMENTED`とする。

## D-040 — Minimal Routine R1 daily dogfood slice
Status: Approved

D-015 / D-027 / D-034 / D-036のRoutine target semanticsを、最初にdogfood可能なdaily-only sliceとして実装するため、以下をR1 contractとして確定する。これはD-036のbroader recurrence patternを狭めず、R1以外のpatternは後続sliceとする。

### Daily schedule and conversion

- R1 recurrenceは毎日のみとし、conversionを行うcurrent logical TaskChuteDayをinclusive start logical dateとする。
- end conditionは終了なし、またはinclusive end logical dateとする。count-based endはR1 scope外とする。
- current-DayのplannedかつRoutine由来でないEntryをRoutine化できる。
- conversionは既存Task / current-Day Entry identity、TaskChuteDay、Section placementまたは`Sectionなし`、見積、開始予定を維持し、todayのTask / Entryをduplicateしない。
- conversion時のSection、見積、開始予定をRoutineDefinitionのinitial defaultsとしてsnapshotし、current DayをoriginとするRoutineOccurrenceを1件materializeして既存Entryへ関連付ける。
- conversionはD-020のlogical operation identity / retry / atomicityに従う。

### Minimal persistence

- R1 APP migrationはstable owner-scoped `RoutineDefinition` / `RoutineOccurrence`とnullableなEntryからOccurrenceへのrelationを追加する。
- RoutineDefinitionはstable Taskを参照し、daily recurrence、start logical date、nullable inclusive end logical date、nullable default Section / estimate / planned startを保持する。
- RoutineOccurrenceはRoutineDefinitionとorigin TaskChuteDayを参照し、同じRoutineDefinition + origin TaskChuteDayのduplicateを許さない。
- RoutineOccurrenceは長期modelで`0..* Entries`を持てるため、Entry relationに将来のcontinuation共有を妨げるuniquenessを置かない。
- migration前のEntryはRoutine relation `NULL`のまま保持し、既存identity / content / history / operation / B1-B3 stateを変更しない。
- 新しいRoutineDefinition / RoutineOccurrence identityはD-022のUUIDv7 opaque identityに従い、ID timestampをProduct ordering authorityにしない。

### Current-Day lazy materialization

- current-Day queryはfinal canonical projectionを返す前に、そのlogical dateへ適用されるactive daily Routineをensureする。
- current Dayがinclusive schedule range内で、Occurrenceが未materializeなら、originをtarget TaskChuteDayとするOccurrenceをexactly one作成し、同じstable Taskを参照するinitial planned Entryをexactly one作成する。既存Occurrenceは再利用する。
- future Dayをunboundedに事前生成せず、repeated / concurrent loadはduplicate Occurrence / Entryを作らないowner-scoped convergenceを要求する。
- one ensureで1件以上のRoutine Entryを作成した場合、target Dayの`placement_revision`をatomicにexactly once増やす。0件なら増やさず、Entry件数ごとには増やさない。partial occurrence / entry / revisionを残さない。

### Defaults and canonical placement

- default planned startがnon-nullならtarget established Dayのlogical rangeで検証し、D-031 / D-039に従ってauthoritative Sectionをderiveする。`Sectionなし + non-null planned start`を作らない。
- default planned startがnullなら、default stable Sectionがtarget Day contextに存在する場合だけ利用し、存在しなければ`Sectionなし`へfallbackする。削除済みSectionを推測・復活させない。
- default estimate / planned startをnew Entryへcopyする。
- generated Entryは既存B2 canonical cohortへ参加し、既存manual memberの後へstable appendする。同じensure内の複数Routineはstable RoutineDefinition dataによるdeterministic orderを使い、UUID timestampをProduct ordering authorityにしない。

### Routine end and minimal Web UX

- `Routineを終了`はcurrent logical Dayより後のgenerationを無効化し、already-materialized current / past Occurrence、Entry、Execution historyを保持する。RoutineDefinitionをhard deleteせず、historyをrewriteしない。
- end mutationはD-020のretry / atomicityに従う。temporary stop / resume、gap backfill、schedule editはR1 scope外とする。
- eligible Entryへ`Routine化` actionを提供し、終了なしまたはinclusive end dateを選択できる。
- Routine-derived Entryはsmall Routine indicatorと`Routineを終了`へのaccessを持ち、成功後とreload後にcanonical relationを表示する。
- pending / deterministic rejection / ambiguityは既存async mutation conventionに従い、retained ambiguous operationをunrelated actionへ再利用しない。

R1はnon-daily recurrence、holiday calendar、future-range projection UI、schedule editing、field override UX、Skip、Day move、temporary stop/resume、Documents、Interrupt、statistics、native/offline clientを実装しない。これらの既存Approved target semanticsとOpen Questionは維持する。本DecisionはR1 implementation contractをApprovedにするが、runtime実装・migration・verification完了を意味しない。

## D-041 — Non-materializing Day navigation and mutation-time future Day establishment
Status: Approved

### Read navigation does not establish a future Day

- arbitraryな未来logical TaskChuteDayへのnavigation / viewはread operationであり、それだけではpersistent TaskChuteDay、timezone / DayBoundary context、Section configuration / historical contextを作成・freezeしない。
- future Dayのrepeated load、previous / next navigation、calendar picker navigationはnon-materializingであり、future TaskChuteDayをunboundedにpre-generateしない。
- 未来日を見るだけではRoutineOccurrenceまたはRoutine-derived Entryを作成しない。

### Non-established planning preview

- 未establishの未来logical dateをDay UIへ表示するため、non-persistent / non-established planning projectionを返してよい。
- previewのinterval / Section情報は、その時点でDayをestablishした場合に適用されるconfigurationからderiveする。
- previewはhistorical authorityではなく、既にfreeze済みのcontextとして保存・表示しない。establishment前に設定が変われば、後のpreviewがnew effective configurationを反映してよい。

### First successful future-Day mutation establishes atomically

- 未来logical dateのcanonical stateを必要とする最初のsuccessful day-specific mutationは、owner-scoped TaskChuteDayをexactly one establishする。
- establishmentはD-017 / D-038に従い、その時点でeffectiveなtimezone / DayBoundary / Section contextをfreezeする。
- Day establishmentとtriggering mutationは一つのlogical atomic outcomeとする。successはestablished Dayとmutation effectの両方を残し、validation rejection、stale conflict、deterministic failureはnewly established Dayだけをside effectとして残さない。
- retry / concurrencyはone owner-scoped TaskChuteDay / context / mutation effectへ収束し、duplicateを作らない。
- establish後のDay contextはhistorical authorityであり、後のtimezone / boundary / Section settings変更でretroactiveにrewriteしない。

### Routine and execution boundary

- D-040 Minimal Routine R1はcurrent-Day lazy materializationを維持し、Day Navigation v0.1はvirtual future Routine previewを導入しない。
- manual planningで既にestablishされた未来Dayが後にcurrent Dayになった場合、D-040 current-Day ensureはそのestablished Day contextを利用し、existing exactly-once / convergence ruleを維持する。
- broader projected future Routine preview / materializationは後続Routine sliceとする。
- Day Navigation v0.1のview / planning capabilityは、Start / Completeをnon-current Dayへ拡張するDecisionではない。

本DecisionはD-017でOpenだったfuture Dayのread-vs-establishment timingを解決する。historical stability、D-038 Section configuration version semantics、D-040 R1 schedule semantics、D-034 broader projected Routine behavior、timezone travel UX、per-Day boundary override、work profile semanticsは変更しない。exact endpoint / DTO / SQLは別のMaterial Decisionを必要としない限りimplementation detailとする。

## D-042 — Non-established past Day is an empty read-only historical gap
Status: Approved

### Historical non-fabrication

- 過去logical dateにhistorically establishedされたTaskChuteDayが存在しない場合、viewのためにTaskChuteDayをcreate / materializeしない。
- current settingsから過去の`[start, end)` interval、timezone / DayBoundary context、Section historical contextをsynthesize / persistしない。
- その過去日へRoutineOccurrence / Routine-derived Entry、Task / Entry、planning stateをbackfillせず、当時の計画を推測しない。
- UIはnormal established Dayのempty stateではなく、empty / record-none past Dayとして表現する。

### Read-only boundary

- Day Navigation v0.1ではnon-established past Dayをread-onlyとし、Add Task、Section placement、estimate / planned-start edit、reorder、Start / Complete、Routine conversion等のplanning / execution mutationを提供しない。
- direct mutation pathへ到達しても、unestablished past Dayをnew planning historyとして作成せずrejectし、DBを変更しない。
- navigation away、reload、repeated readはno-writeを維持する。

### Established past Day and Decision boundaries

- past logical dateが既にhistorically establishedされている場合、そのcanonical Day / frozen context / historyを表示する。
- D-042はestablished past Dayのexisting historical semanticsを再定義せず、Day Navigation v0.1へnew past editing capabilityを導入しない。
- D-017 historical stabilityとD-038 established Section historical contextを維持し、D-040 current-Day lazy Routine materializationをpast unestablished dateへretroactiveに実行しない。
- D-041はfuture unestablished Day、D-042はpast unestablished Dayを扱い、current TaskChuteDay behaviorは変更しない。
- D-037のbroader Day move targetをDay Navigation v0.1へ実装するものではない。unestablished past Dayへのhistorical correction / backfill capabilityは別のexplicit Product Decisionを必要とする。

travel / timezone-change UX、per-Day boundary override、work profile / work shift、broader future Routine projection、established past Dayのnew editing semanticsはOpenのまま維持する。

## D-043 — Section placement and planned start are fully synchronized
Status: Approved

未実行Entryのeditable planning stateでは、real Section placementと開始予定を独立にずらせる値として扱わず、同じplanning intentの同期した表現として扱う。

### Planned start determines Section

- 開始予定を設定・変更した場合、そのextended wall-clock minuteを含むexactly one real Sectionを、established TaskChuteDay contextの`[logical_start_minute, logical_end_minute)`からderiveする。
- Section境界minuteはD-030の`[start, end)`に従って後続Sectionへ属する。`24:00`以降を含むextended-time coordinateとD-039のvalid rangeは変更しない。

### Explicit Section determines planned start

- Section dropdown、Section間move等でreal Sectionを明示選択した場合、そのSectionへ移動し、開始予定を選択Sectionの`logical_start_minute`とexactly同じ値へ設定する。
- 変更前に別の開始予定があった場合も、選択Sectionの開始minuteで置き換える。Section選択後に古い開始予定を保持したり、開始予定を`NULL`へclearしたままreal Sectionへ置いたりしない。

### Clear and Sectionなし are synchronized

- 開始予定を直接clearした場合、`planned_start_minute`を`NULL`にし、Section placementもabsenceである`Sectionなし`へ移す。
- `Sectionなし`を明示選択した場合も、Section placementをabsenceにし、`planned_start_minute`を`NULL`へclearする。
- `Sectionなし`はtimed Sectionのsentinelではなく、D-038でApprovedしたplacement relationのabsenceである。

したがって、通常のuser-editableなplanned stateでは次のinvariantを維持する。

- real Sectionに属するEntryはnon-null開始予定を持ち、そのminuteは当該Sectionのrange内にある。
- `Sectionなし`のEntryは開始予定が`NULL`である。
- non-null開始予定を持つEntryは、そのminuteからderiveされたreal Sectionに属する。
- explicit real Section selectionは、そのSection開始minuteを開始予定として持つ。

Section / planned-start value、canonical placement / order、manual tie-break consistency、`placement_revision`のexactly once increment、operation resultは一つのlogical atomic outcomeとして確定する。stale revision、same-operation replay / misuse、unexpected infrastructure ambiguityはD-020 / D-039のsafe retry / reconciliation boundaryを維持し、partial同期状態を残さない。

### Routine and lifecycle boundary

- Routine由来Entryにも通常Entryと同じSection / planned-start synchronization ruleを適用する。
- D-034の`今回だけ / Routineへ反映` choice UX、occurrence override persistence、RoutineDefinition defaultへのpropagation semanticsは本Decisionでは確定しない。どのscopeを更新するかが別途決まった後、そのscope内のSection / planned-start pairに本Decisionのinvariantを適用する。
- running / completed / interrupted等のhistorical row、既存のhistorical context、non-current Day execution restrictionは変更しない。本Decisionは、既存Decisionが編集を許可するplanned Entryのplanning mutationに適用する。

本DecisionはD-031の「開始予定clear時に現在Sectionを維持する」および「explicit Section変更時に開始予定をclearし、Sectionから時刻を設定しない」というclausesをsupersedeする。また、そのclausesをB2 command contractへ具体化したD-039のclear / explicit Section move behaviorと、D-040の「default planned startが`NULL`ならavailable default Sectionを使う」というRoutine materialization behaviorも同じ同期範囲でsupersedeする。D-031 / D-039 / D-040の記録と既存B2 / R1 verification evidenceはhistorical implementation recordとして保持し、黙って書き換えない。

本DecisionはProduct / Domain semanticsをApprovedにするが、current runtimeの変更、migration、verification完了を意味しない。current runtimeはD-039の旧clear / move behaviorを実装したままであり、D-043 synchronizationは実装と新しいevidenceが揃うまで`NOT_IMPLEMENTED`とする。現時点ではmigrationを前提とせず、実装調査でschema / compatibility変更が必要と判明した場合は別途Material reviewへ戻す。

## D-044 — Routine R2A current-Day field override and default propagation
Status: Approved

D-034のfield-level occurrence overrideと`今回だけ / Routineへ反映`を最初に実装するR2A sliceとして、current logical TaskChuteDayのplanned Routine-derived Entryだけを対象にする。

### Editable units and lifecycle boundary

- `Section + 開始予定`をD-043に従う一つの同期unitとして編集できる。
- 見積は独立した一つのunitとして編集できる。
- scope choiceはunitごとに行い、Entry全体へ一括適用しない。同じOccurrenceでSection-planを`今回だけ`、見積を`ルーティンに反映`とすることもできる。
- Task名、Project、Mode、Note、future / past DayのRoutine編集、running / completed / interrupted Entry、future Routine preview、schedule editing、Skip、temporary stop / resume、broader recurrence editingはR2A first sliceへ含めない。
- D-041 / D-042のnon-current Day boundaryとD-040 current-Day lazy materializationを維持する。

### Candidate and explicit scope choice

- userが対象unitを編集すると、まずlocal candidateを表示し、この時点ではServerへ書き込まない。
- persistence前に`今回だけ`または`ルーティンに反映`を明示選択する。どちらもpreselectしない。
- scope選択前のcancel / Escape / dismissはcandidateを破棄し、Server canonical valueへ戻してno-writeとする。
- silent Routine write-backを行わない。

### `今回だけ`

- `今回だけ`は対象unitのpersistent occurrence overrideを作成または置換し、reload / restart後も維持する。
- Section-plan overrideはSectionだけ、またはplanned startだけに分割せず、D-043の同期pairとして保持する。
- estimateの明示`NULL`は「このOccurrenceには見積なし」、Section-planの`Sectionなし + planned start NULL`は「このOccurrenceにはplacement / planned startなし」という有効なoverride値である。
- overrideなしとexplicit `NULL` overrideはDomain上区別する。exact physical representationは本Decisionで確定しない。
- 後のRoutine default変更は、そのunitにexplicit overrideを持つOccurrenceを上書きしない。

### `ルーティンに反映`

- current occurrenceは編集値を保持し、対応するRoutineDefinition defaultを更新する。
- current occurrenceに同unitのoverrideが存在した場合、success後はそのoverrideをclearし、current occurrenceは更新後defaultを継承する状態へ戻る。
- already-materializedなcurrent / futureのplanned occurrenceのうち、同unitにoverrideがないものへnew defaultを反映する。
- explicit overrideを持つOccurrence、past、running、completed、interrupted、その他historically protectedなstateはretroactiveに書き換えない。
- unmaterialized future occurrenceは後にmaterializeされる時点でnew defaultを利用する。default propagationだけを理由にfuture TaskChuteDay / RoutineOccurrenceをmaterializeしない。
- Section-planのcurrent value、Routine default、propagated effective valueはすべてD-043のpair invariantを満たす。

### Return to current Routine default

- overrideを持つunitのediting contextでは、`ルーティンの設定に戻す`相当のexplicit actionを提供できる。
- resetは対象unitのOccurrence overrideをclearし、override作成時のhistorical defaultではなく、mutation時点のcurrent RoutineDefinition defaultを適用する。
- resetはRoutineDefinitionを変更せず、`今回だけ / ルーティンに反映`を再選択させない。
- Sectionとplanned startは一つのpairとして同時にresetする。

normal Day Tableはeffective valueを表示し、overrideであることだけを示すpermanent badge / status chromeをR2A first sliceの必須要件としない。override stateはediting contextでreset action等に必要な範囲だけ示してよい。

R2A occurrence overrideを永続化するAPP DB migrationはApprovedとする。ただし、exact column / table、override-present表現、default revision、command名 / request / result、operation command string、index、SQL propagation algorithmはimplementation designであり、本DecisionではApproved physical contractにしない。broader compatibility / destructive behaviorがD-045を越えて必要になった場合は、実装前にMaterial reviewへ戻す。

## D-045 — D-043 legacy editable-state normalization
Status: Approved

D-039 / D-040 runtimeで成立し得るlegacy `real Section + planned start NULL`を、D-043のeditable planning invariantへ移行する際のnormalizationを次のとおり定める。

### Planned editable state

- editable planned recordまたはRoutine defaultがreal Sectionを持ちplanned startが`NULL`の場合、real Sectionを維持し、planned startをそのSectionのauthoritativeな`logical_start_minute`へ設定する。
- ordinary planned Entryでは、established TaskChuteDayに保存されたhistorical Section contextをauthorityとする。
- Routine defaultでは、intended Sectionのauthoritative origin / establishment contextを安全かつ一意に解決できる場合だけ、そのSection startを利用する。
- Section名、sort order、current settings、別Dayのcontext等から時刻を推測しない。
- authoritative Section startを一意に解決できない場合、値を捏造せず、Sectionを黙って外さず、partial normalizationを行わない。migration / transitionをno-partial-effectで停止し、incompatible legacy stateとしてexplicit reviewへ戻す。
- legacy `Sectionなし + planned start NULL`はD-043と整合するため変更しない。

### Historical protection and design boundary

- running / completed / interrupted等のhistorically protected rowを、新しいeditable invariantへ見かけ上揃えるためにretroactiveに書き換えない。
- prior runtime behaviorとverification evidenceはhistorical recordとして維持する。
- 本DecisionはnormalizationのProduct-visible resultとauthority / failure boundaryを確定する。exact migration SQL、physical constraint、batching、diagnostic representationはimplementation designとして別途reviewする。
