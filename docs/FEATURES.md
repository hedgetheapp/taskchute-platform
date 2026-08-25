# Features

この文書のStatusはFeature development statusを示す。

Verificationの正本は`docs/TEST_MATRIX.md`であり、`Implemented`等のFeature statusだけを理由に`Verified`と判断しない。

Status values: Planned / In design / Implemented / Verified

| Feature | Status | Notes |
|---|---|---|
| Server canonical task state | Implemented | current TaskChuteDay / Project / Task / Entry / Execution authorityをServerへ実装。First Server + Web vertical sliceをPR #3 + #5で統合 |
| Core Domain foundations | In design | D-015 Approved。Task / Entry / Project / Section / TaskChuteDay / Execution / first lifecycleは実装。Routine / richer history等は未実装 |
| Task / Entry identity | Implemented | separate stable UUIDv7 identityをruntimeへ実装。ID timestampはordering authorityにしない |
| TaskChuteDay | Implemented | explicit timezone/boundary bootstrap、materialized interval/context、compatible DST semanticsをruntimeへ実装 |
| Project | Implemented | CreateProject + optional Task project relationを実装 |
| Section | In design | user-global stable persistence / bootstrapは実装。D-030で開始時間 / 終了時間、non-overlap、gap許容、current Section resolutionをApproved。time-range persistence / settings UI / resolutionは未実装 |
| Mode | In design | D-026 Approved。ユーザー定義で意味を固定せず、1 Entryに0..1 Mode。persistence / management UIは未実装 |
| Entry planning metadata | In design | D-026 Approved。見積時間・開始予定時間はその日のEntryごとのplanned value。開始予定はユーザー明示入力、開始見込はderived projection |
| Today / DayBoard ordering | Implemented | explicit Entry order + ReorderEntries + placement revision conflict protectionを実装 |
| Day Table interaction | In design | configurable columns、column resize / auto-fit / reorder / hide / pin、row focus、実行済みhistory visibility等をDESIGNで設計中 |
| Start / Complete lifecycle | Implemented | current runtimeはplanned -> running -> completed、retry safety、active Execution max 1、no implicit interruptを実装 |
| Interrupt / continuation | In design | D-028 Approved target。explicit Interruptでcurrent Executionをinterrupted終了し、割り込みTaskをStart、元Task continuationを直下生成。Quick Interruptも同じexplicit interruption semanticsを利用。current runtimeは未実装で通常Startをreject |
| Quick Interrupt | In design | D-028 Approved。実行中Taskから`（割込）`のその日のTaskを即時生成・Startして履歴へ残す。発生時刻のcurrent Sectionへ配置し、nested Quick Interruptも許容。exact persistence / command contractは未決 |
| Revert current Start | In design | D-029 Approved。「未実行に戻す」は現在activeなExecution / 今回のStartだけを取消対象とし、以前のvalid actualや割り込みhistoryは維持。current runtimeは未実装 |
| Floating Runner | In design | current running TaskをMain content下部付近のcompact floating UIで継続表示。progress、inline title edit、Day Table navigation、Quick Interrupt / revert / Complete、minimize behaviorをDESIGNで定義 |
| Next Entry projection | Implemented | explicit order上のplanned Entryからlifecycle-aware Nextを算出。Next以外のplanned EntryもStart可能 |
| Historical fact foundation | In design | TaskChuteDay interval context + Execution factは実装。D-028でinterrupt outcome / continuation Review baseline、D-029でcurrent Start取消時に過去actualを消さないsemanticsをApproved。exact metadata snapshot / cancelled representation等は未決 |
| First runtime bootstrap slice | Implemented | auth、current TaskChuteDay、CreateProject、AddTaskToDay、DayBoard / reload recoveryをPR #3でmerge |
| First Server + Web vertical slice | Implemented | PR #3 + #5でD-013 scopeを実装・main統合。local evidence 67 PASS、remote/deployed verificationはNOT_RUN |
| Web app | In design | React + Vite SPAとFirst vertical slice UIは実装。broader Product UI / responsive / routing / offline等は未決 |
| Web First vertical slice | Implemented | Project / Task+Entry / reorder / Start / Complete / Next / retry-conflict reconciliationをasync UIで実装 |
| Async Web mutation | Implemented | First vertical sliceのProject / Task+Entry / Reorder / Start / Completeをfull-page reloadなしで実行 |
| Web browser reload recovery | Implemented | Server canonical stateから再取得・復元。ambiguous mutationもcanonical refetchへreconcile |
| Cloudflare Workers API | Implemented | auth / bootstrap / current day / Project / Task+Entry / Reorder / Start / Complete APIを実装 |
| Cloudflare D1 application persistence | Implemented | AUTH_DB / APP_DB migrations、owner-scoped persistence、operations、executions、active Execution constraintを実装 |
| D1 concurrency / atomicity spike | Verified | D1-SPIKE-01〜08 current-harness local + temporary remote PASS |
| Application authentication | Implemented | Better Auth 1.7.1、public signup disabled、operator bootstrap、rolling 7日session、separate AUTH_DB / APP_DBを実装 |
| Android app | Planned | native first-class。Kotlin + Jetpack Compose第一候補 |
| Android offline capability | In design | capability自体はApproved。操作範囲 / sync方式は未決 |
| Android Widget | Planned | Android architectureを再利用 |
| Wear OS / Pixel Watch | Planned | companion target。Compose for Wear OS第一候補、exact scope未決 |
| iOS native app | Planned | Future / low priority。Swift + SwiftUI第一候補。まずWeb clientから利用 |
| Notes/Documents | In design | Markdown-native + shared Document foundation。standalone Document / general noteをfirst-class capabilityとして扱い、Task / Project等のDocumentと共通foundationを利用 |
| Standalone Document / general note | In design | Task / Project等に従属しない独立Noteを作成可能とするApproved direction。exact lifecycle / organization / search UXは未決 |
| Document links / backlinks | In design | Document同士をlinkし、backlinkから逆方向に辿れるcapability。exact syntax / rename semantics / indexing / Graph Viewは未決 |
| Project Primary Document | In design | logical 1 Primary Document。physical lazy creation可 |
| Task Primary Document | In design | logical 1 Primary Document。Routine共通noteにも利用 |
| RoutineOccurrence Document | In design | optional日別Document。interrupt continuationで複数Entryになっても同じOccurrence文脈を共有可能 |
| Day-specific task context | In design | D-027 Approved。Link / Comment / Note等はdefaultでその日の作業文脈に固有。title一致だけでcross-day共有しない。exact persistenceは未決 |
| Markdown comments | Planned | images対応を含む |
| Image attachments | In design | shared Attachment capability。binary storageは未決 |
| Routine foundation | In design | RoutineDefinition -> RoutineOccurrence -> Entry Approved。D-027でcross-day reuseの主要mechanismとして位置づけ |
| Routine defaults / day override | In design | Routineは見積・Mode・Link等のreusable defaultを供給でき、その日の文脈は個別変更可能。past contextをretroactiveに変更しない |
| Routine generation / streak | Planned | exact rule / achievement semanticsは未決 |
| Review | Planned | historical factsからのprojection。D-028によりinterrupt continuationの見積は当初見積を1回だけbaseline集計し、actualはvalid実行区間を合算。D-029で取り消したcurrent Executionは通常集計から除外 |
| Keyboard-first Day interaction | In design | 優先度高。row focusをfoundationとし、exact shortcut mapping / editing / navigation / execution bindingsは後続設計 |
| Calendar | Planned | Domain / historyからのprojection |
| Timeline | Planned | planned / actual viewのprojection |
| Place | In design | planned meaningful destination foundation Approved |
| Execution Location | In design | optional Start / Complete LocationSnapshot foundation Approved |
| Map | Planned | Place / Location / Project historyからのprojection |
| Continuous location tracking | Planned | Separate future opt-in capability。initial Location scope外 |
| Obsidian integration | Planned | optional client |
| Legacy Vault importer | Planned | exact migration contractは未決 |
