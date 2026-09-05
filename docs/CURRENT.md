# Current

Date: 2026-09-05

## Status

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
