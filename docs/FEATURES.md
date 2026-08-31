# Features

この文書のStatusはFeature development statusを示す。

Verificationの正本は`docs/TEST_MATRIX.md`であり、`Implemented`等のFeature statusだけを理由に`Verified`と判断しない。

Status values: Planned / In design / Implemented / Verified

| Feature | Status | Notes |
|---|---|---|
| Server canonical task state | Implemented | current TaskChuteDay / Project / Task / Entry / Execution authorityをServerへ実装。First Server + Web vertical sliceをPR #3 + #5で統合 |
| Core Domain foundations | In design | D-015 Approved。Task / Entry / Project / Section / TaskChuteDay / Execution / first lifecycleは実装。Routine / richer history / advanced Day planningは設計中 |
| Task / Entry identity | Implemented | separate stable UUIDv7 identityをruntimeへ実装。ID timestampはordering authorityにしない |
| TaskChuteDay | Implemented | explicit timezone/boundary bootstrap、materialized interval/context、compatible DST semanticsをruntimeへ実装 |
| Day Navigation v0.1 | Implemented | visual interaction targetは`docs/DESIGN.md`、semanticsはD-041 / D-042でcanonical化済み。commit `6f183c28242a1cd30211ea8e0c4f1e1dc23329bb`で未来日non-materializing preview / first successful mutation atomic establishment、custom calendar / Today / keyboard navigation、past unestablished record-none / read-only / no-backfill、established past frozen history表示、auth境界でのselected Day resetを実装し、evidence docs commit `be52305ed98e2dbd213b99dcdddb34602cf69091`までGitHub `main`へIntegrated。source review / local automated / signed-in general browser / persistent nonprod general verificationはPASS。remote logout→relogin、cross-owner、config-change / failure / retry / concurrency等の未実施subcaseはlocal-only / NOT_RUNを維持し、productionはNOT_RUN、Released NO。future Routine preview、past historical correction、non-current Day executionは含まない |
| Project | Implemented | CreateProject + optional Task project relationを実装。Day TableのProject列targetは`docs/DESIGN.md`でcanonical化。Project dropdown quick create、検索、設定画面でのuser-defined orderはbroader UI scopeとして設計継続 |
| Section | In design | user-global stable persistenceとD-038 B1 foundationに加え、B3のrename / boundary edit / add / delete・absorption、immutable configuration version/head lifecycle、next-Day effective Web settingsをcommit `2481c4916ca2f694f07d6808a4482bea28c79a80`で実装。B3 source / automated / real local migration / browser / persistent nonprodはPASS、remote raw console exact countはNOT_VERIFIED、productionはNOT_RUN、Released NO。icon / accent、summary、Day-boundary lifecycle等のbroader scopeは未実装 |
| Section Day summary | In design | `docs/DESIGN.md`でcontinuous table上のSection summary row、完了/総数、合計見積、空Section、Sectionなしgroup、日別collapse、Section直下Task追加をtargetとしてcanonical化。Execution実績によるcapacity barを含むbroader projectionは設計継続 |
| Mode | In design | D-026 Approved。ユーザー定義で意味を固定せず、1 Entryに0..1 Mode。Day UI quick create / 検索、設定画面でuser-defined orderを設計。persistence / management UIは未実装 |
| Project / Mode selector search | In design | Project / Mode selectorはdirect文字一致、正規化、かな/カタカナ統一、romaji→かな検索を扱い、例として`tasuku`から`タスクシュート開発`を候補化する方向。漢字読みindexのexact方式は実装設計で詰める |
| Entry planning metadata | In design | D-026 + D-031 + D-039 + D-043 Approved。B1のEntry見積はPR #13で、B2 planned startは`planned_start_minute INTEGER NULL`としてcommit `316ad0d88f0f88d1445991904da587b1e0987dab`でmainへImplemented / Integrated済み。D-043でreal Sectionとrange内non-null開始予定、`Sectionなし`と`NULL`のfull synchronizationをApprovedしたがruntimeはNOT_IMPLEMENTED。B2 source review / automated / real local migration / signed-in browser / persistent nonprod verificationはhistorical runtime evidenceとしてPASS、production verificationはNOT_RUN、Released NO。broader planning metadata scopeは設計継続 |
| Planned-start ordering | Implemented | D-031 + D-039のderived canonical order、既存`position`によるmanual tie-break、SetEntryPlannedStart atomicity / retry、Section move時clear、Reorder cohort制約をcommit `316ad0d88f0f88d1445991904da587b1e0987dab`でmainへ実装。D-043はexplicit real Section選択でSection開始minuteを設定し、planned-start clearで`Sectionなし`へ移す同期targetへ旧clear/move semanticsをsupersedeしたがruntime / verificationはNOT_IMPLEMENTED。既存B2 source review / automated / real local browser / persistent nonprod verificationはPASS、production verificationはNOT_RUN、Released NO |
| Start forecast | In design | D-032 Approved。開始予定とは独立したprojection。current progress / Day order / estimateを使いSectionをまたいで連続計算。past / completed / running自身 / Sectionなしは表示対象外 |
| Today / DayBoard ordering | Implemented | explicit Entry order + placement revision conflict protectionに加え、D-031 / D-039のNULL-first、planned minute昇順、same-minute manual tie-break、cohort-aware ReorderをB2で実装。local + persistent nonprod verification PASS |
| Day Table interaction | In design | UI-1 commit `da4a8c8316d60d942dc73fbd53bb90d15df5517b`をmainへIntegrated。current visible orderは`実行 / Task / Project / Section / Routine / 見積 / 開始予定`で、独立した状態/並び替え列を除去し、Execution Control、Task-cell pointer ↑↓、`Shift+↑/↓`、独立Routine列、見積/開始予定、toolbar/header cleanupを実装。source review / Web 65 / 65 PASS / typecheck / build / diff-check / real local browser / APP integrityはPASS。persistent nonprod / production UI-1はNOT_RUN、Released NO。Bulk slot runtime、sticky/fixed-left final structure、Mode、Note、開始見込、full開始/終了/実績、horizontal-scroll final structure、column customization/preferences、Search/Filter、Section collapse、D&D/full context interactionはUI-2以後 |
| Day task move / duplicate / delete | In design | D-037 Approved。未実行Taskの日付移動、fresh duplicate、未実行 / running delete、completed / interrupted historical row保護を設計。running deleteはcancelled historical representationを残す |
| Start / Complete lifecycle | Implemented | current runtimeはplanned -> running -> completed、retry safety、active Execution max 1、no implicit interruptを実装 |
| Manual Execution correction | In design | D-033 Approved。actual開始/終了の直接入力・訂正、実績derived、valid Execution interval overlap禁止、Section capacity / Review再計算。current runtimeは未実装 |
| Interrupt / continuation | In design | D-028 Approved target。explicit Interruptでcurrent Executionをinterrupted終了し、割り込みTaskをStart、元Task continuationを直下生成。current runtimeは未実装で通常Startをreject |
| Quick Interrupt | In design | D-028 Approved。実行中Taskから`（割込）`を即生成・Startし履歴へ残す。発生時刻のcurrent Sectionへ配置し、nested Quick Interruptも許容。exact persistence / command contractは未決 |
| Revert current Start | In design | D-029 Approved。「未実行に戻す」は現在activeなExecution / 今回のStartだけを取消対象とし、以前のvalid actualや割り込みhistoryは維持。current runtimeは未実装 |
| Floating Runner | In design | current running TaskをMain content下部付近のcompact floating UIで継続表示。whole logical work chain progress、subtle estimate overrun、Quick Interrupt / revert / Complete、minimizeはhistorical design referenceに残るbroader UI scopeで、current `docs/DESIGN.md`では未canonical化 |
| Next Entry projection | Implemented | explicit order上のplanned Entryからlifecycle-aware Nextを算出。Next以外のplanned EntryもStart可能 |
| Historical fact foundation | In design | TaskChuteDay interval + Execution factは実装。D-028〜D-033 / D-037でinterrupt、Start取消、Section historical semantics、manual time correction、running delete時のnon-destructive cancellationをApproved。D-038でSection version/config/day-context責務分離をApproved。Section以外のsnapshot / cancelled outcome等は未決 |
| Day planning persistence B1 | Implemented | PR #13でmainへmerge・Integrated済み。local automated + source review + real local APP migration + signed-in browser + persistent nonprod migration/runtime/browser verificationはPASS。production verificationはNOT_RUN、Released NO |
| Day planning persistence B2 | Implemented | `0004_dogfood_day_b2.sql`、planned-start persistence / command、derived placement/order、Web editorをcommit `316ad0d88f0f88d1445991904da587b1e0987dab`でmainへIntegrated。source review、Worker 87、Web 49、isolated migration 25 checks、real local migration / browser、persistent nonprod migration / runtime / authenticated browserはPASS。productionはNOT_RUN、Released NO |
| Day planning persistence B3 | Implemented | `0005_dogfood_day_b3.sql`、Section settings query/update、immutable version append / expected-head switch、current-Day freeze / next-Day effective semantics、Web settings panelをcommit `2481c4916ca2f694f07d6808a4482bea28c79a80`でmainへIntegrated。source review、Worker 91、focused B3 3、Web 55、migration 32 checks、real local migration / browser、persistent nonprod migration / preservation / deploy / authenticated browserはPASS。next-Day real browserはNOT_RUN、remote raw console exact countはNOT_VERIFIED、productionはNOT_RUN、Released NO |
| First runtime bootstrap slice | Implemented | auth、current TaskChuteDay、CreateProject、AddTaskToDay、DayBoard / reload recoveryをPR #3でmerge |
| First Server + Web vertical slice | Implemented | PR #3 + #5でD-013 scopeを実装・main統合。local + persistent nonprod evidenceはcurrent TEST_MATRIXを参照 |
| Web app | In design | React + Vite SPAとFirst vertical slice UIは実装。broader Product UI / responsive / routing / offline等は設計継続 |
| Settings navigation v0.1 | Implemented | commit `51242b08e015817108010839cd5234959da2fed5`でDesktop Left Navigationの`今日` / `設定`、Settingsの`Section` / `Project`、owner-scoped Project list / createを実装し、DayBoardのtemporary Section settings / standalone Project createを撤去してmainへIntegrated。Section draft navigation保持 / explicit Cancel、Sidebar初期幅240px、UI-1 7列 / 独立Routine列を維持。source review、automated、signed-in local browser、persistent nonprod authenticated browser / integrityはPASS。production `NOT_RUN`、Released `NO`。broader Project管理、Mode Settings、Sidebar resize / preferenceは未実装 |
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
| Task Primary Document | In design | logical 1 Primary Document。Routine共通の長期noteにも利用 |
| RoutineOccurrence Document | In design | optional日別Document。interrupt continuationで複数Entryになっても同じOccurrence文脈を共有可能 |
| Day-specific task context | In design | D-027 / D-034 Approved。Routine occurrenceではTask名 / Project / Mode / Section / 見積 / 開始予定 / day-specific Note等を項目単位override可能。past contextはretroactiveに変更しない |
| Task Note pane | In design | Day Tableの独立Note列から、能動的に開いたTaskへ固定したright paneを表示。Task名 + Note editorを中心にし、J/K row focusへ自動追従しない |
| Markdown comments | Planned | images対応を含む |
| Image attachments | In design | shared Attachment capability。binary storageは未決 |
| Routine foundation | In design | D-015 / D-027 / D-034 Approved。RoutineDefinition -> projected/materialized RoutineOccurrence -> Entry。無期限future taskの大量事前生成を前提にしない |
| Minimal Routine R1 | Implemented | D-040 Approved。runtime commit `f9324e866deb74277d2fd83c5945f2df4b2b95da`とnonprod evidence docs commit `c63a98f22ab685370d3e20f1f15f480fab951ae8`をPR #14 merge commit `ebaff6d156813ba78b4c5c28818f9f55db9fd970`でmainへIntegrated。identity-preserving Routine化、daily lazy materialization、defaults、revision exactly once、inclusive end / Routine終了、minimal Web UXを実装。UI-1でbadge/editor/end state/actionを独立Routine列へ移動。Routine由来EntryのSection / 開始予定 / 見積はD-034 choice UXまでserver / Webともread-only。D-043はRoutine由来Entryにもfull syncを要求し、null planned start + real default SectionのR1 behaviorをsupersedeしたがruntimeは未実装。既存source review / automated local / real local `0006` migration・preservation / signed-in general browser、persistent nonprod `0006` migration・preservation / deploy / authenticated general browserはhistorical runtime evidenceとしてPASS。real-browser controlled inclusive end-dateとdeployed non-null inclusive-date subcheckはbrowser automation event mismatchにより`TOOLING_BLOCKED / NOT_VERIFIED`。production `NOT_RUN`、Released NO |
| Routine defaults / day override | In design | D-034 + D-044 + D-045 Approved。R2A first sliceはcurrent-Day planned Routine-derived Entryの`Section + 開始予定`同期unitと独立見積unitを対象に、no-write candidate後のunit別`今回だけ / ルーティンに反映`、explicit NULLを含むpersistent occurrence override、current defaultへのreset、non-overridden planned occurrenceへのno-future-materialization propagationを定義。legacy real Section + NULLはauthoritative Section startへnormalizeし、解決不能ならfail safely。APP migration requirementはApprovedだがphysical schema / exact commandは未確定。runtime / migration / verificationはNOT_IMPLEMENTED |
| Routine recurrence | In design | D-035 / D-036 Approved。毎日、N日、営業日、休日、祝日、weekly / N-week、monthly指定日 / N-month、第N曜日、月末、月末営業日をinitial patternとする |
| Workday / holiday calendar | In design | D-035 Approved。日本の土日祝base + user指定休日 + 営業日扱いoverride。各overrideに任意の自由入力理由を持てる |
| Routine stop / resume / delete | In design | D-034 Approved。停止期間はbackfillせず、Routine deleteはfuture generation ruleを無効化するsoft-delete / archived direction。history / explicit materialized stateを破壊しない |
| Routine generation / materialization | In design | D-034 Approved。必要範囲をprojectし、day-specific edit / move / Skip / execution等でmaterialize。exact persistence / query cachingは未決 |
| Routine streak / achievement | Planned | exact achievement / delayed completion / continuation semanticsは未決 |
| Review | Planned | historical factsからのprojection。D-028〜D-033 / D-037のvalid actual / correction / cancellation semanticsに従う |
| Keyboard-first Day interaction | In design | `docs/DESIGN.md`で`J/K`・上下、`Shift+↑/↓`、`S`、Tab traversal、IME safety、Section summary focusをDay Table targetとしてcanonical化。`U` / `I` / `D` / `X` / `F` / `Ctrl+C` / `Shift+F10` / Day移動等のbroader mappingは未canonical化 |
| Hit-a-Hint | In design | `F`でvisible actionable elementへhintを表示。mode中は通常single-key shortcutを停止し、入力はhint sequence専用 |
| Bulk Selection | In design | `docs/DESIGN.md`でfixed-width Bulk slotをDay Table targetとしてcanonical化。Bulk capability / actions自体とX toggle、D bulk delete、Esc clear等のbroader mappingは未実装・未canonical化 |
| Calendar | Planned | Domain / historyからのprojection。D-034のProjected RoutineOccurrence foundationを将来利用可能。具体Calendar UX / implementationは後続 |
| Timeline | Planned | planned / actual viewのprojection |
| Place | In design | planned meaningful destination foundation Approved |
| Execution Location | In design | optional Start / Complete LocationSnapshot foundation Approved |
| Map | Planned | Place / Location / Project historyからのprojection |
| Continuous location tracking | Planned | Separate future opt-in capability。initial Location scope外 |
| Obsidian integration | Planned | optional client |
| Legacy Vault importer | Planned | exact migration contractは未決 |
