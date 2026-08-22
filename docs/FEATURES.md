# Features

この文書のStatusはFeature development statusを示す。

Verificationの正本は`docs/TEST_MATRIX.md`であり、`Implemented`等のFeature statusだけを理由に`Verified`と判断しない。

Status values: Planned / In design / Implemented / Verified

| Feature | Status | Notes |
|---|---|---|
| Server canonical task state | Implemented | bootstrap sliceでcurrent TaskChuteDay / Project / Task / Entry authorityをServerへ実装。First vertical slice全体は未完了 |
| Core Domain foundations | In design | D-015 Approved。bootstrap scopeのTask / Entry / Project / Section / TaskChuteDayは実装、Execution / lifecycle等は未実装 |
| Task / Entry identity | Implemented | separate stable UUIDv7 identityをruntimeへ実装。ID timestampはordering authorityにしない |
| TaskChuteDay | Implemented | explicit timezone/boundary bootstrap、materialized interval/context、compatible DST semanticsをruntimeへ実装 |
| Project | Implemented | CreateProject + optional Task project relationをbootstrap sliceで実装 |
| Section | In design | user-global stable persistence / bootstrapは実装。rename等を含むSection lifecycleは未実装 |
| Today / DayBoard ordering | In design | explicit Entry position表示は実装。Reorder commandは未実装 |
| Start / Complete lifecycle | In design | planned -> running -> completed、retry safety、active Execution max 1 Approved。runtime未実装 |
| Next Entry projection | In design | current planned Entry projectionは実装。lifecycle-aware behavior / non-Next Startは次increment |
| Historical fact foundation | In design | materialized TaskChuteDay interval context保存は実装。Execution / exact metadata snapshotは未実装・未決 |
| First runtime bootstrap slice | Implemented | auth、current TaskChuteDay、CreateProject、AddTaskToDay、DayBoard / reload recoveryをPR #3でmerge |
| Web app | In design | React + Vite SPA runtimeは実装。First vertical slice UI全体は未完了 |
| Async Web mutation | In design | Project / Task+Entryはfull-page reload不要。Reorder / Start / Completeは未実装 |
| Web browser reload recovery | Implemented | bootstrap scopeでServer canonical stateから再取得・復元を実装 |
| Cloudflare Workers API | Implemented | auth / bootstrap / current day / Project / Task+Entry APIをruntimeへ実装 |
| Cloudflare D1 application persistence | Implemented | bootstrap foundationのAUTH_DB / APP_DB migrationとowner-scoped persistenceを実装。Execution schemaは次increment |
| D1 concurrency / atomicity spike | Verified | D1-SPIKE-01〜08 current-harness local + temporary remote PASS |
| Application authentication | Implemented | Better Auth 1.7.1、public signup disabled、operator bootstrap、rolling 7日session、separate AUTH_DB / APP_DBを実装 |
| Android app | Planned | native first-class。Kotlin + Jetpack Compose第一候補 |
| Android offline capability | In design | capability自体はApproved。操作範囲 / sync方式は未決 |
| Android Widget | Planned | Android architectureを再利用 |
| Wear OS / Pixel Watch | Planned | companion target。Compose for Wear OS第一候補、exact scope未決 |
| iOS native app | Planned | Future / low priority。Swift + SwiftUI第一候補。まずWeb clientから利用 |
| Notes/Documents | In design | Markdown-native + shared Document foundation |
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
