# Current

Date: 2026-09-03

## Status

### Day Table columns menu + customization + actual projection v0.1 — 2026-09-03

implementation commit `2bf40a0`（`Add Day Table columns menu`）と既存のcolumn customization / actual projection commitsはGitHub canonical `main`へIntegrated済み。default visible orderは`実行 | Task | Project | Section | Routine | 見積 | 開始予定 | 開始見込 | 開始 | 終了 | 実績`。Bulk / Execution / Taskはfixed UI slots、Project以後の9 data columnsはregistry-driven heading / draft / row alignment、header reorder、shared resize、double-click auto-fit、Columns menu hide/showの対象である。order / width / hiddenは`taskchute.web.day-columns.v2`へbrowser-localに保存し、Server / API / D1 / cross-device同期は行わない。

Routine columnはordinary current planned Entryをmuted SVG icon action、Routine-derived Entryをaccent non-button icon、running / completed / non-current / lockedをmuted non-interactive iconとして表示する。開始 / 終了 / 実績は`execution_summary`（first start、last ended、completed duration、active start）からのread-only projectionで、複数Executionを集計し、logical Dayのextended timeを表示する。manual correction / cancellation / history rewriteは追加していない。

local focused column / Webは`127 / 127 PASS`・`133 / 133 PASS`、typecheck、production build、`git diff --check`、source reviewは`PASS`。Worker / D1 / migration / dependencyはWeb-only impact analysisにより`NOT_REQUIRED`。persistent nonprodはexact `main@2bf40a0`を`taskchute-web-nonprod`へdeployし、Worker version `e6d9691b-c3e4-4334-9b06-96379bea5e9d`、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、AUTH `60085f8d-0c4e-4c15-98e9-3ce178398041`、APP `6ad7e35f-5d03-4be3-9b00-46cd713a51c3`、pending migration `0 / 0`を確認した。

authenticated nonprod browserではColumns menu、Project / Routine / actual columnsのhide/show、hide時のtable width縮小、custom Project width `150 → 220`のhide/show・reload保持、`すべて表示`、`初期状態に戻す`、normal / draft / fixed-slot alignmentを確認した。1920 / 1440 / 1280 / 720px responsiveではpopoverがviewport内、page overflowなし、720px Sidebar close / reopenも`PASS`。Routine iconとcompleted actual（開始 `10:04` / 終了 `10:04` / 実績 `0分`）はshow後も保持された。Browser Cuaのheader column D&Dは表示・orderとも変化しないno-opだったため`NOT_VERIFIED`とし、local D&D regressionをPASS evidenceとする。console `0 / 0`。APP / AUTH remote read-only `quick_check = ok`、FK violations `0`、read-only query `rows_written = 0`、root `200`、protected API `401`、disabled bootstrap POST `404`であり、layout preferenceはDBへ書き込んでいない。

classification: Day Table columns menu + customization + actual projection v0.1 `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / PERSISTENT_NONPROD_VERIFIED`、production feature verification `NOT_RUN`、Released `NO`。Mode / Note、fixed slot hide/reorder、Bulk Selection actions、Sidebar resize、Server / cross-device preference、actual manual correction、cross-Day / fuller context interactionはremaining boundaryである。

Routine R2B BoardはD-047 / D-048に基づきcommit `304e73f`（`Implement Routine R2B Board`）で`IMPLEMENTED / INTEGRATED`。Task 0..1 Routine constraint、typed schedule / pause interval / reversible suppression / Task metadata snapshot、independent Board order、Routine command/read model、Sidebar Routine Boardとinline editingを実装した。Source Review、focused R2B `7 / 7`、Worker / D1 `124 / 124`、Web `84 / 84`、migration regression `3 scenarios`、typecheck / build / `git diff --check`、real-local `0008` migration / preservation / signed-in representative browserは`PASS`。persistent nonprodでもprivate backup / isolated `0008` dry-run / preservation gate、remote `0008` migration、exact `main@0228573d67c75305c94a632d2d3d75999b14a19a` deploy、authenticated representative browser、APP/AUTH integrityを`PASS`し、Worker versionは`4257b1ff-1be1-416d-aed5-699c46c914f0`である。controlled browserによるinclusive end-date入力はReact event tooling boundaryにより`TOOLING_BLOCKED / NOT_VERIFIED`、historical title / Projectのpast-Day browser subcaseとproductionのdeep mutation verificationは`NOT_RUN`。D-049 initial production release gateはPASSし、Releasedは`YES`である。

First Server + Web vertical sliceは`IMPLEMENTED / INTEGRATED`。D-023 bootstrap lifecycle security incrementも`IMPLEMENTED / INTEGRATED / LOCAL_TESTED`。D-024 persistent non-production verification environmentは`APPROVED`かつremote verification済み。

PR #3でruntime bootstrap sliceを、PR #5でReorder / Start / Complete / Execution lifecycle incrementを`main`へmergeした。PR #6でPR #5 merge後のcanonical docsをcurrent implementation / evidenceへ整合し、PR #7でcurrent-state maintenanceをmergeした。PR #8でD-023 bootstrap lifecycle security incrementを、PR #10でD-024 persistent non-production environment configurationを`main`へmergeし、PR #11でそのmerge後current stateを整合した。persistent non-production remote runtime verificationはPASS。D-049 initial production release verificationもPASSし、個別featureのdeep production verificationとは境界を分けている。

その後、Day planning / Routine設計をcanonical docsへ進め、D-026〜D-037をApproved。2026-08-28にD-038をApprovedし、Section persistence foundationと次のDay dogfood implementation順を確定した。Dogfood Day v0.1-A UI shellとB1はPR #13で`main`へmerge済み。B1は`IMPLEMENTED / INTEGRATED`で、source review、local automated verification、real local APP DB migration、signed-in browser verification、persistent non-production migration / runtime / browser verificationはPASSした。B1 production verificationとreal Japanese IMEは`NOT_RUN`、Releasedは`NO`。D-039でApprovedしたB2 planned-start persistence / command contractはcommit `316ad0d88f0f88d1445991904da587b1e0987dab`で`main`へ`IMPLEMENTED / INTEGRATED`となり、source review、local automated verification、real local APP DB migration、signed-in browser verification、persistent non-production migration / runtime / authenticated browser verificationはPASSした。B2 production verificationは`NOT_RUN`、Releasedは`NO`。D-038 B3 Section settings lifecycleはcommit `2481c4916ca2f694f07d6808a4482bea28c79a80`で`main`へ`IMPLEMENTED / INTEGRATED`となり、source review、automated verification、real local APP DB `0005` migration、signed-in browser verification、persistent non-production APP `0005` migration / preservation / deployed runtime / authenticated browser verificationはPASSした。B3 production verificationは`NOT_RUN`、Releasedは`NO`。D-040 Minimal Routine R1 daily dogfood sliceはruntime commit `f9324e866deb74277d2fd83c5945f2df4b2b95da`とnonprod evidence docs commit `c63a98f22ab685370d3e20f1f15f480fab951ae8`をPR #14 merge commit `ebaff6d156813ba78b4c5c28818f9f55db9fd970`で`main`へ統合済み。source review、isolated migration / Worker-D1 / Web automated evidence、real local APP DB `0006` migration / preservation、signed-in real-browserのgeneral R1 flowは`PASS`。v6でserver-canonical reconciliation semanticsを変えず、transient pending statusによるDayBoard layout shiftを解消し、ChatGPT source review `PASS`、focused / full Web `65 / 65 PASS`、typecheck / build / `git diff --check` `PASS`を確認した。persistent nonprod APP `0006` migration / preservation、PR head deploy、authenticated general R1 browser flowは`PASS`で、deployed Worker versionは`be96301c-f131-47b4-bf78-11d4433716b1`。real-browser controlled inclusive end-dateとdeployed non-null inclusive-date subcheckはbrowser automation event mismatchにより`TOOLING_BLOCKED / NOT_VERIFIED`、productionは`NOT_RUN`、Releasedは`NO`。

Day Table UI-1はcommit `da4a8c8316d60d942dc73fbd53bb90d15df5517b`（`Realign Day Table UI`）でcurrent `main`へ`IMPLEMENTED / INTEGRATED`となった。独立した状態/並び替え列を除き、Routineを独立列へ移し、current visible orderを`実行 | Task | Project | Section | Routine | 見積 | 開始予定`へ整合した。source review、focused Web、full Web `65 / 65 PASS`、typecheck、production build、`git diff --check`、signed-in real local browser verification、APP integrityは`PASS`。browser console errors / warningsは`0 / 0`。UI-1 persistent nonprod / production verificationは`NOT_RUN`、Releasedは`NO`。

Day Table UI-2Aはimplementation commit `43789c990ed91febb2bb6036c1f3970dfe8f34a1`（`Implement Day Table UI-2A`）とverification / docs commit `b66d6ee2248935fd36d338ea2794762ee51b6515`でGitHub canonical `main`へ`IMPLEMENTED / INTEGRATED`。Day Table自身がhorizontal overflowを所有するfoundation、heading / Task / draftに置く非interactive reserved Bulk slot、実用幅でのBulk / Execution / Task fixed-left structure、狭幅でstickyを解除して全列へ到達できるCSS fallbackを実装した。named heading orderと既存Day interaction / Domain semanticsは変更していない。ChatGPT source review、Web `84 / 84 PASS`、typecheck、production build、`git diff --check`、signed-in real local browserのwide / medium / narrow verification、APP `quick_check` / FK / active Execution / UI-2A verification placement / Routine重複確認は`PASS`、console warnings / errorsは`0 / 0`。Worker / D1 / migrationはWeb-only impact analysisにより`NOT_RUN / NOT_REQUIRED`。persistent nonprod representative verificationは2026-09-02 exact `main@59fd1f97` / Worker `1cf68d11-b878-42f1-9a90-f9585d6f3d4d`で`PASS`（consolidated evidenceを参照）、productionは`NOT_RUN`、Releasedは`NO`。

Day Table UI-2Bはimplementation commit `3861b9839b55a1453b0e2f230f03728e8d85059b`（`Implement Day Table UI-2B`）でGitHub canonical `main`へ`IMPLEMENTED / INTEGRATED`。normal Sectionと`Sectionなし`のcollapse / expand、logical Dayごとのin-session collapse state、focused Taskの`S` Start / Completeを実装し、既存lifecycle command / canonical reconciliationを再利用した。Section collapse persistence v0.1はimplementation commit `b81ea533c27dbcf81e3baae865f361d0f40f66e3`でbrowser-localへ拡張し、logical Day + stable Section identity（`Sectionなし` sentinelを含む）でreload越しに復元する。malformed / incompatible / stale preferenceは安全に無視・整理し、API / Worker / D1 / migrationは変更していない。focused collapse `6 PASS`、full Web `115 / 115 PASS`、core `147 / 147 PASS`、Day Navigation focused `5 PASS`、typecheck、production build、`git diff --check`、signed-in nonprod browser、APP/AUTH integrityは`PASS`、console warnings / errorsは`0 / 0`。persistent nonprod Worker `2d4facea-cf0d-47b3-a247-053cd97b12ab`でcollapse / expand reload、Day isolation、`Sectionなし`、Add auto-expand、completed visibility、summary metrics、keyboard / ARIAを確認し、Domain aggregate deltaは`0`。productionは`NOT_RUN`、Releasedは`NO`。

Day Table UI-2Cはimplementation commit `95701371d6fe25be1a966789254944b3a1f41eca`（`Implement Day Table UI-2C`）でGitHub canonical `main`へ`IMPLEMENTED / INTEGRATED`（2026-09-01時点のhistorical scope）。Task cell内のdrag handleから、同じSectionかつ同じcanonical planned-start cohort内だけをbefore / after位置へ移すD&Dを実装し、既存`ReorderEntries` command / placement revision / retry / reconciliationを再利用した。当時はpointer `↑/↓`と`Shift+↑/↓`を代替interactionとして維持し、cross-Section D&Dは`NOT_IMPLEMENTED`だった。2026-09-03のcross-Section D&D v0.1とvisible pointer button撤去のcurrent evidenceは次段落および`TEST_MATRIX`専用sectionを正本とする。focused Web `4 PASS`、full Web `101 / 101 PASS`、typecheck、production build、`git diff --check`、signed-in real local browserのactual mouse D&D / reload / invalid-drop / regression / medium-width、APP integrityは`PASS`、fresh-tab console warnings / errorsは`0 / 0`。Worker / D1 / migrationはWeb-only impact analysisにより`NOT_RUN / NOT_REQUIRED`。persistent nonprod representative verificationは2026-09-02 exact `main@59fd1f97` / Worker `1cf68d11-b878-42f1-9a90-f9585d6f3d4d`で`PASS`（consolidated evidenceを参照）、productionは`NOT_RUN`、Releasedは`NO`。

Day Table cross-Section D&D v0.1はimplementation commit `89d4784fddca891421d3619def352ee1156f1c89`（`Add cross-Section drag and drop`）で`main`へ`IMPLEMENTED / INTEGRATED`。ordinary planned Entryの非interactive row surface / existing visual handleから、同一Dayの別のvisible Section summary（`Sectionなし`を含む）へappendするfirst sliceを実装した。expanded targetは末尾placeholder、collapsed targetはcueのみで自動展開せず、drag中rowは浮上表示する。成功時は既存`MoveEntry`を1回だけ使い、`taskchute_day_id` / `section_id` / `expected_placement_revision`を送り、全Dayのcanonical reconciliationとtarget focusを行う。same-Section `ReorderEntries`、`Shift+↑/↓`、既存D-043のSection / planned-start同期を維持し、visible `↑/↓` buttonsは撤去した。Routine-derived、running / completed、read-only / preview / locked stateはno-writeであり、新しいProduct / Domain / Architecture / Policy Decisionはない。

Desktop Day wide layout + Sidebar collapse v0.1はimplementation commit `74f7b24`（`Widen Desktop Day layout`）でGitHub canonical `main`へpush済み。Day-only `.day-shell`を`width: calc(100% - 32px); max-width: none`としてmain contentのavailable widthへ広げ、Day TableのTask trackを`minmax(280px, 1fr)`へ変更した。common `.shell`の`1120px` cap、Settings / Routine Board / Authのvisible width、`.day-surface`のhorizontal-scroll ownership、Bulk / Execution / Taskのsticky foundation、`max-width: 720px` fallbackは維持している。authenticated Sidebarはopen時約240px、closed時はgridを1列へ戻して空railを残さず、reopen controlをToday / Routine / Settingsで提供する。preferenceは`taskchute.web.sidebar.v1`の`{version:1,open:boolean}`としてbrowser-localに保持し、malformed / Storage failureはnavigationを壊さずopenへfallbackする。Sidebar resize、saved width、column customization、Server/API/DB/migrationはこのsliceに含まれない。

local focused Web `120 / 120`、full Web `126 / 126`、typecheck、production build、`git diff --check`は`PASS`。persistent nonprodはexact `main@74f7b24`を`taskchute-web-nonprod` / Worker `2886e754-6266-4eda-8260-76d7703f8f29`へdeployし、generated nonprod config / dry-run、AUTH / APP pending migration `0`、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、root `200`、protected API `401`、bootstrap `404`を確認した。authenticated browserでは1920 / 1440 / 1280 / 720pxのDay width、Task expansion、closed Sidebar解放、reload persistence、Today / Routine / Settings共有、calendar / collapse / draft、rightmost column reachability、table-owned scroll、narrow sticky fallbackを確認し、console warnings / errorsは`0 / 0`。APP / AUTH remote read-only `PRAGMA quick_check = ok`、FK violations `0`、rows written `0`。Browser Cuaのactual D&D gestureは表示・writeとも変化しないno-opだったため、新たなDomain mutation evidenceには使用せず、既存local D&D regressionとbrowser static alignmentを採用した。

local focused Web `116 / 116`、full Web `122 / 122`、Worker / D1 `147 / 147`、typecheck、production build、`git diff --check`は`PASS`。Worker / D1 / migrationは実装影響分析上`NOT_REQUIRED`だが、既存Worker suiteはregression確認のため実行した。persistent nonprodではexact `main@89d4784fddca891421d3619def352ee1156f1c89`をWorker `638a78b6-e842-45bb-975c-98e4b6b9e9ac`へdeployし、authenticated browserのexpanded / collapsed target D&D、reload、Sectionなし表示、console warnings / errors `0 / 0`を確認した。root `200`、unauthenticated protected API `401`、disabled bootstrap POST `404`。APP D1 read-only verificationはplacement revision `16`、`PRAGMA quick_check = ok`、FK violations `0`、対象DayのSectionなし planned `2`（planned start `NULL`） / Evening planned `1`、`MoveEntry` success `19` / domain rejection `1`、`ReorderEntries` success `13`。Wrangler log pathへのsandbox `EPERM` warningはあったが、build / deployはexit `0`。productionは`NOT_RUN`、Releasedは`NO`。

Start Forecast v0.1はimplementation commit `8939c4d6af95e2fd21b7d91e0e946bee29a6c1fb`（`Implement Start Forecast v0.1`）でGitHub canonical `main`へ`IMPLEMENTED / INTEGRATED`。D-032に従い、current Dayはprojection生成時刻を基準にactive Executionの見積残時間とtimed Section内planned Entryの見積をcanonical orderで累積し、future established DayはDay startを基準に算出する。completed / running自身、`Sectionなし`、past / record-noneは`—`とし、planned startをforecast barrierには使わない。shared focused `9 PASS`、Day Navigation `12 PASS`、Worker / D1 `133 / 133 PASS`、Web `103 / 103 PASS`、typecheck、production build、`git diff --check`、signed-in real-local browserのcurrent / future / past / reorder / lifecycle / responsive regression、APP integrityは`PASS`、fresh-tab console warnings / errorsは`0 / 0`。extended timeのformatはautomated `PASS`、real-browserは`NOT_RUN`。migration / new dependencyは`NOT_REQUIRED`、persistent nonprod representative verificationは2026-09-02 exact `main@59fd1f97` / Worker `1cf68d11-b878-42f1-9a90-f9585d6f3d4d`で`PASS`（consolidated evidenceを参照）、productionは`NOT_RUN`、Releasedは`NO`。

R-016 established future Day follow-up Addはimplementation commit `04254f60b1dfb25e66550b940b9df6b28fdf616f`（`Fix established future Day task addition`）でGitHub canonical `main`へ修正をIntegrated済み。未establish future Dayの最初のAddは従来どおりD-041のatomic establishmentを使い、既にestablish済みならowner-scoped canonical Dayを先に解決してcurrent placement revisionとfrozen historical Section contextを使う。focused Day Navigation `14 / 14 PASS`、focused Start Forecast `9 / 9 PASS`、Worker / D1 `135 / 135 PASS`、Web `103 / 103 PASS`、typecheck、production build、`git diff --check`、signed-in real-local browserの1件目 → 2件目 → 3件目 → reload / navigation復元とAPP integrityは`PASS`、console warnings / errorsは`0 / 0`。migration / dependency / Product semantics変更は`NOT_REQUIRED`、persistent nonprod representative verificationは2026-09-02 exact `main@59fd1f97` / Worker `1cf68d11-b878-42f1-9a90-f9585d6f3d4d`で`PASS`（consolidated evidenceを参照）、productionは`NOT_RUN`、Releasedは`NO`。

D-050 Duplicate first sliceはimplementation commits `1d68a74148da211bfae76b6f36b86cb18f23e7fc` / `47d998e37bd12fc591b43c3624324ad237f3ca46` / `3573aaafcfcda651bc850dae706f8dd5157efe65`でGitHub `main`へ`IMPLEMENTED / INTEGRATED`。APP `0009_duplicate_entry.sql` migration、Duplicate pendingのvisible / accessible feedback、ordinary / `Sectionなし` / Routine-derived / established-future planned EntryのDuplicate、reload、current-Day Start → Complete、established-past / record-none past read-only境界をpersistent nonprodで確認した。source review、local automated（Duplicate focused `11 / 11`、Worker / D1 `147 / 147`、Web `109 / 109`、migration regression `3 scenarios`）、typecheck / build / `git diff --check`、real-localおよびpersistent nonprod migration / preservation / authenticated browser / APP integrityは`PASS`。persistent nonprod Worker versionは`1dda19d4-5212-4d69-96a8-b6b2656de8bb`、APP finalはquick check `ok`、FK / orphan Entry / active Execution / duplicate active group `0`、AUTH users / accounts / sessions `1 / 1 / 2`。詳細retry / misuse / stale revision / concurrency / ambiguity / logical-past overlapはlocal automated evidence境界を維持し、productionは`NOT_RUN`、Releasedは`NO`。

Settings v0.1はimplementation commit `51242b08e015817108010839cd5234959da2fed5`（`Implement Settings v0.1 navigation`）でcurrent `main`へ`IMPLEMENTED / INTEGRATED`となった。Desktop Left Navigationの`今日` / `設定`、Settingsの`Section` / `Project`、owner-scoped Project list、Settings内Project作成を実装し、既存Section editorとProject作成をDayBoardのtemporary controlからSettingsへ移した。UI-1の7列と独立Routine列、Section configuration semantics、current-Day freezeは維持している。ChatGPT source review、focused Web `2 PASS`、full Web `67 PASS`、Worker / D1 `101 PASS`、typecheck、local / nonprod build、Wrangler nonprod dry-run、`git diff --check`、signed-in local browser、persistent nonprod authenticated browser / integrityは`PASS`。corrected nonprod Worker versionは`22578f99-6256-4027-a345-ce523c67d241`。Sidebar open / closed preferenceは後続Desktop Day wide layout v0.1で実装済み、Sidebar resize / saved widthは未実装。productionは`NOT_RUN`、Releasedは`NO`。

D-041 `Non-materializing Day navigation and mutation-time future Day establishment`はApproved。未来日をviewするだけではTaskChuteDay / historical context / RoutineOccurrence / Entryを作らず、non-persistent previewとして扱う。最初のsuccessful day-specific planning mutationでDay establishmentとmutation effectをatomicに確定し、失敗時はDayだけを残さない。establish後のcontextはhistorical authorityとしてfreezeする。Day Navigation v0.1 runtimeはimplementation commit `6f183c28242a1cd30211ea8e0c4f1e1dc23329bb`（`Implement Day Navigation v0.1`）でGitHub `main`へ`IMPLEMENTED / INTEGRATED`となった。

D-042 `Non-established past Day is an empty read-only historical gap`はApproved。未establishの過去日はrecord-none read-only projectionとして表示し、current settingsからhistorical interval / Section contextを捏造せず、Routine / Task / Entry / planning stateをbackfillしない。established past Dayはexisting frozen canonical contextを表示する。このruntime behaviorもDay Navigation v0.1 implementation commitに含まれる。

D-043 `Section placement and planned start are fully synchronized`はApproved。通常のeditable planned stateでは、開始予定の設定・変更から`[start, end)`でreal Sectionをderiveし、explicit real Section選択からSection開始minuteを設定する。開始予定clearと`Sectionなし`選択はいずれもSection absence + `NULL`へ同期する。D-031 / D-039の旧clear / explicit move clausesはこの範囲でsupersedeされ、implementation commit `7d3c0cb0881dfc11725af6ff45eabad69f86a22a`でordinary EntryとR2A選択scopeへ実装し、evidence docs commit `d1283eb6ef10c9a0997a36427a09b89042250f96`とともにGitHub canonical `main`へIntegrated済み。ChatGPT source review、local automated、real-local migration / signed-in browser evidenceは`PASS`である。

D-044でRoutine R2A first sliceのProduct / Domain / UX semanticsをApprovedした。current-Day planned Routine-derived Entryの`Section + 開始予定`同期unitと独立見積unitを対象に、no-write candidate、unit別のexplicit `今回だけ / ルーティンに反映`、persistent explicit-NULL occurrence override、current Routine defaultへのreset、eligible non-overridden planned occurrenceへのpropagation、future no-materialization、historical protectionを確定した。D-045でlegacy editable real Section + planned start NULLをauthoritative Section startへnormalizeし、解決不能時は推測・partial rewriteなしで停止する方針をApprovedした。D-046でtyped occurrence override columns、override presence、owner-scoped Section FK、Routine default revisionというphysical persistence directionをApprovedした。Routine R2Aは`IMPLEMENTED / INTEGRATED`。implementation commit `7d3c0cb0881dfc11725af6ff45eabad69f86a22a`とevidence docs commit `d1283eb6ef10c9a0997a36427a09b89042250f96`はGitHub canonical `main`へIntegrated済み。Source Review `PASS`、Worker / D1 `117 / 117 PASS`、Web `78 / 78 PASS`、migration regression `2 scenarios PASS`、typecheck / production build / `git diff --check` `PASS`、real-local `0007` migration / preservation / signed-in browser A〜M `PASS`。persistent nonprodではexact `main@8d1348e25df23518415cf9829aea6c4eb89e9f4c`からAPP `0007` migration / preservation、Worker deploy、authenticated browser A〜M、final APP/AUTH/runtime/security integrityを`PASS`し、Worker versionは`b18c5dab-6976-4564-815e-78dda6024b34`である。remote multi-Day propagationと詳細retry / misuse / concurrency / ambiguity / rollbackは`NOT_RUN`、browser exact network captureは`NOT_VERIFIED`、productionは`NOT_RUN`、Releasedは`NO`である。

Day Navigation v0.1は`IMPLEMENTED / INTEGRATED`。implementation commit `6f183c28242a1cd30211ea8e0c4f1e1dc23329bb`とlocal evidence docs commit `be52305ed98e2dbd213b99dcdddb34602cf69091`はGitHub `main`へpush済みである。ChatGPT source review、focused Day Navigation integration `12 PASS`、Worker / D1 `113 PASS`、Web `74 PASS`、focused auth-boundary Web `2 PASS`、migration regression `1 scenario / 46 data/schema checks PASS`、typecheck、build、`git diff --check`は`PASS`。signed-in local browserのgeneral Day Navigation flow、future preview / first Add、past read-only、UI-1 regression、console warnings / errors `0 / 0`も`PASS`。persistent nonprod general verificationはexact `main@164326d11829faf12659c513037a1e172c3875b7`をWorker version `022e57a5-088f-4d9f-8c3a-ae5b76c3df42`としてdeployし、future preview no-write / first establishment、navigation、non-current execution boundary、past record-none / established-past read-only、Settings / UI-1 / current-Day regression、APP/AUTH integrityを`PASS`した。remote logout → relogin、remote cross-owner、failure / retry / concurrency等の未実施subcaseは`NOT_RUN`またはlocal automated evidenceのまま維持する。productionは`NOT_RUN`、Releasedは`NO`である。

Settings v0.1 implementation commit:

`51242b08e015817108010839cd5234959da2fed5`

Relevant implementation commits:

- runtime bootstrap: `3b9fb8b78f6311b63e7a8a6ccf29ddf74415d3f6`
- lifecycle / ordering: `09b1526f7f09554bd937aa446737a979868b779b`
- bootstrap lifecycle security: `ed6927ce23722d0e756e91eee29b4c326ca1eeb6`
- persistent nonprod config: `6f079f238dd4efd2717c4911c8701a72fc2b0d72`
- Dogfood Day B1 planning foundation: `1c14eef4695c2de2ced65f43250544159e039485`
- Dogfood Day B2 planned-start planning: `316ad0d88f0f88d1445991904da587b1e0987dab`
- Dogfood Day B3 Section settings lifecycle: `2481c4916ca2f694f07d6808a4482bea28c79a80`
- Minimal Routine R1: `f9324e866deb74277d2fd83c5945f2df4b2b95da`（PR #14 merge commit `ebaff6d156813ba78b4c5c28818f9f55db9fd970`でmainへIntegrated）
- Day Table UI-1: `da4a8c8316d60d942dc73fbd53bb90d15df5517b`
- Day Table UI-2A: `43789c990ed91febb2bb6036c1f3970dfe8f34a1`（verification / docs commit `b66d6ee2248935fd36d338ea2794762ee51b6515`までGitHub canonical `main`へIntegrated）
- Day Table UI-2B: `3861b9839b55a1453b0e2f230f03728e8d85059b`
- Day Table UI-2C: `95701371d6fe25be1a966789254944b3a1f41eca`
- Day Table columns menu + customization + actual projection: `10584ba` → `6100d20` → `6316b0d` → `60eecdd` → `2bf40a0`
- Start Forecast v0.1: `8939c4d6af95e2fd21b7d91e0e946bee29a6c1fb`
- Settings v0.1 navigation: `51242b08e015817108010839cd5234959da2fed5`
- Day Navigation v0.1: `6f183c28242a1cd30211ea8e0c4f1e1dc23329bb`（evidence docs `be52305ed98e2dbd213b99dcdddb34602cf69091`までGitHub `main`へIntegrated）
- Routine R2A first slice: `7d3c0cb0881dfc11725af6ff45eabad69f86a22a`（evidence docs `d1283eb6ef10c9a0997a36427a09b89042250f96`とともにGitHub `main`へIntegrated）

Relevant merge commits:

- PR #3: `afcf1ef0e1ca36ee0ce962be288fef41331fd694`
- PR #5: `1b5917ad1caff6dd648856bf7a054fa43d040a65`
- PR #6 canonical docs alignment: `eeed503662c487a7691d7b82705079c89a3c8822`
- PR #7 current-state maintenance: `e26e3b167b8f79925d424275c68550c4e151a3fd`
- PR #8 bootstrap lifecycle security: `3d0d1cf64ddfcb17511bfd622713ed8f5473970d`
- PR #10 persistent nonprod environment configuration: `e969f45fd39e14d00e69632532897fb58011f9de`
- PR #11 current-state maintenance: `a1b342e0c07cffa1bbf38fbfd146e3912616d32a`
- PR #13 Dogfood Day v0.1-A + B1: `1609331ae32d3db36091ac0e4b0322c3757e3a9a`
- PR #14 Minimal Routine R1: `ebaff6d156813ba78b4c5c28818f9f55db9fd970`

D1 feasibility gateは引き続きPASS / Verified。current Product runtimeはFirst vertical slice scopeでImplemented + Integratedかつlocal automated evidence / implementation review / GitHub PR diff reviewがPASSしている。persistent non-production remote D1 Product runtime / deployed Worker verificationとD-049 initial production smokeもPASSし、initial release scopeでVerified / Releasedとする。個別featureのdeep production verificationは別evidence boundaryを維持する。

## Current source-of-truth state

- Project InstructionsはGovernance / Source of Truth / authority boundaryの正本。
- `AGENTS.md`と`docs/DEVELOPMENT_WORKFLOW.md`は具体的なAI / development workflowの入口。
- Product / Domain behaviorは`docs/SPEC.md`、Decision状態は`docs/DECISIONS.md`を正本とする。
- UI / visual / interaction targetは`docs/DESIGN.md`を正本とし、Product / Domain semanticsは`docs/SPEC.md` / `docs/DECISIONS.md`をownerとする。
- Verification requirement / evidenceは`docs/TEST_MATRIX.md`を正本とする。
- PR #3 runtime bootstrap sliceは`main`へIntegrated済み。
- PR #5 lifecycle / ordering incrementは`main`へIntegrated済み。
- PR #6でPR #5 merge後のcanonical docs整合は完了済み。
- PR #8でD-023 bootstrap lifecycle securityは`main`へIntegrated済み。
- D1 concurrency / atomicity feasibility gateはlocal + temporary remote spikeでPASS / Verified済み。
- Better Authはcurrent runtimeで`1.7.1`へexact pin済み。
- D-024により1つのpersistent Cloudflare non-production verification environmentをmaintainする方向はApproved済み。
- PR #10でpersistent non-production repository-side configは`main`へIntegrated済み。
- persistent non-production D1 / deployed Worker remote verificationは`PASS`。
- D-026〜D-037でEntry planning metadata、Section / planned-start / forecast、Routine、manual correction、Day move / duplicate / delete等のtarget semanticsはApproved済み。
- D-038でstable Section identity + versioned configuration + established TaskChuteDay context、legacy time-range unknown handling、`Sectionなし` physical absence、通常Section設定変更のnext-Day effective timing、およびB1→B2→B3 stagingはApproved済み。
- D-039でB2の`planned_start_minute INTEGER NULL`、既存`position`によるmanual tie-break、derived Section / canonical order、SetEntryPlannedStart / MoveEntry / Reorder / Startのatomicity・retry境界はApproved済み。
- D-040でdaily-only Minimal Routine R1のidentity-preserving conversion、minimal persistence、current-Day lazy materialization、revision exactly once、defaults、inclusive end / Routine終了、minimal Web UXはApproved済み。runtime commit `f9324e866deb74277d2fd83c5945f2df4b2b95da`とevidence docs commit `c63a98f22ab685370d3e20f1f15f480fab951ae8`はPR #14 merge commit `ebaff6d156813ba78b4c5c28818f9f55db9fd970`でcurrent `main`へImplemented / Integrated済み。source review、focused / full Web `65 / 65`、typecheck / build / diff-check、real local `0006` migration / preservation、signed-in general browser flowは`PASS`。persistent nonprod APP `0006` migration / preservation、Worker version `be96301c-f131-47b4-bf78-11d4433716b1` deploy、authenticated general browser flow、APP/AUTH integrity / security postureも`PASS`。real-browser controlled inclusive end-dateとdeployed non-null inclusive-date subcheckはautomation event mismatchにより`TOOLING_BLOCKED / NOT_VERIFIED`、production `NOT_RUN`、Released `NO`。
- D-041で未来Dayのnon-materializing read preview、first successful mutationによるatomic establishment、failure / retry / concurrency、historical freeze、D-040 current-Day Routine boundaryをApprovedした。Day Navigation v0.1 runtimeはcommit `6f183c28242a1cd30211ea8e0c4f1e1dc23329bb`でImplemented / Integrated / Source Reviewed / Local Tested。representative high-risk flowのpersistent nonprod general verificationは`PASS`、remote未実施の詳細境界は`docs/TEST_MATRIX.md`を参照する。productionは`NOT_RUN`、Releasedは`NO`。
- D-042で未establish past Dayのempty record-none / read-only / no-fabrication / no-backfillと、established past Dayのcanonical history表示をApprovedした。new past editing / historical correctionは別scopeとする。
- D-043でeditable planned EntryのSection / planned-start full synchronizationをApprovedした。D-031 / D-039の旧clear / explicit move semanticsはsupersedeされ、implementation commit `7d3c0cb0881dfc11725af6ff45eabad69f86a22a`でordinary / Routine selected-scope synchronizationを実装済み。D-044 / D-045 / D-046のR2A first-slice scope/UX/propagation、APP `0007` migration、legacy normalization、typed persistenceも同commitで実装し、evidence docs commit `d1283eb6ef10c9a0997a36427a09b89042250f96`までGitHub `main`へIntegrated済み。source review、local automated、real-local migration / browser、persistent nonprod migration / preservation / deploy / authenticated browserは`PASS`。remote multi-Day propagationと詳細reliability subcaseは`NOT_RUN`、productionは`NOT_RUN`、Releasedは`NO`。
- D-038 B1はPR #13でcurrent `main`へIntegrated済みで、Implemented / Integrated / Local Tested / Source Reviewed / Signed-in Local Browser Verified / Persistent Nonprod Remote Verified。B1 production verificationは`NOT_RUN`。
- D-038 B2はcommit `316ad0d88f0f88d1445991904da587b1e0987dab`でcurrent `main`へImplemented / Integrated済み。source review、automated/local migration、signed-in local browser、persistent nonprod migration / runtime / authenticated browser evidenceはPASS。B2 production verificationは`NOT_RUN`。
- D-038 B3はcommit `2481c4916ca2f694f07d6808a4482bea28c79a80`でcurrent `main`へImplemented / Integrated済み。source review、automated verification、real local `0005` migration、signed-in local browser、persistent nonprod `0005` migration / preservation / deployed runtime / authenticated browser、current-Day freeze evidenceはPASS。next-Day materializationのautomated evidenceはPASSだがreal browserは`NOT_RUN`。persistent nonprodのraw console warning/error exact countは`NOT_VERIFIED`、production verificationは`NOT_RUN`、Releasedは`NO`。
- initial production environment / migration / bootstrap / smokeはD-049に従い`PASS`。productionのfeature-specific deep mutation verificationは`NOT_RUN`。

## Dogfood Day v0.1-B / B1 integrated state

B1 implementation commitは`Implement Dogfood Day B1 planning foundation` / `1c14eef4695c2de2ced65f43250544159e039485`。PR #13 `Implement Dogfood Day v0.1-A and B1 planning foundation`はmerge commit `1609331ae32d3db36091ac0e4b0322c3757e3a9a`で`main`へmergeされ、v0.1-A UI shellとB1はIntegrated済み。

Observed evidence:

- Worker / D1 tests: `79 PASS`
- Web tests: `40 PASS`
- upgrade migration: `1 scenario / 15 checks PASS`
- typecheck / production build / `git diff --check`: `PASS`
- real local APP DB backup、`0003` migration、identity/history comparison、foreign-key integrity: `PASS`
- signed-in real local browserでSection表示、`Sectionなし`作成、見積、Section移動、Start時のactual current Section配置、Runner、Complete、reorder、reload persistence: `PASS`
- real Japanese IME: `NOT_RUN`
- B1 persistent nonprod migration / runtime / browser verification: `PASS`
- B1 remote exact same-operation initial configuration / unsectioned Start / Complete retries: `NOT_RUN`（remote実行済みとは扱わない。独立したcanonical retry requirementsはcurrent PASS evidenceを維持）
- B1 production verification: `NOT_RUN`
- Integrated to `main`: `YES`
- Released: `NO`

local dogfood verificationで利用したSection名・時間帯はuser-specific configuration dataであり、Product defaultではない。verification detailsの正本は`docs/TEST_MATRIX.md`を参照する。

## Dogfood Day v0.1-B / B2 integrated state

B2 implementation commitは`Implement B2 planned-start planning` / `316ad0d88f0f88d1445991904da587b1e0987dab`（parent `313679fa0c68ce798c01b2a0216f1dbb0832f4c1`）。review済みpatch（17 files、`+938 / -40`、SHA-256 `38A4D4FB08612039EE0DC313FF9EC665A3B982D9AE1C417EC5BBB5A574489F31`）とcommit patch-idは一致し、`main`へfast-forward Integrated済み。

Observed evidence:

- source review: `PASS`
- Worker / D1 tests: `87 PASS / 87`（focused B2 `7 PASS / 7`）
- Web tests: `49 PASS / 49`
- isolated APP migration regression: `1 scenario / 25 checks PASS`
- typecheck / production build / `git diff --check`: `PASS`
- real local APP DB private backup、`0004_dogfood_day_b2.sql` migration、pre-existing identity / fingerprint preservation、schema / FK / index integrity: `PASS`
- signed-in real local browserでplanned-start auto-placement、exact Section boundary、clear、explicit Section move時clear、derived order、same-minute reorder、illegal reorder抑止、extended `24:30`、Day-end validation、early Start / Complete、reload persistence: `PASS`
- browser unexpected console errors / warnings: `0 / 0`
- B2 persistent nonprod migration / runtime / authenticated browser verification: `PASS`
- B2 production migration / smoke: `NOT_RUN`
- Integrated to `main`: `YES`
- Released: `NO`

2026-08-29のreal local verificationで利用したMorning 04:00–09:00 / Focus 09:00–12:00 / Lunch 12:00–13:00 / Afternoon 13:00–18:00 / Evening 18:00–28:00はuser-specific verification configurationであり、Product defaultではない。exact same-operation replay / misuse / concurrency / ambiguityはautomated Worker / Web evidenceでcoverageし、real browserではoperation ID injectionを行っていない。verification detailsの正本は`docs/TEST_MATRIX.md`を参照する。

## Dogfood Day v0.1-B / B3 integrated state

B3 implementation commitは`Implement B3 Section settings lifecycle` / `2481c4916ca2f694f07d6808a4482bea28c79a80`（parent `d3061ced6e27cf304fe8375002072bc122ac8d22`）。`0005_dogfood_day_b3.sql`、Section configuration query/update、immutable version append、expected-head conflict protection付きhead switch、rename / boundary edit / add / delete・absorption、established current-Day freeze、next-Day effective semantics、Web Section settings panelを実装した。Icon / Accent persistenceやbroader Settings navigationはB3 scope外である。

Observed evidence:

- source review: `PASS`
- Worker / D1 tests: `91 PASS`（focused B3 `3 PASS`）
- Web tests: `55 PASS`
- isolated APP migration regression: `32 data/schema checks PASS`
- typecheck / production build / `git diff --check`: `PASS`
- real local APP DB private backup、`0005` migration、pre-existing identity / fingerprint preservation、quick check / FK / active Execution integrity: `PASS`
- signed-in real local browserでeffective-timing copy、raw-time validation、draft Add/Delete + Cancel、temporary immutable B save、current-Day freeze、reload、pre-test semanticsを新immutable Cでrestore: `PASS`
- current-Day historical context、Task / Entry / Execution、planned start、canonical Entry order、lifecycle、placement revision `22`の不変: `PASS`
- next-Day materialization: automated `PASS` / real browser `NOT_RUN`
- browser unexpected console errors / warnings: `0 / 0`
- Better Auth既存rolling sessionの`expiresAt` / `updatedAt`更新をD-022の7日lifetime / 1日renewal thresholdに沿うexpected runtime side effectとして観測。user / account / credential / mappingとsession identityは不変で、token / hash / secretは取得・記録していない
- B3 persistent nonprod migration / runtime / authenticated browser verification: `PASS`
- B3 persistent nonprod raw console warning / error exact count: `NOT_VERIFIED`（visible errorは未観測）
- B3 production migration / smoke: `NOT_RUN`
- Integrated to `main`: `YES`
- Released: `NO`

real local verificationで利用したSection dataとtemporary B/C変更はuser-specific dogfood dataであり、Product defaultではない。verification detailsの正本は`docs/TEST_MATRIX.md`を参照する。

Persistent nonprod B1 verificationは`main@779f9d18dab79062679dec696657a5addc6539b2`からWorker version `b8d7df82-baa3-4162-adbf-c0ecb65dcc84`へdeployした既存nonprod environmentで実施した。`0003_dogfood_day_b1.sql` migration、pre-existing identity / history preservation、initial Section configuration、historical Day context preservation、`Sectionなし`、見積、MoveEntry、Reorder / stale conflict、Start時のactual current Section配置、Runner、Complete、reload、最終integrityをPASSした。検証専用Section rangeはProduct defaultではなく、検証dataは削除せず残置している。

Persistent nonprod B2 verificationは`main@606d192aa22aea364ad54b7244f295284487a2c6`から既存nonprod environmentへWorker version `23706fe1-5359-43c2-9fef-09b5e8ab714d`をdeployして実施した。private APP DB exportとisolated restore、`0004_dogfood_day_b2.sql` migration、pre-existing全12 tableのidentity / content preservation、schema / FK / active Execution integrity、planned-start auto-placement / clear / explicit Section move時clear / canonical order / same-minute reorder / extended time / boundary rejection / early Start・Complete / reloadをPASSした。検証dataは削除せず残置している。direct bootstrap POSTとpublic signup remote POSTは`NOT_RUN`であり、PASSとは扱わない。

Persistent nonprod B3 verificationは`main@d8d48c4e764958d7a0e5652cf6ed6cbd7b895e43`から既存nonprod environmentへWorker version `0a47ad68-0133-408f-9ce7-d35dcd3b99cb`をdeployして実施した。private APP DB exportとisolated restore、`0005_dogfood_day_b3.sql` migration、pre-existing identity / content preservation、schema / FK / active Execution integrity、draft validation / Add / Delete / Cancel、temporary immutable B save、current-Day freeze、reload、pre-test semanticsを新immutable CとしてrestoreするflowをPASSした。final expected deltaはconfiguration versions `+2`、items `+6`、`UpdateSectionConfiguration` operations `+2`だけで、Task / Entry / Executionは不変。raw console warning / error exact countは`NOT_VERIFIED`であり、visible errorは未観測。direct bootstrap POSTとpublic signup remote POSTは`NOT_RUN`、production verificationは`NOT_RUN`である。

2026-09-02 consolidated representative verificationでは、exact `main@59fd1f97`をWorker `1cf68d11-b878-42f1-9a90-f9585d6f3d4d`として確認した。private export / isolated restore preservation、AUTH / APP pending migrations `0`（remote migration不要）、UI-2A / UI-2B / UI-2C、Start Forecast v0.1、R-016 sequential Add、focused Day Navigation `14 / 14`・forecast `9 / 9`・Worker `135 / 135`・Web `103 / 103`・migration regression `3 scenarios`、typecheck / build / dry-run / diff、authenticated browser、APP/AUTH integrity、bootstrap `false` / root `200` / protected `401` / bootstrap `404`は`PASS`。productionは`NOT_RUN`であり、remote logout → reloginとR-016 detailed retry / concurrencyは既存のlocal automated evidence境界を維持する。

## Persistent non-production increment

Current `main`では、repository-side persistent non-production configを実装・統合済み。local検証・source review・GitHub PR diff reviewもPASS。2026-08-22にpersistent non-production remote environmentを作成してremote verificationを実施しPASSした。

- Worker: `taskchute-web-nonprod`
- URL: `https://taskchute-web-nonprod.taskfulness-sync.workers.dev`
- current Worker version: `1cf68d11-b878-42f1-9a90-f9585d6f3d4d`（2026-09-02 consolidated representative verification、exact `main@59fd1f97`）
- `AUTH_DB`: `taskchute-auth-nonprod` / `60085f8d-0c4e-4c15-98e9-3ce178398041`
- `APP_DB`: `taskchute-app-nonprod` / `6ad7e35f-5d03-4be3-9b00-46cd713a51c3`
- D1 location hint: `apac`
- jurisdiction: none
- observed placement: APAC; AUTH primary response HKG / APP primary response NRT
- remote migrations: AUTH `0001_better_auth_1_7_1.sql` PASS、APP `0001_runtime_bootstrap.sql`〜`0008_routine_r2b_board.sql` PASS、pending 0
- remote `PRAGMA foreign_key_check`: AUTH 0 / APP 0
- active Execution partial UNIQUE index: PASS
- bootstrap: PASS / HTTP 200 / `recovered=false`
- final `BOOTSTRAP_ENABLED=false`
- `BOOTSTRAP_TOKEN` removed; final Worker secret list contains `BETTER_AUTH_SECRET` only
- bootstrap route final posture: 404、old-token probe 5回連続404
- root 200 / unauthenticated protected API 401
- remote smoke: login / public signup rejection / Create Project / Add 3 Tasks+Entries / Reorder / stale revision 409 / Start / Start retry / second active Execution 409 / Complete / Complete retry / reload recovery / canonical state / logout / post-logout 401: PASS
- final active Execution: 0
- deployed Worker verification: PASS
- observed Free-plan-shaped usage: upload gzip 353.80 KiB、startup 37–44 ms、smoke中にCPU/request/D1 quota or overload errorなし

このincrementは`IMPLEMENTED / INTEGRATED / LOCAL_TESTED / SOURCE_REVIEWED / PR_DIFF_REVIEWED / REMOTE_VERIFIED / DEPLOYED_WORKER_VERIFIED`。

Remote verification中、bootstrap disable deploy直後に旧enabled version由来とみられる400を1回観測し、その後8回連続404へ収束した。今後のoperator procedureではdisable deploy後にdisabled postureへ収束したことを複数回確認してから完了扱いとする。

Smoke用test dataとsessionがnonprodに一部残っている。active Executionは0。cleanup / retention policyはOpen Questionとして扱い、承認なしに直接削除しない。

Initial production smokeは`PASS`。Product runtimeはD-049のinitial release scopeで`VERIFIED / RELEASED`、feature-specific deep mutation verificationは`NOT_RUN`。

## Approved initial production release gate

D-049でinitial production environment / release gateをApproved済み。targetはWorker `taskchute-web-production`、separate D1 `taskchute-auth-production` / `taskchute-app-production`、`apac` location hint、initial `workers.dev` endpoint、Workers Free postureである。productionはcleanに開始し、nonprod domain historyをcopyしない。public Workerは常に`BOOTSTRAP_ENABLED=false`とし、initial provisioningはloopback local Worker + remote production D1 bindingsで行う。

Initial production releaseは完了した。Worker `taskchute-web-production`（version `0cab9b2c-2984-4dcd-b784-719a6b8ced1d`）、AUTH D1 `c69df774-69c0-43a5-b346-b202ef4a92c3`、APP D1 `61f07b2b-8bdd-4f5d-853e-6af59afd343c`を`apac`で確立し、AUTH `0001` / APP `0001`〜`0008` migration、loopback-only bootstrap、baseline backup / isolated restore verification、public bootstrap 404、unauthenticated protected API 401、login / Today / Routine Board / Settings / reloadを`PASS`した。public Workerは`BOOTSTRAP_ENABLED=false`、preview URL disabled、production domain dataはclean startで、initial Section configurationはnormal Settings UIからMorning `04:00–12:00` / Day `12:00–20:00` / Evening `20:00–28:00`として保存した。synthetic Project / Task / Routine mutationとproduction deep feature verificationは`NOT_RUN`、Releasedは`YES`。

## Implemented First Server + Web vertical slice

Current `main`では以下を実装・統合済み。

- React + Vite SPA
- Cloudflare Worker API
- separate `AUTH_DB` / `APP_DB` D1 bindings
- Better Auth 1.7.1
- public signup disabled / operator-only bootstrap
- explicit `BOOTSTRAP_ENABLED` gate（default / missing / invalid disabled、exact `"true"`のみenabled）
- disabled bootstrapとenabled + token不備のinformation-disclosingしない404 posture
- Better Auth subject -> stable TaskChute `app_user_id` mapping
- rolling 7日 / update threshold 1日のbrowser session policy
- explicit IANA timezone / TaskChuteDay boundary / initial Sections bootstrap
- current TaskChuteDay resolution / lazy materialization
- Temporal-compatible DST ambiguous / nonexistent boundary handling
- CreateProject
- AddTaskToDay
- Task / Entry separate UUIDv7 identity
- explicit Entry ordering + `placement_revision`
- ReorderEntries with stale revision rejection and atomic rollback
- set-based Reorder SQL using D1 / SQLite `json_each`
- `planned -> running -> completed` lifecycle
- StartEntry / CompleteEntry
- Execution persistence
- DB-enforced user-wide active Execution max 1
- no implicit interrupt on normal Start
- Start / Complete same-operation retry safety
- Complete retryでfirst `ended_at` preservation
- Start / Completeで`placement_revision`を変更しない
- cross-TaskChuteDay active Executionを分割せずComplete可能
- lifecycle-aware Next projection
- logical operation replay / different-semantic misuse rejection
- unexpected infrastructure ambiguityとdeterministic Domain rejectionの分離
- Web move up/down / Start / Complete
- ambiguous Reorder / Start / Completeのexplicit Retry / client-side Discard
- unrelated mutationからretained operationを暗黙再送しないUI guard
- canonical refetch / conflict reconciliation / browser reload recovery

D-038 B1でImplementedしたSection time / `Sectionなし` / Entry見積等はPR #13でcurrent `main`へIntegrated済み。D-039 B2 planned start / derived placement-orderはcommit `316ad0d88f0f88d1445991904da587b1e0987dab`で、D-038 B3 Section settings lifecycleはcommit `2481c4916ca2f694f07d6808a4482bea28c79a80`で、D-040 Minimal Routine R1はPR #14 merge commit `ebaff6d156813ba78b4c5c28818f9f55db9fd970`でIntegrated済み。この一覧はFirst Server + Web vertical slice scopeのみを示す。

## Verification state

Current evidence:

- Runtime implementation: `IMPLEMENTED / INTEGRATED / LOCAL_TESTED`
- Worker / D1 tests: `55 PASS`
- Web tests: `18 PASS`
- total local automated tests: `73 PASS`
- `npm ci`: `PASS`
- npm audit vulnerabilities: `0`
- Generated Worker types: `PASS`
- Typecheck: `PASS`
- Production build: `PASS`
- Fresh AUTH_DB migration: `PASS`
- Fresh APP_DB migration `0001 -> 0002`: `PASS`
- Existing operation-row upgrade: `PASS`
- AUTH_DB foreign-key check: `0`
- APP_DB foreign-key check: `0`
- active Execution partial UNIQUE index: `PASS`
- `git diff --check`: `PASS`
- Bootstrap lifecycle source-only implementation review: `PASS`
- Bootstrap lifecycle GitHub PR diff review: `PASS`
- Persistent nonprod config source-only implementation review: `PASS`
- Persistent nonprod GitHub PR diff review: `PASS`
- Remote D1 Product runtime verification: `PASS`
- Deployed Worker verification: `PASS`
- Persistent nonprod bootstrap lifecycle verification: `PASS`
- Free-plan-shaped runtime feasibility evidence: `PASS` for observed smoke scope; actual account plan tier independently `NOT_VERIFIED`
- Initial production smoke test: `PASS`
- Product runtime overall: `VERIFIED`（D-049 initial release scope。deep feature mutationは`NOT_RUN`）
- Released: `YES`

Local / nonprod PASSをproduction verificationへ自動拡張しない。

B1 integrated implementation / local verification evidence:

- Implementation: `IMPLEMENTED / INTEGRATED (PR #13 merge commit 1609331ae32d3db36091ac0e4b0322c3757e3a9a)`
- Source review: `PASS`
- Worker / D1 tests: `79 PASS`
- Web tests: `40 PASS`
- upgrade migration: `1 scenario / 15 checks PASS`
- signed-in real local browser verification: `PASS`
- real Japanese IME: `NOT_RUN`
- Integrated / remote verified / production verified / Released: `YES / PASS / NOT_RUN / NO`

B2 integrated implementation / local verification evidence:

- Implementation: `IMPLEMENTED / INTEGRATED (316ad0d88f0f88d1445991904da587b1e0987dab)`
- Source review: `PASS`
- Worker / D1 tests: `87 PASS / 87`
- Web tests: `49 PASS / 49`
- isolated migration: `1 scenario / 25 checks PASS`
- real local APP DB migration / signed-in real local browser verification: `PASS / PASS`
- Integrated / persistent nonprod verified / production verified / Released: `YES / PASS / NOT_RUN / NO`

B3 integrated implementation / local verification evidence:

- Implementation: `IMPLEMENTED / INTEGRATED (2481c4916ca2f694f07d6808a4482bea28c79a80)`
- Source review: `PASS`
- Worker / D1 tests: `91 PASS`（focused B3 `3 PASS`）
- Web tests: `55 PASS`
- isolated migration: `32 data/schema checks PASS`
- real local APP DB migration / signed-in real local browser / current-Day freeze: `PASS / PASS / PASS`
- next-Day materialization automated / real browser: `PASS / NOT_RUN`
- Integrated / persistent nonprod verified / production verified / Released: `YES / PASS / NOT_RUN / NO`
- persistent nonprod raw console warning / error exact count: `NOT_VERIFIED`

R1 integrated implementation / verification evidence:

- Implementation: `IMPLEMENTED / INTEGRATED (PR #14 merge commit ebaff6d156813ba78b4c5c28818f9f55db9fd970)`
- Runtime implementation commit: `f9324e866deb74277d2fd83c5945f2df4b2b95da`
- Source review / GitHub PR diff review: `PASS / PASS`
- Worker / D1 full suite: `100 PASS`
- Web full suite after transient-status fix: `65 PASS / 65`
- isolated migration: `1 scenario / 46 checks PASS`
- real local APP DB `0006` migration / preservation / signed-in general browser: `PASS / PASS / PASS`
- persistent nonprod `0006` migration / preservation / deploy / authenticated general browser: `PASS / PASS / PASS / PASS`
- real-browser controlled inclusive end-date / deployed non-null inclusive-date subcheck: `TOOLING_BLOCKED / NOT_VERIFIED`
- Integrated / production verified / Released: `YES / NOT_RUN / NO`

## Important Risks / Gates

- D1 Worker request全体を暗黙のtransactionとみなさない。
- conditional SQL + database constraint + explicit `batch()`をcurrent invariant enforcementの基礎とする。
- active Execution max 1はpartial UNIQUE indexでもenforceしている。
- ReorderはEntry数ごとのUPDATEではなくset-based updateへ変更し、current mutation batchのstatement数をEntry数から分離した。
- unexpected infrastructure failureを確定Domain rejectionへ誤分類しない。
- AUTH_DB / APP_DB間のcross-database atomicityを仮定しない。
- repositoryはpublicであり、secret / credential / private content / production dataをcommitしない。
- D-023に従いnormal runtimeではbootstrapをdisabledとし、provisioning後のmode disable + token remove / rotateをoperator procedureで確実に行う。
- D-024のpersistent non-production environmentはproductionから分離し、default-disabled bootstrap、explicit D1 bindings、secret hygiene、Free-plan monitoringを維持する。
- bootstrap disable deployment後は複数回probeでdisabled postureへ収束したことを確認する。
- persistent nonprod test data / session retention・cleanup policyは未決。
- Integrated済みB1のschema migration / compatibility、Entry見積physical representation、local verificationはreview済み。未解決のestimate multi-device LWW、initial configurationのDay境界race、unusual DST transition recoveryは`RISKS` / `OPEN_QUESTIONS`を参照する。
- operation result retention / cleanup、observability、backup / export、production deployment posture等は未解決。

## Next

current-main consolidated persistent nonprod verification gateは完了した。次のProduct featureはこのmaintenanceで選定せず、canonical Product / Open Questionsと既存のApproved Decisionに基づく別途の優先順位判断を待つ。以下は既存実装・未実装境界の参照であり、次gateではない。

Day Table foundationは`docs/DESIGN.md`をcanonical UI targetとし、UI-1 / UI-2A / UI-2B / UI-2C / cross-Section D&D v0.1、Start Forecast v0.1、Day Table columns menu + customization + actual projection v0.1はcurrent `main`へImplemented / Integrated済みである。default visible orderは`実行 | Task | Project | Section | Routine | 見積 | 開始予定 | 開始見込 | 開始 | 終了 | 実績`で、独立した`状態` / `並び替え`列はなく、Task row surfaceからのcross-Section append D&Dと`Shift+↑/↓` keyboard reorder、独立Routine列を持つ。UI-2Aのhorizontal-scroll foundation、presentation-only Bulk slot、Bulk / Execution / Task fixed-left structure、UI-2BのSection collapse / expandとbrowser-local reload persistence、UI-2Cのsame-Section / same-cohort Task D&D、cross-Section v0.1、D-032のread-only開始見込、Project以後のcolumn reorder / resize / auto-fit / hide / show / browser-local v2 order-width-visibility preference、Execution factsからのread-only actual projectionを実装済みである。visible `↑/↓` buttonsは撤去し、Routine-derived / running / completed / read-only / preview / locked write、Bulk capability、Mode / Note、fixed slot hide / reorder、actual manual correction、Search / Filterは引き続き未実装である。Server同期・cross-device persistenceはcolumn customizationを含め対象外である。

Settings v0.1はcommit `51242b08e015817108010839cd5234959da2fed5`でcurrent `main`へImplemented / Integrated済みで、source review、local browser、persistent nonprod authenticated browser / integrityはPASSした。新しいProduct / Domain Decisionは追加しておらず、broader Project管理、Mode Settings、Sidebar resize / saved custom width等を実装済みへ昇格しない。Sidebar open / closed preferenceはDesktop Day wide layout v0.1で実装済みである。

Day Navigation v0.1はcommit `6f183c28242a1cd30211ea8e0c4f1e1dc23329bb`でGitHub `main`へImplemented / Integrated済みで、D-041に従うprevious / next、custom calendar、Today return、keyboard navigation、未来日のnon-persistent preview / atomic planning establishmentと、D-042に従うpast unestablished record-none / read-only表示を含む。source review / local automated / signed-in general browser / persistent nonprod general verificationは`PASS`。remote logout → relogin、cross-owner、config-change / failure / retry / concurrency等の詳細subcaseは`NOT_RUN`またはlocal-only evidenceを維持し、productionは`NOT_RUN`、Releasedは`NO`。future Routine preview、past historical correction、non-current DayのStart / Completeは引き続きscope外である。

UI-1のstructural prerequisite完了に加え、D-044 / D-045 / D-046でR2A first-slice scope-choice / override / reset / propagation、legacy normalization、typed occurrence persistence、default concurrency controlを確定し、implementation commit `7d3c0cb0881dfc11725af6ff45eabad69f86a22a`としてGitHub `main`へIntegratedした。Source Review / local automated / real-local `0007` migration・preservation / signed-in browser verificationは`PASS`。persistent nonprodでもAPP `0007` migration / preservation、deployment `4e493bc3-68ac-4b1b-a74e-ad9eb01e71ff`、Worker version `b18c5dab-6976-4564-815e-78dda6024b34`のauthenticated representative browser A〜M、future no-materialization、established-past read-only、Routine終了、final integrityを`PASS`した。multi-Day propagation、retry / concurrency / ambiguity / rollback等はlocal automated evidenceであり、remote browser multi-Day evidenceへ拡張しない。

Routine R2A persistent nonprod gateは完了した。次のProduct development workはcanonical Product / Open Questionsから別途選定し、broader Routine recurrence / future-past editing / 0..* Entry authority、UI-2以後等を自動的に実装済みへ広げない。legacy authorityを解決できないdata、current D1 safe boundsを越えるpropagation、D-045 / D-046を越えるcompatibility changeが判明した場合はMaterial reviewへ戻す。R1 real-browser controlled inclusive end-dateとdeployed non-null inclusive-date subcheckはtooling boundaryにより`NOT_VERIFIED`を維持し、productionは別gateとする。

1. direct bootstrap POST / public signup remote POST、B1 real Japanese IME、B3 next-Day real-browser materialization、B3 remote raw console exact countは未検証の境界を維持する。
2. nonprod test data / session retention・cleanup policyは別Open Questionとして維持する。
3. D-049 initial production deployment / bootstrap / smokeは`PASS`しReleased `YES`。custom domain、Access、paid criteria、broader security / DRとproduction deep feature mutationは別Decision / verification scopeとし、nonprod PASSを自動継承しない。
4. R1を越えるRoutine recurrence / override / projection、Documents / Review / Android等は別scopeとして維持する。

B1 / B2 / B3 / R1 / Routine R2A / R2Bのpersistent nonprod remote PASSを個別featureのproduction deep verificationと混同しない。D-049 initial production release scopeは`PASS` / Released `YES`だが、Routine R2Bを含むfeature-specific production mutation、remote multi-Day propagation、詳細reliability subcaseは`NOT_RUN`または既存の限定evidenceを維持する。
