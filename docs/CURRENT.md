# Current

Date: 2026-09-06

## Status

### D-066 non-blocking ordinary current-Day mutation UX v0.1

- D-066 is canonicalized as Approved. The target is a Server-canonical, memory-only client pending overlay with a single serial dispatcher for ordinary current-Day Task add, planned Task metadata / Project / Section / planned start / estimate, reorder, Start, and Complete.
- In-scope Day intents are accepted without a Day-wide mutation freeze. Same-target / dependent-target conflicts remain scoped; global auth, settings, navigation, and initialization barriers remain conservative.
- Sent operations keep frozen `operation_id` and exact payload for retry. Placement revision, D-043 Section/planned-start pairing, active Execution maximum-one, no implicit interrupt, revision conflict barrier, and ambiguous-operation retention remain unchanged.
- No API, schema, migration, new dependency, persistent/offline queue, security posture, production, restore, branch/PR/merge/tag/release operation is part of D-066. Verification evidence will be appended after implementation and nonprod checks.

D-066 retry exposure boundary corrective closeout（2026-09-06）:

- 独立reviewで確認された、ambiguous rootの後ろに保持された未送信descendantを個別retry可能として表示する境界不具合を、Approved D-066内のWeb-only reversible correctiveとして修正した。Start A → Complete A → Start B → Complete B、Complete A → Start B → Complete B、Add Task → Project / Section / estimateの各dependency chainで、実際にdispatch済みでambiguousなrootだけがretry対象となり、未送信descendantはqueueに残るがretry buttonを表示しない。
- `isQueuedDayMutationOperation`で現行queueのoperation identityを判定し、pending panelのD-066操作表示をroot retentionとqueue descendantから分離した。rootの`operation_id`・payload、元のqueue order、single serial dispatcher max in-flight `1`、discard、既存のdirect metadata / estimate / Section / planned-start / reorder / Start / Complete exact retryを維持した。API / Domain / schema / migration / dependency / binding / security posture / persistent queueは変更していない。
- 開始時点のGitHub / origin / local `main@955a90e1cf01088f824a3d53a885d9e95eb8f06f`は一致し、既存untracked review artifact 58件は保持してstage / commitしていない。実装commit `bb407d8ee260250726492f3a2bf07faae3e609fe`をmainへfast-forward pushした。focused retry boundary `29 PASS`（targeted existing + new regression）、full Web `202 / 202 PASS`、full Worker / D1 `184 / 184 PASS`、typecheck、production build、exact `CLOUDFLARE_ENV=nonprod` build、Wrangler nonprod dry-run、`git diff --check`、source reviewをPASSした。Sol Mediumの独立モデル呼出しは利用できないため、root dispatch境界、descendant suppression、identity、queue order、max in-flightについて明示的self-reviewを実施した。
- exact pushed mainをcanonical persistent nonprod Worker `taskchute-web-nonprod`へdeployし、Worker versionは`1e18e60f-edce-4e08-8ac8-7824fc2ec019`。generated configは`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、既存APP / AUTH bindingのまま。APP / AUTH migrationは双方`No migrations to apply`（D-066 migration `NOT_REQUIRED`）。root `200`、未認証Project API `401`、disabled bootstrap POST `404`。
- Authenticated browserではfresh login sessionを利用し、current Dayで`D066 retry boundary browser`を追加、Start → Complete、fresh tabでcompleted rowのreload persistenceを確認した。clean stateではpending retry panel / retry buttonsが不在だった。browser console exact error / warning countはCUA surfaceから取得できず`NOT_VERIFIED`。
- Browser後のread-only APP D1は`PRAGMA quick_check=ok`、FK violations empty、Projects / Tasks / Entries / Executions / operations `0 / 15 / 14 / 13 / 102`、active Executions `0`、全query `rows_written=0`。AUTHは`quick_check=ok`、FK empty、`user / account / session = 1 / 1 / 5`、rows_written `0`でlogin capabilityを保持した。今回のbrowser fixtureは開発用nonprodに残置した。
- 今回はAPI / Domain semantics、schema / migration、dependency package、binding、security posture、persistent/offline queue、production、restore、destructive cleanup、new token、permission / OAuth scope、account / role、branch / PR / merge / tag / releaseを変更・実行していない。Classification: `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED / AUTHENTICATED_BROWSER_REPRESENTATIVE_VERIFIED / DB_INTEGRITY_VERIFIED / CONSOLE_NOT_VERIFIED / MIGRATION_NOT_REQUIRED / PRODUCTION_NOT_RUN / RESTORE_NOT_RUN / RELEASED_NO`。

D-066 transitive dependency corrective closeout（2026-09-06）:

- 開始時点はGitHub / origin / local `main@1631931a17e96c7acce3569bf5a1c89e05c23cfc`で一致し、実装終了は`2711af983edaa3240a1d726a7c81314e4155ea40`。既存untracked review artifact 58件は保持し、stage / commitしていない。
- 原因は`dependsOnOperationId`のdirect childだけをcancel / preserveしていたこと。`collectDependentOperationIds`がqueue内のoperation identityをrootから反復的にたどるtransitive closureを収集し、deterministic failureでは全descendantのHTTP dispatch・pending overlayをcancel、ambiguous rootではfull subtreeを元のqueue orderで保持する。retryはrootのexact operation identity / payloadを再利用し、成功・canonical convergence後だけsubtreeを再開する。discardは既存client-side discardでrootとqueue subtreeを含む保留stateを破棄する。undefined operationIdはclosure対象外、single serial dispatcherのmax in-flight `1`は維持した。
- Local evidenceはD-066 focused追加regression `5 / 5 PASS`（Start failure full cascade、Complete failure full cascade、ambiguous Start full chain preservation、ambiguous Complete descendant preservation、discard subtree cancellation）、full Web `201 / 201 PASS`、full Worker / D1 `184 / 184 PASS`、typecheck、production build、exact `CLOUDFLARE_ENV=nonprod` build、Wrangler nonprod dry-run、`git diff --check`、source reviewをPASSした。Sol Mediumの独立モデル呼出しはこの環境で利用できないため、依存closure、cascade、ambiguity、retry identity、max in-flightについて明示的self-reviewを実施した。
- exact pushed mainからpersistent nonprod Worker `taskchute-web-nonprod`へdeployし、Worker versionは`abe8605f-1613-4c3b-ab4f-39de68605ec7`。generated configは`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、既存AUTH / APP binding。root `200`、protected Project API `401`、disabled bootstrap POST `404`。APP / AUTH migrationは変更なし（pending `0 / 0`）。
- Authenticated browserではMorningのplanned Aと追加BでA Start → A Complete → B Start → B Completeを実施し、reload後もA / B completedを確認した。browser console exact error / warning countはCUA surfaceで取得できず`NOT_VERIFIED`。transitive failure / ambiguity exactnessはdeferred-promise automated regressionをprimary evidenceとする。
- Persistent nonprod read-only APPは`PRAGMA quick_check=ok`、FK violations empty、Projects / Tasks / Entries / Executions / operations `1 / 13 / 12 / 9 / 91`、active Executions `0`、全query `rows_written=0`。AUTHは`quick_check=ok`、FK empty、`user / account / session = 1 / 1 / 5`、rows_written `0`。今回のbrowser fixtureは開発用nonprodに残置した。
- 今回はAPI / Domain semantics、schema / migration、dependency package、binding、security posture、persistent/offline queue、production、restore、destructive cleanup、branch / PR / merge / tag / releaseを変更・実行していない。Classification: `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED / AUTHENTICATED_BROWSER_REPRESENTATIVE_VERIFIED / DB_INTEGRITY_VERIFIED / CONSOLE_NOT_VERIFIED / MIGRATION_NOT_REQUIRED / PRODUCTION_NOT_RUN / RESTORE_NOT_RUN / RELEASED_NO`。

D-066 implementation / verification closeout（2026-09-06）:

Independent-review corrective is complete. The affected current-state evidence has been restored to PASS in `docs/TEST_MATRIX.md`; the historical D-066 closeout evidence below remains retained as historical evidence.

- Start stateはGitHub `main@44188e9c9e02933e3bcd06dc13cfe231f5c5ad04`、local / origin / GitHub一致、tracked worktree clean（既存untracked review artifact 58件は変更・stage・commitせず保持）だった。D-066 canonical decision / workflow updateは`6db31d0`、implementation + focused Web test + canonical SPEC / ARCHITECTURE / DESIGN / FEATURES / TEST_MATRIXは`4fdf63db9b59341712ddda4fc983a337ddc4ae0c`、Contract補修のbeforeunload guard + regressionは`f87d64e9f5d44ef35675c6208e116e089894ff21`、canonical evidence docsは`0e21f7b16269b5a96a47ff185c5afb6554cbf210`以降のdocs-only fast-forwardで更新した。最終GitHub stateはhandoff時点でlocal / origin一致、ahead / behind `0 / 0`。
- 実装はWeb-onlyで、既存API / Worker / Domain command、D1 schema / migration、operation command CHECK、dependency、binding、security postureを変更していない。memory-only overlay、provisional Task / Entry、single serial dispatcher、same-field coalesce、sent operation exact retry、placement revision rebase、scoped conflict barrier、Start→Complete queue、navigation defer / pending guardを追加した。persistent/offline queue、localStorage / IndexedDB、Bulk / Routine scope / date move / duplicate / destructive delete / manual execution correctionは対象外である。
- Local evidenceはWeb `188 / 188 PASS`、Worker / D1 `184 / 184 PASS`、typecheck、production build、`CLOUDFLARE_ENV=nonprod` build、nonprod Wrangler dry-run、`git diff --check`をPASSした。build / dry-run時の既知Wrangler user-log `EPERM`とclient chunk-size warningは非致命で、required commandはexit `0`。D-066 required serial / overlay / coalesce / conflict / ambiguity / navigation / unload-guard casesはWeb automated evidenceで確認し、既存Worker / D1 / migration suiteのregressionも維持した。
- Latest exact pushed mainからgenerated nonprod config（Worker `taskchute-web-nonprod`、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、AUTH / APP canonical binding）を使い再deployした。Worker versionは`b5f789da-f440-41c8-8102-3e2880b30a42`。APP / AUTH migration listはともに`No migrations to apply`（D-066 migration `NOT_REQUIRED`）。
- Persistent nonprod safety probeはroot `200`、未認証`GET /api/v1/projects` `401`、disabled bootstrap `POST /api/internal/bootstrap` `404`。deploy後のread-only APP D1は`PRAGMA quick_check=ok`、FK violations `0`、active Executions `0`、Projects / Tasks / Entries / Executions / operations `1 / 7 / 6 / 2 / 61`、全read-only query `rows_written=0`。AUTHは`quick_check=ok`、FK violations `0`、users / accounts / sessions `1 / 1 / 5`、全read-only query `rows_written=0`でlogin capabilityを保持した。
- Authenticated nonprod browserでは、検証用Projectを作成し、Task A / B / Cをcurrent Dayへ追加した。BのProject選択・見積`25分`、CのSection移動（Evening / `20:00`）を確認。AではStart直後にCompleteを受理し、`開始・照合中…`から`完了・照合中…`を経て、最新Workerのreload相当の新規browser tabでもAのcompleted、BのProject / estimate、CのSectionがcanonical stateとして保持された。browser feature mutation fixtureはcleanupせず残置した。browser console error / warning exact countはこのCua surfaceでは取得できず`NOT_VERIFIED`。
- このrunではbackup / restore / migration / destructive cleanup / production access、new token、permission / OAuth scope、account / role、binding、branch / PR / merge / tag / releaseを行っていない。D-066のclassificationは`IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED / AUTHENTICATED_BROWSER_REPRESENTATIVE_VERIFIED / DB_INTEGRITY_VERIFIED / UNLOAD_GUARD_LOCAL_VERIFIED / MIGRATION_NOT_REQUIRED / PRODUCTION_NOT_RUN / RELEASED_NO`。

D-066 independent-review corrective closeout（2026-09-06）:

- Start stateは`83f19fa9d9894fa5e40ff77bada37fdd7cee289e`、origin / local main一致、ahead / behind `0 / 0`を確認し、実装・focused test・temporary evidence downgradeをcommit `f81a0b1bd4a5730ed38d42065f700084c58861d1`へまとめ、GitHub `main`へfast-forward pushした。終了時点のlocal / remote mainは同じ`f81a0b1bd4a5730ed38d42065f700084c58861d1`。
- FINDING-1はlegacy `queuedStartEntryRef / drainQueuedStarts`を撤去し、Complete→Startを`QueuedDayMutation`へ統合した。StartはComplete成功後のfresh reconcileでbuildし、Sectionなしではaffected canonical `placement_revision`へrebaseする。FINDING-2は`dependsOnOperationId`でStart→Completeを明示し、deterministic Start failureはdependent Completeをcancel、ambiguous outcomeはdependentを保留しcanonical convergence / exact retry成功後だけ再開する。FINDING-3はDay queue / in-flight / retained operation中のlogout・Settingsをdeferし、safe drain後に実行、signed-out transitionでqueue・overlay・active mutation stateをresetする。FINDING-4はprovisional Add行でProject / Section / estimateを受理し、Add operation identityへ依存させ、Add成功・reconcile後だけdependent HTTPをdispatch、deterministic failure / unresolved ambiguityでは送信しない。
- Local evidenceはfocused D-066 App `177 / 177 PASS`、full Web `193 / 193 PASS`、Worker / D1 `184 / 184 PASS`、typecheck、production build、exact nonprod build、Wrangler nonprod dry-run、`git diff --check`をPASSした。source second-pass reviewではsingle global dispatcher、max in-flight 1、Start/Complete dependency、exact retry identity、placement revision rebase、logout / Settings barrierを確認した。独立Sol Mediumモデル呼出しはこの実行環境では利用できないため、同等観点の明示的なself-reviewとして記録する。
- Exact pushed mainからpersistent nonprod Worker `taskchute-web-nonprod`へdeployし、Worker versionは`8f868b0f-e8ba-4ac1-9295-f1fcdf137518`。APP / AUTH migrationはともにpending `0`（No migrations to apply）、bindingはAPP `taskchute-app-nonprod` / AUTH `taskchute-auth-nonprod`、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`のまま。Safety probeはroot `200`、未認証`GET /api/v1/projects` `401`、disabled bootstrap `POST /api/internal/bootstrap` `404`。
- Authenticated browser representative flowは、BのTask名編集・Project変更・見積`30分` → B Start → B Complete → 次のC Start → C実行中のDayでAdd Taskフォームを開き`D066 browser Add`保存 → C CompleteまでPASS。Day-wide lockは発生せず、C実行中もAddを受理した。browser consoleのexact error / warning countはCua surfaceから取得できず`NOT_VERIFIED`。
- 最終read-only APP D1は`PRAGMA quick_check=ok`、`PRAGMA foreign_key_check` empty、Projects / Tasks / Entries / Executions / operations `1 / 8 / 7 / 5 / 72`、active Executions `0`、全query `rows_written=0`。AUTHは`quick_check=ok`、FK empty、users / accounts / sessions `1 / 1 / 5`、login capabilityを保持。今回のbrowser verificationで追加された開発用Task / Entry / Execution / operationはcleanupせずnonprodに残置した。
- Corrective classificationは`IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED / AUTHENTICATED_BROWSER_REPRESENTATIVE_VERIFIED / DB_INTEGRITY_VERIFIED / CONSOLE_NOT_VERIFIED / MIGRATION_NOT_REQUIRED / PRODUCTION_NOT_RUN / RESTORE_NOT_RUN / RELEASED_NO`。API / Domain semantics、schema / migration、dependency、binding、security posture、productionは変更・実行していない。

D-066 queued Complete → Start acceptance corrective（2026-09-06）:

- 開始時点のGitHub `main` / local / originは`3cd01de111cbaea3f53ee528046828d86b875418`で一致し、ahead / behind `0 / 0`。既存untracked review artifact 58件は保持し、stage / commitしていない。
- 追加review findingは、ordinary mutation Xがin-flightの間にComplete Aがqueueされた場合、`start(entryId)`が`hasActiveMutationScope(["execution-lane"])`だけを見て、retained Complete scopeを通常queueと誤認し、Start B intentをsilent discardしていたことだった。さらに、同じ条件でqueued Start Aに対するComplete Aもretained gateで受理されなかった。
- Web-only reversible fixとして、queued / in-flightのnormal Complete / Startと、結果未確定でretainedされたambiguous operationを明確に区別した。normal queued Completeに依存するStart BはComplete後ろへenqueueし、active Completeの場合だけ既存priority insertionを維持した。queued Start Aに対するComplete Aも依存queueへ受理し、ambiguous Complete中のStart Bはbutton / handlerをdisabledで一致させた。API、Domain semantics、schema / migration、dependency package、binding、security posture、persistent/offline queueは変更していない。
- 実装commit `57bc8b98320764b18eb7fd2ecd000220272630a0`をGitHub `main`へfast-forward pushした。local / origin / GitHubの終了stateは同一。Sol Mediumの独立モデル呼出しは環境上利用できないため、execution dependency ordering、exact retry identity、single in-flight invariantについて明示的self-reviewを実施した。
- Local evidenceはD-066 focused App `180 / 180 PASS`、full Web `196 / 196 PASS`、full Worker / D1 `184 / 184 PASS`、typecheck、production build、exact `CLOUDFLARE_ENV=nonprod` build、Wrangler dry-run、`git diff --check`、source reviewをPASSした。追加deferred-promise regressionは`X → Complete A → Start B`、`X → Start A → Complete A → Start B`、ambiguous Complete retained中のStart B disabled、各最大in-flight `1`を確認し、既存のexact retry / deterministic failure / provisional Add / logout / settings / beforeunload回帰も維持した。build / test / dry-run時の既知Wrangler user-log `EPERM`とclient chunk-size warningは非致命で、required commandはexit `0`。
- Exact pushed mainをgenerated nonprod config（canonical Worker `taskchute-web-nonprod`、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、既存APP / AUTH binding）からdeployした。Worker versionは`38abdb22-5dae-49cb-bb24-b7642e17f072`。APP / AUTH migration listは双方`No migrations to apply`（migration `NOT_REQUIRED`）。
- Persistent nonprod safetyはroot `200`、unauthenticated `GET /api/v1/projects` `401`、disabled bootstrap `POST /api/internal/bootstrap` `404`。browser verificationではcurrent DayにA / Bを追加し、A Start → B Task metadata edit → A Complete直後のB Start受理 → B Completeを実施。reload後もA `completed`、B title `D066 corrective B edited` / `completed`を確認した。browser consoleのexact error / warning countはCUA surfaceから取得できず`NOT_VERIFIED`。
- Browser後のread-only APP D1はProjects / Tasks / Entries / Executions / operations `1 / 11 / 10 / 8 / 82`、active Executions `0`、`PRAGMA quick_check=ok`、`PRAGMA foreign_key_check` empty、全read-only query `rows_written=0`。対象Task queryはA / Bとも`completed`。AUTHはusers / accounts / sessions `1 / 1 / 5`、`quick_check=ok`、FK empty、rows_written `0`でlogin capabilityを保持した。verification fixtureはcleanupせずnonprodに残置した。
- 今回はbackup / restore / migration apply / destructive cleanup / production access / new token / permission・OAuth scope / account・role / binding変更、branch / PR / merge / tag / releaseを行っていない。Classification: `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED / AUTHENTICATED_BROWSER_REPRESENTATIVE_VERIFIED / DB_INTEGRITY_VERIFIED / CONSOLE_NOT_VERIFIED / MIGRATION_NOT_REQUIRED / PRODUCTION_NOT_RUN / RESTORE_NOT_RUN / RELEASED_NO`。

### Today display menu color corrective — 2026-09-06

Approved `taskchute-platform_today-display-menu-color-corrective.md`を、開始時点の`main@7874fe53c4a20ddb53af6b0d8de7c05b7ff1300a`から実装し、CSS-only corrective commit `3890efc`をGitHub `main`へfast-forward pushした。原因はglobal `button`の`background: #2383e2; color: #fff`が`.display-menu-item`へ継承され、既存selectorが文字色だけをneutralへ上書きしていたことだった。global button style、menu structure、submenu / keyboard / focus semantics、column / completed visibility semantics、API、Domain、schema、migration、dependency、binding、security postureは変更していない。

`.display-menu-checkbox, .display-menu-item`へ`border: 0`と`background: transparent`を追加し、通常時はtransparent background・`#373735` neutral text・borderなしとした。既存のhover / focus-visible rule（`#f7f7f5` highlight、`#1769aa` text）とneutral submenu arrow（`#787774`）を維持したため、青ベタ背景は通常時に発生しない。production、restore、destructive operation、migration apply、branch / PR / merge / tag / releaseは実施していない。

focused menu regression `1 / 1 PASS`、full Web `187 / 187 PASS`、typecheck、production build、exact `CLOUDFLARE_ENV=nonprod` build、Wrangler dry-run、`git diff --check`、source reviewをPASSした。build / dry-run時の既知のWrangler log `EPERM`、client chunk-size warning、generated configのenvironment warningは非致命で各command exitは`0`。

Exact pushed mainをcanonical persistent nonprod Worker `taskchute-web-nonprod`へdeployし、Worker version `075567fc-2cda-4ead-b95e-52b1b48e589b`、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、既存APP / AUTH bindingを確認した。HTTP safety probeはroot `200`、未認証 Project API `401`、disabled bootstrap POST `404`。

Authenticated browserでは通常時の`列表示` / `デフォルトに戻す`が`rgba(0,0,0,0)` background、`rgb(55,55,53)` text、`0px none` borderであること、focus-visible時の`rgb(247,247,245)` background / `rgb(23,105,170)` text、submenu arrowのneutral colorを確認した。submenu open、reset、Escape（submenu → parent → close）、click-away、browser console error / warning `[]`もPASSした。hover highlightは同じCSS ruleをsourceで確認し、直接hoverは利用可能なbrowser APIの範囲外として前回同様に区別している。

Classification: `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED / AUTHENTICATED_BROWSER_VERIFIED / MENU_COLOR_CORRECTED / NORMAL_BACKGROUND_VERIFIED / FOCUS_BACKGROUND_VERIFIED / SUBMENU_ARROW_COLOR_VERIFIED / PRODUCTION_NOT_RUN / RELEASED_NO`。Featuresのstatusは変更していない。

### Today display menu consolidation — 2026-09-06

Approved `taskchute-platform_today-display-menu-consolidation.md`を、開始時点の`main@75efd34093c7c3d1c9290668f50a5d173cf84d2d`から実装し、実装commit `87b467a`をGitHub `main`へfast-forward pushした。今回の変更はWeb UI / local preferenceと対応testだけで、API、Domain、schema、migration、dependency、binding、security posture、Product Decisionは変更していない。production、restore、destructive cleanup、branch / PR / merge / tag / releaseは実施していない。

BeforeはDay toolbar右側に独立した`列` buttonと`実行済みを表示` checkboxが並び、列popoverに`すべて表示`と`初期状態に戻す`があった。Afterは右側の単一`表示` menuに統合し、top-levelのcheckable `実行済みを表示`、`列表示` submenu、`デフォルトに戻す`を提供する。`列表示`には既存9列（Project / Section / Routine / 見積 / 開始予定 / 開始見込 / 開始 / 終了 / 実績）のvisibility checkboxを保持し、`デフォルトに戻す`は既存のcolumn preference reset semanticsだけを実行し、completed visibilityは変更しない。`すべて表示`は今回のapproved menu構造から撤去した。

Accessibility / interactionは`aria-haspopup="menu"`、`aria-expanded`、menu / menuitem semantics、click、focus、hover handler、click-awayを実装した。Escapeはsubmenu → 親menu → closeの順で動作し、focusをsubmenu trigger / 表示 triggerへ戻す。submenu focus復帰時に再openしないregressionも追加した。local focused Web `171 / 171 PASS`、full Web `187 / 187 PASS`、full Worker / D1 `184 / 184 PASS`、typecheck、production build、exact `CLOUDFLARE_ENV=nonprod` build、Wrangler dry-run、`git diff --check`、source reviewをPASSした。build / dry-run時に既知のWrangler log `EPERM`とclient chunk-size warningは出たが、各command exitは`0`。

Exact pushed mainを生成configでcanonical persistent nonprod Worker `taskchute-web-nonprod`へdeployし、Worker version `65365fa0-047b-4ff9-b4de-4a0cb9bdf8cd`、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、既存canonical APP / AUTH bindingを確認した。APP / AUTH migrationは双方`No migrations to apply`。HTTP safety probeはroot `200`、未認証 Project API `401`、disabled bootstrap POST `404`。APP / AUTH read-only integrityはともに`quick_check=ok`、FK violations `0`、`rows_written=0`。

Authenticated browserでは`表示` menuのrole / aria、completed toggleのoff / on、9列submenuの表示、Project hide / show、`デフォルトに戻す`による復元、Escape階層、click-awayを確認した。current fixtureはplanned Taskだったためcompleted rowの可視数変化は発生せず、completed filtering semanticsはlocal testで確認した。browser console error / warningは`[]`。`onMouseEnter` hover handlerはsource reviewで確認したが、利用可能なbrowser操作APIにhover actionがないためhover展開自体は`NOT_VERIFIED`として区別する。

Classification: `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED / AUTHENTICATED_BROWSER_VERIFIED / DISPLAY_MENU_CONSOLIDATED / COLUMN_SUBMENU_VERIFIED / COMPLETED_TOGGLE_VERIFIED / RESET_BEHAVIOR_VERIFIED / HOVER_HANDLER_SOURCE_VERIFIED / HOVER_BROWSER_NOT_VERIFIED / PRODUCTION_NOT_RUN / RELEASED_NO`。Featuresのstatusは変更していない。

### Accidental auxiliary Worker cleanup — 2026-09-06

Product Ownerの明示承認に基づき、D-065 Project notification correctiveのdeploy時に誤ってpublishされた補助Worker `taskchute-web-nonprod-nonprod`だけを削除した。開始時点は`main@db8cb53fe1a3fe0b59b18135b0b0a2c8c1951d8c`（local HEAD / GitHub `main`一致、tracked worktree clean、untracked review artifacts `58`件）で、runtime code、API、Domain、schema、migration、binding、security posture、canonical Workerのdeployは変更していない。

削除前のCloudflare read-only inventoryでは、canonical `taskchute-web-nonprod`は100% deployment version `dd85ad38-baef-43a7-b8b5-8e94be11cac3`（version number `53`）で、APP `6ad7e35f-5d03-4be3-9b00-46cd713a51c3`、AUTH `60085f8d-0c4e-4c15-98e9-3ce178398041`、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`を確認した。補助Workerはcanonicalと異なるWorker identity / workers.dev endpointを持つ`taskchute-web-nonprod-nonprod`の100% deployment version `cd5edd0d-2a97-4caa-a1e7-98693cf698c8`（version number `2`）だった。canonical config / docsはcanonical Worker `taskchute-web-nonprod`だけを参照し、Project verificationもcanonical endpointだけで実施済みだった。補助Workerのversion detailは同じnonprod APP / AUTH resourceを参照していたが、削除はWorker resourceだけに限定し、D1へwriteしていない。削除前probeはcanonical `200 / 401 / 404`、補助Worker root `200`（非canonical protected API `503`）だった。

対象名をcanonical `taskchute-web-nonprod`と再比較してから、`taskchute-web-nonprod-nonprod`だけをCloudflareから削除した。削除後はCloudflare inventoryが`Worker does not exist`、補助workers.dev endpointが`404`となり、canonicalは同じversion `dd85ad38-baef-43a7-b8b5-8e94be11cac3`・同じAPP / AUTH binding・同じnonprod varsで存続した。canonical post-delete probeはroot `200`、protected Project Board `401`、disabled bootstrap POST `404`。APP / AUTH migration pendingは`0 / 0`、両方`quick_check=ok`、FK violations `0`、read-only queryの`rows_written=0`で、補助Worker cleanupによるAPP / AUTH data mutationはない。production Worker / route、restore、migration、runtime deploy、production dataには触れていない。

Historical recordとして、補助Workerが一時publishされた事実は直前のD-065 notification evidenceに残し、このcleanupで削除済みとした。Classification: `AUXILIARY_WORKER_IDENTITY_VERIFIED / AUXILIARY_WORKER_DELETED / CANONICAL_WORKER_PRESERVED / NONPROD_SAFETY_VERIFIED / APP_INTEGRITY_VERIFIED / AUTH_PRESERVED / NO_RUNTIME_CHANGE / NO_CANONICAL_REDEPLOY / PRODUCTION_NOT_RUN / RELEASED_NO`。

### D-065 Project operation notification layer / no layout shift corrective — 2026-09-06

Approved D-065のWeb-only correctiveとして、Project Boardのsuccess / error / retry・reconcile通知を通常document flowからviewport固定のtop-center notification layerへ移した。開始時点のGitHub canonicalは`main@dfb62ec64c35a4f63b3c8c47e56392799aa30006`、実装commitは`2e58331601082ce3ca3af183217e5a358b81d4fd`で、local / origin / GitHubの最終stateは一致している。API、Domain、schema、migration、dependency、binding、security posture、Product Decisionは変更していない。

BeforeはProject Board内でnotice / error / retry panelがtable前の通常flowに配置され、表示中にtable位置を押し下げ得た。Afterは`.project-notification-stack`を`position: fixed`、top-center、`z-index: 80`、`pointer-events: none`（各notificationは`auto`）として配置し、通常flowから分離した。Modal backdropは既存の`z-index: 100`を維持し、modalがnotificationより上位で、focus trap / focus restore / background shortcut suppressionも変更していない。successは`role=status`、`aria-live=polite`、`aria-atomic=true`で2.5秒後に自動dismissし、連続successではtimerをreset、unmount時にcleanupする。errorは`role=alert`でpersistent、retry / reconcileは既存のoperation identity・retry button・fresh reconcile semanticsを保持したまま固定layerへ移した。

Local evidenceはfocused Web `171 / 171 PASS`、full Web `187 / 187 PASS`、full Worker / D1 `184 / 184 PASS`、typecheck、production build、exact nonprod build、Wrangler dry-run、`git diff --check`、source reviewをPASSした。production buildのWrangler log `EPERM`とclient chunk-size warningは既知の非致命warningで各command exitは`0`。migration regressionはschema変更なしのため`NOT_REQUIRED`で、migration / backup / restoreは実施していない。

Persistent nonprodではAPP / AUTH pending `0 / 0`、canonical Worker `taskchute-web-nonprod`へexact pushed mainをdeployし、Worker version `dd85ad38-baef-43a7-b8b5-8e94be11cac3`、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical APP / AUTH bindingを確認した。HTTP safety probeはroot `200`、protected Project Board `401`、disabled bootstrap POST `404`。authenticated browserではdisposable Project 2件のcreate、1件のrename、archive / restoreを行い、success notificationのcomputed style `position=fixed / top=12px / z-index=80`を確認した。Project table topはnotification before / during / afterで`505 / 505 / 505px`、successは自動dismiss、archive / restore success textも確認し、console error / warningは`[]`だった。

Browser後のAPP read-only aggregateはProjects / board items / archives / Tasks / Entries / Executions / operations `2 / 2 / 0 / 3 / 2 / 0 / 42`、`quick_check=ok`、FK violations `0`、全query `rows_written=0`。AUTHは`quick_check=ok`、FK `0`、rows_written `0`、users / accounts / sessions `1 / 1 / 5`でlogin capabilityを保持した。hard delete、既存Domain data cleanup、remote restore、production操作は行っていない。

Deploy時の同一shell環境変数処理により、verification対象外の補助Worker `taskchute-web-nonprod-nonprod`（version `cd5edd0d-2a97-4caa-a1e7-98693cf698c8`）が一時的にpublishされた。これはcanonical Workerではなく、既存のD-062 historical precedentと同様に削除せず、verification対象から除外した。環境変数を除去してcanonical `taskchute-web-nonprod`を再deployし、上記canonical Workerだけをbrowser / safety verificationに使用した。新API token、permission / OAuth scope拡張、account / role変更、binding変更、その他security posture変更はない。

Classification: `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED / AUTHENTICATED_BROWSER_VERIFIED / PROJECT_NOTIFICATION_FIXED_LAYER_VERIFIED / SUCCESS_AUTO_DISMISS_VERIFIED / LAYOUT_INVARIANT_VERIFIED / ARCHIVE_RESTORE_VERIFIED / HARD_DELETE_NOT_RUN / PRODUCTION_NOT_RUN / RELEASED_NO`。Featuresのstatusは今回変更していない。

### D-065 Final persistent nonprod verification — 2026-09-06

D-065のremaining persistent nonprod verificationを、実行開始時のGitHub canonical `main@be90a2833a3a12774e47f58785cc01783b2aa046`（local / origin / GitHub一致、ahead / behind `0 / 0`）から完了した。今回のruntime code、API、Domain、schema、migration、dependency、binding、security posture、Product Decisionは変更していない。current Worker `taskchute-web-nonprod` version `78bf3f21-84a2-4c3b-ba10-ec38bfcd4f2a`を使用し、APP / AUTH migration pendingは`0 / 0`、nonprod envは`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`だった。

Project hard delete前のfresh private ignored backup HARD GATEをPASSした。APP backup `apps/web/.wrangler/private-backups/d065-final-pre-delete-app-20260906.sql` は`52,578 bytes` / SHA-256 `095E382FCE688F911F4FADF0DA2F5C468A83585BC1A191DC36E357C387AD5A90`、AUTH backup `apps/web/.wrangler/private-backups/d065-final-pre-delete-auth-20260906.sql` は`4,704 bytes` / SHA-256 `A7CCF8729DDCC1BEAB0441D1C8C6112A72F8203B1F399E91E02DF0D35B80BA06`で、両方とも非空・readable・`.wrangler/` ignored・migration metadata保持を確認した。remoteへrestoreせず隔離SQLiteへimportし、APP / AUTHとも`quick_check=ok`、FK violations `0`を確認した。recovery aggregateはAPP `projects / board_items / archives / tasks / entries / executions / routines / occurrences / operations / app_users = 0 / 0 / 0 / 2 / 1 / 0 / 1 / 0 / 29 / 1`、AUTH `users / accounts / sessions / verification = 1 / 1 / 5 / 0`だった。

このrun専用のdisposable Project `D065-final-delete-20260906`（ID `01a07482-cf9e-7e39-ae1f-95527bc1e8c5`）とnext-row用 Project `D065-final-next-row-20260906`（ID `01a07482-ee75-709c-9fb3-ad2fedcafbb5`）を作成し、disposable Task `D065-final-task-20260906`（ID `01a07483-2467-7e2b-a714-088205e789e2`）を対象Projectへassignした。hard delete前のBoard orderは対象→next、Board revisionは`25`、対象Project settings revisionは`0`、Task `project_id`は対象Projectだった。TaskのProject selectorは`Projectなし → 対象Project → next-row Project`のBoard順を示し、active selector orderをPASSした。archived relationは`0`件だったため、archived Projectを新規選択対象にしない境界は現stateのarchive `0`とexisting automated / prior browser evidenceで維持される。

確認modalのdestructive textを確認して対象Projectだけをhard deleteした。成功notice後にfalse-error / reconcile errorはなく、対象row消失後のdocument focusはnext visible Projectのrow actionへ移った。Dayへ戻るとTask identity / titleは残り、Project表示は`Projectなし`、reload後も同じだった。delete後selectorは`Projectなし → next-row Project`となり、削除Projectは不在だった。browser console error / warningは空集合だった。

APP read-only evidenceでは対象Project row / board item / archive relation `0`、Board revision `25 → 26`、Task `project_id=NULL`、Task identity保持、Taskに紐づくEntry `1`件保持、Executions `0`、RoutineDefinition `1`、RoutineOccurrence `0`、Entry / Routine historical snapshot `0 / 0`、orphan Project reference `0`、`quick_check=ok`、FK violations `0`を確認した。operationsはfixture作成後の`33 → 34`、`DeleteProject`は`9 → 10`で、最新operation `01a07484-d4e2-7195-b670-2b0f84c9d05d`のresultは`board_revision=26`、`unassigned_task_count=1`だった。全D1 queryは`rows_written=0`。AUTHはuser / account / session `1 / 1 / 5`、`quick_check=ok`、FK `0`でlogin capabilityを保持した。対象はこのrun専用Projectだけで、既存Project / Task / Routine / Entry / Execution / historyは削除していない。next-row Projectはverification fixtureとして残置した。

Local confidence checkはfocused Web `169 / 169 PASS`、full Worker / D1 `184 / 184 PASS`、full Web `185 / 185 PASS`、migration regression `4 scenarios PASS`、typecheck、production build、exact nonprod build、Wrangler nonprod dry-run、`git diff --check`をPASSした。既知のWrangler log `EPERM`とclient chunk-size warningは非致命で、各command exit `0`だった。Classification: `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_BACKUP_VERIFIED / ISOLATED_RECOVERY_VERIFIED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED / AUTHENTICATED_BROWSER_VERIFIED / SELECTOR_ORDER_VERIFIED / HARD_DELETE_BROWSER_VERIFIED / TASK_PROJECT_NULLIFICATION_VERIFIED / DELETE_SUCCESS_FOCUS_VERIFIED / APP_INTEGRITY_VERIFIED / AUTH_PRESERVED / PRODUCTION_NOT_RUN / RELEASED_NO`。remote restore、Task / Routine / Entry / Execution hard delete、production operation、branch / PR / merge / tag / release、credential / permission / OAuth scope変更は行っていない。

### D-065 persistent nonprod state reconciliation closeout — 2026-09-06

D-065 final verificationにおけるProject fixtureのcanonical state transitionを、APP / AUTH D1 read-only query、既存のprivate ignored APP backup、canonical docs / retained operation historyの突合でcloseoutした。このcloseoutではAPP / AUTHへのwrite、new backup、restore、cleanup、migration、deploy、production操作、runtime変更を行っていない。

Snapshot AはD-065 corrective browser run直後のcanonical stateで、Projects / project board items / archives `3 / 3 / 0`、Board revision `16`、operations `22`だった。fixtureはA=`01a0745e-14f5-7f8a-8b25-202c0fb117e8` (`D065-corrective-20260906-A-renamed`)、B=`01a0745e-3cee-7551-b240-4a803fbaaa14` (`D065-corrective-20260906-B`)、C=`01a0745e-590e-7104-b79f-c653946f1b13` (`D065-corrective-20260906-C`)で、orderは`B → A-renamed → C`だった。

Snapshot Bはfinal verificationのProject hard delete前に取得済みのfresh private ignored APP backupに対応するstateで、Projects / project board items / archives `0 / 0 / 0`、operations `29`だった。backupは`apps/web/.wrangler/private-backups/d065-final-pre-delete-app-20260906.sql`、`52,578 bytes`、SHA-256 `095E382FCE688F911F4FADF0DA2F5C468A83585BC1A191DC36E357C387AD5A90`で、readable・ignoredを確認済み。隔離SQLiteへのimport結果は`quick_check=ok`、FK violations `0`、latest migration `0019_project_management.sql`だった。

Snapshot Aのoperations `22`からSnapshot Bの`29`までの7件は、時系列順に以下の通り完全に説明できる。seq23 / seq28は一時Projectの`CreateProject`、seq24〜27 / seq29はProject-onlyの`DeleteProject`であり、削除結果の`unassigned_task_count`は全件`0`だった。

| seq | operation | operation_id | Project / result |
| --- | --- | --- | --- |
| 23 | `CreateProject` | `01a07477-5cb5-7691-a24d-985526c75154` | temporary `01a07477-5cb5-768f-b2be-3836caec7398` / title `てst` |
| 24 | `DeleteProject` | `01a07477-976c-70a6-8e11-c0ad5fb2edd4` | B `01a0745e-3cee-7551-b240-4a803fbaaa14` / Board revision `18` / unassigned `0` |
| 25 | `DeleteProject` | `01a07477-a4be-7554-93d5-367980982a60` | A `01a0745e-14f5-7f8a-8b25-202c0fb117e8` / Board revision `19` / unassigned `0` |
| 26 | `DeleteProject` | `01a07477-b085-7b58-8e03-11202a232e81` | C `01a0745e-590e-7104-b79f-c653946f1b13` / Board revision `20` / unassigned `0` |
| 27 | `DeleteProject` | `01a07477-bd04-7e5c-bce9-e2b2755d3ad5` | temporary `01a07477-5cb5-768f-b2be-3836caec7398` / Board revision `21` / unassigned `0` |
| 28 | `CreateProject` | `01a07477-cd48-7f43-8d82-3d257f283c8e` | temporary `01a07477-cd48-76e5-b8fe-97075fc5e9eb` / title `てst` |
| 29 | `DeleteProject` | `01a07477-d6fe-7f05-80bf-fd419101761f` | temporary `01a07477-cd48-76e5-b8fe-97075fc5e9eb` / Board revision `23` / unassigned `0` |

従って3 fixture Projectの消失は、A / B / Cそれぞれに対応する保持済みsuccessful `DeleteProject` operation（seq24〜26）で説明できる。7件すべてがProject-onlyで、削除時にunassigned Taskがなく、22→29のwindowにProject外のTask / Entry / Routine / Execution / historyへのdestructive changeはない。これはactorや目的を推測する記録ではない。retained canonical historyが差分を完全にaccountし、read-only reconciliation queryにも直接DB mutationを示す証拠はない、というstate explanationである。

後続のfinal verificationで別fixtureを作成・削除したため、closeout時点のcurrent APPはProjects / board items / archives `1 / 1 / 0`、Tasks / Entries / Executions / RoutineDefinitions / RoutineOccurrences `3 / 2 / 0 / 1 / 0`、operations `34`、Board revision `26`である。残存Projectは`01a07482-ee75-709c-9fb3-ad2fedcafbb5` (`D065-final-next-row-20260906`)であり、これはSnapshot Bそのものではなく、後続verification後のstateとして区別する。

closeout時のAPP read-only evidenceは`quick_check=ok`、FK violations `0`、orphan Project references `0`、全query `rows_written=0`だった。APP / AUTH migrationsはpending `0 / 0`。AUTHは`quick_check=ok`、FK violations `0`、users / accounts / sessions `1 / 1 / 5`、全query `rows_written=0`で、login capabilityを保持した。canonical docs内のhistorical baselineに重複していた`PROJECT-CORRECTIVE-05`は、baseline側だけ`PROJECT-CORRECTIVE-BASELINE-05`へ改名し、latest corrective evidenceのIDは維持した。

Classification: `READ_ONLY_RECONCILED / SNAPSHOT_A_RECORDED / SNAPSHOT_B_RECORDED / SEVEN_OPERATION_DELTA_EXPLAINED / THREE_PROJECT_DISAPPEARANCE_EXPLAINED / APP_INTEGRITY_VERIFIED / AUTH_PRESERVED / NO_DIRECT_DB_MUTATION_EVIDENCE / NO_RUNTIME_CHANGE / NO_DEPLOY / PRODUCTION_NOT_RUN / RESTORE_NOT_RUN / RELEASED_NO`。

### D-065 Web corrective — persistent nonprod verification — 2026-09-06

D-065 Approved範囲のWeb correctiveについて、current GitHub `main@fc8918f359e04c9b7332ad15570d19d7b2bdb4df`を起点に、backdrop click時の既定focus移動を抑止するreversible Web-only fixを追加した。Delete modalのCancel / Escape / backdrop closeはいずれもorigin row actionへfocusを戻し、hard delete自体は実行していない。focused regressionを追加し、修正commit `3208d1edde6b1db4ebd4272cf5c4e16d00a385e0`を`main`へfast-forward pushした。API / Domain / schema / migration / compatibility / dependency / security postureは変更していない。

Local evidenceはfocused regressionを含むWeb `169 / 169 PASS`、full Worker / D1 `184 / 184 PASS`、full Web `185 / 185 PASS`、migration regression `4 scenarios PASS`、typecheck、production build、exact `CLOUDFLARE_ENV=nonprod` build、Wrangler nonprod dry-run、`git diff --check`、source reviewをPASSした。build時のWrangler log `EPERM`とclient chunk size warningは既知の非致命warningで、各commandはexit `0`である。

exact pushed `main@3208d1edde6b1db4ebd4272cf5c4e16d00a385e0`をcanonical generated configでdeployし、Worker `taskchute-web-nonprod` version `78bf3f21-84a2-4c3b-ba10-ec38bfcd4f2a`を確認した。configは`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical APP / AUTH bindingで、migration pendingはAPP / AUTH `0 / 0`。HTTP safety probeはroot `200`、未認証 protected Project API `401`、disabled `/api/internal/bootstrap` POST `404`をPASSした。

Authenticated nonprod browserでは、reset後の既存sessionを再認証なしで利用した。disposable Project `D065-corrective-20260906-A` / `B` / `C`をcreateし、Aを`D065-corrective-20260906-A-renamed`へrename、Bをarchive → archived tab確認 → restoreし、各状態をreload後も確認した。成功notice後にfalse-error / reconcile errorは表示されず、browser console error / warningは空集合だった。Delete modalはAでCancel、Escape、backdropの3つを確認し、いずれもdialogを閉じ、origin actionへfocusをrestoreした。Confirm deleteは押していない。

Sidebarを閉じてrowのnon-interactive領域を確保したうえで、A / B / Cの3行を実座標pointer D&Dし、visible order `B → A-renamed → C`、reload後のserver-canonical order、`ReorderProjects` successを確認した。active Project selector orderは、保存なしのDay draft UIにProject selectorがなく、Task / Routine fixtureを追加しなかったため`NOT_VERIFIED`。fixtureはactive Project 3件として残置し、勝手なcleanupは行っていない。hard-delete mutation、delete後focus fallback、Task-assigned hard deleteはこのContract境界により`NOT_RUN`である。

Browser前のAPP read-only baselineは`quick_check=ok`、FK violations `0`、Projects / board items / archives `0 / 0 / 0`、Project Board head `1` / revision `12`、app_users / Sections / Tasks / Entries / Executions / operations `1 / 3 / 2 / 1 / 0 / 15`だった。browser後は`quick_check=ok`、FK violations `0`、Projects / board items / archives `3 / 3 / 0`、Board revision `16`、app_users / Sections / Tasks / Entries / Executions `1 / 3 / 2 / 1 / 0`、operations `22`。deltaはCreateProject `3`、UpdateProject `1`、SetProjectArchived `2`、ReorderProjects `1`のみで、当runのDeleteProjectは`0`。Project order / IDsはD1 read-onlyで`B (position 1) → A-renamed (position 2) → C (position 3)`と一致した。全D1 queryの`rows_written=0`で、既存Task / Entry等の件数変化はない。AUTHはread-onlyで`quick_check=ok`、FK `0`、users / accounts / sessions `1 / 1 / 5`を確認し、login capabilityを保持した。

Classification: D-065 corrective `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED / AUTHENTICATED_BROWSER_PARTIAL / DELETE_MODAL_NON_DESTRUCTIVE_FOCUS_VERIFIED / ROW_REORDER_VERIFIED / HARD_DELETE_BROWSER_NOT_RUN / SELECTOR_ORDER_NOT_VERIFIED / PRODUCTION_NOT_RUN / RELEASED_NO`。このrunではmigration / backup / restore / existing persistent data deletion / production / branch / PR / merge / tag / release / auxiliary Worker操作を行っていない。new API token、permission / OAuth scope拡張、account / role変更、APP / AUTH binding変更、security posture変更も行っていない。

### D-065 Web corrective — Project retry / reconcile and Delete focus restoration — 2026-09-05

Approved D-020 / D-065のWeb correctiveとして、Project BoardのCreate / rename / archive・restore / reorder / hard deleteを、失敗後のcanonical Project Board / active Project list reloadへ統一した。response lost後のcanonical projectionがexact intentへ既に収束している場合は成功として扱い、未収束の`infrastructure_ambiguous`だけが元のoperation ID・request fingerprint・revision・semantic payloadを保持して再試行できる。revision conflict等のdeterministic rejectionはretry対象にしない。API / Domain / schema / migration / dependency / security postureは変更していない。

Delete modalはrow-end actionをopen前に明示的originとして保持する。cancel / Escape / backdrop / deterministic failureではconnected originへ戻し、成功またはcanonical convergenceでorigin rowが消えた場合は次のvisible row、前のvisible row、toolbarの順へfocusをrestoreする。Help originとは分離し、既存dialog / focus trap / background shortcut suppressionを維持した。

implementationはGitHub canonical `main@45d398bb282e6d892e63a31706722783c7693b31`へfast-forward integrated済み。Web `184 / 184 PASS`、Worker / D1 `184 / 184 PASS`、typecheck、production build、exact nonprod build、Wrangler nonprod dry-run、`git diff --check`、source reviewをPASSした。generated configはWorker `taskchute-web-nonprod`、canonical APP / AUTH binding、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`である。

persistent nonprod deployはこの2026-09-05 snapshot時点では実行環境のnetwork approvalがWrangler deploy通信を開始前に拒否したため`NOT_RUN`だった。このbaselineは上記2026-09-06のdeploy / browser evidenceでsupersedeされる。fixture作成、APP / AUTH write、migration、restore、production、auxiliary Worker、branch / PR / merge / tag / releaseは当時`NOT_RUN`、Released `NO`。

### D-065 — Project management — 2026-09-05

D-065をApproved Decisionとしてcanonical化し、Decision commit `09934a48e9d39126f4b377d9376977a5a45270d9`、runtime implementation commit `af5a3bd46e3f490e23fafe62c24d54f119584f3c`をGitHub canonical `main`へfast-forward pushした。Projectはdedicated Settings Boardで管理し、stable Project identity、Task / Routine assignment、Entry / Execution / operation historyを保持したまま、server-owned board order、archive relation、settings revisionを追加した。Project archiveはreversibleで、hard deleteはProjectだけを除去し、Taskのassignmentを`Projectなし`へnull化する一方、Task / Entry / Execution / RoutineOccurrence / snapshot / historyを削除しない。Project-owned Documentは未実装のため追加していない。

APP compatibility migration `0019_project_management.sql`は、Project Board head / item、archive relation、bounded ordinary executed-Entry Project snapshot、live Project FKを持たないRoutine occurrence snapshot、D-065 command allow-listをatomicに導入した。初期Board orderは既存Projectの`created_at ASC, id ASC`、初期revisionは0で、既存identity / assignment / historyを暗黙にarchive / deleteへ変換しない。AUTH migration、binding、dependency、security postureは変更していない。

Local evidenceはD-065 focused Project integration `3 / 3 PASS`、full Worker `184 / 184 PASS`、full Web `180 / 180 PASS`、migration regression `4 scenarios PASS`（fresh `0001 -> 0019` chain、existing identity / history / operation CHECK / Project hard-delete compatibility）、typecheck、production build、`git diff --check`をPASSした。real-local safety smokeはroot `200`、protected API `401`、disabled bootstrap POST `404`をPASSした。

Persistent non-productionではAPP pending `0019_project_management.sql` / AUTH pending `0`を確認し、HARD GATEとしてfresh private ignored backupを取得した。APP `302,501 bytes` / SHA-256 `999B9A049E237D3BBB2EFB2E9DB0DA4C82E3081B9AAFAD217CF6D94E07FA7D`、AUTH `4,280 bytes` / SHA-256 `53D9BAA8A4D3F2EC2789627DE03C2BDB539A58E68F90E5AEE8501C9B26D618A4`は非空・readable・`.wrangler/` ignoreをPASSした。remoteへ書き戻さないisolated recoveryでAPP / AUTH `quick_check = ok`、FK violations `0`をPASSし、remote restoreは実行していない。HARD GATE後にAPP `0019`だけを適用し、post pending `0 / 0`、APP / AUTH `quick_check = ok`、FK `0`を確認した。

exact `main@af5a3bd46e3f490e23fafe62c24d54f119584f3c`を`CLOUDFLARE_ENV=nonprod`でbuildし、canonical Worker `taskchute-web-nonprod`へdeployした。Worker versionは`2627c53b-d990-4e2b-bcc1-e67d8e2ddc9e`、generated configは`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical APP / AUTH bindingである。HTTP safety probeはroot `200`、protected `/api/v1/project-board` `401`、disabled bootstrap POST `404`をPASSした。

Authenticated nonprod browserでは、使い捨てProjectのcreate、rename、search、active / archived tab、archive、restore、row-end menu、中央delete modal、cancel、hard delete、reload後の不在を確認した。削除後にDay / Routine projectionは壊れず、Project selectorから削除Projectが消えた。Project BoardのJ / ↓・K / ↑、`?` help、Esc close、`X`が存在しないこと、browser consoleのerror / warning空集合を確認した。これは後続cleanup前の初期D-065 browser evidenceであり、D1はProject / board item / archive row `0`、Task / Entry / Execution `55 / 62 / 25`、Routine snapshot `20`、Entry snapshot `25`、operations `307`、D-065 operation内訳 `CreateProject 3 / UpdateProject 1 / SetProjectArchived 2 / DeleteProject 1`、historical snapshotのProject参照 `entry 1 / routine 2`だった。Taskを削除対象Projectへ割り当てたremote fixtureは作成していないため、hard delete時のTask `project_id=NULL`変化、selector orderの再選択、実座標row reorderはlocal integration / browser structure evidenceを根拠とし、authenticated browserでは`NOT_VERIFIED`とした。座標reorderは既定幅と一時的な1200px幅の双方で試行したが`ReorderProjects` operationは発火しなかった。

Classification: D-065 `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / REAL_LOCAL_SAFETY_VERIFIED / MAIN_PUSHED / PERSISTENT_NONPROD_BACKUP_VERIFIED / PERSISTENT_NONPROD_MIGRATED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED / AUTHENTICATED_BROWSER_PARTIAL`。browserのrow reorder、Task-assigned hard-delete mutation、selector order再選択は`NOT_VERIFIED`、production、restore、branch / PR / merge / tag / release、auxiliary Worker操作は行っていない。new API token、permission / OAuth scope拡張、account / role変更、APP / AUTH binding変更、security posture変更は行っていない。Released `NO`。

### D-065 follow-up — persistent nonprod development-data cleanup reconciliation — 2026-09-05

Product Ownerの明示承認に基づくpersistent nonprod APPの開発用Domain cleanupをreconcileした。前turn中断中にcleanup commandの一部が完了していたため、今回のresume後は追加のdestructive commandを実行していない。read-onlyで確認した成功`DeleteProject` operationは次の3件である。最初の1件はD-065 browser verificationで既に削除した使い捨てProject、後2件が今回のcleanup中断プロセスで削除された既存Projectである。

| Operation | Project ID | Scope |
|---|---|---|
| `01a0719b-081a-732d-8947-3774a64c98ce` | `01a07197-986d-7297-91d0-a2d912d82c61` | D-065 disposable Project（先行browser verification） |
| `01a071a5-a5a2-7ced-9454-66fd103d9e86` | `01a051d9-ead5-7ab2-b4ab-1059f3876bca` | existing nonprod development Project |
| `01a071a5-affa-7823-96bb-37ee455eb47a` | `01a0293c-0a4f-79ce-97b3-f3b1cc2beb71` | existing nonprod development Project |

今回のcleanup中断プロセスによる新規削除差分はProject `2`件と対応する`project_board_items` `2`件である。`project_archives` / `project_command_guards`は`0`件のままで、Project Board headはuser-scoped row `1`件を保持した。Tasks `55`、Entries `62`、Executions `25`、RoutineDefinitions `11`、RoutineOccurrences `20`、Routine occurrence snapshots `20`、Entry Project snapshots `25`、Sections `3`、TaskChuteDays `10`、Day contexts `30`は削除していない。operation historyは削除せず、cleanupの2件を含むoperationsは`307 → 309`となった。Taskのlive Project assignmentは`0`、orphan Project referenceは`0`、historical snapshotのProject referenceはRoutine `2` / Entry `1`を保持している。

cleanup発生後にfresh private APP export `apps/web/.wrangler/private-backups/d065-cleanup-pre-app-20260905.sql`を取得した。size `313,540 bytes`、SHA-256 `0E1B8FE0278671609E42A1D788B0E584FBEF15AC7E4CC7CFC49183F67152A936`、readable、`.wrangler/` ignoredを確認し、remoteへ書き戻さないisolated SQLite recoveryで`quick_check = ok`、FK violations `0`、`app_users 1 / projects 0 / tasks 55 / routine_definitions 11 / entries 62 / executions 25`を確認した。これは既にcleanup effectsが発生した後のbackupであり、cleanup前のfresh backup HARD GATEとしては扱わない。既存の`d065-pre-0019-app.sql`はcleanup前の比較用に`projects 2 / tasks 55 / entries 62 / executions 25 / operations 302`をisolated recoveryできたが、0019適用前であり、今回cleanup直前のfresh backupとは記録しない。restoreは実行していない。

APP post-cleanupはmigration pending `0`、`quick_check = ok`、FK violations `0`。AUTHは一切writeせず、migration pending `0`、`quick_check = ok`、FK violations `0`、users / accounts / sessions `1 / 1 / 4`を確認した。AUTH login capabilityの既存rowsは保持されている。production、remote restore、AUTH cleanup、binding / permission / OAuth scope変更は行っていない。

Classification: D-065 cleanup follow-up `NONPROD_DOMAIN_CLEANUP_RECONCILED / APP_POST_CLEANUP_BACKUP_VERIFIED / APP_POST_CLEANUP_RECOVERY_VERIFIED / APP_INTEGRITY_VERIFIED / AUTH_PRESERVED`。cleanup前fresh backup gateはこのresume runでは`NOT_ATTESTED`、追加destructive operationは`NOT_RUN`。削除対象はnonprod APPのみで、production / restore / branch / PR / merge / tag / releaseは`NOT_RUN`、Released `NO`。

### persistent nonprod APP development-data clean reset — 2026-09-05

Product Ownerの明示承認に基づき、persistent nonprodの開発用APP Domain dataをclean stateへresetした。対象はAPP `taskchute-app-nonprod`（`6ad7e35f-5d03-4be3-9b00-46cd713a51c3`）のみで、canonical Workerは`taskchute-web-nonprod`、AUTHは`taskchute-auth-nonprod`（`60085f8d-0c4e-4c15-98e9-3ce178398041`）である。実行開始時点はexact `main@448664b70e6682f4f4c16e64652fde1453d73f32`、generated configは`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical APP / AUTH bindingだった。APP / AUTH migration listはcleanup前後とも`0 / 0`（APP latest `0019_project_management.sql`）で、migration / schema / API / binding changeは行っていない。D-065 corrective codeは変更していない。

Cleanup前のfresh backup HARD GATEを、追加destructive cleanupの前にPASSした。APP backupは`apps/web/.wrangler/private-backups/d065-reset-pre-cleanup-app-20260905.sql`、size `313,540 bytes`、SHA-256 `0E1B8FE0278671609E42A1D788B0E584FBEF15AC7E4CC7CFC49183F67152A936`、AUTH backupは`apps/web/.wrangler/private-backups/d065-reset-pre-cleanup-auth-20260905.sql`、size `4,280 bytes`、SHA-256 `6293171FAF25CE7C3E0B6906E50502B819F5E76D33D617AC86FEA99608BFF6DD`である。両方とも非空・readable・`.wrangler/` ignoredを確認し、remoteへ書き戻さない隔離SQLiteへimportした。APP recoveryは`quick_check = ok`、FK violationsなし、`app_users 1 / projects 0 / tasks 55 / entries 62 / executions 25 / routine_definitions 11 / operations 309`、AUTH recoveryは`quick_check = ok`、FK violationsなし、`user 1 / account 1 / session 4 / verification 0`を確認した。これらは前turn中断中に既に削除されていた2 Projectsを含む、今回の追加cleanup直前stateのbackupである。

Preservation classificationは、`PRESERVE_CONFIG`: `app_users`、`auth_subject_mappings`、`user_settings`、`sections`、`section_configuration_versions`、`section_configuration_heads`、`section_configuration_items`、`project_board_heads`、`routine_board_heads`、`d1_migrations`、`_cf_KV`、`DELETE_DOMAIN_DATA`: Project / Task / Entry / Execution / Routine / occurrence / snapshot / Day / operation history、`DELETE_EPHEMERAL_GUARD`: 全command guard / `transaction_assertions`である。保全後の件数は`app_users 1 / auth_subject_mappings 1 / user_settings 1 / sections 3 / section_configuration_versions 7 / section_configuration_heads 1 / section_configuration_items 21 / project_board_heads 1 / routine_board_heads 1`で変化なし。`user_settings`は`Asia/Tokyo / day_boundary_minutes=240`、current Section configuration versionは`01a05280-06af-79ae-b238-95c1fc8b8167 / 240`、Sectionは`Morning (sort 0, 240-720)`、`Day (sort 1, 720-1200)`、`Evening (sort 2, 1200-1680)`（表示では`04:00-12:00 / 12:00-20:00 / 20:00-28:00`）で、Section IDとlogical start / endをcleanup前後で一致確認した。

削除したAPP rowは、cleanup直前件数に対して`entry_project_snapshots 25`、`executions 25`、`routine_occurrence_task_snapshots 20`、`routine_occurrence_suppressions 3`、`routine_pause_intervals 8`、`routine_schedules 11`、`routine_board_items 10`、`routine_definition_archives 1`、`routine_occurrences 20`、`entries 62`、`routine_definitions 11`、`tasks 55`、`taskchute_day_section_contexts 30`、`operations 309`である。guard / assertion各表はcleanup前から`0`、Project / Project board item / archiveも前turnの中断時点で`0`だったため、今回のresetで追加削除したrowは`0`である。最初にD1 CLIの`BEGIN IMMEDIATE` transactionを試行したが、D1 query APIがSQL transactionを拒否し変更なしで失敗した。その後、FKを有効にした依存順で各DELETEを個別実行し、`routine_occurrences`を先に削除しようとした1回はentries FKにより拒否され、変更なしで停止した。read-only integrityを確認してからentriesを先に削除し、occurrences、Routine、Task、Day、operationsの順で完了した。remote restoreは行っていない。

Post-cleanup APPは`PRAGMA quick_check = ok`、FK violationsなし、Domain data（Projects / Board items / Archives / Tasks / Entries / Executions / Routines / Routine occurrences / snapshots / schedules / pause / Day / contexts / operations）と全guards / assertionsが`0`である。AUTHにはwriteせず、post `quick_check = ok`、FK violationsなし、pending `0`、`user / account / session = 1 / 1 / 4`を確認した。APP user identity、auth-subject mapping、timezone / day boundary、stable Section entities / config、migration metadata、board headsを保持している。

既存authenticated nonprod browser tabを再認証なしでreloadし、ログイン済みshell（Logout表示）をPASSした。TodayはMorning / Day / Eveningの各Sectionが表示され、すべて`表示するTaskはありません`、Routine Boardは`該当するRoutineはありません。`、Settings > Projectは`該当するProjectはありません。`となった。Settings > Sectionでは保存済みSection名・開始終了が維持されている。browser consoleのerror / warning collectionは空集合だった。fixture再作成、AUTH write、production、restore、auxiliary Worker、branch / PR / merge / tag / release、security posture changeは行っていない。

Classification: persistent nonprod reset `APP_CLEAN_RESET_APPROVED / PRE_CLEANUP_BACKUP_HARD_GATE_PASS / APP_BACKUP_RECOVERY_VERIFIED / AUTH_BACKUP_RECOVERY_VERIFIED / APP_DOMAIN_CLEANED / APP_INTEGRITY_VERIFIED / APP_CONFIG_PRESERVED / AUTH_PRESERVED / AUTHENTICATED_BROWSER_EMPTY_STATE_VERIFIED`、production / restore / AUTH cleanup / schema / migration / binding / security posture changeは`NOT_RUN`。前turn中断時に発生した2 Projectsの削除は既存reconciliationとして保持し、今回のfresh gate後に実施した全削除と区別して記録している。Released `NO`。

### D-064 — Routine delete and Routine Board table UX — 2026-09-05

D-064はApproved Decisionとしてcanonical化し、Decision commit `2e8685de2321f4a2e6c39dd0276ef726806a45d6`、runtime implementation commit `573f3a72394988442f8482bb183136b95b831242`をGitHub canonical `main`へfast-forward pushした。Routine deleteはhard deleteではなくowner-scoped archive relationによるsoft archiveとし、Board itemを除去してfuture generationを停止する。RoutineDefinition、Task、Occurrence、Entry、Execution、operation history、snapshot、moved occurrenceは保持する。APP compatibility migration `0018_routine_archive.sql`はarchive table追加と`DeleteRoutine`のoperations / routine guard CHECK拡張だけを行い、既存identity / historyを破壊的に変更しない。

Routine Boardのcurrent columnsは`有効 | タスク名 | 繰り返し | 開始予定 | 見積 | プロジェクト | セクション | 開始日 | 終了日`である。enabled checkbox、inline defaults、Project / Section / dates / estimate編集、header reorder / right-edge resize、browser-local preference `taskchute.web.routine-columns.v1`、J / ↓ / K / ↑ navigation、`?` help、Esc closeを実装した。Routine rowはdedicated drag handleを持たず、非interactiveなrow surfaceから並び替えを開始し、row-end `…` actionは9つのdata column外へ配置する。Routine Boardに`X` selection shortcutはなく、既存Routine semantics / Board revision / retry identityを維持する。

Local evidenceはfocused Routine Board Web `8 / 8 PASS`、full Worker `181 / 181 PASS`、full Web `176 / 176 PASS`、migration regression `4 scenarios PASS`（fresh `0001 -> 0018` chain、0018 preservation / constraints）、typecheck、production build、`git diff --check`、source reviewをPASSした。real-local Vite safety probeはroot `200`、protected API `401`、disabled bootstrap POST `404`をPASSした。

Persistent non-productionではmigration前pending APP `0018_routine_archive.sql` / AUTH `0`を確認した。HARD GATEとしてfresh private ignored backupを取得し、APP `294,445 bytes` / SHA-256 `7076FE8C3D50EC7FE0F9F3347351231F28B453DCBC67F81A286308CE1FB0C8C2`、AUTH `4,280 bytes` / SHA-256 `53D9BAA8A4D3F2EC2789627DE03C2BDB539A58E68F90E5AEE8501C9B26D618A4`の非空・readability・D1 migration marker・SQL終端・`.wrangler/` ignoreをPASSした。両backupをremoteへ書き戻さないisolated D1へ復元し、APP / AUTH `quick_check = ok`、FK violations `0`、aggregate読込をPASSした。HARD GATE後にAPP `0018`だけを適用し、post pending APP / AUTH `0 / 0`、APP / AUTH `quick_check = ok`、FK `0`を確認した。

APP post-migrationのRoutineDefinition / Task / Entry / Execution / operationsは`10 / 54 / 62 / 25 / 293`でmigration前と一致し、archive rowは初期`0`だった。認証済みnonprod browserでは使い捨てRoutineを作成し、`… → 削除`、中央確認モーダル、confirm、notice、Routine Board reload後の不在を確認した。APP read-onlyでは、delete後にRoutineDefinition / Task / Entry / Execution / operations `11 / 55 / 62 / 25 / 295`、`DeleteRoutine` operation `1`、archive `1`、Board item `10`、archived Definition relation `1`を確認し、既存historyを保持した。HelpのJ/↓・K/↑・?・EscとRoutine BoardでのX no-opも確認した。browser consoleのzero-error exact collectionは`NOT_VERIFIED`である。

Classification: D-064 `IMPLEMENTED / INTEGRATED / MAIN_PUSHED / LOCAL_TESTED / REAL_LOCAL_SAFETY_VERIFIED / PERSISTENT_NONPROD_BACKUP_VERIFIED / PERSISTENT_NONPROD_MIGRATED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED / AUTHENTICATED_BROWSER_VERIFIED`。production、restore、branch / PR / merge / tag / release、auxiliary Worker操作は行っていない。new API token、permission / OAuth scope拡張、account / role変更、APP / AUTH binding変更、security posture変更は行っていない。Released `NO`。

### D-064 corrective — Routine row drag surface, row-end actions, and modal focus — 2026-09-05

Approved D-064のUI correctiveとして、dedicated `⋮⋮` drag handleとhandle起点のArrow reorderを撤去した。Routine row全体をdrag sourceとし、button / link / input / select / textarea / label / contenteditable / menu / popover / dialog / resize handleなどのinteractive descendantからはdragを開始しない。row-end `…` actionはTask-name cellから分離し、最後のpresentation columnの外側へabsolute配置した。semantic data columnは9列のままで、Actions header / 10列目は追加していない。

Helpはkeyboard起点の実focus（Routine rowを含む）またはtoolbar buttonをoriginとして保持し、Deleteはrow-end actionをoriginとして保持する。cancel / Escape / backdropではconnected originへ戻し、削除でorigin rowが消えた場合は次のvisible row、前のvisible row、toolbarへfallbackする。dialog role、aria-modal、centered layout、focus trap、background shortcut suppressionは維持した。API / Domain / schema / migration / dependency / security posture変更はない。

implementation commit `783f461b71e10d18ae459be192ce175bb1256291`を`main`へfast-forward pushした。focused Routine Board Web `12 / 12 PASS`、full Web `180 / 180 PASS`、typecheck、production build、`git diff --check`、source reviewをPASSした。Worker full / migrationはWeb-only correctiveのimpact boundaryにより`NOT_REQUIRED`である。

exact `main@783f461b71e10d18ae459be192ce175bb1256291`を`CLOUDFLARE_ENV=nonprod`でbuildし、canonical `taskchute-web-nonprod`へdeployした。Worker versionは`eae7107a-18df-4ffe-b9d9-4e59c2796f8d`、generated configは`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical APP / AUTH binding、migrationなしである。root `200`、protected API `401`、disabled bootstrap POST `404`をPASSした。認証済みnonprod browserのAX smokeでは、9 data cellの後のrow-end menu、dedicated handleなし、Delete Escape後のaction focus、focused rowのHelp Escape後のrow focus、J / K / Arrow focus移動、X no-opをPASSした。実drag / resizeの座標操作とconsole zero-error収集はbrowser tooling boundaryにより`NOT_VERIFIED`である。

classification: D-064 corrective `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED / AUTHENTICATED_BROWSER_PARTIAL`。migration / backup / restore / production / branch / PR / merge / tag / release / auxiliary Worker操作は`NOT_REQUIRED / NOT_RUN`。new API token、permission / OAuth scope拡張、account / role変更、binding変更、security posture変更は行っていない。Released `NO`。

### D-063 corrective — conflict-scope retention and single queued Start — 2026-09-05

Approved D-063のretry identity / execution queue safetyに対するcorrective bugfixを実装し、implementation commit `bef893e03a6f62047ab6610c9a53749f7166a669`をGitHub canonical `main`へfast-forward pushした。これは新しいProduct Decisionではなく、API・Domain semantics・schema・migration・dependency・security postureを変更しないWeb client coordinationの収束修正である。

mutation familyごとにaccepted concurrencyとconflict scopeを監査した。Task metadataは既存のEntry / Task単位のretentionを維持し、通常EstimateはEntry scope、Routine EstimateはEntry + current Routine definition scopeのexact operationを複数保持する。これらだけが現行UI上でdisjoint scopeの同時accepted mutationを許すため、current operationに加えて各retained operationを保持し、success / non-ambiguous failure / ambiguous convergenceをoperation id条件付きでclearし、各operationを個別retry可能とした。Bulk EstimateはUIの単一pending gate、Routine endは現行UIでaccepted commandなし、配置・Section・Reorder・Bulk系はDay placement / placement revision、Start / Complete / SetExecutionTimesはglobal execution laneでserializedであり、singleton保持を維持した。Project / settingsはglobal scope、RoutineBoard controlsは既存の保守的なpending gateを維持した。機械的な全state array化は行っていない。

Complete後のStart待機は旧array / FIFOを廃止し、accepted queued intentを最大1件だけ保持する。Complete A pending中はBを受理し、C以降はdisabled / ignoredとする。A success後にqueueを先にclearし、fresh reconcileでBのplanned・target projection・active executionを再確認して一度だけdispatchする。不正化したBは破棄し、Aのnon-ambiguous / ambiguous failure時も待機Startを破棄してvisible errorを表示する。stale queued Cが後続Completeで自動実行される経路はない。

Local evidenceはfocused corrective Web `4 / 4 PASS`、full Web `174 / 174 PASS`、typecheck、production build、`git diff --check`、source reviewをPASSした。focused regressionは通常EstimateとRoutine Estimateのdisjoint ambiguous operation identity保持、Complete後のB受理 / C拒否、Complete failure時のqueue破棄とvisible messageを含む。Worker full suiteはWeb-only変更のimpact boundaryにより`NOT_REQUIRED`とし、canonical Worker safety smokeとD1 read-only verificationを実施した。

Persistent non-productionではexact `main@bef893e03a6f62047ab6610c9a53749f7166a669`をnonprod buildし、canonical `taskchute-web-nonprod`へdeployした。Worker versionは`6bfef882-5172-4c6f-9804-f8c7282aa2c9`、APP / AUTH bindingはそれぞれ`taskchute-app-nonprod` / `taskchute-auth-nonprod`、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`である。APP / AUTH migration pendingは`0 / 0`（追加migrationなし）、両DBのread-only `PRAGMA quick_check = ok`、FK violations `0`、`rows_written = 0`。APP aggregateはoperations `287` / executions `25` / entries `61` / tasks `54`、active executions `0`、AUTHはusers / accounts / sessions `1 / 1 / 4`。HTTP safety probeはroot `200`、protected API `401`、disabled bootstrap POST `404`をPASSした。初回のlocal-generated bindingによるdeploy試行はWorker version作成前にCloudflareが拒否し、正しいnonprod buildで再試行した。auxiliary Worker、production、restore、cleanupは触れていない。

Authenticated nonprod browserでは、既存development dataのordinary planned EntryでProjectを変更して元へ戻し、Sectionを変更して元へ戻すmutation / reconcile、Projectから`TAB`でSectionへ進むrow workflow、Xによるselection toggle / clear、Add draftのEscape cancelを確認した。reload後も復元したProject / Section状態を維持し、active Executionを残していない。Complete A→Start B→Cのremote lifecycle mutationとremote ambiguous retry inductionは不可逆なfixture mutationを避けて`NOT_VERIFIED`とし、上記local deferred regressionを根拠とする。browser consoleのzero-error収集は`NOT_VERIFIED`である。

classification: D-063 corrective `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED / AUTHENTICATED_BROWSER_PARTIAL`。remaining authenticated lifecycle / ambiguous retry `NOT_VERIFIED`、Worker full suite `NOT_REQUIRED`、migration `NOT_REQUIRED`、production `NOT_RUN`、Released `NO`である。new API token、permission / OAuth scope拡張、account / role変更、binding変更、security posture変更は行っていない。

### D-063 — Modal confirmations, row Tab workflow, and non-blocking Day mutations — 2026-09-05

D-063はApproved Decisionとしてcanonical化済みで、Decision commit `dfaad7c0ff1fc9687025a1e3f28399d139552cca`（`Approve D-063 modal and non-blocking Day workflow`）と実装 commit `79c2a7cff88b36886f275f635ff9cccdd5d58f83`（`Implement D-063 modal and scoped non-blocking Day mutations`）をGitHub canonical `main`へpush済みである。D-063はWeb-onlyのpresentation / client coordination変更であり、既存API・Domain semantics・schema・migration・dependency・security postureは変更していない。

Day Tableのshortcut help、single planned delete、bulk confirmation / choice、Routine conversion / scope choiceを共通centered Modalへ統一した。Modalは`role="dialog"`、`aria-modal="true"`、initial focus、focus trap、Escape / backdrop / X close、close後のfocus restoreを持ち、背景Day UIの操作を受け付けない。row Tabはvisual column orderに従い、Bulk / Execution controlを通常Tabから除外し、Project / Sectionから次のrelevant cellへ進む。`X`はfocused eligible Taskのselection toggleに限定し、input / IME / modalでは抑制する。

single-cell actual Start / Endはvalid outside blur、Enter、Tab、Shift+Tabで一度だけcommitし、Escapeはcancel-onlyとした。Start編集中はEndをinputへ切り替えず、invalid write・unchanged write・double submitを抑制する。client coordinatorはEntry / Task、Day placement、Routine definition、global execution laneのscopeで競合を分離し、pending overlay、複数件status、fresh reconcile、ambiguous operationのexact retry identityを保持する。Complete A pending中のStart Bは安全な場合にqueueし、Aのsuccess reconcile後にfresh stateでdispatchする。既存CAS、operation idempotency、active Execution最大1、overlap、placement revision semanticsは変更していない。

Local evidenceはWeb `171 / 171 PASS`（D-063 focused regressionを含む）、Worker / runtime `180 / 180 PASS`、typecheck、production build、`git diff --check`、source reviewをPASSした。D-063はserver / migration変更なしのためAPP / AUTH migration `0 / 0`、migration適用・backup・restoreは`NOT_REQUIRED / NOT_RUN`である。migration regression scriptは今回のschema変更がないため影響範囲外として完走対象にしていない。

Persistent non-productionでは、exact pushed `main@79c2a7cff88b36886f275f635ff9cccdd5d58f83`を`CLOUDFLARE_ENV=nonprod`でbuildし、canonical `taskchute-web-nonprod`（`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、AUTH_DB=`taskchute-auth-nonprod`、APP_DB=`taskchute-app-nonprod`、generated `migrations=[]`）へdeployした。Worker versionは`68261024-e3ef-4e43-beb1-5ff579e53e85`。HTTP safety probeはroot `200`、unauthenticated protected API `401`、disabled bootstrap POST `404`。APP / AUTHのread-only `PRAGMA quick_check = ok`、FK violations `0`、`rows_written = 0`を確認し、APP migration記録は既存`0017_task_metadata_update.sql`まで、AUTHは既存`0001_better_auth_1_7_1.sql`のみである。

認証済みpersistent nonprod browserでは、Helpのcentered modal / X / backdrop表示、actual Start inputのvalue `0900`、Start編集中のEnd button維持、Escape cancelを確認した。browser tabが途中で認証なし状態へリセットされたため、remoteでのrow Tab全順序、X selection、複数同時保存・ambiguous retry・Complete→Start queue、save/reload mutationは`NOT_VERIFIED`とし、local Web regressionを根拠とする。production、restore、cleanup、auxiliary Worker操作は行っていない。

classification: D-063 `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED / AUTHENTICATED_BROWSER_PARTIAL`。migration `NOT_REQUIRED`、authenticated feature verificationの未実施部分 `NOT_VERIFIED`、production `NOT_RUN`、Released `NO`である。new API token、permission / scope拡張、account / role変更、binding変更、security posture変更は行っていない。

### D-062 — Day Table keyboard workflow, single-cell actual editing, Task-column resize, and calendar polish — 2026-09-05

D-062はApproved Decisionとしてcanonical化済みで、Decision commit `5eae737`（`Record D-062 Day Table keyboard and calendar decision`）と実装 commits `327dd7f` / `0344e65`をGitHub canonical `main`へpush済みである。D-062はWeb-onlyのinteraction polishであり、既存API・Domain semantics・schema・migrationを変更していない。

Day Tableでは、neutralなDay surfaceから`↓ / J`で最初のvisible Task、`↑ / K`で最後のvisible Taskへ移動できる。focused Taskでは`S`（planned Start / running Complete）、`N`（current SectionへTask追加）、`E`（ordinary planned Task metadata編集）、`D`（既存single planned delete確認）を提供し、`?`でshortcut help、`Esc`でeditor / menu / calendarを閉じる。input / select / textarea / contenteditableとIME composition中はglobal shortcutを発火させない。D-057 / D-060の既存lifecycle、overlap、retry、forecast reconciliation、delete semanticsは再利用し、new capabilityは追加していない。

actual Start / Endはrow内のsingle-cell editorとして4桁`HHMM`（numeric text、例`0900`）を受け付ける。Start編集中もEndはread-only buttonのままで、Endを明示的に選択した時だけEnd inputになる。未設定のplanned / actual timeは`--:--`、未設定のEstimate / actual durationは`--分`と表示する。Task列は専用resize handleで280〜640pxの範囲を変更でき、`taskchute.web.day-columns.v2`のbrowser-local preferenceへ保存し、reload後も復元する。calendarは表示中のmonth / yearを`前年 / 前の月 / 次の月 / 翌年`で移動でき、outside click / Escapeで閉じる。

Local evidenceはWeb `164 / 164 PASS`、Worker / runtime `180 / 180 PASS`、typecheck、production build、`git diff --check`、source review、real-local Vite safety smoke（root `200`、protected API `401`、disabled bootstrap POST `404`）をPASSした。persistent nonprodはmigration / schema / API / Domain変更なしのためAPP / AUTH migration `0 / 0`、pre-migration backup / migration / restoreは`NOT_REQUIRED / NOT_RUN`である。exact `main@0344e656c2e011b91d5af045257f51636c7754cf`をcanonical `taskchute-web-nonprod`へdeployし、generated `RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical APP / AUTH binding、Worker version `a910aa25-b405-4be4-97f7-b8f89921cedc`を確認した。remote safety probeはroot `200`、protected API `401`、disabled bootstrap POST `404`、productionは`NOT_RUN`である。

authenticated persistent nonprod browserでは、actual Start inputのvalue / displayed inputを`0900`、Start編集中のEndをbutton、End inputのvalueを`0915`として確認した。Task列を`280px → 290px`へresizeし、新規tab / reload後も`290px`を保持した。neutral surfaceの`↓ / ↑ / J / K`、`S / N / E / D / ? / Esc`、input中の`S`抑制、calendarの前後月・前年翌年、outside click close、`--:-- / --分`を実機で確認した。IME composition中のshortcut suppressionはlocal Web regressionで確認し、real OS Japanese IMEは`NOT_RUN`とした。S確認で開始した開発用ordinary fixtureは同じrunで完了へ戻し、active executionを残していない。Dの削除確認は開くところまでとし、最終削除は実行していない。

このrunでは、deploy commandの環境変数指定ミスにより一時的に非canonical名`taskchute-web-nonprod-nonprod` version `b0351e9f-de9b-4947-a9a4-3efb361ce5df`も同じnonprod bindingでpublishされた。これはverification対象にせず、canonical Workerをversion `a910aa25-b405-4be4-97f7-b8f89921cedc`へ再deployした。補助Workerの削除・restore・production accessは行っていない。

classification: D-062 `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / REAL_LOCAL_SAFETY_VERIFIED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED / AUTHENTICATED_BROWSER_VERIFIED`。migration `NOT_REQUIRED`、production `NOT_RUN`、Released `NO`である。新API token、permission / OAuth scope拡張、account / role変更、APP / AUTH binding変更、security posture変更は行っていない。

### D-061 — Day Table inline-editor ergonomics and resize anchoring — 2026-09-05

D-061はApproved Decisionとしてcanonical化済みで、Decision commit `4e468fc632dfcf68b39f3f2b8b2e91283a223711`（`Approve Day Table editor polish`）とimplementation commit `e4cea330f0e369ef5449d8596dd8bc0d40360df8`をGitHub canonical `main`へpushした。その後、実機で発見した二つのD-061範囲内の収束不具合を`1c07467173e17e232d46cdd704a3c200409b665e`（SQLiteのmillisecond-safe execution guard）と`7b435ec3d31ccbd627d5adb46d86defeece16955`（Start→End focus遷移での早期commit防止）で修正し、exact latest `main@7b435ec3d31ccbd627d5adb46d86defee16955`をpush済みである。

Day Tableのplanned Start / actual Start / actual Endは4桁`HHMM`のtext input（numeric input mode、4桁以外・不正時刻を拒否）へ統一し、planned Startの既存Day boundary mapping、actualのcivil-date / cross-Day / overlap / future / owner / retry semanticsは変更していない。EstimateはDay Table内だけ分表示、Task metadata / time inputはcell幅を使い、blur / Enter / Tab / Shift+Tabでcommit、Escapeはcancel-onlyとした。actual StartからEndへのfocus移動では中間commitせず、Endから外へ出た時に一度だけcommitする。Column resizeは左端固定・右境界移動で後続列だけを押し、Task trackが余白を吸収しない。Delete actionは赤いdestructive styleとした。

追加のserver修正はAPI / Domain semantics / schemaを変更せず、既存`SetExecutionTimes` lifecycle guardのmillisecond付きcanonical Instant比較をSQLiteの文字列等値比較へ直しただけである。focused Web / D-061 `160 / 160`、Worker `180 / 180`、typecheck、production build、real-local Vite safety smoke、`git diff --check`、source reviewはPASSした。real-local safety probeはroot `200`、protected API `401`、disabled bootstrap POST `404`である。

persistent non-productionはmigration / schema変更なしのためAPP / AUTH migration listはgenerated config使用で`0 / 0`、cleanup / reset・pre-migration backup・restoreは`NOT_REQUIRED / NOT_RUN`とした。exact mainを`CLOUDFLARE_ENV=nonprod`でbuildし、`taskchute-web-nonprod`（`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical APP / AUTH binding）version `633f747b-d0d3-4773-8257-306b296adfb4`へdeployした。safety probeはroot `200`、protected API `401`、disabled bootstrap POST `404`、APP / AUTH `quick_check = ok`、FK violations `0`、read-only query `rows_written = 0`である。

authenticated nonprod browserでは、既存current-Day ordinary fixtureのplanned Startを`0930`へ変更し、D1で`planned_start_minute = 570`とreload persistenceを確認した。fixtureをStart / Completeしてactive executionを残さず、actual editorの4桁値`1139` / `1142`、Start→End間の早期保存なし、`0900` / `0915`へのEnter commit、表示実績`15分`、reload後の`0900` / `0915`保持を確認した。B2はcompleted、Section Morning、placement_revision `9`、active executions `0`であり、SetExecutionTimes operation logは`5` rows（success `1`、domain rejection `4`）を保持している。既存nonprod dataのcleanupは行っていない。

classification: D-061 `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED / AUTHENTICATED_BROWSER_VERIFIED`。migration `NOT_REQUIRED`、production `NOT_RUN`、Released `NO`である。新API token、permission / OAuth scope拡張、account / role変更、APP / AUTH binding変更、security posture変更は行っていない。

### D-060 — Day row editing, inline actual entry, and completed duplicate — 2026-09-05

D-060はApproved Decisionとしてcanonical化済みで、Decision commit `18de3b692e69be1544b1f175b9a48a3777106da4`（`Approve Day row editing and inline actual entry`）とimplementation commit `18c2d6a1f41f9eeff7eba56ecb2ba3781d13658e`（`Implement D-060 Day row editing`）をGitHub canonical `main`へfast-forward push済みである。D-058で撤去したexecution correctionのうち、current capabilityへ再有効化したのは`SetExecutionTimes`だけであり、`RevertEntryStart`はclient / API / Worker / UIへ復活させていない。

Day Tableでは、current-Dayのordinary planned Entryだけを対象にTask名inline編集とowner-scoped Project選択を提供する。Task名はtrim後non-empty・300文字以内、Enter commit / Escape cancel、Task / Entry identityとplacement revisionを変更しない。Projectは既存owner-scoped候補のselectのみで、quick create / searchは追加していない。Routine、running / completed、past / future read-only、mutation-locked Entryはread-onlyのままである。実績開始 / 終了は旧dialogを戻さず、同じrow内のStart / End `datetime-local` editorで直接入力・訂正する。D-057のplanned / running / completed遷移、actual / overlap / owner / retry / atomicity / forecast reconciliation semanticsを再利用し、completed end clear、future / unavailable Day、invalid orderingを拒否する。

completed current-Day Entryのfar-right `…` menuは`複製`だけを提供し、source actualはcopyせず、新しいordinary planned Task / Entryを作る。completed sourceのdelete / date move、Routine relationのcopy、planning pairの無断normalizationは行わない。D-059のsurface fill、stable scrollbar gutter、square centered checkbox、eligible planned rowのfull-row D&Dと、D-058の他のread-only / overflow / ordering semanticsは維持した。

APP compatibility migration `apps/web/migrations/app/0017_task_metadata_update.sql`は`operations.command_type`のallow-listへ`UpdateTaskMetadata`を追加するoperations table rebuildだけで、Task / Entryのcolumn・table・revision・indexを追加していない。適用前APP / AUTH pendingは`0017_task_metadata_update.sql / 0`。pre-migration fresh private ignored backupはAPP `apps/web/.wrangler/private-backups/d060-app-pre-0017-20260905.sql`（`255,713 bytes` / SHA-256 `4F9FFBB0072B7A51BDA01CF4D27AAFA5D9EAFB113DC08F85CCF154831162AD8B`）、AUTH `apps/web/.wrangler/private-backups/d060-auth-pre-0017-20260905.sql`（`3,862 bytes` / SHA-256 `0FF8B268288B6EF675B2EAFDB867ED4FF63D27A8F321B3B06641FAC3D7E87028`）で、非空、readable、`.wrangler/` ignoreをPASSした。restoreは行っていない。

HARD GATE PASS後にAPP `0017`だけを適用し、post pending APP / AUTH `0 / 0`、APP latest `0017_task_metadata_update.sql`、operations `235 -> 235`、lifecycle guards `0 -> 0`、executions `21 -> 21`、active executions `0 -> 0`を確認した。APP `PRAGMA quick_check = ok`、FK violations `0`、read-only `rows_written = 0`、Task / Entry column・index構成不変、operations CHECKへの`UpdateTaskMetadata`追加、existing `RevertEntryStart` / `SetExecutionTimes` compatibility residue保持を確認した。AUTHも`quick_check = ok`、FK `0`、users / accounts / sessions `1 / 1 / 3`を保持した。

exact `main@18c2d6a1f41f9eeff7eba56ecb2ba3781d13658e`を`CLOUDFLARE_ENV=nonprod`でbuildし、generated configの`taskchute-web-nonprod`、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical APP / AUTH bindingを確認してdeployした。Worker versionは`0772b58e-23d1-4bef-bd49-8bd5c3e8d9b0`。safety probeはroot `200`、protected API `401`、disabled bootstrap POST `404`である。

Local evidenceはfocused SetExecutionTimes `2 / 2 PASS`、focused Task metadata `2 / 2 PASS`、Web `157 / 157 PASS`、Worker / runtime `180 / 180 PASS`、migration regression `4 scenarios PASS`、typecheck、production build、nonprod dry-run、`git diff --check`、source reviewをPASSした。real-local safety smokeはroot `200`、protected API `401`、disabled bootstrap POST `404`。authenticated nonprod in-app browserでは既存のcurrent-Day ordinary planned fixtureでTask名editor（Escape cancel）、owner Project choices、Start / End direct datetime editor（Escape cancel）を確認したが、既存current Dayにcompleted eligible fixtureがなく、save mutation、reload persistence、completed duplicate、actual persisted correctionは不可逆な既存data mutationを避けて`NOT_VERIFIED`とした。synthetic fixture、direct SQL feature mutation、restore、production accessは行っていない。新API token、permission / OAuth scope拡張、account / role変更、APP / AUTH binding変更、security posture変更は行っていない。

classification: D-060 `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / PERSISTENT_NONPROD_MIGRATED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED`。authenticated feature mutation / reload / completed duplicate `NOT_VERIFIED`、production `NOT_RUN`、Released `NO`である。

### D-059 — Day Table vertical space, stable scrollbar gutter, and full-row D&D surface — 2026-09-04

D-059はApproved Decisionとしてcanonical化済みで、Decision commit `19a3281e76631de32dd0bae2439bb0cb4b6cb22b`（`Approve Day Table viewport polish`）とimplementation commits `ccc93a98e2586a9e1f0649ac761811faed512d16`（`Polish Day Table viewport interactions`） / `39cf674c44db2857aa649a18b480f695a6382112`（interactive SVG guard hardening）をGitHub canonical `main`へfast-forward push済みである。D-058のD&D開始面だけをTask identity / Task cellからeligible planned Task row全体のnon-interactive surfaceへsupersedeし、D-058の他のinteraction・Domain / ordering semanticsは維持した。

`.shell.day-shell`をcolumn flexとして`100dvh`のminimum viewportを持たせ、`.day-surface`が`flex: 1 0 auto`でheader / toolbar下の残りを白いtable surfaceとして使うようにした。Task rowの既存`min-height: 44px`、padding、密度は意図的に増やしていない。surfaceはcontentで自然に伸び、固定height・clip・inner vertical scrollbarを追加せず、horizontal scroll ownershipは維持した。root `html`には`scrollbar-gutter: stable`を設定し、page scrollbar出現時のcentered Day UI / Sidebar横位置のshiftを防ぐ。

eligible planned row rootをD&D surface（`data-drag-surface="row"`）とし、Task / Project / read-only Section・Routine・estimate・planned-start・forecast・actual・EmptyValue・row whitespaceから既存threshold付きpointer D&Dを開始できる。checkbox、Execution control、button / link / input / select / textarea / contenteditable、Routine control、inline editor、overflow trigger / menu item、既存`isInteractiveDragTarget`対象はguardで除外した。same-cohort / same-Section Reorder、cross-Section Move、collapsed cue、keyboard `Shift+↑/↓`、planned-only / current planning boundary / retry / revision semanticsは変更していない。Bulk checkboxはheader / row共通の16×16、`aspect-ratio: 1 / 1`、paddingなし、grid中央揃えとし、checked markをdeterministic clip-path、indeterminate markを同じ中央gridで表示する。

Local evidenceはfocused Web `156 / 156 PASS`（新規D-059 layout CSS source checks、row-wide read-only cell D&D、interactive descendant no-drag、既存D&D回帰を含む）、Worker / runtime `176 / 176 PASS`、migration regression `4 scenarios PASS`、typecheck、production build、`git diff --check`、source reviewをPASSした。D-059はWeb-onlyでmigration / schema / API / Domain変更がなく、migration適用・backup・restoreは`NOT_REQUIRED / NOT_RUN`である。

persistent non-productionではexisting `taskchute-web-nonprod`へexact `main@39cf674c44db2857aa649a18b480f695a6382112`をdeployし、Worker version `2632d168-7b8f-4793-8502-f68295e05c65`を確認した。generated configは`targetEnvironment=nonprod`、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical APP / AUTH D1 binding、`migrations=[]`を示した。deploy前後のAPP / AUTH pending migrationは`0 / 0`、APP latest `0016_execution_correction.sql`、APP operations / executions / lifecycle guards / active executionsは`225 / 19 / 0 / 0`、AUTH users / accounts / sessionsは`1 / 1 / 3`。APP / AUTH `PRAGMA quick_check = ok`、FK violations `0`、read-only `rows_written = 0`を確認し、安全probeはroot `200`、protected API `401`、disabled bootstrap `404`である。既存OAuth / account / scopeをそのまま利用し、新API token、permission / scope拡張、account / role変更、binding変更、security posture変更は行っていない。

real-local Vite safety smokeはroot `200`、protected API `401`、disabled bootstrap `404`をPASSした。認証済みbrowser connectorがないため、1920×1080 / 1440×900 / 1280×720 / 720pxでのvisual viewport、actual page-scroll transition、checkbox zoom、pointer D&D gesture、consoleのreal-local UI evidenceは`NOT_VERIFIED`であり、local automated / source evidenceに限定した。productionは`NOT_RUN`、Releasedは`NO`である。

classification: D-059 `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED`。migration `NOT_REQUIRED`、authenticated feature verification `NOT_VERIFIED`、production `NOT_RUN`、Released `NO`である。

### D-058 — Day Table simplification and Execution-correction capability withdrawal — 2026-09-04

D-058はApproved Decisionとしてcanonical化済みで、Decision commit `44001b63b1704e52bc193eea5fe8ee606c663acb`（`Approve Day Table interaction simplification`）を含む実装 commit `66d63efa790c06d2efefa769595508b7c5d6dbb`（`Implement Day Table simplification`）を`main`へpush済みである。これはD-057の`開始を取り消す`と`実績入力 / 実績訂正`をUIから隠すだけでなく、current Web / API / Workerから撤去するcapability withdrawalである。normal Start / Complete、active Execution最大1、derived actual / Start Forecast、read-onlyの開始 / 終了 / 実績projectionは維持した。

Day Tableは、Bulk checkboxのunchecked / hover / checked / indeterminate / focus / disabled状態、Task identity cell全体のplanned D&D surface（interactive descendantからの誤発火なし）、Section summary row全体のpointer / keyboard collapse、eligible planned rowのfar-right `…` overflow menu（`日付変更` / `複製` / `削除`のみ）、empty data valueの専用`EmptyValue`表示へ簡素化した。既存のkeyboard reorder、same-cohort / cross-Section semantics、selection、D&D、collapse、column customization、retry / reconciliationは保持した。

`RevertEntryStart` / `SetExecutionTimes`のclient method、request/result contracts、Web state / dialog / editor、Worker handler / command path、UI専用CSSを撤去し、旧API pathはauthenticated boundaryで`404`となる。適用済み`0016_execution_correction.sql`、historical operations / lifecycle guard rows、Execution facts、schema / existing D1 dataは変更せず、reverse migration・CHECK allow-list縮小・history削除は行っていない。0016のcommand CHECK値はhistorical compatibility residueであり、現行Product capabilityへの到達経路ではない。

Local evidenceはWeb `149 / 149 PASS`、Worker / runtime `176 / 176 PASS`（withdrawn endpoint negative boundaryを含む）、migration regression `4 scenarios PASS`、typecheck、production build、`git diff --check`、source reviewをPASSした。real-local safety smokeはroot `200`、protected API `401`、disabled bootstrap POST `404`をPASSした。認証済みbrowser connectorがないため、real-local / remoteのauthenticated UI mutation、overflow / checkbox / D&D / collapseのvisual interaction、removed APIのauthenticated HTTP実環境確認以外は`NOT_VERIFIED`とし、local automated evidenceを採用した。

persistent non-productionでは、既存Cloudflare account・既存OAuth scopeの期限切れ認証を再認証してread/deploy accessを復旧した。新API token、permission / OAuth scope拡張、account / role変更、APP / AUTH binding変更は行っていない。APP / AUTH migration listは`0 / 0`（追加migrationなし、0016は再適用なし）。generated configの`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical bindingを確認し、exact `main@66d63efa790c06d2efefa769595508b7c5d6dbb5`を`taskchute-web-nonprod` version `6b9a0c23-caa2-4734-afa3-f1a3e762caa5`へdeployした。APP / AUTHのread-only `PRAGMA quick_check = ok`、FK violations `0`、`rows_written = 0`、APP latest `0016_execution_correction.sql`、operations `224`、executions `19`、AUTH users / accounts / sessions `1 / 1 / 3`を確認した。安全probeはroot `200`、protected API `401`、disabled bootstrap `404`である。

classification: D-058 `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED`。persistent nonprod migrationは`NOT_REQUIRED`、authenticated feature verificationは`NOT_VERIFIED`、productionは`NOT_RUN`、Releasedは`NO`である。

### D-057 — Execution Correction Batch v0.1 — 2026-09-04

D-057はApproved Decisionとしてcanonical化済みで、Decision commit `bcacc599b477b4eea56dd1ca158eb085360265e2`（`Approve Execution Correction v0.1`）を`main`へpush済みである。implementation commit `b3370d3d2e3de3ba113b1e3a55fbed893f3cc068`（`Implement Execution Correction v0.1`）も`main`へpush済みである。D-029の「未実行に戻す」は、現在のactiveなStartだけを対象とする狭い実装境界へ具体化した。D-057はD-029 / D-033を基礎としつつ、current Start Revertにおけるhistorical-retention semanticsを狭くsupersedeするApproved Product Decisionである。

current StartのRevertはactive Executionだけを削除し、Entryを`running -> planned`へ戻す。Section、開始予定、position、`placement_revision`は保持し、取消Executionの履歴は残さない。operation logはretry / idempotencyのため保持する。actual開始・終了時刻はplanned / running / completed Entryへ直接入力・訂正でき、derived実績、user-global no-overlap、Start Forecast reconciliationを維持する。completed Entryのactual endを消して再openする経路は拒否する。

APP compatibility migration `apps/web/migrations/app/0016_execution_correction.sql`は`operations`と`lifecycle_command_guards`のcommand CHECKだけを拡張し、functional table / column / indexを追加しない。既存operations、lifecycle guards、executions、table / index構成を保持する。

Local evidenceはD-057 focused Worker `5 / 5 PASS`（sectioned / sectionless Start→Revert、planned / running / completed actual入力・訂正、overlap rejection、forecast reconciliation、placement revision不変、Execution preservation、operation replay、completed reopen guard）、full Worker `180 / 180 PASS`、Web `150 / 150 PASS`、migration regression `4 scenarios PASS`、typecheck、production build、`git diff --check`、source reviewをPASSした。real-local safety smokeはroot `200`、protected API `401`、disabled bootstrap POST `404`を確認した。

Persistent non-productionでは、初回read-only migration listのCloudflare API 7403に対し、同じCloudflare account・既存OAuth scopeで期限切れ認証を再認証しread accessを復旧した。新API token作成、permission / OAuth scope拡張、account / role変更、APP / AUTH binding変更、その他security posture変更は行っていない。migration前pendingはAPP `0016_execution_correction.sql` / AUTH `0`。HARD GATEとしてfresh private ignored backupを取得した。APP `apps/web/.wrangler/private-backups/d057-app-pre-0016-20260904.sql`は`242,569 bytes` / SHA-256 `51EB91ADCF29614CF5516493C4028A01E29FB4E19A6932E9A9DF3C01ECA234AF`、AUTH `apps/web/.wrangler/private-backups/d057-auth-pre-0016-20260904.sql`は`3,862 bytes` / SHA-256 `30475F539BE52CD1C80EDD5956E8FDCADD03441EF392BE3942FCFB75625F468D`で、readability、schema / migration marker、SQL終端、git ignoreをPASSした。

HARD GATE PASS後にAPP `0016`だけを適用した。post-migration pendingはAPP / AUTH `0 / 0`、operations rowsは`224 -> 224`、lifecycle guardsは`0 -> 0`、executionsは`19 -> 19`で、各preservation hash、table / index names、`PRAGMA quick_check = ok`、FK violations `0`、read-only query `rows_written = 0`を確認した。operations / lifecycle guardsの新command CHECKも確認済みである。restoreは行っていない。

exact `main@b3370d3d2e3de3ba113b1e3a55fbed893f3cc068`をnonprod buildし、generated configの`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical APP / AUTH bindingを確認して`taskchute-web-nonprod` version `25e289fc-3eac-48b6-a063-706e8dcfb165`へdeployした。post-deploy APP / AUTH `quick_check = ok`、FK `0`、operations `224`、executions `19`、active executions `0`、lifecycle guards `0`、`0016` recordedを確認した。

authenticated browser connectorがこの実行環境にないため、remoteのsectioned / sectionless Start→Revert、manual actual correction、overlap / forecast / reload persistence、Routine correction、exact remote operation replayは`NOT_VERIFIED`である。synthetic fixture投入やdirect SQLによるfeature mutationは行わず、feature semanticsはlocal automated evidenceに限定した。productionは`NOT_RUN`、Releasedは`NO`である。

classification: D-057 `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / PERSISTENT_NONPROD_MIGRATED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED`。authenticated remote feature mutation / replayはremaining boundaryである。

### D-056 corrective resume — moved Routine occurrence Section start propagation — 2026-09-04

D-056はApproved済みで、implementation commit `b325580d720099e93a9036d5091b267889e4753b`（`Implement Day Operations date move`）を`main`へpush済みである。独立reviewで、moved Routine occurrenceのDefinition default propagationがcurrent / Board defaultのplanned startをaffected Dayへ再利用し、D-043 / D-044のper-Day frozen Section contextと不一致になるbugを確認した。これは新しいProduct / Domain Decisionではなく、D-043 / D-044 / D-056に適合するreversible corrective fixであり、corrective commit `72321c7b51a7aec2e1123d216262e9dd8b88d497`（`Fix moved Routine Section propagation`）を`main`へfast-forward push済みである。correctiveでは新migration / schema / dependency変更を行っていない。

`sectionPlansForUpdate`は、伝播対象の各materialized EntryについてEntry自身の`taskchute_day_id`からstable Section contextを解決し、そのDayのfrozen `logical_start_minute`をeffective planned startへ使う。RoutineDefinitionのdefault pair保存はBoard authorityどおり維持し、explicit occurrence Section-plan overrideは保護する。affected DayでSection contextが欠落する場合は全体reject、SectionなしはSection / planned startをともに`NULL`へ同期する。moved occurrenceはorigin Task / Routine identityを保持し、schedule suppressionを発生させない。

local evidenceはcorrective focused Worker `5 / 5 PASS`（current / moved futureの異なるfrozen Section start、Routine default保持、explicit override保護、same-Section start-onlyのposition不変、missing context atomic reject、Sectionなし、moved occurrence protection）である。full Worker `175 / 175 PASS`、D-047 `7 / 7 PASS`、migration regression `4 scenarios PASS`、typecheck、production build、`git diff --check`、source reviewもPASSした。Web全体は`143 PASS / 3 FAIL`で、失敗は変更前から再現する既存ambiguous Reorder 3件（D-056経路外）であり、新しいD-056 failureはない。real-local safety smokeはroot `200`、protected API `401`、disabled bootstrap POST `404`を確認した。

persistent nonprodでは初回read-only migration listがCloudflare API 7403で停止したが、Wrangler `4.125.0`のstored OAuth（既存account、既存`d1 (write)` scope）を再確認し、credential envは未設定、binding UUIDも既存nonprod D1と一致した。同じOAuth / profile / bindingを使うelevated read-only retryでAPP / AUTH read accessが回復し、token作成、permission拡張、role変更、binding変更、re-loginは行っていない。migration前pendingはAPP `0015_day_move.sql` / AUTH `0`。HARD GATEとしてfresh private ignored APP backup `apps/web/.wrangler/private-backups/d056-corrective-pre-0015-20260904-app.sql`（`242,432 bytes` / SHA-256 `B4D6D409105736F0D4DAD23DA853528DAD49EC13BE0A7DABFC181585CDBCE584`、非空、SQL marker、ignore）を取得してからAPP `0015`だけを適用した。

post-migrationはAPP / AUTH pending `0 / 0`、APP `d1_migrations` latest `0015_day_move.sql`、operations row count `224`（backup内pre-migration INSERT `224`）、`BulkMoveEntriesToDay` operations CHECK、APP `PRAGMA quick_check = ok`、FK violations `0`、read-only query `rows_written = 0`を確認した。exact `main@72321c7b51a7aec2e1123d216262e9dd8b88d497`を`CLOUDFLARE_ENV=nonprod`でbuildし、`taskchute-web-nonprod` version `3bddabf9-1c44-495b-97d3-686342241a5a`へdeployした。generated configは`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical AUTH / APP bindingを示し、remote safety probeはroot `200`、protected API `401`、disabled bootstrap `404`である。

authenticated nonprod browser connectorがないため、remoteのD-056 feature mutation、reload persistence、remote exact same-operation replay、remote future differing-context propagationは`NOT_VERIFIED`。D-041に反するsynthetic future fixtureやdirect SQL feature mutationは行っていない。local focused fixtureでrequired semanticsを確認済みである。productionは`NOT_RUN`、Releasedは`NO`である。

classification: D-056 corrective resume `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / PERSISTENT_NONPROD_MIGRATED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED`。remote authenticated feature mutation / replayはremaining boundaryである。

### D-054 corrective fix — per-affected-Day frozen Section start — 2026-09-04

GitHub independent reviewで、D-054のfuture propagationがselected current DayのSection `logical_start_minute`をaffected future Dayへ再利用する仕様不一致を検出した。これは新しいProduct / Domain Decisionではなく、Approved D-043 / D-044 / D-054内のreversible bugfixであり、migration / schema / dependency変更は行っていない。implementation commit `c0eed8452c340a2798fc6d2e62532cc7affd1c4f`（`Fix per-Day future Section start propagation`）を`main`へfast-forward push済みである。

runtimeはcurrent DayのDefinition default pairをcurrent Day frozen contextから解決する既存semanticsを維持し、各affected established Dayのtarget Section contextから`logical_start_minute`を個別に解決する。target contextが一つでも欠落する場合はoperation全体をrejectし、`Sectionなし`はaffected Day contextを要求せずSection / planned startをともに`NULL`へ同期する。same-Section start-only propagationもvisible changeとして`propagated_entry_ids`へ含めるが、position churnは発生させない。

local evidenceはcorrective focused Worker `4 / 4 PASS`（current / futureで異なるGamma start `960 / 900`、same-Section start-only、position不変、propagated id、missing context atomic reject、Sectionなし、replay）、full Worker `166 / 166 PASS`、Web `140 / 140 PASS`、typecheck、production build、`git diff --check`、source review `PASS`である。APP migration regressionは今回migration / schema変更がないため`NOT_REQUIRED`とした（既存D-054 `0013` migration evidenceは前段のcanonical blockを参照）。

exact pushed mainを`CLOUDFLARE_ENV=nonprod`でbuildし、`taskchute-web-nonprod`へdeployしたWorker versionは`34b11179-8562-4aba-825b-abe8dc185ddf`である。generated configは`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical AUTH / APP bindingを示し、root `200`、protected API `401`、disabled bootstrap POST `404`を確認した。persistent nonprod APP / AUTHはread-onlyで`PRAGMA quick_check = ok`、FK violations `0`、`rows_written = 0`、APP latest migration `0013`、future materialized Routine Entry `0`を確認した。今回はremote authenticated mutationを実行せず、remoteにestablished future Routine occurrenceが存在しないためfuture-specific remote propagationは`NOT_VERIFIED`とし、future differing-context / ordering / no-materializationはlocal focused fixtureを根拠とする。productionは`NOT_RUN`、Releasedは`NO`である。

classification: D-054 corrective fix `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED`。remote authenticated feature mutation、remote future propagation、remote exact replay、production deep mutationはremaining boundaryである。

### D-055 — Bulk Estimate change with per-Routine scope — 2026-09-04

D-055をApproved DecisionとしてcanonicalizeしたDecision commit `934708b4bb72262d86e2642e1d0fcb04b9654373`（`Approve per-Routine Bulk Estimate scope`）を`main`へpushし、runtime implementation commit `2eba5907455b92d301e57cc8b2eee087fa1aeebd`（`Implement Bulk Estimate per-Routine scope`）もfast-forward push済みである。既存Bulk Selection surfaceへcommon positive / explicit `NULL` estimateを追加し、ordinary / Routine / mixed planned Entryを一件の`BulkSetEntriesEstimateScoped` commandでatomicに処理する。Routineごとの`今回だけ` / `ルーティンに反映`、no-preselection、fill-all後の個別override、confirm前no-write、success後selection retentionを実装した。

Occurrence scopeはD-044 / D-046のexplicit estimate overrideを再利用し、Definition scopeはselected occurrenceのoverride clear、Definition default / `defaults_revision`一回増分、既存のeligible current / future planned Entryへのpropagationを行う。explicit override、past / running / completed / suppressed / protected stateは保持し、future materializationは行わない。ordinary-onlyはestablished current / future Dayを許可し、Routineを含むrequestはserver canonical current Dayだけを許可する。Section、planned start、position、Day `placement_revision`は変更しない。APP `0014_bulk_estimate_scoped.sql`は`operations`と既存`routine_command_guards`のcommand CHECKだけをrebuildし、既存row / schema / table / identityを保持するcompatibility-only migrationである。

local evidenceはD-055 focused Worker `4 / 4 PASS`（mixed positive、explicit NULL、Routine scope validation、same-definition consistency、stale revision、atomic no-partial-write、semantic replay、ordinary established future Day、placement revision不変）、full Worker `170 / 170 PASS`、D-055 Web focused `2 / 2 PASS`、typecheck、production build、`git diff --check`、migration regression `4 scenarios PASS`（fresh `0001 -> 0014`、representative preservation / CHECK constraints）、source review `PASS`である。Web全体は`139 PASS / 3 FAIL`で、失敗は変更前から再現した既存ambiguous Reorder 3件（D-055経路外）である。real-localではlocal Vite Worker smokeのroot `200`、protected API `401`、disabled bootstrap `404`を確認した。browser connectorがこの実行環境にないため、authenticated browser UI mutationは`NOT_VERIFIED`とし、local Worker / Web automated evidenceを採用した。

persistent nonprodではAPP pending `0014_bulk_estimate_scoped.sql`、AUTH pending `0`を確認した後、HARD GATEとしてfresh private ignored backupを取得した。APP `.wrangler/private-backups/d055-app-pre-0014-20260904.sql`は`242,239 bytes` / SHA-256 `6117341C22F425413DF46CA15A609AC0728FEC83687D222DFB5B59C7A73D7854`、AUTH `.wrangler/private-backups/d055-auth-pre-0014-20260904.sql`は`3,862 bytes` / SHA-256 `30475F539BE52CD1C80EDD5956E8FDCADD03441EF392BE3942FCFB75625F468D`で、非空、readable、schema / migration marker、SQL終端、ignore状態をPASSした。APP `0014`を適用後、APP / AUTH pending `0 / 0`、APP migration `0014`、APP operation row count `224`（pre-backup insert statements `224`）、table構成、operations / routine guard新command CHECK、APP / AUTH `quick_check = ok`、FK `0`、read-only `rows_written = 0`を確認した。

exact `main@2eba5907455b92d301e57cc8b2eee087fa1aeebd`をnonprod buildし、generated configの`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical APP / AUTH bindingを確認した。`taskchute-web-nonprod` version `e41085e0-792e-4ec1-a4b3-35990505949a`へdeployし、root `200`、protected API `401`、disabled bootstrap `404`、future materialized Routine Entry `0`を確認した。既存nonprod authenticated credential / browser connectorがなく、D-055 remote feature mutation、reload UI、remote exact replayは`NOT_VERIFIED`。synthetic future fixture投入やdirect SQL feature mutationは行っていない。productionは`NOT_RUN`、Releasedは`NO`である。

classification: D-055 `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / PERSISTENT_NONPROD_MIGRATED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_SAFETY_VERIFIED`。authenticated remote feature mutation、remote exact replay、production deep mutationはremaining boundaryである。

### Bulk Selection v0.2B2 — per-Routine Section propagation scope — 2026-09-04

D-054をcanonicalなApproved Decisionとしてcommit `73bd8b597189083dcb39e04a6d69b22f4cee456a`（`Approve per-Routine Bulk Section scope`）で`main`へpushし、runtime implementation commit `ddbf882e2ec9487175ccdc96e5d27184d8a1b5b2`（`Implement per-Routine Bulk Section scope`）も`main`へpush済みである。APP compatibility migrationは`apps/web/migrations/app/0013_bulk_routine_section_scoped.sql`で、`operations.command_type`のCHECKへ`BulkMoveEntriesToSectionScoped`だけを追加するrebuildとし、既存command type / operation row / field、RoutineDefinition、RoutineOccurrence、Entry、TaskChuteDay、Section、suppression、PK / FKとtable数を保持した。

新commandはordinary / Routine / mixedのselected Entryを一件のatomic outcomeへまとめ、ordinaryはcurrent Dayだけ、Routineはrowごとに未選択から`今回だけ`または`ルーティンに反映`を選ぶ。`すべて今回だけ` / `すべてルーティンに反映`は明示fill-all helperで、helper後の個別override、未選択時のconfirm disabled、cancel / Escape / dismissのno-write、成功後のselection retentionを実装した。Occurrence scopeはD-053 semantics、Definition scopeはD-044 semanticsを再利用し、unique Definitionごとの`defaults_revision`を一回だけ増分、selected current overrideをclear、already-materializedなeligible current / future planned Entryへpropagateし、explicit override / past / running / completed / protected stateとfuture materializationを保護する。affected Dayごとのvisible changeはplacement revisionを一回だけ増分し、moverはpre-mutation canonical display orderでcross-definition appendする。owner / lifecycle / suppression / snapshot / Day / default revision guard、atomic rollback、operation fingerprint / replay / misuse boundaryを維持した。

local evidenceはB2 focused Worker `2 / 2 PASS`（mixed occurrence + multi-definition propagation、scope validation、semantic array-order replayを含む）、full local `npm test` `164 / 164 PASS`、Web `140 / 140 PASS`、migration regression `4 scenarios PASS`（fresh `0001 -> 0013` / representative `0012 -> 0013` preservation / CHECK constraints）、typecheck、production build、`git diff --check`、source review `PASS`である。real-localではAPP `0013` migration後、ordinary + RoutineのB2 scope dialogでno-preselection、fill-all、個別override、disabled-to-enabled confirm、one-command mutation、reload、Routine Board defaultを確認し、local D1 `BulkMoveEntriesToSectionScoped` success、Routine occurrence override / Definition default、Day revision、`quick_check = ok`、FK `0`を確認した。future established Day、eligible propagation、explicit override protection、same-future-Day ordering、no-materializationはfocused Worker fixtureでも`PASS`した。

persistent nonprodではAPP binding `6ad7e35f-5d03-4be3-9b00-46cd713a51c3`、AUTH binding `60085f8d-0c4e-4c15-98e9-3ce178398041`を確認し、migration前 pendingはAPP `0013_bulk_routine_section_scoped.sql`のみ / AUTH `0`だった。HARD GATEとしてfresh private ignored backupを取得し、APP `apps/web/.wrangler/private-backups/b2-app-pre-0013-20260904.sql` `231,555 bytes` / SHA-256 `87BEDF1A0030707E7C673DB441E590D009555A239BAB307DD5595E553F568510`、AUTH `apps/web/.wrangler/private-backups/b2-auth-pre-0013-20260904.sql` `3,862 bytes` / SHA-256 `30475F539BE52CD1C80EDD5956E8FDCADD03441EF392BE3942FCFB75625F468D`を取得した。両方とも非空、D1 export / schema marker / migration table、SQL終端、readability、ignore状態を確認してからAPP `0013`だけを適用した。post-migration pendingはAPP / AUTH `0 / 0`、`d1_migrations`は`0013`まで、`PRAGMA quick_check = ok`、FK violations `0`である。restoreは行っていない。

exact implementation mainをnonprod buildし、generated configの`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical bindingを確認した。`taskchute-web-nonprod`へdeployしたWorker versionは`432ba02e-2d95-4d0d-a026-5f5afc2383c5`である。authenticated browserでは、最初のRoutine 3件のoperation `01a06955-b70c-77f2-a274-c15b4569c9d9`でEvening / `20:00`を選び、Occurrence scope 1件、Definition scope 2件、selected current override clear、Definition defaults revision `0 -> 1`、Day revision `1 -> 2`、reload persistence、Routine Board Evening / `20:00`を確認した。その後、verification-only ordinary Entry `01a0695a-e1ed-77e3-8773-425b80760c59`（`routine_occurrence_id = NULL`）とRoutine 2件を混在させ、operation `01a0695b-3452-7736-afd4-e3ff574cc000`を一件だけ実行した。targetはDay / `12:00`、ordinary + Routineの3件すべてがcurrent Dayで変更され、Routine AはOccurrence override、Routine BはDefinition unchanged、Routine Cはdefaults revision `1 -> 2`・selected override clearとなり、Day revisionは`3 -> 4`、reload後も3件のSection / startが保持された。既存operation row / identity / task relationは保持されている。

nonprod remoteには実行時点でcurrent Day以外のmaterialized Routine occurrenceが無く、未来日はD-041どおりpreviewのままDay / Routineをmaterializeしなかった。future propagation、explicit future override protection、multi-definition future orderingはreal-local focused fixtureで確認した。同一operation replayはlocal focused WorkerでPASSし、nonprod D1 operation logは各logical command一row・defaults / placementの二重増分なしを確認した。browser pluginのpage evaluationはread-onlyでremote exact replay requestを直接発行できないため、nonprod exact replay probeは`NOT_VERIFIED`として残す。1280px browser viewport、console warnings / errors `0 / 0`、root `200`、protected API `401`、productionは`NOT_RUN`、Releasedは`NO`である。

classification: Bulk Selection v0.2B2 `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / PERSISTENT_NONPROD_MIGRATED / PERSISTENT_NONPROD_VERIFIED`。Bulk estimate / date / Project / Mode / Note、cross-Day move、future / past Routine direct Bulk edit、undo / restore、remote materialized-future propagation、remote exact replay、production deep mutationはremaining boundaryである。

### Bulk Selection v0.1 — 2026-09-03

D-051をcanonicalなApproved Decisionとしてcommit `a7ef32b2f99263c705306b1c5caeca2a535c89f8`（`Approve Bulk Selection v0.1`）で`main`へ統合し、runtime implementation commit `c0c8799f1ae5fd1b14fd5f87259adda02ffca504`（`Implement Bulk Selection v0.1`）と、browserで検出した720px Columns popover overflowの修正commit `ae7cd5c980f202bad5ca36e2967a010d8457cc1e`（`Fix narrow bulk columns menu overflow`）をcanonical `main`へpush済みである。

current established Dayのeligible planned Entryをreserved Bulk slotのrow checkbox / header select-allからstable Entry IDで選択し、collapse Sectionを含む全Day projectionへselect-allを適用する。selectionはephemeral Web stateで、collapse / column preference / Sidebar変更では維持し、reconcileでpruneし、reload / Day navigation / logout・identity change / successでclearする。明示確認ではordinary EntryをこのDayからremoveし、Routine-derived Entryを当日だけ`skip`し、single atomic `BulkDeleteEntries` command、owner / placement revision guard、operation replayを利用する。running / completed / historical / preview / locked state、Task hard delete、RoutineDefinition変更、productionは対象外である。

local evidenceはBulk Worker focused `6 / 6 PASS`、Worker全体 `154 / 154 PASS`、Web App focused `132 / 132 PASS`、Web全体 `138 / 138 PASS`、fresh `0001 -> 0010` / existing `0009 -> 0010` migration regression `4 scenarios PASS`、typecheck、production build、`git diff --check`、source review `PASS`。real-local APP `0010` migration、authenticated browserのselection / mixed confirmation / cancel・Escape focus / select-all mixed state / collapse・columns persistence / reload selection clear、1920 / 1440 / 1280 / 720px responsive、console warnings / errors `0 / 0`を確認した。

persistent nonprodではmigration前にAPP / AUTHのprivate ignored SQL backupを取得し、非空・読込可能性を確認した。APP `0010_bulk_selection_delete.sql`を適用、AUTHは変更せず、APP / AUTH pending migration `0 / 0`、APP `PRAGMA quick_check = ok`、FK violations `0`、read-only query `rows_written = 0`を確認した。exact latest `main@ae7cd5c`を`CLOUDFLARE_ENV=nonprod`でbuildし、`taskchute-web-nonprod`（`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical AUTH / APP binding）へdeployしたWorker versionは`1eed0ee4-313f-46f9-9e7b-4bd884fcf7ec`である。authenticated nonprod browserではordinary / Routine-derived mixed selection、explicit confirmation copy、final `削除`、reconciliation、reload、Routine Board、1920 / 1440 / 1280 / 720pxのpage overflow `0`・Columns popover viewport内・table-owned overflow、console `0 / 0`を確認した。root `200`、unauthenticated protected API `401`、disabled bootstrap POST `404`も確認した。

persistent nonprod mutation evidence（2026-09-03）は、Day `01a0557e-ae83-7596-bf8d-96f3de2bc3cc`の`placement_revision 18 -> 19`で実施した。ordinary verificationはTask `01a0557e-ae83-7349-9cb8-247be7580dab`（`Day Nav nonprod verification 2026-09-03`）、Entry `01a0557e-ae83-7f83-af32-5e4b80cc28b2`で、Entryは削除、Taskは保持、Execution factsは`0`、同Taskの他Day Entryは変更なしである。Routine verificationはDefinition `01a06296-bc0f-7601-a272-4d120cae448e`、Occurrence `01a06424-9566-7d27-b257-b757cf95d871`、Entry `01a06424-9566-7c26-a3f2-26ab77614782`で、Entry / Occurrence / Definitionを保持し、suppression exactly `1`、`reason = 'skip'`、`suppressed_at` populatedとなった。operation `01a06600-254f-7a0d-ba7b-8ab71a89d063`は`BulkDeleteEntries / success`を1 rowだけ記録し、resultはordinary 1件削除・Routine 1件skip・revision `19`を識別する。

同一operation retryは通常UIで作成した別のverification-only mixed pair（ordinary Entry `01a06603-f1e7-7661-b10c-3d9cc22d1749` / Task `01a06603-f1e7-793d-b2eb-db3482fdd9c4`、Routine Entry `01a06604-0bd3-7861-bfa2-627eb308a858` / Definition `01a06604-587a-7c25-b597-79c181abc245` / Occurrence `01a06604-587a-7f9f-8d03-36da5c69fa18`）で同じconfirmationのfinal `削除`を二重送信して確認した。Day revisionは`21 -> 22`のexactly `+1`、retry operation `01a06605-2ae5-732a-bddb-cdec748bde65`は`BulkDeleteEntries / success`の1 rowのみ、Routine suppressionは1件のみで、second effectはなかった。両mutation後のreloadで対象Entryは再表示されず、Routine BoardではRoutineが`ON`、scheduleは`daily`、open pauseは`0`であり、future scheduleをmaterializeしていない範囲でRoutine継続を確認した。APP `quick_check = ok`、FK violations `0`、active Execution `0`を再確認した。classification: Bulk Selection v0.1 `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / PERSISTENT_NONPROD_MIGRATED / PERSISTENT_NONPROD_VERIFIED`、production feature verification `NOT_RUN`、Released `NO`。verification中のcode / migration変更は`none`、restore / cleanup / production accessは行っていない。

### Bulk Selection v0.2A — 2026-09-03

D-052をApprovedとしてcanonicalizeしたDecision commit `0398477f8f149a32af940e3d0aca0cfce5b1bc41`（`Approve Bulk Section change v0.2A`）に続き、runtime implementation commit `1a21c313d131d0a8e3673a9c4b68bce3282c30ff`（`Implement Bulk Section change v0.2A`）を`main`へpush済みである。既存D-051 Bulk Selectionを再利用し、established current Dayのordinary planned Entryだけを一つの`BulkMoveEntriesToSection` commandで同一Day内のtarget Sectionへ移動する。Routine-derived、running、completed、historical / preview / locked stateはSection change対象外で、Routineを含むselectionはUI / serverの両方でrejectし、silent skipやdefault plan変更を行わない。

commandはserverがtarget Section contextの`logical_start_minute`を解決し、real Sectionでは`section_id`と`planned_start_minute`を同期、`Sectionなし`では両方を`NULL`へ同期する。owner / Day / expected placement revision / selected-entry snapshotをatomic guardで検証し、変更Entryがある場合だけDay revisionをcommand全体でexactly `+1`する。moverはcommand直前のcurrent Day display orderを保ってtarget group末尾へappendし、同一Sectionのstart-only syncとcanonical no-opではposition churn / revision incrementを起こさない。selectionは成功後に維持し、reload / Day navigation / logoutでは従来どおりclearする。

local evidenceはfocused Bulk Section Worker `5 / 5 PASS`、Worker全体 `159 / 159 PASS`、Web全体 `140 / 140 PASS`、migration regression `4 scenarios PASS`（0011を含むfresh chain / existing operations preservation / constraints）、typecheck、production build、`git diff --check`、source review `PASS`。real-localではAPP `0011` migration、異なるSectionのordinary planned TaskをEveningへ一括変更、target start / display order、selection retention、reload persistence / selection clearを確認した。

persistent nonprodではAPP pending `0011_bulk_section_change.sql`のみを確認し、APP migration後はAPP / AUTH pending `0 / 0`、APP operations `197` rowのcount / aggregate / command distributionをmigration前後で保持、`BulkMoveEntriesToSection` CHECKだけのschema拡張、APP `quick_check = ok`、FK violations `0`、read-only query `rows_written = 0`を確認した。migration前のfull DB backupは安全審査の初回拒否により取得できなかったが、Contractのrecovery-validationとしてpost-migrationのprivate ignored SQL backupをAPP `209,818 bytes` / SHA-256 `52A05664C6C28631BCA22F8AC02878F0447E22F93775B4371A5D5335D3D22F51`、AUTH `3,862 bytes` / SHA-256 `30475F539BE52CD1C80EDD5956E8FDCADD03441EF392BE3942FCFB75625F468D`で取得し、SQL構造・終端・readabilityを確認した。restoreは行っていない。

exact `main@1a21c313d131d0a8e3673a9c4b68bce3282c30ff`を`CLOUDFLARE_ENV=nonprod`でbuildし、generated configのWorker `taskchute-web-nonprod`、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical AUTH / APP bindingを確認した。Worker version `68c4964f-a73d-4e8c-a3d3-3ce5364d2bda`へdeployし、root `200`、unauthenticated protected API `401`、disabled bootstrap POST `404`を確認した。

authenticated nonprod browserでは、verification-only ordinary Tasks 3件をSectionなし / Morning / DayからEveningへ一つのcommandで移動し、server-derived `20:00`、stable append positions `3 / 4 / 5`、selection retentionを確認した。reload後はEvening / `20:00`とSectionなし / `NULL` planned startが保持され、selectionはclearされた。AをSectionなしへ移動したmutationはrevision `26 -> 27`、B/Cのsynchronized Evening no-opは`changed_entry_ids=[]`かつrevision `27`不変である。APP operationsはmigration直後 `197`、Task追加後 `200`、Bulk Section success `3` row後 `203`で、first bulk result revision `26`、Sectionなし result revision `27`、no-op result revision `27`を記録した。double-click retry probeでもfirst operationは1 rowに留まり、exact same-operation replay / injected rollbackはlocal automated evidenceでPASSした。verification Task / Entryはcleanupせず残置し、削除・restore・production accessは行っていない。

classification: Bulk Selection v0.2A `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / PERSISTENT_NONPROD_MIGRATED / PERSISTENT_NONPROD_VERIFIED`、production feature verification `NOT_RUN`、Released `NO`。Bulk Section v0.2AのRoutine bulk / date / Project / Mode / Note、cross-Day move、undo / restore、production deep mutation、full persistent same-operation replay probeはremaining boundaryである。

### Bulk Selection v0.2B1 — Routine-inclusive Section occurrence change — 2026-09-03

D-053をApprovedとしてcanonicalizeしたDecision commit `e398d2b3a5e0a3937fe35169fe1e69162a26b6dd`（`Approve Routine Bulk Section occurrence change`）に続き、runtime implementation commit `70d88e2be8d33ada2e520029f2b322301d30c5d0`（`Implement Routine Bulk Section occurrence change`）を`main`へpush済みである。D-052のcurrent-Day Bulk Section surfaceを拡張し、ordinary / Routine / mixedのplanned Entryを一つの`BulkMoveEntriesToSectionOccurrence` commandで同一Day内のtarget Sectionへ変更する。Routineを含む場合も明示的な`今回だけ変更` acknowledgementを要求し、RoutineDefinition、default、future Day / other Occurrence、Routine Board設定は変更しない。

real SectionではserverがDay Section contextの`logical_start_minute`を解決して`section_id + planned_start_minute`を同期し、`Sectionなし`ではordinary / Routineとも`NULL + NULL`へ同期する。Routineはexisting R2A typed fieldsの`section_plan_override_present` / `section_override_id` / `planned_start_override_minute`をOccurrenceへ保存し、同じeffective pairでもno overrideならoverride-only changeとしてpersistする。既存same overrideはtrue no-opとし、visible placement change時だけDay `placement_revision`をcommand全体でexactly `+1`する。moverはmixed selectionでもcommand前のDay display orderを保ってtarget末尾へappendする。

APP compatibility migration `0012_bulk_routine_section_occurrence.sql`は`operations` tableの`command_type` CHECKに`BulkMoveEntriesToSectionOccurrence`を追加するためのrebuildだけで、既存operation rows、Entry / Routine / Section / Day schemaを変更せず、新tableも追加しない。local migration regressionはfresh `0001 -> 0012`、existing preservation / constraintsを含む`4 scenarios PASS`。local focused Worker `8 / 8 PASS`、Worker全体 `162 / 162 PASS`、Web App focused `2 / 2 PASS`、Web全体 `140 / 140 PASS`、typecheck、production build、`git diff --check`、source reviewは`PASS`である。real-localではAPP `0012` migration、mixed visible move、acknowledgement前no-write、selection retention、reload、Routine Board、Sectionなし、override-only、same-effective existing override、narrow table-owned scroll、console warnings / errors `0 / 0`を確認した。

persistent nonprodではAPP / AUTH binding（`taskchute-app-nonprod` / `taskchute-auth-nonprod`）を確認し、APP pending `0012`のみ、AUTH pendingなしを確認した。migration前のfresh private ignored SQL backupはAPP `212,706 bytes` / SHA-256 `1B34E6955CEDA74BE317E91889BCAF17B2C1F7B265C7AC4729CA7E96FD50154B`、AUTH `3,862 bytes` / SHA-256 `30475F539BE52CD1C80EDD5956E8FDCADD03441EF392BE3942FCFB75625F468D`で取得し、非空、D1 export header、migration table / schema marker、SQL終端、readability、ignore状態を確認した。HARD GATE PASS後にAPP `0012`だけを適用し、AUTHは変更していない。適用後 pending `0 / 0`、APP operationsはmigration前`203` rowのcount / command distributionを保持、schema metadataで新command CHECKを確認、APP / AUTH `PRAGMA quick_check = ok`、FK violations `0`を確認した。restoreは行っていない。

exact `main@70d88e2be8d33ada2e520029f2b322301d30c5d0`を`CLOUDFLARE_ENV=nonprod`でbuildし、generated configのWorker `taskchute-web-nonprod`、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical AUTH / APP bindingを確認した。Worker version `24c6e42d-0632-448e-bb6f-4a8956d9c71e`へdeployし、authenticated nonprod browserでverification-only ordinary / Routine Taskを作成した。mixed moveはrevision `33 -> 34`、Morningのserver-derived start `04:00`、stable positions `3 / 4`、Routine override presentを確認し、same mixed pairのSectionなし変更は`34 -> 35`、ordinary / Routine `NULL + NULL`とRoutine explicit NULL overrideを確認した。no-override RoutineのSectionなしoverride-onlyはrevision `36`不変、`changed_entry_ids=[]`、override presentを確認した。各confirmation前のDBはno-write、成功後selectionは保持、reloadでplacement / overrideを復元しselectionはclear、RoutineDefinition defaultsは`NULL / NULL`・`defaults_revision=0`、Routine schedule `1` / Board item `1` / suppression `0`、Task / Entry `3 / 3`、RoutineDefinition / Occurrence `2 / 2`を確認した。B1 operationは`3` rows、APP final `quick_check = ok`、FK `0`、AUTH final `quick_check = ok`、FK `0`、console warnings / errors `0 / 0`である。verification dataはcleanupせず残置している。

classification: Bulk Selection v0.2B1 `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / PERSISTENT_NONPROD_MIGRATED / PERSISTENT_NONPROD_VERIFIED`、production feature verification `NOT_RUN`、Released `NO`。Bulk `Routineへ反映`、multi-RoutineDefinition default propagation、future / past Routine bulk edit、Bulk date / Project / Mode / Note、cross-Day move、undo / restore、production verificationはremaining boundaryである。

### Day Table columns menu + customization + actual projection v0.1 — 2026-09-03

implementation commit `2bf40a0`（`Add Day Table columns menu`）と既存のcolumn customization / actual projection commitsはGitHub canonical `main`へIntegrated済み。default visible orderは`実行 | Task | Project | Section | Routine | 見積 | 開始予定 | 開始見込 | 開始 | 終了 | 実績`。Bulk / Execution / Taskはfixed UI slots、Project以後の9 data columnsはregistry-driven heading / draft / row alignment、header reorder、shared resize、double-click auto-fit、Columns menu hide/showの対象である。order / width / hiddenは`taskchute.web.day-columns.v2`へbrowser-localに保存し、Server / API / D1 / cross-device同期は行わない。

Routine columnはordinary current planned Entryをmuted SVG icon action、Routine-derived Entryをaccent non-button icon、running / completed / non-current / lockedをmuted non-interactive iconとして表示する。開始 / 終了 / 実績は`execution_summary`（first start、last ended、completed duration、active start）からのread-only projectionで、複数Executionを集計し、logical Dayのextended timeを表示する。manual correction / cancellation / history rewriteは追加していない。

local focused column / Webは`127 / 127 PASS`・`133 / 133 PASS`、typecheck、production build、`git diff --check`、source reviewは`PASS`。Worker / D1 / migration / dependencyはWeb-only impact analysisにより`NOT_REQUIRED`。persistent nonprodはexact `main@2bf40a0`を`taskchute-web-nonprod`へdeployし、Worker version `e6d9691b-c3e4-4334-9b06-96379bea5e9d`、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、AUTH `60085f8d-0c4e-4c15-98e9-3ce178398041`、APP `6ad7e35f-5d03-4be3-9b00-46cd713a51c3`、pending migration `0 / 0`を確認した。

authenticated nonprod browserではColumns menu、Project / Routine / actual columnsのhide/show、hide時のtable width縮小、custom Project width `150 → 220`のhide/show・reload保持、`すべて表示`、`初期状態に戻す`、normal / draft / fixed-slot alignmentを確認した。1920 / 1440 / 1280 / 720px responsiveではpopoverがviewport内、page overflowなし、720px Sidebar close / reopenも`PASS`。Routine iconとcompleted actual（開始 `10:04` / 終了 `10:04` / 実績 `0分`）はshow後も保持された。Browser Cuaのheader column D&Dは表示・orderとも変化しないno-opだったため`NOT_VERIFIED`とし、local D&D regressionをPASS evidenceとする。console `0 / 0`。APP / AUTH remote read-only `quick_check = ok`、FK violations `0`、read-only query `rows_written = 0`、root `200`、protected API `401`、disabled bootstrap POST `404`であり、layout preferenceはDBへ書き込んでいない。

classification: Day Table columns menu + customization + actual projection v0.1 `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / PERSISTENT_NONPROD_VERIFIED`、production feature verification `NOT_RUN`、Released `NO`。Mode / Note、fixed slot hide/reorder、Sidebar resize、Server / cross-device preference、actual manual correction、cross-Day / fuller context interactionはremaining boundaryである。Bulk Selection v0.1は直前のcurrent status blockを参照する。

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

Day Table foundationは`docs/DESIGN.md`をcanonical UI targetとし、UI-1 / UI-2A / UI-2B / UI-2C / cross-Section D&D v0.1、Start Forecast v0.1、Day Table columns menu + customization + actual projection v0.1、Bulk Selection v0.1はcurrent `main`へImplemented / Integrated済みである。default visible orderは`実行 | Task | Project | Section | Routine | 見積 | 開始予定 | 開始見込 | 開始 | 終了 | 実績`で、独立した`状態` / `並び替え`列はなく、Task row surfaceからのcross-Section append D&Dと`Shift+↑/↓` keyboard reorder、独立Routine列を持つ。UI-2Aのhorizontal-scroll foundation、presentation-only Bulk slot、Bulk / Execution / Task fixed-left structure、UI-2BのSection collapse / expandとbrowser-local reload persistence、UI-2Cのsame-Section / same-cohort Task D&D、cross-Section v0.1、D-032のread-only開始見込、Project以後のcolumn reorder / resize / auto-fit / hide / show / browser-local v2 order-width-visibility preference、Execution factsからのread-only actual projection、D-051のBulk Selection actionを実装済みである。visible `↑/↓` buttonsは撤去し、Routine-derived / running / completed / read-only / preview / locked write、Mode / Note、fixed slot hide / reorder、actual manual correction、Search / Filterは引き続き未実装である。Server同期・cross-device persistenceはcolumn customizationを含め対象外である。

Settings v0.1はcommit `51242b08e015817108010839cd5234959da2fed5`でcurrent `main`へImplemented / Integrated済みで、source review、local browser、persistent nonprod authenticated browser / integrityはPASSした。新しいProduct / Domain Decisionは追加しておらず、broader Project管理、Mode Settings、Sidebar resize / saved custom width等を実装済みへ昇格しない。Sidebar open / closed preferenceはDesktop Day wide layout v0.1で実装済みである。

Day Navigation v0.1はcommit `6f183c28242a1cd30211ea8e0c4f1e1dc23329bb`でGitHub `main`へImplemented / Integrated済みで、D-041に従うprevious / next、custom calendar、Today return、keyboard navigation、未来日のnon-persistent preview / atomic planning establishmentと、D-042に従うpast unestablished record-none / read-only表示を含む。source review / local automated / signed-in general browser / persistent nonprod general verificationは`PASS`。remote logout → relogin、cross-owner、config-change / failure / retry / concurrency等の詳細subcaseは`NOT_RUN`またはlocal-only evidenceを維持し、productionは`NOT_RUN`、Releasedは`NO`。future Routine preview、past historical correction、non-current DayのStart / Completeは引き続きscope外である。

UI-1のstructural prerequisite完了に加え、D-044 / D-045 / D-046でR2A first-slice scope-choice / override / reset / propagation、legacy normalization、typed occurrence persistence、default concurrency controlを確定し、implementation commit `7d3c0cb0881dfc11725af6ff45eabad69f86a22a`としてGitHub `main`へIntegratedした。Source Review / local automated / real-local `0007` migration・preservation / signed-in browser verificationは`PASS`。persistent nonprodでもAPP `0007` migration / preservation、deployment `4e493bc3-68ac-4b1b-a74e-ad9eb01e71ff`、Worker version `b18c5dab-6976-4564-815e-78dda6024b34`のauthenticated representative browser A〜M、future no-materialization、established-past read-only、Routine終了、final integrityを`PASS`した。multi-Day propagation、retry / concurrency / ambiguity / rollback等はlocal automated evidenceであり、remote browser multi-Day evidenceへ拡張しない。

Routine R2A persistent nonprod gateは完了した。次のProduct development workはcanonical Product / Open Questionsから別途選定し、broader Routine recurrence / future-past editing / 0..* Entry authority、UI-2以後等を自動的に実装済みへ広げない。legacy authorityを解決できないdata、current D1 safe boundsを越えるpropagation、D-045 / D-046を越えるcompatibility changeが判明した場合はMaterial reviewへ戻す。R1 real-browser controlled inclusive end-dateとdeployed non-null inclusive-date subcheckはtooling boundaryにより`NOT_VERIFIED`を維持し、productionは別gateとする。

1. direct bootstrap POST / public signup remote POST、B1 real Japanese IME、B3 next-Day real-browser materialization、B3 remote raw console exact countは未検証の境界を維持する。
2. nonprod test data / session retention・cleanup policyは別Open Questionとして維持する。
3. D-049 initial production deployment / bootstrap / smokeは`PASS`しReleased `YES`。custom domain、Access、paid criteria、broader security / DRとproduction deep feature mutationは別Decision / verification scopeとし、nonprod PASSを自動継承しない。
4. R1を越えるRoutine recurrence / override / projection、Documents / Review / Android等は別scopeとして維持する。

B1 / B2 / B3 / R1 / Routine R2A / R2Bのpersistent nonprod remote PASSを個別featureのproduction deep verificationと混同しない。D-049 initial production release scopeは`PASS` / Released `YES`だが、Routine R2Bを含むfeature-specific production mutation、remote multi-Day propagation、詳細reliability subcaseは`NOT_RUN`または既存の限定evidenceを維持する。

## D-067 — Completed Entry hard delete v0.1

Canonicalized from the Product Owner Approved Task Contract at the start SHA `2edcf4408fcd747cf80c11e217091675578f49e2`. D-067 adds the separate `DeleteCompletedEntry` command for one explicitly confirmed `completed` Entry on the server-authoritative current Day. It deletes the Entry and all attached Executions atomically, increments placement revision exactly once, retains Task / Project / Routine identity and the RoutineOccurrence, and relies on the retained occurrence to prevent same-day rematerialization. Planned delete remains `BulkDeleteEntries`; completed bulk, undo/restore, past/future/running mutation, production operation, and schema/FK weakening are excluded.

Implementation / local integration evidence is complete in commit `9747366fee0a7e74d70540cd922a9f55df6bbb55`, pushed fast-forward to `main`. Focused D-067 Worker `7 / 7 PASS`, focused Web `187 / 187 PASS`, full Worker / D1 `191 / 191 PASS`, full Web `203 / 203 PASS`, typecheck, production build, `git diff --check`, fresh-through-0020 isolated migration, and `0019 -> 0020` upgrade preservation all PASS. The repository migration helper did not complete within its tooling run, so the direct isolated fresh / upgrade checks are the relied-upon migration evidence.

Persistent nonprod evidence (2026-09-06): initial generated-config APP migration-list read hit Cloudflare API `7403`, while AUTH read succeeded. Read-only diagnosis confirmed the existing Wrangler OAuth/account, canonical APP/AUTH database IDs, `d1 info`, and `SELECT 1`; no token, OAuth scope, account/role, binding, or security-posture change was made. Retrying with the canonical `wrangler.jsonc --env nonprod` path showed APP pending `0020_delete_completed_entry.sql` and AUTH pending `0`.

The pre-migration backup HARD GATE then passed. APP backup `apps/web/.wrangler/private-backups/d067-pre-0020-app-20260906.sql` is `110,769 bytes`, SHA-256 `47BF1A6F56C61D267FCF89FE2C2D6488CCA31C1F8701AC7BAD5D0959A31E4E91`; AUTH backup `apps/web/.wrangler/private-backups/d067-pre-0020-auth-20260906.sql` is `4,704 bytes`, SHA-256 `E70BF2930AB0106607FFA81A0B15B57598F042166DD7F55B2EB3A53ADC0380AA`. Both were non-empty, readable, `.wrangler/`-ignored, and imported only into isolated SQLite recovery files: APP / AUTH `quick_check = ok`, FK violations `0`; recovery aggregates included APP `entries / executions / operations = 14 / 13 / 102` and AUTH `users / sessions = 1 / 5`. No remote restore was performed.

After the gate, only approved APP `0020_delete_completed_entry.sql` was applied. Post-migration APP / AUTH pending is `0 / 0`; APP `quick_check = ok`, FK violations `0`, active executions `0`, orphan executions `0`, entries / executions / operations `14 / 13 / 102`, and the operations CHECK contains `DeleteCompletedEntry`. Exact pushed main deployed to `taskchute-web-nonprod` as Worker version `cf45a294-84f7-4f09-869f-16cced6764bb` with canonical APP / AUTH bindings, `RUNTIME_ENV=nonprod`, and `BOOTSTRAP_ENABLED=false`. Safety probe passed: root `200`, unauthenticated protected API `401`, disabled bootstrap `404`.

Authenticated browser verification opened the existing current-Day completed-row `… → 削除` action and confirmed the exact destructive modal title/body and `キャンセル` / `完全に削除` controls. Cancel closed the modal, retained the row, and restored focus to the overflow trigger. The `完全に削除` control was not activated; no persistent `DeleteCompletedEntry` command or Entry/Execution deletion was sent. Final read-only APP/AUTH checks remained `quick_check = ok`, FK violations `0`, APP entries / executions / operations `14 / 13 / 102`, active executions `0`, orphan executions `0`, AUTH users / sessions `1 / 5`.

Required handoff boundary: `PERSISTENT_NONPROD_DESTRUCTIVE_HARD_DELETE = NOT_RUN_BY_CONTRACT / HARD STOP BEFORE FIRST WRITE`. Production, restore, branch, PR, merge, tag, and release remain `NOT_RUN`; no security posture or binding change was made. Product Owner approval is required before sending the first persistent nonprod `DeleteCompletedEntry` command against a controlled disposable completed Entry.

D-067 serial-dispatcher corrective (2026-09-06): independent review identified that the completed-delete confirmation and retained retry could bypass D-066's global serial dispatcher. From `main@d9bb90e5f60d20ad3a3e16866b1ad5053daaebdb`, corrective implementation commit `b2c4d6a29240e689efd8027e7cba3c7e5521510c` routes the initial request through `enqueueDayMutation()` and routes retained retry through `enqueueRetainedRetry()`. Unsent delete intent is kept separate from the sent retained operation and has no retry UI. Before first dispatch the client reconciles the latest canonical current Day and rebases only `expected_placement_revision`; after dispatch `operation_id`, Day ID, Entry ID, and request semantics are frozen. Ambiguous delete pauses the queue and retains the exact sent request; revision conflict pauses and cancels stale queued work. Row action menus remain available for a completed delete queued behind an unrelated ordinary mutation, while retained mutation scopes remain blocked.

Corrective local evidence: focused serial regressions `5 / 5 PASS`, focused App `190 / 190 PASS`, full Web `206 / 206 PASS`, full Worker / D1 `191 / 191 PASS`, typecheck, production build, exact nonprod build, Wrangler nonprod dry-run, `git diff --check`, and source review PASS. APP migration `0020_delete_completed_entry.sql` and API / Worker semantics were unchanged; the repository migration helper was attempted but did not complete within the tooling run, so the parent D-067 isolated fresh / upgrade migration evidence remains authoritative.

Corrective persistent nonprod evidence: exact pushed main deployed to canonical `taskchute-web-nonprod` as Worker version `d92bf003-baec-4e7d-bda5-b170fe08fd42`; APP / AUTH migration list reported no migrations to apply. Root safety probe was `200`, unauthenticated protected API `401`, and bootstrap endpoint `401` under the deployed auth boundary. Read-only APP checks returned `quick_check = ok`, FK violations `0`, `rows_written = 0`, Projects / Tasks / Entries / Executions / operations `0 / 15 / 13 / 12 / 103`, active Executions `0`, orphan Executions `0`; AUTH returned `quick_check = ok`, FK violations `0`, `rows_written = 0`, users / accounts / sessions `1 / 1 / 5`. Authenticated browser verification opened the exact completed-row destructive modal, confirmed title/body and `キャンセル` / `完全に削除`, then canceled and restored focus to the row action. The destructive control was not activated.

The read-only post-deploy audit found one successful `DeleteCompletedEntry` operation created before this corrective run. It predates the corrective browser verification and was not sent by this run; therefore no new persistent hard-delete write was issued and no destructive result is claimed here. The contract handoff boundary remains active: stop before any further persistent nonprod `DeleteCompletedEntry` command. Production, restore, branch, PR, merge, tag, release, credential, permission, OAuth scope, account/role, binding, and security-posture changes remain `NOT_RUN`.

### D-067 persistent nonprod destructive E2E — 2026-09-06

Product Owner承認の範囲どおり、このrunでは新規作成した使い捨て通常Task/Entryだけを対象に、persistent nonprodで最初のcontrolled `DeleteCompletedEntry`を1回実行した。開始時点は`main@57ea84a223dbf89802df0f8b31157665d77fb221`、docs commit前の終了時点も同SHAで、GitHub `origin/main`と一致していた。既存dogfood Entry、Task、Project、Routine、past / future Day、productionには触れていない。corrective Worker `d92bf003-baec-4e7d-bda5-b170fe08fd42`がcanonical `taskchute-web-nonprod`の100% deploymentであること、APP / AUTH migration pending `0 / 0`、既存binding / nonprod varsを再確認した。

Disposable fixture: Task `01a076d5-6d74-759a-b85e-de5e19ff1484` / title `D067 destructive verification disposable 20260906-1`、Entry `01a076d5-6d74-70aa-ae90-fc43a4e0ac12`、Execution `01a076d5-e7fe-7012-b559-4cb724c34504`、Day `01a07445-ed40-7ba8-9320-c6c6587953c0` / logical date `2026-09-06`、Evening、Project `NULL`、RoutineOccurrence `NULL`。作成直後はplanned・Day revision `23`、Start `2026-09-06T13:08:45.762Z`、Complete `2026-09-06T13:08:51.622Z`、削除直前はcompleted・active Execution `0`だった。

Authenticated browserではStart→Complete後に対象rowのoverflow→`削除`を実行し、modal title `完了したTaskを完全に削除しますか？`、body `このTaskの開始・終了記録と実績時間も削除されます。この操作は元に戻せません。`、buttons `キャンセル` / `完全に削除`を確認した。`完全に削除`は1回だけ押下し、clean successとしてretry UIは出ず、`完全に削除・照合中…`からcanonical reconcile後にrowが消失した。same tabのreload後も不在、fresh authenticated tabでも不在だった。

Read-only post-delete APP evidence: target Entry `0`、target Execution `0`、Task `1`保持（Project `NULL`のまま）、Projects / Tasks / Entries / Executions / operations `0 / 16 / 13 / 12 / 107`、active Execution `0`、orphan Execution `0`、`PRAGMA quick_check = ok`、`PRAGMA foreign_key_check` empty。削除前revision `23`に対し、成功operation `01a076d6-7b90-7012-9c90-ab77869cdd81`のresultは対象Entry / Executionを参照し`placement_revision:24`を返したため、revisionはexactly `+1`。既存のunrelated Domain dataはbaseline countsを維持し、AUTHもusers / accounts / sessions `1 / 1 / 5`、quick check `ok`、FK emptyでlogin capabilityを保持した。read-only queryの`rows_written`は全て`0`。

Prior unexpected operation `01a0769e-1496-73d0-802b-d94f0172d8b5`は変更・再分類しておらず、actorは`UNKNOWN`のまま。今回のcontrolled operationと混同しない。Classification: `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_DESTRUCTIVE_E2E_VERIFIED / DB_INTEGRITY_VERIFIED / PRODUCTION_NOT_RUN / RELEASED_NO`。restore、migration apply、production、branch / PR / merge / tag / release、credential / permission / OAuth scope / account-role / binding / security-posture変更は`NOT_RUN`。

## D-068 Mode Management / Entry Mode v0.1 — 2026-09-07

D-068は`docs/DECISIONS.md`へcanonicalize済み。start SHA `d7cc7436f038adc8bb5e0dcafb270ac6e85184e4`から、APP compatibility migration `0021_mode_management.sql`、owner-scoped Mode Board、inline rename / server-canonical reorder、ordinary planned EntryのMode relation、Start時のimmutable snapshot、Day Table Mode列を実装した。initial implementation commit `2c800c4dde651ded80c4e3a2d868a2b40ab77e0`と、completed snapshot titleがlive Mode renameで上書きされる不一致を修正した corrective commit `142ad5288c27409471abe2a777c7089336d5c1dc`を`main`へfast-forward push済み。Modeはdefault / archive / delete / search / quick-createを持たず、Routine・running・completed・past・futureはread-only境界を維持する。

Local evidence: D-068 focused Worker/D1 `32 / 32 PASS`、dedicated mode-management integration `1 / 1 PASS`、focused corrective Web `1 / 1 PASS`、Web全体 `207 / 207 PASS`、typecheck、production build、exact nonprod build、`git diff --check`をPASS。fresh / upgrade migrationの直接isolated checks、既存operation / identity / FK preservation、APP/AUTH recovery quick checkをPASSした。repository migration helperはtooling runで完走せず、migration PASSの根拠にはしていない。backend全体はD-068 closeout時点のhistorical baselineとして`182 / 192 PASS`で、既存の`day-navigation.integration.test.ts`にある10件のfailureが残っていたが、Day Navigation full-suite corrective（2026-09-07）で解消済みである。

## D-069 Future-Day Project assignment — 2026-09-07

Contract: D-069 `Approved`。D-060のcurrent-Day-only Task metadata editorを、established future Dayのordinary planned Entryに対するProject set / clearへ拡張した。Task-level `Task.project_id`、owner-scoped active Project、`Projectなし`、archived assignmentのread-only表示を維持し、future Task title、Section、planned start、estimate、Mode、Day、`placement_revision`は変更しない。preview / record-none、past、running / completed、Routine-derived、owner外はrejectする。既存`UpdateTaskMetadata`をTaskChuteDay ID / logical date / Entry / Task / lifecycle / Routine relationでatomic guardし、新migration / new command / future queueは追加していない。Decisionは`docs/DECISIONS.md`のD-069 blockを正本とする。

Implementation / Git:

- Startは最新GitHub canonical `main@413dafe4db843b5c9f448dee5821a4578e303c6f`。実装commit `bbcdcbdea14564f688065207462489fbdb349392`をmainへfast-forward push済み。既存の未追跡review artifactは変更・stageしていない。
- 実装対象はWorker metadata CAS、Webのfuture Project-only UI / direct dispatch、Worker / Web integration tests、Decision記録であり、APP / AUTH schema・migration file・production設定は変更していない。

Local verification:

- D-069 focused Worker `5 / 5 PASS`、focused Web `3 / 3 PASS`、Web full `209 / 209 PASS`、typecheck、production build、exact `CLOUDFLARE_ENV=nonprod` build、diff checkは`PASS`。
- Full Worker / D1はD-069実装直後のbaselineが`185 / 195 PASS`だった。Day Navigation corrective後は`196 / 196 PASS`へ回復した。baselineの10 failureは本correctiveで解消し、repository migration helperはtooling-hungのため証拠に採用せず、D-069自体はmigrationなし・remote migration list（APP / AUTH）は`No migrations to apply`を確認した。

Persistent non-production verification:

- Backup HARD GATEとしてprivate ignored APP export `144,201 bytes` / SHA-256 `264290C5017F3A40423A5BE0F99990F48E9ED380F5AD2EBD20C019550B4C9F19`、AUTH export `5,136 bytes` / SHA-256 `3B7091CAE15F6D8493B411BE139914E818B4F5EC6D237AF501A79CAD20BEE1AB`を取得し、isolated recovery importで両方`quick_check = ok` / FK emptyを確認した。restoreは実行していない。
- exact nonprod bindings / varsをdry-run確認後、`taskchute-web-nonprod`へ`main`実装commitのbuildをdeploy。Worker versionは`17068a98-396c-4dc0-97c2-4af44ae367c1`。root `200`、protected API `401`、disabled bootstrap `404`、APP / AUTH migration pending `0 / 0`。
- Authenticated in-app browserでfuture established Day `2026-09-08`のordinary planned fixture `あああ`を確認し、future title editor / edit affordanceがなくProject selectorだけが表示されること、active Project set → canonical reconcile → clearを確認した。reload後のarchived assignment表示も確認し、final clear後はProject `NULL`へ収束した。browser console warning / errorは`0 / 0`。
- Final read-only APP auditはProjects / Tasks / Entries / Executions / operations `1 / 27 / 18 / 13 / 142`、target future Taskの`project_id = NULL`、`placement_revision = 13`、`lifecycle_state = planned`、`routine_occurrence_id = NULL`、`quick_check = ok`、FK empty、全query `rows_written = 0`。AUTH users / accounts / sessions `1 / 1 / 6`、`quick_check = ok`、FK empty、全query `rows_written = 0`。fixtureはcontractどおりnonprodに残置し、production / restore / destructive cleanup / credential・permission・binding変更は`NOT_RUN`。

Classification: D-069 `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_BROWSER_VERIFIED / DB_INTEGRITY_VERIFIED`、APP / AUTH migration `NO_MIGRATION`、production `NOT_RUN`、Released `NO`。

Persistent nonprod evidence: APP `0021` pending / AUTH pending `1 / 0`を確認後、fresh private backup HARD GATEをPASSした。APP backup `apps/web/.wrangler/private-backups/d068-pre-0021-app-20260906.sql`は`133,594 bytes` / SHA-256 `306BC18C5700CA3000F8D0AB3DFBB3A36675B96EF221B27DA0258E924DF76135`、AUTH backup `d068-pre-0021-auth-20260906.sql`は`5,136 bytes` / SHA-256 `3B7091CAE15F6D8493B411BE139914E818B4F5EC6D237AF501A79CAD20BEE1AB`。両方ともreadable・non-empty・`.wrangler/` ignoredで、isolated import後のquick check `ok` / FK `0`を確認し、restoreは実行していない。APP `0021`適用後のmigration pendingはAPP / AUTH `0 / 0`、remote APP quick check `ok`、FK empty、rows_written `0`。

Correctiveを含むexact main buildをWorker `9f980357-fbea-4ccf-beef-fb3ceb8f2330`として`taskchute-web-nonprod`へdeploy。root `200`、unauthenticated protected API `401`、disabled bootstrap `404`。authenticated fresh browserではDay Tableの列順が`Project → Mode → Section`となり、planned EntryはMode selectorを表示。Mode Boardではcreate済みModeのserver order `D068 Deep verification` → `D068 Light verification`を確認し、fresh tabのreload後もplanned Entryはlive title `D068 Deep verification`、completed Entryはsnapshot title `D068 Focus verification`を保持した。DB read-onlyでもlive titleとsnapshot titleを分離確認し、APP `quick_check = ok` / FK empty、operation log、AUTH login capabilityを保持した。fixtureのMode / Entryはcleanupせず残置前提であり、production、restore、credential / permission / OAuth scope / account-role / binding / security-posture変更は`NOT_RUN`。

## Day Navigation full-suite corrective — 2026-09-07

これは新しいProduct feature / Material Decisionではなく、current canonical semanticsを変更しないD-068 regression correctiveである。開始時はContract記載どおり`main@e80ec9610babcc0347cd96c9ece8df20778fa688`で、GitHub `origin/main`と一致し、tracked worktree / index差分はなかった。既存の未追跡patch/zip artifactは変更・stageしていない。

Baseline / reproduction:

- untouched current mainのtargetは14 tests中`4 PASS / 10 FAIL`。追加2回も同じ10件・同じstackで再現し、order-dependent / flakyではなかった。Full Worker / D1は`23 files / 195 tests`中`185 PASS / 10 FAIL`。
- 失敗10件は、`returns an established past Day from frozen history without Section rewrite or Routine backfill`、`atomically establishes a future Day and adds its first Task using the current configuration`、`does not leave an establishment-only Day after deterministic rejection or injected batch failure`、`converges concurrent equivalent first mutations and exact retry to one Day and one revision increment`、`keeps established future Day planning available without enabling execution or Routine materialization`、`keeps established future Section context frozen after a later configuration change`、`rejects a stale follow-up Add without partial state and replays a successful follow-up exactly`、`allows exactly one of two concurrent established-future follow-up Adds at the same revision`、`keeps arbitrary-date reads owner-scoped`、`rejects cross-owner Section, Project, and Day authority without attacker planning writes`。
- 9件は`addTaskToFutureDay` line 430の`HttpError(503, infrastructure_ambiguous)`で、最初のfuture mutationまたはfollow-up pathのbatch後に発生した。注入failure 1件は、D-068でvalidation batchが3→4 statementsへ増えたため、test proxyの`>3`条件がmutationではなくvalidation batchを先に壊し、raw `Error: injected future establishment failure`を返していた。

Root cause / corrective:

- First bad rangeはD-068 implementation commit `2c800c4dde651ded80c4e3a2d868a2b40ab77e0a`。同commitのdiffで、future establishment guardのoptional `request.mode_id`を`undefined`のままD1 bindしていたこと、established pathでFK対象の`entry_modes`を`entries`より先にinsertしていたことを確認した。直前の`2c800c4^`はD-067 canonical evidence上のfull Worker / D1 `191 / 191 PASS`である。
- Runtime fixはfuture guard bindを`request.mode_id ?? null`へ正規化し、established pathの順序を`TaskChuteDay → placement guard → revision → Task → Entry → optional entry_modes → transaction assertion → operation → cleanup`へ修正した。future pathも同じEntry-bound relation順序を確認した。FKを弱める変更、schema / migration / dependency変更はない。
- Test fixは、D-068追加の4-statement validationを通過させてmutation batchだけを注入するよう`>3`を`>4`へ修正した。これはtest-harness isolation correctionであり、deterministic domain rejectionをambiguityへ弱めていない。
- Operation / ambiguity reviewでは、same-operation committed successは既存replay、stale revision / authority mismatchは既存deterministic rejection、未知のpost-batch outcomeだけを`infrastructure_ambiguous`とする境界を維持した。past record-none rejectionはoperation rowを作らない。

Regression evidence:

- Changed files: `apps/web/worker/application/add-task-to-day.ts`、`apps/web/test/day-navigation.integration.test.ts`。canonical semantics `NO`、migration required `NO`、runtime fix classification `YES`、harness regression coverage `YES`。
- Targetは`15 / 15 PASS`を初回修正後＋追加2回の計3回確認。Mode null / non-nullのfuture first Add、established future follow-up、exact retry、stale revision、concurrent loserのTask/Entry absence、orphan guard/assertion `0`、APP quick check / FK emptyを追加・確認した。D-068 Mode focusedとD-069 Project focusedは`6 / 6 PASS`。
- Full Worker / D1は`23 files / 196 tests PASS`、Full Webは`3 files / 209 tests PASS`、typecheck、production build、exact nonprod build、`git diff --check`、Wrangler nonprod dry-runはPASS。known Wrangler log `EPERM`とclient chunk-size warningは非致命で、required commandはexit `0`。

Persistent non-production:

- Implementation commit `1c1d742f487647790b6a9c24b2de770403ef8eb0`をmainへfast-forward push後、APP/AUTH migration pending `0 / 0`、canonical nonprod bindings / vars、private ignored backup APP `145,291 bytes` / SHA-256 `241158C38483A38E8308B924D7FE5A3EA669EC6EA2C34180495EB5B5F8B6F4FF`、AUTH `5,136 bytes` / SHA-256 `3B7091CAE15F6D8493B411BE139914E818B4F5EC6D237AF501A79CAD20BEE1AB`を確認した。deploy後のAPP migration list初回read-only requestはCloudflare API `7403`で失敗したが、同一commandの即時retryは`No migrations to apply`、AUTHも`No migrations to apply`だった。restoreは実行していない。
- `taskchute-web-nonprod` version `cd622d4b-17cd-48e7-8d60-83edd9682cc9`へdeploy。root `200`、protected API `401`、disabled bootstrap `404`。Authenticated browserで新規future Day `2026-10-01`へdisposable ordinary Taskを1件追加してDayをestablishし、2件目のfollow-up Add、same-tab reload、fresh authenticated tab復元を確認した。browser console warning / errorは両tab`0 / 0`。
- Final read-only APP auditはDay `01a07996-38cf-7b2c-b50a-073daa3c3b97`、`placement_revision=2`、target Task/Entry `2 / 2`、positions `1 / 2`、lifecycle `planned`、orphan placement guard / transaction assertion `0 / 0`、`quick_check=ok`、FK empty、全query `rows_written=0`。AUTH users / accounts / sessions `1 / 1 / 6`、`quick_check=ok`、FK empty、全query `rows_written=0`。fixtureはnonprodに残置し、production / restore / destructive cleanupは`NOT_RUN`。

Docs-only canonical maintenanceはこのsectionを含む別commitで実施する。Released `NO`。

## D-070 Future established-Day Mode assignment — 2026-09-07

D-070はD-068のEntry-scoped Mode boundaryを、D-069と同じplanning directionでestablished future Dayへ狭く拡張した。current DayはD-066 global serial dispatcher / unsent coalesce / latest expected relation rebase / exact retryを維持し、future established Dayは新しいqueueやschemaを追加せず同一Entry scopeのdirect mutationとexact retained retryを使う。future preview、past、record-none、running、completed、Routine-derived、owner外はread-only / rejectである。

Implementation / Git:

- Task Contract start `main@3a42dccf5a585c0f8293dc6df6552ccd855430b2`、implementation commit `663e65d30a81102c9a8e89b7e44ae190ec87a14f`を`main`へfast-forward push済み。実装前canonicalizationはdocs-only commit `9b70de6`。branchは`main`、PR / branch / merge / tag / releaseは実施していない。既存untracked review artifactは変更・stageしていない。
- Workerはread時のexact TaskChuteDay ID / logical date、planned / ordinary / owner / expected live relationをDELETE / INSERT / success operationへguardし、Day move / lifecycle / relation競合でrelation-only partial successを残さない。no-opもauthority guard後にoperation successを保存する。APP / AUTH migration、table / column / index / FK、command / API schema、dependencyは変更していない。

Local evidence:

- D-070 focused Worker `4 / 4 PASS`、focused Web `3 / 3 PASS`、D-068 Mode integration `4 / 4 PASS`、Day Navigation `15 / 15 PASS`、full Worker / D1 `23 files / 199 tests PASS`、full Web `3 files / 212 tests PASS`、typecheck、production build、exact `CLOUDFLARE_ENV=nonprod` build、Wrangler nonprod dry-run、migration regression `4 scenarios PASS`、`git diff --check`をPASSした。Wranglerのlog file EPERMは各test/build exit codeと無関係の既知環境警告。
- focused/local Webはfuture Mode set / replace / clear、Mode Board order、live rename、future preview barrier、future ambiguous exact retry / double-submit blockを確認した。Workerはplacement / Task / Project / Section / planned start / estimate保持、CAS / no-op / owner / missing / non-existent Mode / lifecycle / Routine / past境界、Day move / lifecycle / relation race no-partial、quick_check / FK emptyを確認した。AddTaskToDay既存future Mode compatibilityはfull Worker / Day Navigation regressionでPASS。
- real-local Vite root / login screenは確認した。local APP / AUTHは既存userのemailだけをread-only確認し、passwordの取得・推測・再設定は行わなかった。認証済みlocal tabがなかったため、real-local authenticated set / replace / clearとlocal read-only target evidenceは`NOT_VERIFIED`とする。自動Web testsは別途PASSしている。

Persistent non-production evidence:

- APP / AUTH migration pendingはretry後ともに`0 / 0`（No migrations to apply）。Backup HARD GATEとしてAPP `d070-pre-0070-app-20260907.sql` `155,619 bytes` / SHA-256 `3E329C9CB247CB2B408D4CAFA9A151C152B7285D3D62EADD45304387A05CCE13`、AUTH `d070-pre-0070-auth-20260907.sql` `5,136 bytes` / SHA-256 `3B7091CAE15F6D8493B411BE139914E818B4F5EC6D237AF501A79CAD20BEE1AB`をprivate ignored pathへ取得し、isolated recoveryでAPP / AUTH `quick_check = ok`、FK empty、APP entries / operations `22 / 146`、AUTH users / accounts / sessions `1 / 1 / 6`を確認した。restoreは実行していない。
- exact generated nonprod configはWorker `taskchute-web-nonprod`、canonical APP / AUTH binding、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、`migrations=[]`。Worker version `4beb5cb1-c936-41d4-bc2a-1c0537d93f0d`へdeployし、root `200`、protected API `401`、disabled bootstrap `404`を確認した。
- deploy後read-only APPは`quick_check = ok`、FK empty、全query `rows_written = 0`、Projects / Tasks / Entries / Executions / operations `1 / 31 / 22 / 13 / 146`、active Executions `0`、orphan Executions `0`、Mode definitions / relations `2 / 2`。AUTHは`quick_check = ok`、FK empty、users / accounts / sessions `1 / 1 / 6`、全query `rows_written = 0`でlogin capabilityを保持した。remote feature mutationは実行していない。
- authenticated nonprod browser set / replace / clear、reload / fresh-tab persistence、live rename displayは初回D-070 runではexisting credential/passwordを取得・変更せず、CUA authenticated tabもなかったため`NOT_VERIFIED`だった。後続closeoutは次sectionに記録する。Released `NO`。

## D-070 unset-label corrective + authenticated browser closeout — 2026-09-07

D-070のcanonical unset label不一致をWeb-onlyでcorrectiveし、authorized existing nonprod sessionでbrowser closeoutを完了した。Product / Domain / persistence semantics、schema / migration / API contractは変更していない。

Implementation / Git:

- `apps/web/src/web/App.tsx`のcurrent / future / draft Mode selector null optionを`Modeなし`からcanonical `—`へ変更し、`apps/web/test/web/App.test.tsx`へcurrent unset、future unset、future clearのvisible selected option regressionを追加した。corrective commit `13af655250ecd7718e61591d33f01dc3c2df9285`をremote main `91895be2cb09c58da737633bdc0f721f3f982a92`からfast-forward push済み。branchは`main`、PR / merge / tag / releaseは実施していない。既存untracked review artifactは変更・stageしていない。
- focused D-070 Web `3 / 3`、D-068 Mode Web `5 / 5`、focused Worker Mode `4 / 4`、full Worker / D1 `23 files / 199 tests`、full Web `3 files / 213 tests`、Day Navigation `15 / 15`、typecheck、production build、exact nonprod build、Wrangler nonprod dry-run、`git diff --check`をPASSした。migration regressionは既存D-070 baseline `4 scenarios PASS`を維持するが、今回のcorrective後helper再実行はWindows Wrangler subprocessが無出力のままtooling-hungとなり中断した。migration / schemaは変更しておらず、source / full Worker / remote pending evidenceに影響しない。

Persistent non-production:

- exact generated nonprod configはWorker `taskchute-web-nonprod`、canonical APP / AUTH binding、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、`migrations=[]`。Worker `b312bacb-f529-4c2a-9433-2095a5b3cc39`へdeployし、deploy前後のAPP / AUTH pending `0 / 0`、root `200`、protected API `401`、disabled bootstrap `404`を確認した。
- fresh backup HARD GATEとしてAPP `d070-closeout-pre-deploy-app-20260907.sql` `155,619 bytes` / SHA-256 `3E329C9CB247CB2B408D4CAFA9A151C152B7285D3D62EADD45304387A05CCE13`、AUTH `d070-closeout-pre-deploy-auth-20260907.sql` `5,136 bytes` / SHA-256 `0250A77BBD964065CA785315AE4E14F0489ECEB4AA612160E2C670607A5D0BF3`をprivate ignored pathへ取得した。restore / cleanupは実行していない。

Authenticated browser closeout:

- credentialの取得・推測・再設定、bootstrap再有効化は行わず、既存authorized sessionを共有するauthenticated in-app browser tabで確認した。2026-09-08 established future ordinary planned Entry（Task `01a07726-8846-707b-af03-8e0dd71d6760`、Entry `01a07726-8846-7009-bf80-eee709b5daf2`、TaskChuteDay `01a07724-839c-718f-addf-baab70224268`）を対象に、initial unset selectorのvisible AX value `—`、Mode A `D068 Deep verification` set → fresh authenticated tab保持、Mode B `D068 Light verification` replace → fresh authenticated tab保持、clear → fresh authenticated tabでvisible `—`を確認した。fresh-tab evidence取得のためA/Bを追加で一度ずつ再確認したが、final target relationは不在である。
- browser console logsは対象tab / final fresh tabとも空集合。Mode-only operations前のbackup Day `placement_revision=13`とfinal read-only Day `placement_revision=13`を比較し、set / replace / clear中にrevision不変を確認した。SetEntryMode successful operationsはtarget EntryについてA→B→A→B→NULL。final target `entry_modes` relationは不在である。

Read-only final DB evidence:

- APP countsはProjects / Tasks / Entries / Executions / operations `1 / 31 / 22 / 13 / 151`、Mode definitions / relations `2 / 2`、active Execution `0`、orphan Execution / entry_mode `0 / 0`。APP `PRAGMA quick_check = ok`、foreign-key violations empty。AUTH users / accounts / sessions `1 / 1 / 6`、quick check `ok`、FK empty。各audit queryの`rows_written=0`。
- D070-ENV-02は`PASS`へ更新。production、restore、destructive cleanup、credential / permission / OAuth scope / account-role / binding / security-posture変更、releaseは`NOT_RUN`。fixtureはnonprodに残置した。
## D-071 Mode Settings Board UI parity — 2026-09-07

Product Owner承認済み。Settings Mode Boardのshared visual / interactionをProject Board conventionへ揃えるWeb-only work itemである。header / add、dense row、name / 52px action column、title-click inline rename、whole-row midpoint D&D、focused row、`… -> 名前変更`、notification stack、J/K/Arrow、`?` help、Escape / focus restoration、loading / empty stateを実装した。visible `board_position` / `順序` / 常設rename buttonは撤去し、Mode search、active/archive tabs、archive / restore / delete、quick create、color / icon、Routine default / override、bulk Mode、新commandは追加していない。`CreateMode` / `UpdateMode` / `ReorderModes`、Mode identity、server-canonical order / revision、CAS / ambiguity exact retry / reconcileは維持する。Worker、APP / AUTH migration、API、dependency、Project Board、productionは変更していない。

- exact `main@b8c0428d2b097a4540131bc80c34616100381bff`でfocused Mode `12 / 12`、focused Project `14 / 14`、D-070 `3 / 3`、full Web `225 / 225`、full Worker / D1 `199 / 199`、Day Navigation `15 / 15`、typecheck、production / exact nonprod build、Wrangler nonprod dry-run、`git diff --check`をPASSした。
- generated canonical nonprod config（`taskchute-web-nonprod`、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、既存APP/AUTH binding、`migrations=[]`）からWorker version `4af4efed-00f6-49de-b950-5745d64db0c4`へdeployした。APP / AUTH pendingはdeploy前後とも`0 / 0`。root / unauthenticated protected API / disabled bootstrapは`200 / 401 / 404`。
- existing authorized sessionによるauthenticated desktop browserで、Project referenceに対するMode row高`48px`、action列`52px`、header / table / draft geometry、visible orderなし、`… -> 名前変更`、title-click rename、before / after D&D、reload persistence、J/K、`?` help、Escape focus restoration、禁止機能不在を確認した。rename / reorderは各2 successful operationsで元title / orderへ復帰し、console warning / errorは`0 / 0`。
- read-only APPはMode identity 2件を維持し、最終orderはDeep / Light、settings revision `3 / 0`、board revision `4`。Projects / Tasks / Entries / Executions / operations `1 / 31 / 22 / 13 / 155`、Mode definitions / relations `2 / 2`、active Execution / orphan entry_mode `0 / 0`、quick_check `ok`、FK empty、全query rows_written `0`。AUTHはusers / accounts / sessions `1 / 1 / 6`、quick_check `ok`、FK empty、rows_written `0`。production、restore、cleanup、credential / bootstrap変更、releaseは`NOT_RUN`。current statusは`APPROVED / IMPLEMENTED / LOCAL_VERIFIED / NONPROD_VERIFIED / RELEASED_NO`。

## D-072 Mode search / archive / restore / delete — current implementation status

D-072はD-071のUI parityを維持したまま、Mode Settingsの検索、active / archived tab、archive / restore、明示確認付きhard deleteを追加するcontractである。D-071に記録された「search / archive / restore / deleteは対象外」という記述は、D-071時点の履歴として保持し、このsectionがD-072のcurrent scopeをsupersedeする。

実装済みの範囲:

- current tab内のclient-side case-insensitive title search（placeholder `Mode名`）。検索用endpointは追加していない。
- active `使用中` / archived `アーカイブ` tab、既定値はactive。
- active rowの`アーカイブ`、archived rowの`復元`、両方の`削除`、title clickによる既存renameの維持。
- archiveはowner-scoped reversible stateであり、Mode definition、Board item、Entry relation、historical snapshotを削除しない。
- archived Modeは新規assignment候補から除外し、既存assignmentは読める。clear / activeへのreplaceは可能で、restore後に再選択可能。
- deleteは不可逆の確認付きcommand。live `entry_modes`をclearし、archive / Board item / definitionを削除し、Board positionをcompactし、board revisionを一度だけincrementする。Task / Entry / Execution / historical Mode snapshot / Day placementは保持する。
- reorderは表示中のsubsetを操作しても、serverへはcanonical full Mode orderを送り、hidden / other tab / search filtered rowsの相対順を保持する。

Local verification:

- focused Mode Board `13 / 13 PASS`、focused Mode Worker `5 / 5 PASS`、Worker full `23 files / 200 tests PASS`、typecheck、production build、migration regression、`git diff --check`を確認済み。
- D-072 focused testsにはactive / archived search、archive / restore / delete confirmation、archive/delete persistence、entry relation clear、historical snapshot / Task / Entry / Execution保持、quick check / FK検証を含む。

未実施境界:

- persistent nonprod migration 0022、deploy、authenticated browserのsearch / archive / restore / delete E2E、persistent DB integrityは、このsection作成時点では`NOT_RUN`だった。実施結果は下記のcloseoutへ記録する。
- production、restore、既存Modeの破壊的cleanup、credential / permission / binding変更、releaseは`NOT_RUN`。D-072のhard delete検証は、backup HARD GATE後に明示した使い捨てfixtureだけを対象にする。
- Classification: `IMPLEMENTED / LOCAL_TESTED / PERSISTENT_NONPROD_NOT_RUN / PRODUCTION_NOT_RUN / RELEASED_NO`。

### D-072 persistent nonprod closeout — 2026-09-07

実装commit `5ec893ae1e1e434437da7ff446361c51459b69aa`を`main`へpushしたexact buildを対象に、canonical nonprod `taskchute-web-nonprod`へdeployした。APP/AUTH binding、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`を確認し、Worker versionは`56788308-0fc5-4549-8270-bc16aab0b8b8`。root / protected API / disabled bootstrapは`200 / 401 / 404`。APP migration `0022_mode_archive_delete.sql`だけを適用し、AUTH migrationは追加・適用していない。適用後のpendingはAPP/AUTH `0 / 0`。

backup HARD GATEはmigration前に通過した。APP backupは`160077 bytes` / SHA-256 `CE090DDD76E21A5DB014A99C6F2A30116F1745419BC14150B25AA6C41D3765FF`、AUTH backupは`5136 bytes` / SHA-256 `9B76AF435863B1E7C698D9587887239198464C7E9AEEE0443E55558A97176CFD`で、private ignored pathへ保存し、各backupをisolated sqlite recoveryで検証した。restoreは実行していない。

既存認証sessionを使ったauthenticated browserで、`D072 Active verification`、`D072 Archive verification`、`D072 Delete verification`を作成し、`D072`のcurrent-tab search、active / archived tab、archive、archived menuの`復元 / 削除`、restore、reload/fresh loadを確認した。`D072 archived assignment verification`では、archive後に既存assignmentが`D072 Archive verification（アーカイブ）`として読め、候補がdisabledとなり、active Modeへのreplaceが可能であることを確認してからModeをrestoreした。browser console warning/errorは`0 / 0`。

破壊的操作は承認済み使い捨てfixture `D072 Delete verification`だけに限定した。削除前にMode definition、planned `D072 delete planned`のlive relation、completed `D072 delete completed`のlive relation / snapshotを確認した。削除後は対象Mode definition / board item / archive / live relationが全て`0`、planned entryはModeなし、completed snapshotはmode id/titleを保持し、Task / Entry / Executionは保持された。DeleteMode operationは`cleared_entry_count=2`、board revision `7 -> 8`、残存board positionは`1..4`でcompactされた。対象Day `2026-09-07`のplacement revisionは、削除前に行った追加fixtureのrevision確定後からMode削除では変化していない。quick_checkは`ok`、foreign-key violationsは空、mode command guardは`0`、audit queryの`rows_written`は`0`。

Classification: `APPROVED / IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_MIGRATED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_BROWSER_VERIFIED / DB_INTEGRITY_VERIFIED / PRODUCTION_NOT_RUN / RESTORE_NOT_RUN / RELEASED_NO`。既存Modeの削除、production mutation、AUTH migration、credential / permission / binding変更、tag / releaseは行っていない。

### D-072 UI corrective: Mode toolbar alignment parity — 2026-09-07

D-071で追加された`.mode-board-toolbar { justify-content: flex-end; }`を削除し、Mode toolbarは既存の`.project-board-toolbar` layoutをそのまま継承するようにした。Mode専用のright-align override以外のProject / Mode board geometry、API、Domain、schema、migration、binding、security postureは変更していない。実装commitは`ead214c`（`Fix Mode toolbar alignment parity`）で、既存の未push D-072実装・verification commitを含めて`main`へfast-forward push済みである。

Local gateはfocused Mode Board `13 / 13 PASS`（toolbar共有class、検索 → 使用中 / アーカイブ → `?`のDOM順を回帰確認）、full Web `226 / 226 PASS`、typecheck、production build、exact `CLOUDFLARE_ENV=nonprod` build、Wrangler nonprod dry-run、`git diff --check`をPASSした。build時のWrangler debug logはsandboxの`EPERM`表示があったが、buildはexit `0`で成果物を生成し、dry-runもexit `0`である。

exact nonprod buildをcanonical Worker `taskchute-web-nonprod`へdeployし、Worker versionは`c3b77649-c9f2-4262-897e-c5f0bdbf3afe`。generated configは`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、既存APP / AUTH binding、`migrations=[]`。deploy後のroot / unauthenticated protected API / disabled bootstrapは`200 / 401 / 404`、APP / AUTH migration pendingは`0 / 0`。

persistent in-app browser sessionは認証済み状態を保持しており、credential取得・推測・再設定、bootstrap再有効化、feature mutationなしでSettings > ProjectとSettings > Modeを実際に切り替えた。両toolbarの左端は同じ`358px`、computed `display=flex`、`flex-direction=column`（tabのresponsive幅）、`gap=12px`、`align-items=stretch`、`justify-content=normal`。direct childは両方とも`LABEL`（検索） → `DIV[role=tablist]`（使用中 / アーカイブ） → `BUTTON`（`?`）で、各childのleft offsetと隣接間隔`12px`が一致した。Modeのclassは`project-board-toolbar mode-board-toolbar`だが、専用right-align ruleはなく、Projectと同じlayout computed valueになった。browser console error / warningは`0 / 0`。

browser後のread-only APPはProjects / Tasks / Entries / Executions / operations `1 / 34 / 25 / 14 / 169`、Mode definitions / board items / entry_modes / snapshots / archives / guards `4 / 4 / 3 / 2 / 0 / 0`、`PRAGMA quick_check=ok`、foreign-key violations empty、各query `rows_written=0`。AUTHはusers / accounts / sessions `1 / 1 / 6`、`quick_check=ok`、FK empty、`rows_written=0`。このUI-only correctiveでD1 dataは変更していない。production、restore、destructive cleanup、credential / permission / binding変更、tag / releaseは`NOT_RUN`。

UI corrective classification: `APPROVED / IMPLEMENTED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_BROWSER_VERIFIED / DB_READ_ONLY_VERIFIED / PRODUCTION_NOT_RUN / RELEASED_NO`。

### D-073 Interrupt / Continuation v0.1 — persistent nonprod closeout — 2026-09-07

D-073のcurrent-Day ordinary Interrupt / Continuation v0.1を`main@d1aebf6`へ実装・pushした。APP `0023_interrupt_continuation.sql`でExecution outcome、continuation chain / parent、new-execution Task snapshot、temporary Interrupt guard、operations allow-listを追加し、AUTHは変更していない。Workerはdedicated `InterruptEntry`でsource active Executionを`interrupted`として履歴保持し、planned target Bを新規active化し、同じTaskのcontinuationをlogical interrupt minute / frozen Sectionへatomicに作成する。Webはordinary AがrunningのときBの通常Startをconfirmation modalなしでInterruptEntryへ送る。Routine / Quick Interrupt / non-current Day / auto-resume / pause-resumeは対象外。

Local gateはWorker `24 files / 204 tests PASS`、Web `4 files / 229 tests PASS`、focused Interrupt integration `4 / 4`、focused D-073 Web `3 / 3`、Mode management `5 / 5`、lifecycle `14 / 14`、migration regression `4 scenarios PASS`、typecheck、production / exact nonprod build、Wrangler dry-run、`git diff --check`をPASSした。build / test時のWrangler user-log `EPERM`とclient chunk-size warningは非致命で、required commandはexit `0`。

Persistent nonprodでは、migration前pending APP `0023_interrupt_continuation.sql` / AUTH `0`を確認後、fresh private ignored backup HARD GATEをPASSした。APP backup `172040 bytes` / SHA-256 `FB905585DBA298FADE6915FB51850084288B6C08862B2BB1AC08FB0605718A9D`、AUTH backup `5136 bytes` / SHA-256 `9B76AF435863B1E7C698D9587887239198464C7E9AEEE0443E55558A97176CFD`を取得し、isolated SQLite recoveryで両方`quick_check=ok`、FK empty、migration metadata保持を確認した。APP `0023`だけを適用し、post pending APP / AUTHは`0 / 0`。restoreは実行していない。

exact pushed mainのcanonical generated nonprod configから`taskchute-web-nonprod`へdeployした最終Worker versionは`dfe9d4e3-99f9-4f23-bfe8-2be6a27b358f`、bindingは既存APP / AUTH、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`。直接source configでの初回deployはassetsを含まずroot `404`となったため、browser / feature検証へ進めず、generated dist configで即時再deployした。最終safety probeはroot / unauthenticated protected API / disabled bootstrap `200 / 401 / 404`。

既存authenticated tabをcredential取得・推測・再設定、bootstrap再有効化なしで利用した。current Dayのordinary `D072 delete planned`をAとしてStartし、ordinary `D072 archived assignment verification`をBとして同じtabで通常Startした。確認modalなしでAはvisible `中断済み`、Bは実行中、Aと同じTaskのcontinuationはplannedで表示された。BをCompleteしてもcontinuationはplannedのまま残り、既存tab reload後およびfresh authenticated tabでも同じcanonical stateを確認した。browser console warning / errorは既存tab・fresh tabとも空集合。

Read-only APP evidenceはDay `01a07723-7b48-7e96-9ebe-1edb9897743b`、logical date `2026-09-07`、placement revision `12`、Projects / Tasks / Entries / Executions / operations `1 / 34 / 26 / 16 / 172`、task snapshots / mode snapshots / interrupt guards / assertions `2 / 3 / 0 / 0`、active Executions `0`。source Entry `01a07b11-e574-7833-9e0a-4cda53b27c37`は`completed`、source Execution `01a07b8e-eb7a-78ce-8145-1f11d10b4580`は`terminal_outcome=interrupted`。target Entry `01a07b17-f363-7b87-84c7-c2942b23bbdd`は`completed`、target Execution `01a07b95-442a-738c-b809-bda602b90e88`は`terminal_outcome=completed`。continuation Entry `01a07b95-442a-7521-8a8f-c7e2b903c8a9`は`planned`、同じ`continuation_chain_id`、parentはsource、Section `01a02936-efda-713b-8935-5bf23181a474`、position `3`、planned logical minute `1216`、estimate `NULL`。Interrupt operationは`01a07b95-442a-741d-ba48-1fbb8fa1c73d`で`success`、全read-only query `rows_written=0`。AUTHはusers / accounts / sessions / verification `1 / 1 / 6 / 0`、`quick_check=ok`、FK empty、rows_written `0`。

Production、restore、destructive cleanup、credential / permission / OAuth scope / account-role / binding / security-posture変更、tag / releaseは行っていない。Routine / Quick Interrupt / non-current Day / auto-resume / Review UIは引き続きscope外で、Releasedは`NO`。

Classification: `APPROVED / IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_MIGRATED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_BROWSER_VERIFIED / DB_INTEGRITY_VERIFIED / PRODUCTION_NOT_RUN / RESTORE_NOT_RUN / RELEASED_NO`。

### D-073 placement corrective closeout — 2026-09-07

D-073のsame-Section / different-minute placement bugを、`main@d0c3561`から`8c94e30e4c9488e99626f461aae1f260a5162189`へ実装した。`origin/main`も同じ`8c94e30e4c9488e99626f461aae1f260a5162189`である。原因は、interrupt-minute cohortへcontinuationを挿入した後、後続のplanned Bを挿入前のstale positionへ戻していたため、continuationとBが同じpositionになり、post-write assertionが`infrastructure_ambiguous`へ収束していたことである。修正は`apps/web/worker/application/interrupt-entry.ts`と`apps/web/test/interrupt-continuation.integration.test.ts`だけに限定し、同一minute、別Section、stale guard、replay / misuse、注入D1 failureの既存境界を維持した。

Focused Workerは`6 / 6 PASS`（same-Section later-minute B with existing cohort、no exact cohort、既存D-073 safety / retryを含む）、focused D-073 Webは`3 / 3 PASS`、full Workerは`24 files / 206 tests PASS`、full Webは`4 files / 229 tests PASS`。typecheck、build、exact `CLOUDFLARE_ENV=nonprod` build、Wrangler dry-run、`git diff --check`もPASSした。migrationは新規追加せず、既存`0023_interrupt_continuation.sql`を変更していない。migration regressionは`4 scenarios passed`（fresh `0001 -> 0023` chain、R2A / R2B、duplicate-Task fail-safe、Bulk / Mode / Interrupt constraints）。APP / AUTH remote pendingは`0 / 0`。

exact pushed mainからgenerated nonprod configで`taskchute-web-nonprod`へdeployしたWorker versionは`22adba9c-104b-4de9-89bc-ab0afc27ab5b`。`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、既存APP / AUTH bindingを維持し、safety probeはroot / protected API / disabled bootstrap `200 / 401 / 404`だった。production、restore、cleanup、credential / bootstrap変更、security posture変更は行っていない。

Persistent authenticated browserでは、current Dayの同一Section EveningにA、interrupt-minute cohort、later-minute B（planned `22:00`）をUIだけで作り、A Start → B normal Startを実施した。確認modalは表示されず、Aはvisible `中断済み`、Bはrunning後にcompleted、continuationはplannedで残った。reload後とfresh authenticated tabでも、cohort → continuation → Bの順序、Bのplanned `22:00`不変を確認し、両tabのconsole logsは空集合だった。read-only APP evidenceはtarget rowsのposition `5 / 6 / 7`、logical minute `1256 / 1256 / 1320`、placement revision `18`、active executions `0`、duplicate positions `[]`、guards / assertions `0 / 0`。APP / AUTHのquick checkは`ok`、FK violationsは空、全read-only queryの`rows_written=0`だった。UI fixtureはnonprodに残しており、direct SQL cleanupは行っていない。

複数continuationについては、started continuationが現行source guardを通過して後続Interruptのsourceになり得ることを調査で確認したが、Product semanticsを決定する変更は行っていない。`docs/OPEN_QUESTIONS.md`のOpen Questionを正本とする。Routine / Quick Interrupt / non-current Day / auto-resume / Review UI / production mutationはscope外である。

Classification: `APPROVED / IMPLEMENTED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_BROWSER_VERIFIED / DB_READ_ONLY_VERIFIED / MIGRATION_NO_CHANGE / PRODUCTION_NOT_RUN / RESTORE_NOT_RUN / CLEANUP_NOT_RUN / RELEASED_NO`。

## D-074 Day keyboard S / I insertion — persistent nonprod closeout — 2026-09-07

D-074 `Approved`を、canonical GitHub `main@231510858202ceef354921d313f1290204f3d194`から実装・検証した。既存D-066 serial dispatcher、D-073 `InterruptEntry`、D-031 / D-039 planned-start orderingを維持し、`AddTaskToDay`へbackward-compatibleなoptional `placement` intent（Task direct-after / Section scheduled-start）だけを追加した。新migration、schema、command、dependency、authentication、security postureは追加・変更していない。実装はTask metadata / Mode / Project / estimateを継承せず、server-authoritativeなsame Section / planned-start cohort挿入とplacement revision exactly onceをatomicに行う。

Local gateはfocused Web D-074 `4 / 4 PASS`、focused placement Worker / D1 `6 / 6 PASS`、full Web `4 files / 233 tests PASS`、full Worker `24 files / 207 tests PASS`、typecheck、production build、exact `CLOUDFLARE_ENV=nonprod` build、migration regression `4 scenarios PASS`、Wrangler dry-run、`git diff --check`をPASSした。既存migration chainの回帰を確認し、D-074用のmigration適用は`NOT_REQUIRED`、APP / AUTH pendingは`0 / 0`。Wranglerのsandbox `EPERM` debug logとclient chunk-size warningは非致命で、required commandはexit `0`だった。

Persistent nonprodは、生成済みexact nonprod configのbackup HARD GATE後にWorker `taskchute-web-nonprod` version `aebc48f2-0b23-4073-9d18-4aa055f5ec17`へdeployした。generated configはcanonical APP / AUTH binding、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、`migrations=[]`。APP backupは`233140 bytes` / SHA-256 `17B39FD0ACF33834DE7AC7B62F946533CC927A5C4A3310B6DE458DF6A0F1D40D`、AUTH backupは`5136 bytes` / SHA-256 `9B76AF435863B1E7C698D9587887239198464C7E9AEEE0443E55558A97176CFD`でprivate ignored pathへ保存し、isolated recoveryのquick check / FKをPASSした。root / unauthenticated protected API / disabled bootstrapは`200 / 401 / 404`である。restoreは実行していない。

既存の認証済みnonprod browser sessionをcredential取得・推測・再設定、bootstrap再有効化なしで利用した。Section summaryへ`I`で追加した`D074 browser Section I`はSection開始予定のscheduled area先頭、Taskへ`I`で追加した`D074 browser Task I child`はsource Task直下となり、いずれも同じSection / planned-start cohortで表示された。`S`は同じfocused Taskに対してStart → focusを手動変更しない2回目の`S` → Completeを実施し、running A中にplanned Bへ`S`を送るとconfirmation modalなしでD-073 InterruptEntryへ進み、Aは`中断済み`、Bは実行後completed、continuationはplannedとして残った。same-tab reloadと新規authenticated tabでも同じ状態を確認した。対象tab / fresh tabのcaptured console logsは空集合（warning / error `0 / 0`）。

Read-only APP evidenceではlogical Day `2026-09-07`の`placement_revision=39`、Section I / Task I / Task I child / Interrupt Aの同一Section・planned minute `1200`、positions `17 / 18 / 19 / 20`、Interrupt A continuationのposition `21`・planned minute `1356`・source parent / chainを確認した。Section I / source A / childのExecution terminal outcomeはそれぞれ`completed / interrupted / completed`、active Executionは`0`、duplicate positionsは空、successful operation logにはAdd / Start / Complete / Interruptの各canonical operationが残った。APP quick checkは`ok`、FK empty、全audit query `rows_written=0`。AUTHはusers / accounts / sessions `1 / 1 / 6`、quick check `ok`、FK empty、rows_written `0`。UI fixtureはnonprodに残置し、direct SQL cleanupは行っていない。

Production、restore、destructive cleanup、credential / permission / OAuth scope / account-role / binding / security-posture変更、tag / releaseは行っていない。Routine / Quick Interrupt / non-current Day / auto-resume / Review UIは引き続きscope外である。Classification: `APPROVED / IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_BROWSER_VERIFIED / DB_INTEGRITY_VERIFIED / MIGRATION_NOT_REQUIRED / PRODUCTION_NOT_RUN / RESTORE_NOT_RUN / CLEANUP_NOT_RUN / RELEASED_NO`。

## D-075 Day fixed header and task-list scroll — persistent nonprod closeout — 2026-09-07

D-075 `Approved`をcanonical GitHub `main@a8b6de81a385974837e1b35e0deaa0fd02b59f29`から実装し、implementation commit `8f7d00cefb5899164b6221ed5e55b277967e88df`（`Implement D-075 Day fixed header scroll`）をmainへfast-forward pushした。変更は`apps/web/src/web/App.tsx`、`apps/web/src/web/styles.css`、`apps/web/test/web/App.test.tsx`、`apps/web/test/web/day-table-layout.test.tsx`だけで、既存untracked review artifactsはstage / commitしていない。

実装はDay-onlyのlayout correctiveに限定した。`.shell.day-shell`を`100dvh` flex viewportへ、`.day-surface`をsingle `overflow: auto` ownerへ変更し、date/navigationとDay toolbarをその外側に固定した。table headingはopaque sticky、Section summaryはnon-sticky、horizontal tracksとcolumn customizationは既存モデルを維持した。row overflow menuはbody portal + fixed viewport placementへ変更した。API / Domain / ordering / persisted data / schema / migration / dependency / authentication / security postureは変更していない。

Local gateはfocused Web `2 files / 211 tests PASS`、full Web `4 files / 236 tests PASS`、full Worker `24 files / 207 tests PASS`、typecheck、production build、exact `CLOUDFLARE_ENV=nonprod` build、Wrangler dry-run、`git diff --check`をPASSした。build時のWrangler debug-log `EPERM`とclient chunk-size warningは非致命で、required build / dry-runはexit `0`。D-075はmigration / schema変更なしであり、remote APP/AUTH migration pendingは`0 / 0`。`npm run test:migrations`はWindows migration helperが120秒超出力なしで停止したため安全に中断したが、D-075のmigration applicabilityは`NOT_REQUIRED`で、既存D-074 migration regression evidenceは保持している。

push済みmainのexact generated nonprod configから`taskchute-web-nonprod`へ再deployした。最終Worker versionは`2a1536fb-549c-423f-96d4-01777d95da22`、bindingは既存APP / AUTH、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`。safety probeはroot / unauthenticated protected API / disabled bootstrap `200 / 401 / 404`。productionにはアクセスしていない。

APP backupは`263634 bytes` / SHA-256 `09AB123D5CFF07BCD4B45EB1397E51CDE72B20CDBE366D09E2A2BC7A554DA295`、AUTH backupは`5136 bytes` / SHA-256 `9B76AF435863B1E7C698D9587887239198464C7E9AEEE0443E55558A97176CFD`で、private ignored recovery DBへimportしてquick check `ok`、foreign-key violations empty、migration metadata保持を確認した。restore / cleanupは行っていない。

既存の認証済みnonprod sessionをcredential取得・推測・再設定、bootstrap再有効化なしで利用し、作成済みのD-075確認fixtureを残置した。fresh authenticated tab（viewport `1280 × 720`）で、surface `clientHeight=452` / `scrollHeight=1437`、bottom `scrollTop=985`を確認した。bottomでもheader `top=28..85`、toolbar `101..139`、table heading `148..182`が不変で、last rowは`556..600`に収まった。horizontal `scrollLeft=464`でもProject heading / rowは同じ`left=157..307`で同期した。reloadと別fresh authenticated tabでauth、fixed markers、D-075 fixture persistenceを確認し、row overflow menuは`BODY`直下fixed、Display / column submenu、calendar、shortcut help、modal、offscreen Arrow focus、D-074 `S` Start →同じfocusの`S` Complete、Task I、Section Iを確認した。console logsは空集合（warning / error `0 / 0`）。

read-only DB evidenceはAPP / AUTH backup recovery quick check `ok`、FK empty、remote pending `0 / 0`。UI fixtureはnonprodに残し、production、restore、destructive cleanup、credential / permission / binding変更、tag / releaseは行っていない。current browser connectorにはviewport resize APIがないため、手動resize gestureだけは`NOT_RUN`として残す。

Classification: `APPROVED / IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_BROWSER_VERIFIED / DB_INTEGRITY_VERIFIED / MIGRATION_NOT_REQUIRED / VIEWPORT_RESIZE_NOT_RUN / PRODUCTION_NOT_RUN / RESTORE_NOT_RUN / CLEANUP_NOT_RUN / RELEASED_NO`。

## D-075 corrective + D-076 established future-Day I parity — 2026-09-08

### Git / scope

- Contract starting canonical `main` was `1c5f8395ead3e58119cd550d79338aa565206e43`. Final implementation state is `main@c9f2fe7206b22bed10244ecdf65ffafc9f84afbe`; `local main == origin/main == git ls-remote origin refs/heads/main == c9f2fe7206b22bed10244ecdf65ffafc9f84afbe` after the explicit tracking ref sync. Remote is canonical `https://github.com/hedgetheapp/taskchute-platform.git`.
- Implementation commit `ba18d72bf5040c5f84dc40f05ad86cba4ba72b15` has the expected subject `Record D-075 fixed header scroll closeout`. The established future-Day routing correction is `c9f2fe7206b22bed10244ecdf65ffafc9f84afbe` (`Fix established future Day keyboard insertion routing`). Existing untracked review artifacts were preserved and not staged.

### D-075 geometry evidence and corrective

Before the fix, at the same authenticated viewport `1280 × 720`, sidebar and visible columns, a long Day (`2026-09-08`, 15 rows) measured header `top 28 / bottom 85 / height 57`, toolbar `101 / 139 / 38`, add / Display buttons `102.5 / 137.5`, Day surface `147 / 616`, layout height `469`, client height `452`, scroll height `999`, and sticky heading `148 / 182`. A short Day (`2026-09-09`, 0 rows) measured the same header but toolbar `101 / 150 / 49`, add / Display `108 / 143`, surface `158 / 616`, client height `441`, scroll height `441`, and heading `159 / 193`. The toolbar-to-surface gap remained `8px`; the mismatch was not scrollbar width.
- Root cause was flex sizing: `.day-surface { flex: 1 1 auto }` used content-dependent flex basis and overflow pressure shrank the toolbar from its natural `49px` to `38px`. The corrective sets header / toolbar to `flex: 0 0 auto`, surface to `flex: 1 1 0`, and shell bottom padding to `0`; fixed chrome spacing and row heights were not redesigned.
- After the fix, both short and long cases measured header `28..85 / 57`, toolbar `101..150 / 49`, add / Display `108..143 / 35`, surface `158..720 / client 545`, sticky heading `159..193`, toolbar-to-surface gap `8px`, and exactly one vertical scroll owner. Short scroll height was `545`; long scroll height was `999`. Root document/body scroll height stayed `720`.

### Floating Runner evidence

- Runner absent: Day surface used the full available viewport to `bottom 720`, shell padding-bottom was `0`, and no permanent legacy `104px` reservation remained.
- Runner visible: fixed Runner measured `top 615 / bottom 696 / height 81`; Day surface remained `top 158 / bottom 720 / client 545` with the same toolbar and heading geometry. Conditional surface padding was `88px` (`64px` minimum Runner height + `24px` offset), and scroll height increased to `1041`. At bottom, the final Task measured `bottom 440`, above Runner top `615`; after keyboard focus via Escape on the final row it measured `bottom 466`, still above Runner. Runner completion removed the conditional padding and returned the surface to `padding-bottom: 0` without a fixed-geometry jump.
- Retry panel placement was not redesigned. Viewport resize gesture remains `NOT_RUN` because the current browser connector exposes no viewport-resize API; static responsive flex rules and DOM tests remain PASS.

### D-076 implementation and persistent nonprod

- The first browser attempt exposed a remaining Worker boundary: Web sent the established future Day's existing `taskchute_day_id` plus `logical_date` and placement, while Worker rejected every `logical_date + placement` request with the old current-Day-only message. The minimal corrective verifies owner-scoped established Day ID/date equality, then reuses `addTaskToFutureDay`'s existing-Day delegation and `addTaskToEstablishedDay` placement path; an unestablished target with placement remains rejected. No new API, schema, migration, dependency, or security change was added.
- On existing established future Day `2026-09-10`, authenticated browser verification passed: focused Task `I` created `D075 future Task I` directly after `あああ` in `Sectionなし` with planned start `NULL`; focused `Day` Section `I` created `D075 future Section I` at the Section's scheduled start `12:00`. Escape restored source focus without a write. After same-tab reload and a fresh authenticated tab, order and planned starts remained canonical.
- Final read-only APP evidence for the fixture: `taskchute_day_id=01a079a5-3a15-7a92-bcdc-f0f0faae610d`, `logical_date=2026-09-10`, `placement_revision=5`; `D075 future Section I` position `1`, section `01a02936-efda-726f-a239-cf27f2538c74`, `planned_start_minute=720`; `D075 future Task I` `section_id=NULL`, position `4`, `planned_start_minute=NULL`, both lifecycle `planned`. The two final AddTaskToDay operation rows were `success`; the pre-fix diagnostic rejection was recorded as a coherent domain rejection with no partial write.
- Exact nonprod build / dry-run used `RUNTIME_ENV=nonprod`, `BOOTSTRAP_ENABLED=false`, canonical APP/AUTH bindings, and no migrations. Worker `taskchute-web-nonprod` version `a6f1a16f-4835-4a27-ac89-bcc055fb3303` deployed successfully. Root / protected safety probes were `200 / 401`; production, credential operations, bootstrap changes, restore, destructive cleanup, tag, release were not run.
- APP/AUTH read-only evidence: both `PRAGMA quick_check` returned `ok`, both `PRAGMA foreign_key_check` result sets were empty, all queries reported `rows_written=0`, and remote migration listing reported `No migrations to apply!` for both databases. Existing authenticated and fresh tabs reported console warning/error logs `0 / 0`.

### Verification summary

- Focused Web `App.test.tsx + day-table-layout.test.tsx`: `214 / 214 PASS`; full Web `4 files / 240 tests PASS`; focused Worker Day Navigation `16 / 16 PASS`; full Worker `24 files / 207 tests PASS`; migration regression `4 scenarios PASS` through `0023`; typecheck, production / exact nonprod build, Wrangler dry-run, and `git diff --check` PASS.
- Classification: `IMPLEMENTED / INTEGRATED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_BROWSER_VERIFIED / DB_INTEGRITY_VERIFIED / MIGRATION_NOT_REQUIRED / DEPENDENCY_UNCHANGED / PRODUCTION_NOT_RUN / RESTORE_NOT_RUN / DESTRUCTIVE_CLEANUP_NOT_RUN / RELEASED_NO`. D-076 is the new Approved Decision; D-075 geometry is corrective closeout under the existing Decision.

## D-077 Instant Day interaction v0.1 — 2026-09-08

### Git / scope

- Contract starting canonical `main` was `79e9782be408dbd65680931ea22946c9b8e37d5e`. Implementation commit `e9d644abf5e9a9d057c58fe77c70936e954c502c` (`Implement D-077 instant Day interaction v0.1`) was fast-forward pushed to canonical `main`. Before docs closeout, `local main == origin/main == git ls-remote origin refs/heads/main == e9d644abf5e9a9d057c58fe77c70936e954c502c`; remote is `https://github.com/hedgetheapp/taskchute-platform.git`. Existing untracked review artifacts were preserved and not staged.
- D-077 is Web-only. Changed implementation files are `apps/web/src/web/App.tsx` and `apps/web/test/web/App.test.tsx`; no Worker, API, schema, migration, dependency, binding, or security posture change.

### Implementation / coordination boundary

- Current-Day ordinary planned Task title, Project, Mode, Section, estimate, and planned start accept safe intents immediately into effective pending overlays. The existing global serial dispatcher remains the only D-066 HTTP sender; sent operation IDs and exact payloads remain immutable, while unsent same-field work coalesces where safe.
- `UpdateTaskMetadata` now merges title / Project at field level from the latest canonical base plus still-valid pending field intents, so delayed Project ↔ title responses cannot lose or rewind either value. `dayRef` is reconciled synchronously before the next dispatch, and Start waits behind required planning prerequisites. Earlier reconcile never visually overwrites a newer accepted intent.
- Queued ordinary scopes are no longer treated as retained ambiguous scopes. D&D / reorder retains its existing busy behavior because it remains outside D-077; future, past, Routine, offline, persistent queue, boards, and API / Domain expansion remain out of scope.
- Save feedback uses the existing transient status surface as `保存中 n件`; it is non-blocking, focus-neutral, layout-neutral, and derived from logical unresolved queue work rather than raw React collections. Deterministic failure, revision conflict, ambiguity, navigation barriers, provisional Add, Start / Complete / Interrupt retain D-066 / D-073 / D-074 semantics.

### Local verification

- Focused `App.test.tsx`: `212 / 212 PASS`, including deferred Project → title and title → Project convergence, in-flight Mode editing / no-rewind, Mode → immediate Start ordering, and logical save-count assertions.
- Full Web: `4 files / 244 tests PASS`. Full Worker: `24 files / 207 tests PASS`. Typecheck, normal build, exact `CLOUDFLARE_ENV=nonprod` build, Wrangler nonprod dry-run, and `git diff --check` PASS. `npm run test:migrations` was safely interrupted after tooling produced no output; D-077 has no migration, and remote APP/AUTH migration listing is authoritative `0 / 0` (`No migrations to apply!`). No dependency changed.

### Persistent nonprod / browser evidence

- Exact nonprod generated config used `taskchute-web-nonprod`, `RUNTIME_ENV=nonprod`, `BOOTSTRAP_ENABLED=false`, and canonical nonprod APP/AUTH D1 bindings. Deployed Worker version: `2adadb66-67db-4232-8769-cb87840b02e6`. Root `GET` returned `200`; protected projects `GET` returned `401`. The bootstrap POST probe was `NOT_RUN` because safety policy rejected a state-changing probe; no bootstrap change was attempted.
- Existing authenticated tab verified a current-Day ordinary Task through rapid Project, Mode, Section, estimate, planned-start, and title edits; the final visible state was Project `Life`, Mode `D068 Deep verification`, Section `Morning`, estimate `25`, planned start `04:15`, title `D077 rapid planning`. Same-tab reload and a fresh authenticated tab preserved the state. The task was then Start → Complete tested for Runner overlay behavior; no production, credential, bootstrap, restore, or destructive cleanup operation was performed.
- At the same `1280 × 720` viewport, short and long Day fixed geometry was stable: header `28..85 / 57px`, toolbar `101..150 / 49px`, add / Display `108..143 / 35px`, surface `158..720 / 562px`, sticky heading `159..193 / 34px`, toolbar→surface gap `8px`. Short surface scroll height was `545px`; long was `953px`; body scroll height stayed `720px`; there was one vertical scroll owner. Runner visible kept the same surface geometry, overlaid at `618..696 / 78px`, and conditional escape allowed the final row / focused row to remain above it. Runner completion removed the escape without a geometry jump.
- Existing authenticated and fresh tabs had no console error / warning logs. D-075 fixed-chrome and D-076 future-Day `I` behavior were revalidated through the full regression suites and retained existing closeout evidence; D-077 did not broaden future-Day mutation.

### Read-only APP / AUTH evidence

- APP and AUTH `PRAGMA quick_check` returned `ok`; FK checks were empty; every audit query reported `rows_written=0`; remote migration pending was `0 / 0`. APP target Entry `01a07c4c-af00-70e3-aafc-375651afad07` / Task `01a07c4c-af00-796c-a9f0-a0404fe94f6a` on Day `01a07724-839c-718f-addf-baab70224268` ended with Section Morning, position `4`, planned start `255`, estimate `1500`, title `D077 rapid planning`, Project Life, Mode D068, lifecycle `completed`.
- Target Start / Complete timestamps were server-derived (`2026-09-08T02:14:50.731Z` / `2026-09-08T02:15:31.795Z`); execution count was `0` active at evidence time. Day placement revision was `32`; duplicate-position query was empty. Recent operation rows for metadata / Mode / move / estimate / planned start / Start / Complete were coherent `success` rows. APP counts were entries `67`, tasks `72`, operations `281`; AUTH counts were users `1`, accounts `1`, sessions `6`.

Classification: `APPROVED / IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / PERSISTENT_NONPROD_BROWSER_VERIFIED / DB_INTEGRITY_VERIFIED / MIGRATION_NOT_REQUIRED / DEPENDENCY_UNCHANGED / BOOTSTRAP_PROBE_NOT_RUN / PRODUCTION_NOT_RUN / RESTORE_NOT_RUN / DESTRUCTIVE_CLEANUP_NOT_RUN / RELEASED_NO`.

## D-078 — Non-blocking repeated same-Section reorder v0.1 closeout

### Git / implementation

- Contract baseline was `2f611a18021d87e30d2d6cc4c8f4cea1b96efee0`; final implementation commit is `7bdfc4be82439f8518672e0bc120f374c435a5e6`, message `Implement D-078 non-blocking same-Section reorder`.
- Branch is `main`; local `main`, `HEAD`, `origin/main`, and `git ls-remote origin refs/heads/main` agree at `7bdfc4be82439f8518672e0bc120f374c435a5e6`. Remote is `https://github.com/hedgetheapp/taskchute-platform.git`. Tracked worktree and index are clean; pre-existing untracked review artifacts were preserved and not staged.
- Changed implementation files are `apps/web/src/web/App.tsx` and `apps/web/test/web/App.test.tsx`. Worker/API/schema/migration/dependency files are unchanged.

### Implementation result

D-078 adds a dedicated barrier-aware reorder intent coordinator. A pointer or keyboard gesture on an eligible current-Day same-Section / same-planned-start cohort uses the full canonical Section order plus the still-valid pending overlay, so a second gesture is calculated from the effective order. Sent Reorder operation identity, exact payload, and expected revision remain immutable. Only unsent desired order within the same reorder segment coalesces; Start / Complete / Interrupt and membership / placement mutations remain barriers. Unsent return-to-base cancels without HTTP; sent return-to-base becomes a later intent. Failure/conflict cancels dependent reorder intent, while ambiguity retains exact retry identity. Future-Day direct reorder and all historical / preview boundaries remain unchanged.

`保存中 n件` counts sent and latest unsent reorder logical work once, excluding obsolete coalesced intents and unsent no-ops. Next / forecast derivations use the effective pending order where applicable. Focus stays on the logical Entry for keyboard movement, and lifecycle / Section invalidation clears stale drag state safely.

### Automated verification

- D-078 focused Web coverage: `6 / 6` targeted tests PASS, including effective pointer/keyboard order, focus retention, unsent no-op cancellation, Start barrier, and dependent failure cancellation.
- Full Web: `4 files / 249 tests` PASS. Full Worker: `24 files / 207 tests` PASS. Relevant Worker reorder/lifecycle: `4 files / 38 tests` PASS.
- Typecheck, normal build, exact nonprod build, Wrangler nonprod dry-run, and `git diff --check`: PASS. The migration helper produced no output on Windows and was safely interrupted; it is reported as `NOT_RUN`, not PASS. Since D-078 is Web-only, status is `MIGRATION_NOT_REQUIRED`; dependency change is `NONE`.

### Persistent nonprod

- Deployed `taskchute-web-nonprod` from the exact nonprod build. Worker version: `500e93af-0308-45b5-84da-627eb44eeaab`. Generated config used `RUNTIME_ENV=nonprod`, `BOOTSTRAP_ENABLED=false`, nonprod APP/AUTH D1 bindings, and no migrations.
- Authenticated persistent tab verified two rapid `Shift + ArrowDown` moves on the same logical Entry, immediate visible reorder, focus retention, `保存中 1件` during drain, disappearance at convergence, and same-tab reload persistence. A fresh authenticated tab loaded the same persisted order. Console logs were `0 errors / 0 warnings` for persistent and fresh tabs.
- The initial D-078 browser run had a pointer/Runner evidence gap because its active content viewport was approximately `332px` wide and task columns were clipped. The verification-only closeout below supersedes that initial status using a normal-width `1280 × 720` authenticated surface; no code or redeploy was needed.
- D-075 fixed-chrome regression geometry remained stable in the same nonprod session: short Day header `top 16 / bottom 94 / height 78`, toolbar `top 110 / bottom 251 / height 141`, Day surface `top 259 / bottom 910 / height 651`, table heading `top 260`; long Day had the same top geometry and only a larger surface `scrollHeight` (`953` vs `634`). Toolbar-to-surface gap was `8px` in both cases.

### Read-only APP / AUTH evidence

- APP and AUTH `PRAGMA quick_check` returned `ok`; foreign-key checks were empty; every successful audit query reported `rows_written=0`. Local and remote migration lists both indicated pending `0 / 0` (APP local/remote 23 migrations; AUTH local/remote 1 migration).
- APP Day `2026-09-08` is `01a07724-839c-718f-addf-baab70224268`, with placement revision `34`. The browser keyboard reorder persisted the Sectionなし order and the duplicate-position query was empty.
- Latest `ReorderEntries` operation rows were two distinct successful operations: revisions `33` and `34`, with unique operation IDs and coherent full Section order results. Operations count was `283`, with `283` distinct operation IDs. No production database was queried.

Classification: `APPROVED / IMPLEMENTED / INTEGRATED / LOCAL_TESTED / MAIN_PUSHED / PERSISTENT_NONPROD_DEPLOYED / KEYBOARD_BROWSER_VERIFIED / POINTER_DND_BROWSER_VERIFIED / RUNNER_VISIBLE_BROWSER_VERIFIED / RELOAD_PERSISTENCE_VERIFIED / FRESH_TAB_VERIFIED / DB_INTEGRITY_VERIFIED / MIGRATION_NOT_REQUIRED / MIGRATION_HELPER_NOT_RUN / DEPENDENCY_UNCHANGED / PRODUCTION_NOT_RUN / RESTORE_NOT_RUN / DESTRUCTIVE_CLEANUP_NOT_RUN / RELEASED_NO`.

### D-078 persistent browser verification gap closeout

- Starting docs/main SHA was `d003df3320680582a56ad505bd4d1aa4ace2b38c` (`Record D-078 non-blocking reorder closeout`). No code change or redeploy was needed. Existing nonprod Worker `taskchute-web-nonprod` version `500e93af-0308-45b5-84da-627eb44eeaab` remained in use with `RUNTIME_ENV=nonprod`, `BOOTSTRAP_ENABLED=false`, and nonprod APP/AUTH D1 bindings.
- The usable browser surface was an authenticated persistent in-app browser tab with product Sidebar closed: viewport `1280 × 720`, DPR `1`, normal zoom. `.day-surface` was `1233px` wide; Task drag source and drop targets were visibly reachable. The earlier `332 × 910` clipped surface was retained as a limitation record only and was not used for the PASS claim.

#### Pointer D&D

- Dedicated fixture IDs included `D078 Browser A` (`01a0804d-e88f-7f32-9900-e462296bc27e`), `D078 Browser Runner` (`01a0804e-1121-7b98-b1e0-3b9218b25472`), `D078 Browser B` (`01a0804e-09d7-7458-b735-bce8f2056d1a`), `D078 Browser C` (`01a0804e-0d7e-7f1b-9193-918b2abfadb0`), and `D078 Browser Runner2` (`01a08057-9d45-7fdd-aa5f-fe5d125484da`). B/C/Runner2D were established in the same Day Section and `planned_start=720` cohort; initial relevant planned order was B → C → Runner2D after the historical fixture rows.
- A real browser pointer drag B→C changed the visible order immediately and preserved the logical focus on B. A two-drag pointer burst then produced `B → Runner2D → C`, with `保存中 2件` visible before drain; the final order did not rewind, the drop indicator count was zero, and save status returned to empty.
- Same-tab Ctrl+R and a fresh authenticated tab both preserved the final pointer order. The fresh tab had no login form and, after opening the existing sidebar, showed `ログアウト`; no credential retrieval, reset, or new login was used.

#### Floating Runner

- A second dedicated set used `D078 Browser P1`, `D078 Browser P2`, and `D078 Browser Runner4`, all in the Day Section with `planned_start=720`. Runner4 was started and later completed, leaving active execution count zero.
- In the same normal-width viewport, Runner OFF geometry was header `64..121 / 57px`, toolbar `137..186 / 49px`, surface `194..720 / 526px`, and sticky heading `195..229 / 34px`. Runner ON retained all four geometry invariants exactly. The fixed Runner overlay measured `left 392.5 .. right 872.5`, `top 618 .. bottom 696`, height `78px`; `.day-surface` gained only conditional `88px` bottom escape padding.
- With Runner4 visible, a real P1→P2 pointer reorder produced `保存中 1件`, preserved focus, and left no stale indicator. A P1→Runner4 crossing attempt left order and save status unchanged. At max scroll `1014`, final planned P1 bottom was `440`, below Runner top `618` in the visual sense (fully above it); planned-row focus also remained above Runner. Completing Runner4 removed the overlay and conditional escape.

#### Final browser / DB evidence

- All final verification tabs reported empty console logs: `0 errors / 0 warnings`. Same-tab reload and fresh authenticated tab showed no active execution and preserved planned fixture order `P2 → P1` after the Runner4 run.
- APP read-only evidence: `PRAGMA quick_check=ok`, FK empty, Day `2026-09-08` placement revision `77`, duplicate positions empty, active executions `0`, APP migrations `23`. AUTH: quick check `ok`, FK empty, AUTH migrations `1`. Every successful audit query reported `rows_written=0`; operations total `338`, distinct operation IDs `338`.
- Final relevant fixture positions were coherent: B position `7` planned / `720`, P2 position `10` planned / `720`, P1 position `11` planned / `720`, Runner4 position `13` completed / `720`; no production database was queried. Existing fixture rows were not destructively cleaned.

Classification update: `POINTER_DND_BROWSER_VERIFIED / POINTER_BURST_BROWSER_VERIFIED / RUNNER_VISIBLE_BROWSER_VERIFIED / RUNNER_GEOMETRY_STABLE / RUNNER_TRAILING_ESCAPE_VERIFIED / RUNNING_BOUNDARY_REJECTION_VERIFIED / RELOAD_PERSISTENCE_VERIFIED / FRESH_TAB_VERIFIED / CONSOLE_CLEAN / DB_INTEGRITY_VERIFIED / NO_CODE_CHANGE / NO_REDEPLOY / PRODUCTION_NOT_RUN / RELEASED_NO`. The earlier R-024 evidence gap is closed; `MIGRATION_HELPER_NOT_RUN` remains unchanged and is not a D-078 migration requirement.
