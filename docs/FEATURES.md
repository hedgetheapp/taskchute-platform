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
| Section | In design | user-global stable persistence / bootstrapは実装。rename等を含むSection lifecycleは未実装 |
| Today / DayBoard ordering | Implemented | explicit Entry order + ReorderEntries + placement revision conflict protectionを実装 |
| Start / Complete lifecycle | Implemented | planned -> running -> completed、retry safety、active Execution max 1、no implicit interruptを実装 |
| Next Entry projection | Implemented | explicit order上のplanned Entryからlifecycle-aware Nextを算出。Next以外のplanned EntryもStart可能 |
| Historical fact foundation | In design | TaskChuteDay interval context + Execution factは実装。exact metadata snapshot / Review historical semanticsは未決 |
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
| RoutineOccurrence Document | In design | optional日別Document。必要時のみ作成 |
| Markdown comments | Planned | images対応を含む |
| Image attachments | In design | shared Attachment capability。binary storageは未決 |
| Routine foundation | In design | RoutineDefinition -> RoutineOccurrence -> Entry Approved |
| Routine generation / streak | Planned | exact rule / achievement semanticsは未決 |
| Review | Planned | historical factsからのprojection |
| Calendar | Planned | Domain / historyからのprojection |
| Timeline | Planned | planned / actual viewのprojection |
| Place | In design | planned meaningful destination foundation Approved |
| Execution Location | In design | optional Start / Complete LocationSnapshot foundation Approved |
| Map | Planned | Place / Location / Project historyからのprojection |
| Continuous location tracking | Planned | Separate future opt-in capability。initial Location scope外 |
| Obsidian integration | Planned | optional client |
| Legacy Vault importer | Planned | exact migration contractは未決 |
