# Features

この文書のStatusはFeature development statusを示す。

Verificationの正本は`docs/TEST_MATRIX.md`であり、`Implemented`等のFeature statusだけを理由に`Verified`と判断しない。

Status values: Planned / In design / Implemented / Verified

| Feature | Status | Notes |
|---|---|---|
| Server canonical task state | In design | Target direction Approved |
| Core Domain foundations | In design | D-015 Approved。runtime未実装 |
| Task / Entry identity | In design | 分離・stable identity Approved。initial runtime IDはUUIDv7 (D-022) |
| TaskChuteDay | In design | D-017 / D-022 Approved。explicit timezone/boundary bootstrap、continuous interval、compatible DST semantics |
| Project | In design | D-013 First slice contract Approved |
| Section | In design | user-global stable entity / Entry ordering foundation Approved (D-015, D-022) |
| Today / DayBoard ordering | In design | Entry explicit order。D-013 Approved |
| Start / Complete lifecycle | In design | planned -> running -> completed、retry safety、active Execution max 1 Approved |
| Next Entry projection | In design | hard lockではない。D-013 Approved |
| Historical fact foundation | In design | D-016 / D-022 Approved。TaskChuteDay interval context保存、exact metadata snapshotは未決 |
| Web app | In design | React + Vite SPA、primary / universal client |
| Async Web mutation | In design | full-page reload不要。D-013 / D-020 Approved |
| Web browser reload recovery | In design | D-013 Approved |
| Cloudflare Workers API | In design | D-020 Approved。runtime未実装 |
| Cloudflare D1 application persistence | In design | D-020 / D-022 Approved。APP baseline / AUTH_DB split確定、exact SQL / migrationは実装時review |
| D1 concurrency / atomicity spike | Verified | D1-SPIKE-01〜08 current-harness local + temporary remote PASS |
| Application authentication | In design | Better Auth + no public signup、operator bootstrap、rolling 7日session、separate AUTH_DB / APP_DB (D-021, D-022) |
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
