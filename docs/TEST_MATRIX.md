# Test Matrix

First Server + Web vertical slice、D-038 B1 / B3、D-039 B2、D-040 Minimal Routine R1、Day Table UI-1、D-041 / D-042 Day Navigation v0.1は実装・GitHub `main`統合済み。Day Navigation v0.1 source / local automated / signed-in general browser / persistent nonprod general verificationはPASS。remote logout→reloginとremote未実施の詳細subcaseは`NOT_RUN`またはlocal-only evidence、productionは`NOT_RUN`。B1 / B2 / B3 / R1 local + persistent non-production verificationはPASS。UI-1 source / automated / real local browser verificationはPASS。B3 remote raw console warning / error exact countは`NOT_VERIFIED`。R1 real-browser controlled inclusive end-dateとdeployed non-null inclusive-date subcheckは`TOOLING_BLOCKED / NOT_VERIFIED`。B1 / B2 / B3 / R1 production verificationは`NOT_RUN`。Product runtime全体はまだVerified / Releasedではない。

この文書はverification requirementとcurrent evidenceの正本とする。

`Contract`は対象behavior自体のDecision状態を示す。

- `Approved`: canonical specification / Decisionとして確定済み
- `Proposed`: candidateであり、Approved implementation contractではない

`Evidence`は実装・検証状態を示す。

- `NOT_IMPLEMENTED`: 対象runtime behaviorが未実装
- `NOT_RUN`: test / spike contractは存在するが未実施
- `PASS`: current evidenceで要求を満たした
- `FAIL`: current evidenceで要求を満たさなかった
- `NOT_REQUIRED`: current change / scopeでは実施不要
- `LOCAL_PASS`: local working tree / commit candidateではPASSだが、mainへ未統合

Contractが`Approved`でも、実装やverificationが未実施ならPASS扱いしない。

## Current First Server + Web vertical slice evidence

`main@a1b342e0c07cffa1bbf38fbfd146e3912616d32a`に対するcurrent local / review evidence:

- lifecycle / ordering implementation commit: `09b1526f7f09554bd937aa446737a979868b779b`
- PR #5 merge commit: `1b5917ad1caff6dd648856bf7a054fa43d040a65`
- bootstrap lifecycle security: `IMPLEMENTED / INTEGRATED / LOCAL_TESTED`
- persistent nonprod config: `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / SOURCE_REVIEWED / PR_DIFF_REVIEWED`
- Worker / D1 tests: `55 PASS`
- Web tests: `18 PASS`
- total local automated tests: `73 PASS`
- `npm ci`: `PASS`
- npm audit vulnerabilities: `0`
- generated Worker types: `PASS`
- typecheck: `PASS`
- production build: `PASS`
- fresh AUTH_DB migration: `PASS`
- fresh APP_DB migration `0001 -> 0002`: `PASS`
- existing operation-row upgrade: `PASS`
- AUTH_DB foreign-key check: `0`
- APP_DB foreign-key check: `0`
- active Execution partial UNIQUE index: `PASS`
- `git diff --check`: `PASS`
- bootstrap lifecycle source-only implementation review: `PASS`
- bootstrap lifecycle GitHub PR diff review: `PASS`
- persistent nonprod config source-only implementation review: `PASS`
- persistent nonprod GitHub PR diff review: `PASS`
- remote D1 Product runtime verification: `PASS`
- deployed Worker verification: `PASS`
- production smoke test: `NOT_RUN`

この73 PASSはexplicit bootstrap mode、token rejection、cross-DB recovery、public signup regressionを含むcurrent local suiteである。local / nonprod evidenceをproduction verificationへ自動拡張しない。

## Persistent non-production remote verification evidence — 2026-08-22

Environment:

- Worker: `taskchute-web-nonprod`
- workers.dev URL: `https://taskchute-web-nonprod.taskfulness-sync.workers.dev`
- AUTH_DB: `taskchute-auth-nonprod` / `60085f8d-0c4e-4c15-98e9-3ce178398041`
- APP_DB: `taskchute-app-nonprod` / `6ad7e35f-5d03-4be3-9b00-46cd713a51c3`
- D1 creation location hint: `apac`
- jurisdiction: none
- observed region: APAC; AUTH primary response HKG / APP primary response NRT

Remote migration / schema evidence:

- AUTH migration `0001_better_auth_1_7_1.sql`: `PASS`
- APP migration `0001_runtime_bootstrap.sql`: `PASS`
- APP migration `0002_lifecycle_ordering.sql`: `PASS`
- pending migrations: AUTH 0 / APP 0
- AUTH `PRAGMA foreign_key_check`: 0
- APP `PRAGMA foreign_key_check`: 0
- `one_active_execution_per_user` partial UNIQUE index: `PASS`
- AUTH application tables observed: 5
- APP tables observed: 14

Deployment / bootstrap evidence:

- initial disabled deployment: `89b1da39-85c4-446b-864b-1e9661921f13` / version `b4894e25-a0e5-4da1-889b-428d1440f5c6`
- temporary enabled deployment: `8123e1e2-a330-491a-902e-608de7d88656` / version `fd7c32af-66f3-413b-81aa-137513665b11`
- disabled restore deployment: `1284c066-f202-43d6-9330-b1850d622732` / version `7a480b82-0e90-4eed-b0c1-6dfc7e671e05`
- final token-removed deployment: `44166465-52c6-418d-b8b2-d6034570563b` / version `98a11ea4-36b8-4177-8e38-d4a5dda81bde`
- bootstrap HTTP 200 / `recovered=false`: `PASS`
- final `BOOTSTRAP_ENABLED=false`: `PASS`
- `BOOTSTRAP_TOKEN` removed: `PASS`
- final secret list contains `BETTER_AUTH_SECRET` only: `PASS`
- final bootstrap route: 404
- old-token probe: 5 consecutive 404
- root: 200
- unauthenticated protected API: 401

Remote runtime smoke evidence:

| ID | Scenario | Evidence |
|---|---|---|
| NONPROD-REMOTE-01 | Login | PASS |
| NONPROD-REMOTE-02 | Public signup rejection | PASS |
| NONPROD-REMOTE-03 | Create Project | PASS |
| NONPROD-REMOTE-04 | Add 3 Tasks / Entries | PASS |
| NONPROD-REMOTE-05 | Reorder | PASS |
| NONPROD-REMOTE-06 | stale placement revision rejection | PASS (409) |
| NONPROD-REMOTE-07 | Start | PASS |
| NONPROD-REMOTE-08 | same-operation Start retry | PASS |
| NONPROD-REMOTE-09 | second user-wide active Execution rejection | PASS (409) |
| NONPROD-REMOTE-10 | Complete | PASS |
| NONPROD-REMOTE-11 | same-operation Complete retry | PASS |
| NONPROD-REMOTE-12 | reload / canonical order-state recovery | PASS |
| NONPROD-REMOTE-13 | active Execution converges to 0 | PASS |
| NONPROD-REMOTE-14 | Logout | PASS |
| NONPROD-REMOTE-15 | protected API after logout | PASS (401) |

Free-plan-shaped feasibility evidence for the observed smoke scope:

- Worker upload gzip: `353.80 KiB`
- startup observed: `37–44 ms`
- no observed CPU 1102, request 1027, D1 quota, or overload errors during smoke
- AUTH DB: 81,920 bytes / 176 rows read / 51 rows written over observed 24h window
- APP DB: 225,280 bytes / 1,518 rows read / 564 rows written over observed 24h window
- actual Cloudflare account subscription tier independently confirmed: `NOT_VERIFIED`
- paid-plan upgrade: `NOT_RUN`

Operational observation:

bootstrap disable deploy直後に旧enabled version由来とみられる400を1回観測し、その後8回連続404へ収束した。今後のbootstrap lifecycle verificationではdisable deployment後に複数回probeし、disabled postureへの収束を確認してから完了扱いとする。

Remote smoke harnessの前提誤りにより追加test dataとsessionが残ったが、active Executionは0。cleanup / retention policyはOpen Questionであり、このevidence取得時には承認外DELETEを実施していない。

## Core Domain

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| CORE-ID-01 | Identity | TaskとEntryを曖昧にcollapseしない | Approved (D-010) | PASS |
| CORE-ID-02 | Identity | EntryをTaskChuteDay / Section間で移動してもEntry identityを維持する | Approved (D-015) | NOT_IMPLEMENTED |
| CORE-ID-03 | Identity | initial runtime entity IDはUUIDv7を使用し、opaque identityとして扱いID timestampをordering authorityにしない | Approved (D-022) | PASS |
| CORE-PROJECT-01 | Project | Taskはinitial scopeで0..1 Projectに所属する | Approved (D-015) | PASS |
| CORE-SECTION-01 | Section | Sectionはrename等でidentityを失わないstable entityである | Approved (D-015) | PASS |
| CORE-SECTION-02 | Section | First sliceのSectionはuser-global stable entityとして複数TaskChuteDayで再利用できる | Approved (D-022) | PASS |
| CORE-ORDER-01 | Ordering | TaskではなくEntry identityによるexplicit orderをpreserveする | Approved (D-013, D-015) | PASS |
| CORE-ORDER-02 | Ordering | stale placement revisionによるreorderをsilent overwriteせずrejectする | Approved (D-020) | PASS |
| CORE-LIFE-01 | Lifecycle | Startは同一operation retryでduplicate Execution / inconsistencyを起こさない | Approved (D-012, D-020) | PASS |
| CORE-LIFE-02 | Lifecycle | Completeは同一operation retryで二重完了 / ended_at変更を起こさない | Approved (D-012, D-020) | PASS |
| CORE-LIFE-03 | Lifecycle | user全体でactive Executionは最大1つ | Approved (D-015) | PASS |
| CORE-LIFE-04 | Lifecycle | First sliceで`planned -> running -> completed`を正しく遷移する | Approved (D-013, D-015) | PASS |
| CORE-LIFE-05 | Lifecycle | 別Entryがrunning中の通常Startはimplicit interruptせずrejectする | Approved (D-015) | PASS |
| CORE-NEXT-01 | Next | explicit orderから次のplanned EntryをNextとして算出する | Approved (D-013) | PASS |
| CORE-NEXT-02 | Next | Next以外のplanned Entryもactive ExecutionがなければStart可能 | Approved (D-013) | PASS |

## TaskChuteDay / History

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| CORE-DAY-01 | TaskChuteDay | non-midnight boundaryでcivil instantを正しいlogical TaskChuteDayへ解決する | Approved (D-017) | PASS |
| CORE-DAY-02 | TaskChuteDay | historically establishedされたpast dayを後のboundary / timezone変更で再分類しない | Approved (D-017) | PASS |
| CORE-DAY-03 | TaskChuteDay | boundary / timezone transitionを含めconsecutive intervalにgap / overlapを作らない | Approved (D-017) | PASS |
| CORE-DAY-04 | TaskChuteDay | Execution crossing logical boundaryをfactとして分断せず、overlapでday別集計可能 | Approved (D-016, D-017) | NOT_IMPLEMENTED |
| CORE-DAY-05 | TaskChuteDay | initial bootstrapでIANA timezone / boundaryを明示し、暗黙のProduct defaultを適用しない | Approved (D-022) | PASS |
| CORE-DAY-06 | TaskChuteDay | ambiguous / nonexistent local boundaryを`compatible` semanticsで解決し、start/endを別々にtimezone ruleから決定する | Approved (D-017, D-022) | PASS |
| CORE-DAY-07 | TaskChuteDay | materialized dayがactual intervalとestablishment timezone / boundary contextを保持する | Approved (D-017, D-022) | PASS |
| HISTORY-01 | History | Task / Project等の現在metadata変更で過去Executionのhistorical meaningを黙って再分類しない | Approved (D-016) | NOT_IMPLEMENTED |
| HISTORY-02 | History | historical reference中のentityをunsafe hard deleteしてfactを参照不能にしない | Approved (D-016) | NOT_IMPLEMENTED |

Cross-day lifecycle testでは、前日Entryのactive Executionを翌TaskChuteDayでも同一Executionとして保持し、分割せずCompleteできることをPASSしている。ただしlogical day overlapによるReview / aggregation queryは未実装のため`CORE-DAY-04`全体はPASSへ昇格しない。

### Day Navigation v0.1 verification contract

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| DAY-NAV-01 | Future read | 未establishの未来logical dateをusable projectionとして返し、TaskChuteDay / Section historical contextを作らず、repeated readもno-writeとする | Approved (D-041) | PASS (LOCAL + NONPROD) |
| DAY-NAV-02 | Preview | future preview後、establishment前にeffective Section configurationが変わればlater previewはnew configurationを反映でき、first viewはhistorical contextをfreezeしない | Approved (D-038, D-041) | PASS |
| DAY-NAV-03 | Establishment | unestablished future Dayへの最初のsuccessful Task追加がthen-effective contextを持つDayをexactly one establishし、valid Task / Entry placementをatomicに保存してreloadできる | Approved (D-020, D-038, D-041) | PASS (LOCAL + NONPROD) |
| DAY-NAV-04 | Failure | malformed / invalid / stale deterministic failureがrequested mutationなしのnewly established Dayだけを残さない | Approved (D-020, D-041) | PASS |
| DAY-NAV-05 | Retry / concurrency | same logical mutation retryとconcurrent first mutationがone owner-scoped Day / context / Task / Entryへduplicateなしで収束する | Approved (D-020, D-041) | PASS |
| DAY-NAV-06 | History | successful planningでestablishされた未来Day contextを後のSection / timezone / boundary設定変更でrewriteしない | Approved (D-017, D-038, D-041) | PASS |
| DAY-NAV-07 | Routine | future Day viewはRoutineOccurrence / Routine Entryを作らず、既establish future Dayがcurrentになった場合はD-040 ensureがhistorical contextを維持してexactly once収束する | Approved (D-040, D-041) | PASS |
| DAY-NAV-08 | Interaction | previous / next、calendar picker、Today return、`Shift+Left / Shift+Right`、accessible label / focusを提供し、text / calendar editing中にglobal shortcutを発火しない | Approved (D-041; canonical DESIGN) | PASS (LOCAL + NONPROD observed interaction) |
| DAY-NAV-09 | Execution boundary | non-current Day view / planningからStart / Completeを拡張せず、current-Day execution semanticsを維持する | Approved (D-013, D-017, D-041) | PASS (LOCAL + NONPROD) |
| DAY-NAV-10 | Security | arbitrary-date query / mutationをauthenticated principalからowner-scopedに解決し、cross-owner accessを拒否する | Approved (D-021, D-041) | PASS |
| DAY-NAV-11 | Regression | Settings v0.1、UI-1 7列 / Routine列、Section / estimate / planned-start / reorder、current-Day Start / Completeを維持する | Approved regression contract | PASS (LOCAL + NONPROD) |
| DAY-NAV-12 | Past unestablished read | TaskChuteDay rowがないpast logical dateをempty / record-none projectionとして返し、Day / Section context / RoutineOccurrence / Routine Entryを作らずrepeated read / reloadもno-writeとする | Approved (D-042) | PASS (LOCAL + NONPROD) |
| DAY-NAV-13 | Past non-fabrication | unestablished past dateのview前後にcurrent Section configurationが変わっても、当時存在したかのようなhistorical interval / Section contextをsynthesize / persistしない | Approved (D-017, D-038, D-042) | PASS |
| DAY-NAV-14 | Past mutation boundary | Webはpast unestablished DayのAdd / planning / reorder / lifecycle / Routine mutationをusableにせず、direct Server mutationもDB変更なしでrejectする | Approved (D-020, D-021, D-042) | PASS (LOCAL; NONPROD Web read-only only) |
| DAY-NAV-15 | Established past regression | established past Dayをexisting frozen canonical context / historyからreadし、later Section settingsでrewriteせず、Day Navigation v0.1はnew past editing semanticsを追加しない | Approved (D-017, D-038, D-042) | PASS (LOCAL + NONPROD observed history) |

Day Navigation v0.1 local implementation evidence — 2026-08-31:

- implementation commit: `6f183c28242a1cd30211ea8e0c4f1e1dc23329bb` / `Implement Day Navigation v0.1`（parent `cd6dfe30321e0b1e88d6e12bb397690d9ad9ef0e`）とevidence docs commit `be52305ed98e2dbd213b99dcdddb34602cf69091`はGitHub `main`へIntegrated済み
- reviewed complete patch: SHA-256 `5773F11C0D11D196FACCFAA35B1FA64F89197A03DA26CA47F76B4EBDD6549CE9`、stable patch-id `7d34646ed3388c5da3db02fa93b1844e7181ba99`、10 files、`1,198 insertions / 97 deletions`
- ChatGPT final source review: `PASS`
- focused Day Navigation integration `12 PASS`、Worker / D1 full `113 PASS`、Web full `74 PASS`、focused auth-boundary Web `2 PASS`
- migration regression `1 scenario / 46 data/schema checks PASS`、typecheck / build / `git diff --check`: `PASS`
- Wrangler sandbox log writeは`EPERM` warningを出す場合があったが、tests / buildはexit code 0
- signed-in local browser: custom month-grid pointer / day-week-month keyboard / Enter / Escape + focus return / calendar-local Shift isolation / accessible selected-current state / global Shift Day navigation / Header Today / Sidebar Today canonical current-Day return / Settings unsaved draft retention + explicit Cancel / future preview + first Add / established-future planning / non-current Start disabled / established-past + record-none read-only / current-Day Start-Complete / UI-1 7列 + independent Routine column / console warnings-errors `0 / 0`: `PASS`
- logout → relogin → current Day real-browser subcase: `NOT_RUN`（final focused runではcredential handlingを行わず、explicit logout / 401 session-expiry resetのautomated Web `2 PASS`を記録）
- local APP DB: future preview no-write、first establishmentのexactly one Day / context / Task / Entry、`PRAGMA quick_check = ok`、FK violations `0`、active Execution `0`: `PASS`
- migration追加 / dependency追加 / new Material Decision: `NO / NO / NO`
- persistent nonprod general verification / production: `PASS / NOT_RUN`、Released: `NO`

Day Navigation v0.1 persistent nonprod evidence — 2026-08-31:

- exact source / deploy: `main@164326d11829faf12659c513037a1e172c3875b7` → existing `taskchute-web-nonprod` Worker version `022e57a5-088f-4d9f-8c3a-ae5b76c3df42`。pre-deploy version `22578f99-6256-4027-a345-ce523c67d241`、rollback `NOT_RUN / NOT_REQUIRED`
- pre-deploy local gate: focused Day Navigation `12 / 12`、Worker / D1 `113 / 113`、Web `74 / 74`、migration regression `1 scenario / 46 checks`、typecheck / nonprod build / Wrangler dry-run / `git diff --check`: `PASS`。Wrangler sandbox-external log-write warningはあったが各commandはexit 0
- deployment posture: `RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、tracked canonical APP/AUTH bindings、production resource混入なし、APP/AUTH pending migrationsなし。root `200`、unauthenticated protected API `401`、bootstrap POST `NOT_RUN`
- private ignored APP export: `98,979 bytes`、SHA-256 `507091E9843B8B87C92BFED48C23217A81A847877D1EF850BA4BCCFDDD2C6B17`、isolated restore / `quick_check=ok` / FK violations `0`: `PASS`。private path / row contentは非公開、commitなし
- `DAY-NAV-01 NONPROD_PASS`: future preview `2026-09-02`はDay / Entry / RoutineOccurrence `0 -> 0`でrepeated/reloaded viewもno-write。`DAY-NAV-02`のeffective-config-change freshnessはlocal automated evidenceのみ
- `DAY-NAV-03 NONPROD_PASS`: future `2026-09-03`のfirst successful normal Web Task addがDayをatomic establishしTask / Entry `+1 / +1`、historical Section contexts `+3`。estimate `25分`、Section `Evening`、planned start `21:15`、planned lifecycle、reload persistenceを確認。`DAY-NAV-04 / 05` failure / retry / concurrencyはremote `NOT_RUN`
- `DAY-NAV-08 / 09 NONPROD_PASS`: calendar picker、previous / next、`Shift+Left / Shift+Right`、Today return、non-current Start disabled、console warnings / errors `0 / 0`。calendar focus / editing isolationの詳細はlocal automated / local browser evidenceを維持
- `DAY-NAV-11 NONPROD_PASS`: Settings Section / Project、Section draft navigation保持 / explicit Cancel、Sidebar `240px`、UI-1 7列 / independent Routine列、future planning、current-Day Add → Start → Runner → Complete → reloadを確認。final active Execution `0`
- `DAY-NAV-12 NONPROD_PASS`: past record-none `2026-08-27`はrepeated view後もDay / Entry / RoutineOccurrence `0`、Add disabled、historical context / Routine / Task / Entry backfillなし
- `DAY-NAV-14`はdeployed Web read-only portionのみ`NONPROD_PASS`。direct Server mutation rejectionはremoteで新規実行せず、local automated evidenceを維持
- `DAY-NAV-15 NONPROD_PASS`: established past `2026-08-30`のexisting frozen Section / Entry / Routine historyをread-only表示し、placement revision `13`、viewによるOperation追加なし。later-config-rewrite dimensionはremote `NOT_RUN`
- remote未実施境界: logout → relogin、cross-owner、`DAY-NAV-02` config freshness、`04` failure、`05` retry / concurrency、`06` later-config freeze、`07` future-becomes-current Routine convergence、`13` config-change non-fabrication、`14` direct Server rejection。該当contractのlocal automated `PASS`は維持するがremote PASSへ昇格しない
- final integrity: APP / AUTH `quick_check=ok`、FK violations `0 / 0`、AUTH users / accounts / sessions `1 / 1 / 2`、active Execution `0`、duplicate active groups `0`
- intentional APP delta: Days `+2`、Day Section contexts `+6`、Tasks `+2`、Entries `+2`、Executions `+1`、Operations `+8`、RoutineOccurrences `+0`。Section configuration / Routine definitionsは不変。`+2 Days`はcurrent-Day lazy establishment + future verification Day。preview-only `2026-09-02`とpast record-none `2026-08-27`はno-write。verification dataはcleanupせず残置し、Product defaultとして扱わない
- correctness regression / unexpected migration: `NONE / NONE`。production `NOT_RUN`、Released `NO`

future Routine previewとpast historical correction / backfillはv0.1 scope外である。

## Runtime command / retry semantics

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| RUNTIME-OP-01 | Operation | same operation identity + same semantic requestはstored resultへreplayする | Approved (D-020) | PASS |
| RUNTIME-OP-02 | Operation | same operation identityをdifferent semantic requestへ再利用するとrejectする | Approved (D-020) | PASS |
| RUNTIME-OP-03 | Failure | unexpected infrastructure failureをdeterministic Domain rejectionとしてpersistせず、retry / reconciliation余地を残す | Approved (D-020) | PASS |
| RUNTIME-OP-04 | Operation | persisted request fingerprint version incompatibilityをclient misuseへ誤分類しない | Approved (D-020) | PASS |
| RUNTIME-PLACEMENT-01 | Placement | AddTaskToDayのstale placement revisionはpartial Task / Entryを残さずrejectする | Approved (D-020) | PASS |
| RUNTIME-PLACEMENT-02 | Placement | Reorder conflict / failureでmixed orderを残さず、winner resultとfinal stored orderを一致させる | Approved (D-020) | PASS |
| RUNTIME-LIFE-01 | Lifecycle | concurrent Startでexactly one active Execution / running Entryへ収束する | Approved (D-015, D-020) | PASS |
| RUNTIME-LIFE-02 | Lifecycle | Section設定済みEntryのStartとCompleteはplacement変更を伴わず、`placement_revision`を変更しない | Approved (D-020) | PASS |
| RUNTIME-LIFE-03 | Lifecycle | SectionなしEntryのStartはexpected placement revisionを前提に、Section配置・revisionのexactly one increment・Execution・lifecycle・operation resultをatomicに確定する | Approved (D-020) | PASS |
| RUNTIME-LIFE-04 | Lifecycle | Complete requestはplacement revisionを要求せず、`placement_revision`を変更しない | Approved (D-020) | PASS |

Current lifecycle / ordering suiteではsame-operation retry / misuse、stale conflict replay、cross-owner Reorder、historical Entryを越えないplanned-only Reorder、atomic rollback、64 Entry set-based Reorder、sectioned lifecycle-only Start / Complete、SectionなしStartのplacement atomicityを明示的にcoverageしている。

## Dogfood Day v0.1-B / B1 integrated implementation evidence

以下は2026-08-28に実行・reviewされたlocal evidenceである。B1 implementation commit `1c14eef4695c2de2ced65f43250544159e039485`はPR #13 merge commit `1609331ae32d3db36091ac0e4b0322c3757e3a9a`でmainへIntegrated済み。integrationはこのevidenceのpost-merge rerun、deployed verification、remote D1 verification、Product全体のVerified状態を意味しない。

Implementation / review provenance and automated evidence:

- B1 implementation commit: `1c14eef4695c2de2ced65f43250544159e039485`
- PR #13 merge commit: `1609331ae32d3db36091ac0e4b0322c3757e3a9a`
- historical review base: `dogfood-day-v01a@b6419f522ee6cb643b5b01a1b1c70f37b3da10a9`
- historical reviewed patch: 26 files、`+2,135 / -110`、SHA-256 `2D0154230E253B3DB2916604C346AE902F1A7CF6524561F2F4921164653B116D`
- source review: `PASS`
- Worker / D1 tests: `79 PASS`
- Web tests: `40 PASS`
- upgrade migration: `1 scenario / 15 checks PASS`
- typecheck / production build / `git diff --check`: `PASS`

Real local evidence — 2026-08-28, `Asia/Tokyo`:

- real local APP DB backup + `0003` migration + identity/history comparison + `PRAGMA foreign_key_check = 0`: `PASS`
- signed-in real-browser B1 verification: `PASS` for the rows below
- reload persistence: `PASS`
- browser unexpected console errors: `0`
- real Japanese IME: `NOT_RUN`
- B1 persistent nonprod / production verification: `PASS / NOT_RUN`
- Integrated to `main` / Released: `YES / NO`

local dogfoodで利用したSection set / rangesはuser-specific verification dataであり、Product default evidenceとして扱わない。

| ID | Area | Requirement | Evidence |
|---|---|---|---|
| B1-ORDER-01 | Reorder | Section / Sectionなし双方でmutation-time lifecycle snapshotを検証し、running / completed Entryのnumeric positionを含むcanonical slotを固定してhistorical境界越えをrejectする | PASS |
| B1-CONTEXT-01 | TaskChuteDay | configured / legacy双方のconcurrent context materializationが単一集合へ収束し、60 Sectionでも単一set-based statementでmaterializeする。established contextはcurrent Section metadataやtimezone再解決に依存せずhistorical authorityとして読み、configured actual intervalの内部連続性は検証する | PASS |
| B1-START-01 | Lifecycle / Placement | SectionなしStartのstale / concurrent loserがrevision conflictとなり、配置・revision・Execution・lifecycle・operation resultにpartial effectを残さない | PASS |
| B1-START-02 | Lifecycle / Retry compatibility | Sectioned Startはplacement revisionを省略した単一canonical request shapeを強制し、0003 upgrade後もoptional B1 result fieldsを含まないpre-B1 fingerprint / resultをexact replayする。SectionなしStartだけがinteger placement revisionを送る | PASS |
| B1-CONFIG-01 | Section configuration | initial configurationはserver command timeのcurrentかつlegacy-unknownなTaskChuteDayだけへ適用し、historical Dayをrewriteしない。同一success operationはDay境界後もreplayする。hidden Section-count capを置かず、60 Sectionを固定6-statement mutation batchでatomicに確定する | PASS |
| B1-MOVE-01 | Placement | MoveEntryがold groupを再採番せずgapを保持し、stale loserは全Entry位置とrevisionを変更しない | PASS |
| B1-CONTEXT-02 | Authorization / Projection | real Section指定commandはDay Section contextを検証し、out-of-context Entryをprojectionから黙って欠落させない | PASS |
| B1-MIGRATION-01 | Migration | isolated local D1で`0001 -> 0002 -> v0.1-A fixture -> 0003`を適用し、identity / lifecycle / nullable fields / indexes / active unique / FKを検証する | PASS |
| B1-HTTP-01 | Worker HTTP | initial Section configuration / MoveEntry / SetEntryEstimate routeをsigned-in test sessionで検証する | PASS |
| B1-LOCAL-DB-01 | Migration / Integrity | real local APP DBをbackup後に0003へupgradeし、original identity/history/operationを保持してFK 0、legacy Section time非捏造を確認する | PASS |
| B1-BROWSER-01 | Section / Reload | signed-in real browserでauthoritative Section range、extended-time表示、Section estimate total、virtualなSectionなし、reload persistenceを確認する | PASS |
| B1-BROWSER-02 | Sectionなし / Estimate | SectionなしEntryをEnterでexactly one作成し、15分を900秒として保存・集計・reloadし、estimate editでplacement revisionが変わらないことを確認する | PASS |
| B1-BROWSER-03 | Placement | planned EntryをSectionなし↔real Sectionへ移動し、各mutationでplacement revisionがexactly one増え、reload後も保持される | PASS |
| B1-BROWSER-04 | Start / Runner | SectionなしStartがactual current Sectionへの配置、revision exactly one increment、running lifecycle、exactly one Execution、Runnerをatomicに確定し、reload後も保持する | PASS |
| B1-BROWSER-05 | Complete | CompleteがExecutionをexactly once終了しactive Executionを0へ戻し、placement revisionを変えず、reload / completed visibility toggleで保持される | PASS |
| B1-BROWSER-06 | Reorder | natural planned cohortでpointer / Shift+Arrow reorderを行い、running / completed boundaryを越えずcanonical orderへ復元できる | PASS |
| B1-IME-01 | Web / IME | real OS Japanese IME composition Enterがpremature submitせず、normal Enterでexactly one作成する | NOT_RUN |
| B1-REMOTE-01 | Remote nonprod | B1 migration / runtime / browser flowをpersistent nonprodで検証する | PASS |
| B1-PROD-01 | Production | B1 production migration / smokeを検証する | NOT_RUN |

## Dogfood Day v0.1-B / B2 integrated implementation evidence

B2 implementation commit `316ad0d88f0f88d1445991904da587b1e0987dab`（parent `313679fa0c68ce798c01b2a0216f1dbb0832f4c1`、subject `Implement B2 planned-start planning`）は`main`へfast-forward Integrated済み。reviewed patchは17 files、`+938 / -40`、SHA-256 `38A4D4FB08612039EE0DC313FF9EC665A3B982D9AE1C417EC5BBB5A574489F31`で、commit patch-idとの一致とsource review `PASS`を確認した。

Automated / isolated evidence:

- Worker / D1: `87 PASS / 87`（focused B2 `7 PASS / 7`）
- Web: `49 PASS / 49`
- isolated APP migration regression: `1 scenario / 25 data-schema checks PASS`
- typecheck / production build / `git diff --check`: `PASS`

Real local APP DB migration evidence — 2026-08-29:

- private ignored raw SQLite backup: `taskchute-app-local-pre-b2-20260829-160924.sqlite`、311,296 bytes、SHA-256 `3AF6A262629CA9807FAC5126DA7A92677F8B7076959DFB4A4A7DFCFF981AA1C5`
- backup / pre-migration: `PRAGMA quick_check = ok`、FK violations 0、active Execution 0、pendingは`0004_dogfood_day_b2.sql`のみ
- pre-existing counts: app_users 1 / projects 1 / sections 5 / taskchute_days 1 / tasks 9 / entries 9 / executions 4 / operations 55 / Section configuration versions 1 / heads 1 / items 5 / Day contexts 5
- `0004_dogfood_day_b2.sql`: `PASS`、post-migration pending 0
- immediate preservation gate: `PASS`。全12 tableのpre-existing identity / deterministic fingerprint、placement revision、estimate、unknown-vs-timed Section contextを保持。既存Entry 9件はplanned start NULL、schema / constraint / B1+B2 index / one-active index、quick check / FK / active Executionを確認

Signed-in real local browser evidence — 2026-08-29:

- `http://127.0.0.1:5173/`、logical date `2026-08-29`、boundary `04:00` / 240
- auto-placement、exact Section boundary、clear、editor-open explicit Section move時clear、NULL / minute / same-minute canonical order、same-minute reorder、illegal cohort reorder control抑止、extended `24:30`、`28:00` / `29:00` rejection、17:30 planned Entryの16:15 early Start / Complete、reload persistence: `PASS`
- unexpected console errors / warnings: `0 / 0`
- final DB: `quick_check = ok`、FK 0、active Execution 0、pending 0、Sectionなし + non-null planned start 0、original Task / Entry / Execution / operation identity and content preserved
- verification用Morning 04:00–09:00 / Focus 09:00–12:00 / Lunch 12:00–13:00 / Afternoon 13:00–18:00 / Evening 18:00–28:00はuser-specific configurationであり、Product defaultではない。verification-created dataはcleanupせず残置した

`B2-COMMAND-01` / `B2-RETRY-01`のexact operation replay / misuse / concurrency / ambiguityはautomated Worker / Web evidenceによる。real browserではoperation IDをinjectしてlow-level retryを再現していない。

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| B2-PERSIST-01 | Persistence | nullable `planned_start_minute INTEGER`がestablished Day `logicalDate`基準のextended wall-clock minuteをSection contextと同じ座標系で保持し、existing EntryをNULLでupgradeする | Approved (D-039) | PASS |
| B2-VALIDATE-01 | Validation | non-null値を`[establishment_boundary_minutes, establishment_boundary_minutes + 1440)`内かつexactly one authoritative timed Sectionへ検証し、Day開始0-based offsetやlegacy unknown timingを推測しない | Approved (D-039) | PASS |
| B2-PLACEMENT-01 | Placement | planned start設定・変更がexactly one Sectionを解決してauto-moveし、Section boundary minuteを次Sectionへ配置する | Approved (D-039) | PASS |
| B2-PLACEMENT-02 | Placement | `Sectionなし` + non-null planned startを許さず、SectionなしEntryへの設定をresolved real Sectionへ移す | Approved (D-039) | PASS |
| B2-CLEAR-01 | Placement | planned start clearが現在Sectionを維持し、開始予定なしcohortへ配置する | Approved (D-039) | PASS |
| B2-ORDER-01 | Ordering | Section内で開始予定なしをposition順、開始予定ありをminute昇順・同minute position順にし、historical slotを保護する | Approved (D-039) | PASS |
| B2-REORDER-01 | Reorder | manual Reorderを開始予定なしcohortまたは同一minute cohort内だけに制限し、異なるcohort / historical boundary越えをrejectする | Approved (D-039) | PASS |
| B2-COMMAND-01 | Command | SetEntryPlannedStartがplanned-start、Section、order、revision exactly +1、operation resultをatomicに確定する | Approved (D-039) | PASS |
| B2-RETRY-01 | Retry / Conflict | stale revisionをpartial effectなしでrejectし、same-operation retryでrevision / effectsを二重適用せず、different-semantic misuseとambiguity reconciliationを扱う | Approved (D-039) | PASS |
| B2-MOVE-01 | Placement | explicit Section moveがplanned startをclearし、MoveEntry全体でrevisionをexactly once増やす | Approved (D-039) | PASS |
| B2-START-01 | Lifecycle | planned-startにnot-beforeを課さず、Sectionなし Start placementをplanned-start NULLへ限定する | Approved (D-039) | PASS |
| B2-ELIGIBILITY-01 | Lifecycle | running / completed Entryのplanned-start editをrejectする | Approved (D-039) | PASS |
| B2-RELOAD-01 | Query | planned start、derived Section / order、revisionがreload後もcanonical stateから復元する | Approved (D-039) | PASS |
| B2-WEB-01 | Web | current Day planned Entryのblank / extended-time入力、auto-placement、clear、move時clear、illegal reorder control抑止を実ブラウザで扱う | Approved (D-039) | PASS |
| B2-LOCAL-DB-01 | Migration / Integrity | real local APP DBをprivate backup後に0004へupgradeし、pre-existing identity / content / historical authorityとDB integrityを保持する | Approved (D-039) | PASS |
| B2-BROWSER-01 | Web / Browser | signed-in real local browserでB2 placement / order / validation / lifecycle / reload scenariosを検証する | Approved (D-039) | PASS |
| B2-REMOTE-01 | Remote nonprod | B2 migration / runtime / authenticated browser flowをpersistent nonprodで検証する | Approved (D-039) | PASS |
| B2-PROD-01 | Production | B2 production migration / smokeを検証する | Approved (D-039) | NOT_RUN |

### D-043 Section / planned-start full synchronization contract

以下はD-043でApprovedしたfuture runtime requirementである。既存B2 PASSはD-039 runtime baselineのhistorical evidenceとして維持するが、D-043実装のPASSへ読み替えない。現時点では全項目`NOT_IMPLEMENTED`である。

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| SECTION-START-SYNC-01 | Section edit | real Sectionを明示選択すると、開始予定を選択Sectionの`logical_start_minute`へexactly設定する | Approved (D-043) | NOT_IMPLEMENTED |
| SECTION-START-SYNC-02 | Section edit | real Section変更が以前の開始予定を選択Sectionの開始minuteで置き換える | Approved (D-043) | NOT_IMPLEMENTED |
| SECTION-START-SYNC-03 | Sectionなし | `Sectionなし`の明示選択がSection placementをabsenceにし、開始予定を`NULL`へclearする | Approved (D-038, D-043) | NOT_IMPLEMENTED |
| SECTION-START-SYNC-04 | Planned-start clear | 開始予定の直接clearが`planned_start_minute = NULL`と`Sectionなし`を同時に確定する | Approved (D-043) | NOT_IMPLEMENTED |
| SECTION-START-SYNC-05 | Planned-start edit | 開始予定の設定・変更がそのminuteを含むreal Sectionをderiveする | Approved (D-030, D-043) | NOT_IMPLEMENTED |
| SECTION-START-SYNC-06 | Boundary | Section boundary minuteが`[start, end)`に従って後続Sectionへ属する | Approved (D-030, D-043) | NOT_IMPLEMENTED |
| SECTION-START-SYNC-07 | Extended time | `24:30` / `28:00`等のextended wall-clock開始予定とSection開始minuteで同じ同期規則を維持する | Approved (D-030, D-039, D-043) | NOT_IMPLEMENTED |
| SECTION-START-SYNC-08 | Routine parity | ordinary EntryとRoutine-derived Entryの選択済みscope内で同じSection / planned-start invariantを適用する | Approved (D-034, D-043) | NOT_IMPLEMENTED |
| SECTION-START-SYNC-09 | Atomicity | Section、planned start、canonical order / tie-break、placement revision exactly +1、operation resultをatomicに確定しpartial stateを残さない | Approved (D-020, D-039, D-043) | NOT_IMPLEMENTED |
| SECTION-START-SYNC-10 | Retry / Conflict | stale revision、same-operation retry / misuse、infrastructure ambiguityをD-020 / D-039に従って安全に処理し同期effectを二重適用しない | Approved (D-020, D-039, D-043) | NOT_IMPLEMENTED |
| SECTION-START-SYNC-11 | Reload | mutation成功後とreload後にSection / planned-startの同期したcanonical stateを復元する | Approved (D-043) | NOT_IMPLEMENTED |
| SECTION-START-SYNC-12 | Lifecycle / History | running / completed / interrupted、historical context、non-current execution restrictionを変更せず、許可されたplanned editingだけへ同期規則を適用する | Approved (D-030, D-041, D-042, D-043) | NOT_IMPLEMENTED |
| SECTION-START-SYNC-13 | Invariant | `Sectionなし` + non-null開始予定をnormal mutation pathとstored canonical stateで作らない | Approved (D-039, D-043) | NOT_IMPLEMENTED |
| SECTION-START-SYNC-14 | Invariant | real Section + `NULL`開始予定をnormal user-editable mutation pathで作らない | Approved (D-043) | NOT_IMPLEMENTED |

## Dogfood Day v0.1-B / B3 local implementation evidence

B3 implementation commit `2481c4916ca2f694f07d6808a4482bea28c79a80`（parent `d3061ced6e27cf304fe8375002072bc122ac8d22`、subject `Implement B3 Section settings lifecycle`）は`main`へIntegrated済み。reviewed v3 patchは12 files、`+904 / -9`、SHA-256 `4537423FCEFC1F39E3FD0EAEE00ABA3D60BBADE4A35CA4CBE6BB28F60BA726E4`、stable patch-id `f3b88cf45ed17d19bb21ddcc90844bd28c0d418a`で、source reviewは`PASS`。

Automated / isolated evidence:

- Worker / D1 full suite: `91 PASS`
- focused B3 application: `3 PASS`
- Web full suite: `55 PASS`
- isolated APP migration regression: `32 data/schema checks PASS`
- typecheck / production build / `git diff --check`: `PASS`
- current-head query independent of current Day context、immutable append / head switch、rename identity/history、shared boundary、add/delete/last absorption、current-Day freeze、next-Day materialization、stale conflict、same-operation replay/misuse、invalid range rejection、B2 planned-start against new context: `PASS`
- Web invalid raw time、success feedback、revision-conflict canonical reset / new-base edit、infrastructure-ambiguous exact retry: `PASS`

Real local APP DB migration evidence — 2026-08-29:

- private ignored pre-B3 backupとdeterministic fingerprint snapshotを作成・別SQLiteでvalidation: `PASS`
- pre-migration pendingは`0005_dogfood_day_b3.sql`のみ、7 migration commands成功、post-migration pending 0
- AUTH pending 0、AUTH migration / explicit SQL writeなし
- pre/post APP/AUTH `quick_check`: `PASS`、FK violations 0、active Execution 0、Sectionなし + non-null planned start invalid rows 0
- migration前後でpre-existing APP identities/content、operations、Section configuration head、established current Day context、placement revisionを保持: `PASS`

Signed-in real local browser evidence — 2026-08-29:

- existing signed-in sessionを使用し、bootstrap / account / credential operationなし
- settings/effective timing copy、invalid raw boundary syncとSave/Add/Delete disable、Add draft + Cancel、non-last / last Delete absorption + Cancel、one-Section delete disable: `PASS`
- temporary immutable configuration Bをnormal Web UIで保存し、temporary rename + safe shared-boundary 1-minute shiftとsuccess messageを確認: `PASS`
- B後もalready-established current Dayのhistorical Section identity/name/range、Task/Entry placement、planned starts、canonical order、lifecycleは不変、placement revision `22`: `PASS`
- reload後にDayはhistorical A、settingsはBを表示: `PASS`
- pre-test A semanticsを新immutable configuration CとしてWeb UIで保存し、final active semanticsをexact restore: `PASS`
- expected APP increments: configuration versions `+2`、items `+10`、operations `+2`（両方`UpdateSectionConfiguration`）、head row count不変
- pre-existing Task / Entry / Execution fingerprints不変、final APP/AUTH quick check PASS、FK 0、active Execution 0
- browser unexpected warnings / errors: `0 / 0`
- next-Day materializationはautomated `PASS`、real browser `NOT_RUN`

AUTH rolling-session observationはD-022のexisting rolling lifetime 7日 / update・renewal threshold 1日policyに沿うexpected verification/runtime side effectである。original verification startとの比較ではuser / account / credential / mapping、session row count / identityは不変で、既存sessionの`expiresAt` / `updatedAt`だけが更新された。token / hash / secretは取得・記録しておらず、resume baseline後のAUTH差分は0。これは新しいDecisionではない。

real localで利用したSection dataとtemporary B/Cはuser-specific dogfood dataであり、Product default evidenceとして扱わない。

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| B3-QUERY-01 | Query | current Section configuration head/itemsをcurrent Day historical contextから独立してowner-scoped queryする | Approved (D-038) | PASS |
| B3-VERSION-01 | Persistence | updateはimmutable configuration version/itemsをappendし、expected headを検証してheadをatomicに切り替える | Approved (D-038) | PASS |
| B3-RENAME-01 | Identity / History | rename後もstable Section identityとprior version / established Day historyを保持する | Approved (D-030, D-038) | PASS |
| B3-BOUNDARY-01 | Validation | adjacent Sectionのshared boundaryを同期し、configuration全体をgaplessに保つ | Approved (D-030, D-038) | PASS |
| B3-VALIDATE-01 | Validation | overlap / gap / zero-length / before-Day / after-Dayをpartial effectなしでrejectする | Approved (D-030, D-038) | PASS |
| B3-ADD-01 | Settings | Section追加はexisting intervalを分割し、新しいstable Section identityをactive configurationへ追加する | Approved (D-030, D-038) | PASS |
| B3-DELETE-01 | Settings | non-last Section削除を次Sectionへのinterval absorptionとして保存し、stable row/historyをhard deleteしない | Approved (D-030, D-038) | PASS |
| B3-LAST-DELETE-01 | Settings | last Section削除を前Sectionへ吸収し、one remaining Sectionの削除を拒否する | Approved (D-030, D-038) | PASS |
| B3-HISTORY-01 | History | settings変更がestablished current Day contextをretroactiveにrewriteしない | Approved (D-030, D-038) | PASS |
| B3-EFFECTIVE-01 | TaskChuteDay | later unestablished Dayはlatest active configurationからcontextをmaterializeする | Approved (D-038) | PASS (automated; real browser NOT_RUN) |
| B3-CONFLICT-01 | Conflict | stale expected headをrejectし、Webはlatest canonical stateへreloadしてstale draftをresetする | Approved (D-038) | PASS |
| B3-RETRY-01 | Retry | same-operation replay / misuseを分離し、infrastructure ambiguityはexact original requestだけをretryする | Approved (D-020, D-038) | PASS |
| B3-PLANNED-01 | B2 regression | B2 planned-startが新たにestablishされたB3 next-Day contextからSectionを解決する | Approved (D-031, D-038, D-039) | PASS |
| B3-MIGRATION-01 | Migration | isolated upgradeでexisting rowsを保持し、UpdateSectionConfiguration operation typeを追加する | Approved (D-038) | PASS |
| B3-WEB-01 | Web | raw invalid timeではSave/Add/Deleteをdisableし、valid saveのsuccess / conflict reconciliationを表示する | Approved (D-038) | PASS |
| B3-WEB-ADDDELETE-01 | Web | Add/Delete draft、absorption、Cancelがserver mutationなしで動作する | Approved (D-038) | PASS |
| B3-WEB-HISTORY-01 | Web / History | B保存とreload後もcurrent Dayはhistorical contextを表示し、settingsだけがlatest headを表示する | Approved (D-038) | PASS |
| B3-LOCAL-DB-01 | Migration / Integrity | real local APP DBをprivate backup後に0005へupgradeし、pre-existing identity/contentとintegrityを保持する | Approved (D-038) | PASS |
| B3-BROWSER-01 | Web / Browser | signed-in real local browserでB3 draft/save/freeze/reload/immutable restoreを検証する | Approved (D-038) | PASS |
| B3-REMOTE-01 | Remote nonprod | B3 migration / runtime / authenticated browser flowをpersistent nonprodで検証する | Approved (D-038) | PASS |
| B3-PROD-01 | Production | B3 production migration / smokeを検証する | Approved (D-038) | NOT_RUN |

## Persistent non-production B3 remote verification evidence — 2026-08-29

Source / environment:

- source / `main`: `d8d48c4e764958d7a0e5652cf6ed6cbd7b895e43`（B3 implementation `2481c4916ca2f694f07d6808a4482bea28c79a80`を含む）
- Worker: `taskchute-web-nonprod`
- URL: `https://taskchute-web-nonprod.taskfulness-sync.workers.dev`
- pre-B3 Worker version: `23706fe1-5359-43c2-9fef-09b5e8ab714d`
- deployed Worker version: `0a47ad68-0133-408f-9ce7-d35dcd3b99cb`
- AUTH_DB: `taskchute-auth-nonprod` / `60085f8d-0c4e-4c15-98e9-3ce178398041`
- APP_DB: `taskchute-app-nonprod` / `6ad7e35f-5d03-4be3-9b00-46cd713a51c3`

Local / preflight gate:

- Worker / D1: `91 PASS / 91`
- Web: `55 PASS / 55`
- isolated migration regression: `1 scenario / 32 data/schema checks PASS`
- typecheck / `git diff --check`: `PASS`
- pre-deploy root / unauthenticated protected API: `200 / 401`
- `RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、expected bindings、APP pendingは`0005_dogfood_day_b3.sql`のみ、AUTH pending 0
- APP `PRAGMA quick_check = ok`、FK violations 0、active Execution 0、duplicate active Execution 0、Sectionなし + non-null planned start 0

Backup / migration / preservation:

- private ignored full APP exportを作成・検証: `PASS`
- backup: 44,795 bytes / SHA-256 `1F37B2F93360368DF748BE2535605DA58A3868E4D7BF95BC054BB2F6ED638411`
- isolated SQLite restore、restored quick check / FK: `PASS / ok / 0`
- pre-migration counts: app_users 1、auth_subject_mappings 1、projects 1、sections 3、taskchute_days 2、tasks 11、entries 11、executions 3、operations 35、configuration versions / heads / items `1 / 1 / 3`、Day contexts 6
- `0005_dogfood_day_b3.sql`: `PASS`、7 commands、post-migration pending 0
- migration直後の13-table identity / content fingerprints、current Day context、Section configuration head semanticsはpre-migrationと一致
- `UpdateSectionConfiguration` command constraint、B1/B2 indexes、one-active-Execution indexを保持

Build / deployment / security:

- `CLOUDFLARE_ENV=nonprod` build、generated config inspection、dry-run: `PASS`
- generated Worker / vars / D1 names and IDsはexpected nonprodだけを参照
- upload: 1,728.23 KiB / gzip 361.20 KiB、startup 39 ms
- deployed Worker version: `0a47ad68-0133-408f-9ce7-d35dcd3b99cb`
- post-deploy root: 3 consecutive 200、unauthenticated Day / Section configuration API: 401
- direct bootstrap POST: `NOT_RUN`
- public signup remote POST: `NOT_RUN`
- production、secret / credential / binding / resource mutation: none

Authenticated B3 browser evidence:

- existing signed-in persistent nonprod browser sessionを使用。bootstrap / credential / account operationなし
- effective-timing copy、malformed shared-boundary raw value同期、invalid draftでSave/Add/Delete disable、valid valueで復帰: `PASS`
- Add draftのmidpoint split / gapless + Cancel、non-last / last Delete absorption + Cancel、one-Section delete disable: `PASS`
- draft-only検証後もversions / items / operations `1 / 3 / 35`、head不変
- temporary immutable Bをnormal Web UIで保存し、success feedbackとreload persistenceを確認: `PASS`
- B保存後もcurrent Day identity / establishment context / placement revision、historical context、Task / Entry / Execution / planned start / canonical orderはpre-test snapshotから不変: `PASS`
- pre-test semanticsを新immutable Cとしてnormal Web UIで保存し、active semanticsをexact restore: `PASS`
- final reloadでcurrent Day freezeとsettings semantic equalityを再確認: `PASS`
- verification configuration / Section rangeはuser-specific nonprod dataであり、Product defaultではない
- visible browser error: none observed
- raw console warning / error exact count: `NOT_VERIFIED`
- raw console境界はDomain / persistence / visible browser flowのPASSをinvalidateしない
- next-Day materialization: automated `PASS` / remote real-browser `NOT_RUN`

Final integrity / evidence boundary:

- APP / AUTH pending migration: `0 / 0`
- APP `PRAGMA quick_check = ok`、FK violations 0、active Execution 0、duplicate active Execution 0、Sectionなし + non-null planned start 0
- pre-existing app user / mapping / Project / Section / Day / Task / Entry / Execution / operation / Day-context rowsを保持
- expected delta only: configuration versions `+2`、items `+6`、operations `+2`（両方`UpdateSectionConfiguration`）
- Task / Entry / Execution delta: `0 / 0 / 0`
- AUTH user / account / mapping: `1 / 1 / 1`、auth subject -> APP mapping整合。AUTH migration / explicit SQL write、credential/hash/token/secret取得なし
- B3 production verification: `NOT_RUN`
- Released: `NO`

## Persistent non-production B2 remote verification evidence — 2026-08-29

Source / environment:

- source / `main`: `606d192aa22aea364ad54b7244f295284487a2c6`（B2 implementation `316ad0d88f0f88d1445991904da587b1e0987dab`を含む）
- Worker: `taskchute-web-nonprod`
- URL: `https://taskchute-web-nonprod.taskfulness-sync.workers.dev`
- pre-B2 Worker version: `b8d7df82-baa3-4162-adbf-c0ecb65dcc84`
- deployed Worker version: `23706fe1-5359-43c2-9fef-09b5e8ab714d`（deployment `c85e57af-7045-489e-8d40-1c4b6f6318d1`、traffic 100%）
- AUTH_DB: `taskchute-auth-nonprod` / `60085f8d-0c4e-4c15-98e9-3ce178398041`
- APP_DB: `taskchute-app-nonprod` / `6ad7e35f-5d03-4be3-9b00-46cd713a51c3`

Local / preflight gate:

- Worker / D1: `87 PASS / 87`（focused B2 `7 PASS / 7`）
- Web: `49 PASS / 49`
- migration regression: `1 scenario / 25 checks PASS`
- typecheck / `git diff --check`: `PASS`
- pre-deploy root / unauthenticated protected API: `200 / 401`
- `BOOTSTRAP_ENABLED=false`、expected bindings、APP pendingは`0004_dogfood_day_b2.sql`のみ、`PRAGMA quick_check = ok`、FK violations 0、active Execution 0

Backup / migration / preservation:

- private ignored APP export: `.wrangler/private-backups/taskchute-app-nonprod-pre-b2-20260829-165630.sql`、27,490 bytes、SHA-256 `492AFF9D4179420E16738867D336EF34A68C4D65DAC7CAA1A5716D5CC51FAB70`
- isolated restore: `PASS`。pre-existing countsはapp_users 1 / projects 1 / sections 3 / taskchute_days 2 / tasks 4 / entries 4 / executions 2 / operations 15 / configuration versions 1 / heads 1 / items 3 / contexts 6
- `0004_dogfood_day_b2.sql`: `PASS`、9 commands、pending after 0
- preservation gate: 全12 tableのpre-existing identity / content、placement revision、estimate、historical Section contextを保持 `PASS`
- post-migration `PRAGMA quick_check = ok`、FK violations 0、active Execution 0、Sectionなし + non-null planned start 0

Deployment / authenticated browser:

- build / dry-run / deploy: `PASS`、startup 44 ms。deploy後root / unauthenticated protected APIを3回連続`200 / 401`、schema / 5xx errorなし
- existing signed-in session、logical date `2026-08-29`、boundary `04:00` / 240、placement revision `7 -> 25`
- planned-start auto-placement、exact Section boundary、clear、editor-open explicit Section move時clear、NULL / minute / same-minute canonical order、same-minute reorder、illegal cohort reorder control抑止、extended `24:30`、`28:00` / `29:00` rejection、early Start / Complete、reload persistence: `PASS`
- browser unexpected console errors / warnings: `0 / 0`
- final APP integrity: pending 0、`quick_check = ok`、FK 0、active Execution 0、Sectionなし + non-null planned start 0。pre-existing content / historical Day authorityを保持
- verification用Morning `04:00–12:00` / Day `12:00–20:00` / Evening `20:00–28:00`はuser-specific configurationでありProduct defaultではない。verification-created dataはcleanupせず残置した

Verification boundary:

- direct bootstrap POST: `NOT_RUN`
- public signup remote POST: `NOT_RUN`
- 上記2項目はremote PASSへ含めない。`B2-REMOTE-01`はprivate backup、0004 migration / preservation、deploy、authenticated B2 runtime / browser flow、final integrityによりPASSとする
- B2 production verification: `NOT_RUN`
- B1 real Japanese IME: `NOT_RUN`
- Released: `NO`

## Persistent non-production B1 remote verification evidence — 2026-08-29

Source / deployment:

- source / `main`: `779f9d18dab79062679dec696657a5addc6539b2`
- time-dependent test gate fix: integrated in the same source
- Worker: `taskchute-web-nonprod`
- URL: `https://taskchute-web-nonprod.taskfulness-sync.workers.dev`
- deployed version: `b8d7df82-baa3-4162-adbf-c0ecb65dcc84`
- AUTH_DB: `taskchute-auth-nonprod` / `60085f8d-0c4e-4c15-98e9-3ce178398041`
- APP_DB: `taskchute-app-nonprod` / `6ad7e35f-5d03-4be3-9b00-46cd713a51c3`
- observed APP primary: NRT / APAC context

Local gate before remote:

- typecheck / build / `git diff --check`: `PASS`
- Worker / D1 tests: `79 PASS / 0 FAIL`
- Web tests: `40 PASS / 0 FAIL`
- migration regression: `1 scenario / 15 checks PASS`

Migration / preservation:

- pre-migration pending: APPは`0003_dogfood_day_b1.sql`のみ / AUTH 0
- private ignored APP backup captured before migration: `PASS`
- pre/post APP `PRAGMA quick_check`: `ok`
- pre/post APP foreign-key violations: `0`
- pre/post active Execution: `0`
- `0003_dogfood_day_b1.sql`: `PASS`、standard Wrangler migration tracking、31 commands executed、pending after 0
- `entries.section_id`: nullable
- `entries.estimate_seconds`: exists / nullable
- B1 tables / indexes: present
- pre-existing core row counts、Task / Entry / Execution / operation identity fingerprints: preserved
- legacy Section contexts: authoritative timeを推測せずunknownを保持
- initial configuration前のversions / heads / items: `0 / 0 / 0`

Deployment / security:

- root: 200 / unauthenticated protected API: 401
- `BOOTSTRAP_ENABLED=false`
- bootstrap route: prior runで5回連続404
- secret / resource / binding / production changes: none
- existing persistent nonprod account authenticated successfully; auth subject -> APP user mapping preserved

Authenticated B1 runtime / browser evidence:

- current TaskChuteDay: `2026-08-29` / `2026-08-28T19:00:00Z`–`2026-08-29T19:00:00Z`
- initial Section configuration: `PASS`、versions / heads / items = `1 / 1 / 3`
- verification-only ranges: Morning `04:00–12:00` / Day `12:00–20:00` / Evening `20:00–28:00`。Product defaultではない
- current Day contexts: known timed contextsへ確定
- historical `2026-08-22` contexts: legacy unknownのまま保持
- clearly labeled B1 verification Entry 3件を作成し残置。cleanup / deleteは未実施
- `Sectionなし`: create / reloadでnull Section保持 `PASS`
- estimate: 15分 / 900秒、group total 15分、placement revision不変 `PASS`
- MoveEntry: `Sectionなし -> Morning -> Sectionなし`、revision `3 -> 4 -> 5`、reload persistence `PASS`
- Reorder: revision 3のstale requestは`revision_conflict`、mixed orderなし。fresh reorder `5 -> 6`、reload persistence `PASS`
- Start from `Sectionなし`: actual current Sectionをexactly oneの`Day`へ解決し、`Sectionなし -> Day`、revision `6 -> 7`、running、Execution exactly one、Runner / reload persistence `PASS`
- Complete: completed、ended Execution exactly one、active Execution 0、revision 7維持、reload persistence `PASS`
- browser flow: Day / ranges / `Sectionなし` / create / estimate / move / reorder / stale conflict / Start / Runner / Complete / reload `PASS`
- unexpected browser console warnings / errors: 0

Remote retry evidence boundary:

- exact same-operation initial Section configuration retry: `NOT_RUN`
- exact same-operation unsectioned Start retry: `NOT_RUN`
- exact same-operation Complete retry: `NOT_RUN`
- 上記3項目をremote実行済みとは扱わない。一方、`B1-REMOTE-01`のcanonical requirementはB1 migration / runtime / browser flowであり、このremote evidenceで満たした。same-operation retry semanticsは独立したcurrent PASS requirement / evidenceである`RUNTIME-OP-01`、`CORE-LIFE-01`、`CORE-LIFE-02`、`B1-CONFIG-01`、`B1-START-02`、79-PASS Worker suite、および2026-08-22 persistent nonprodのStart / Complete retry PASSでcoverageされている。このため3件のremote retry `NOT_RUN`を明示したまま`B1-REMOTE-01`を`PASS`とする。

Final:

- APP `PRAGMA quick_check`: `ok`
- APP foreign-key violations: `0`
- active Execution: `0`
- pending migrations: `0`
- `B1-IME-01`: `NOT_RUN`
- `B1-PROD-01` / production verification: `NOT_RUN`
- Released: `NO`

## Routine / Documents

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| ROUTINE-01 | Routine | RoutineOccurrenceは成立時のorigin TaskChuteDayをEntry延期後も保持する | Approved (D-015) | NOT_IMPLEMENTED |
| ROUTINE-02 | Routine | 8/21持越しOccurrenceと本来の8/22 Occurrenceを別identityとして同日に保持できる | Approved (D-015) | NOT_IMPLEMENTED |
| ROUTINE-R1-MIGRATION-01 | Routine R1 / Migration | 0005からR1へupgradeしexisting canonical rows / identity / content / B1-B3 constraintを保持し、existing Entry relationはNULL、quick check / FK checkを通す | Approved (D-040) | PASS / NONPROD_PASS |
| ROUTINE-R1-PERSIST-01 | Routine R1 / Persistence | owner-scoped stable RoutineDefinition / RoutineOccurrence relation、same Routine + origin Day uniqueness、Occurrence 0..* Entries compatibilityを持つ | Approved (D-015, D-040) | PASS |
| ROUTINE-R1-CONVERT-01 | Routine R1 / Conversion | current planned EntryのTask / Entry identityとplacement / estimate / planned startを維持し、duplicateなしでRoutine defaultsとcurrent-Day Occurrence relationを確定する | Approved (D-040) | PASS / NONPROD_PASS |
| ROUTINE-R1-CONVERT-RETRY-01 | Routine R1 / Retry | conversion same-operation replay / different-semantic misuse / ambiguous canonical reconciliationでduplicateやdouble effectを作らない | Approved (D-020, D-040) | PASS |
| ROUTINE-R1-DAILY-01 | Routine R1 / Daily | eligible current logical dateへexactly one occurrence / initial Entryをlazy materializeし、stable Taskとfresh Entry identityを使う | Approved (D-040) | PASS |
| ROUTINE-R1-RANGE-01 | Routine R1 / Range | start / configured end logical dateはinclusive、day-after-endは生成せず、no-endは継続する | Approved (D-036, D-040) | PASS |
| ROUTINE-R1-RELOAD-01 | Routine R1 / Reload | convergence後のrepeated current-Day loadがOccurrence / Entryをduplicateせずrevisionも変更しない | Approved (D-040) | PASS / NONPROD_PASS |
| ROUTINE-R1-DEFAULTS-01 | Routine R1 / Defaults | estimate / planned start copy、planned-start Section derive、available default Section、missing Sectionなし fallbackをcanonicalに適用する | Approved (D-031, D-039, D-040) | PASS |
| ROUTINE-R1-ORDER-01 | Routine R1 / Order | generated Entryがexisting NULL-first / minute / same-minute position orderへstable appendし新order authorityを作らない | Approved (D-031, D-039, D-040) | PASS |
| ROUTINE-R1-REVISION-01 | Routine R1 / Revision | one ensureで1件以上生成時にrevision exactly +1、0件なら+0とする | Approved (D-020, D-040) | PASS |
| ROUTINE-R1-CONCURRENCY-01 | Routine R1 / Concurrency | concurrent current-Day loadsがduplicateなしへ収束しOccurrence / Entry / revisionのpartial stateを残さない | Approved (D-020, D-040) | PASS |
| ROUTINE-R1-FAILURE-01 | Routine R1 / Failure | infrastructure ambiguityをdeterministic rejectionとしてpersistせずcanonical reload / retryをsafeに保つ | Approved (D-020, D-040) | PASS |
| ROUTINE-R1-END-01 | Routine R1 / End | current logical Dayで終了するとcurrent/past Occurrence / Entry / Execution historyを保持してlater generationを止める | Approved (D-034, D-040) | PASS / NONPROD_PASS |
| ROUTINE-R1-END-RETRY-01 | Routine R1 / Retry | same end-operation retryはidempotent、different-semantic operation reuseはrejectする | Approved (D-020, D-040) | PASS |
| ROUTINE-R1-WEB-01 | Routine R1 / Web | Routine化、end-date/no-end、indicator、Routine終了をasync canonical reconciliation付きで扱う | Approved (D-040) | PASS / NONPROD_GENERAL_PASS（real-browser controlled inclusive end-dateとdeployed non-null inclusive-date subcheckはTOOLING_BLOCKED / NOT_VERIFIED） |
| ROUTINE-R1-WEB-RELOAD-01 | Routine R1 / Web | reloadでRoutine relation / indicatorを維持しdaily Entryをduplicateしない | Approved (D-040) | PASS / NONPROD_PASS |
| ROUTINE-R1-REGRESSION-01 | Routine R1 / Regression | B1/B2/B3 Section context/freeze、Sectionなし、estimate、planned start、order、Move/Reorder、lifecycle、retry/conflictを維持し、D-034 choice未実装中はRoutine由来Entryへの旧planning commandをserver mutation-timeでrejectする | Approved (D-034, D-040) | PASS |
| ROUTINE-DOC-01 | Documents | Routine共通noteはTask Primary Documentを利用できる | Approved (D-018) | NOT_IMPLEMENTED |
| ROUTINE-DOC-02 | Documents | RoutineOccurrenceはoptional Documentを持ち、同一Occurrenceの複数Entryで共有できる | Approved (D-018) | NOT_IMPLEMENTED |
| DOC-01 | Documents | Markdown save/read round-tripでcontent semanticsを保持する | Approved (D-006) | NOT_IMPLEMENTED |
| DOC-02 | Documents | Task / Projectのlogical Primary Document identityをowner identityと分離する | Approved (D-018) | NOT_IMPLEMENTED |
| ATTACH-01 | Attachment | Noteでimage attachmentを扱える | Approved (D-007) | NOT_IMPLEMENTED |
| ATTACH-02 | Attachment | Commentでimage attachmentを扱える | Approved (D-007) | NOT_IMPLEMENTED |

R1 integrated implementation / verification evidence（2026-08-30）:

- runtime implementation commit: `f9324e866deb74277d2fd83c5945f2df4b2b95da`、nonprod evidence docs commit: `c63a98f22ab685370d3e20f1f15f480fab951ae8`、PR #14 merge commit: `ebaff6d156813ba78b4c5c28818f9f55db9fd970`
- focused Worker/D1 `r1.integration.test.ts`: `8 PASS`。mutation-time conversion snapshot（estimate / placement）、Routine由来Entryへのestimate / Move / planned-start server rejection、Reorder / Start許可、conversion injected-failure atomic rollback + exact same-operation retry、EndRoutine operation-id misuse、Sectionなし、EndRoutine vs stale materialization、same-minute stable append、concurrent load / rollbackを含む
- full Worker/D1: `100 PASS`（authenticated direct HTTP estimate rejectionを含む）、full Web jsdom: `61 PASS`（controlled date input `2026-08-31` → conversion request `end_logical_date`を含む）
- isolated migration chain `0001 -> 0002 -> fixture -> 0003 -> 0004 -> 0005 -> 0006`: `1 scenario / 46 checks PASS`。existing identity/content/relation preservation、`PRAGMA quick_check = ok`、`PRAGMA foreign_key_check = []`
- Routine由来EntryのSection / 開始予定 / 見積read-only、stale editor protection、Start / canonical cohort Reorder / Routine終了、conversion/end ambiguous exact retryはautomated Web PASS
- typecheck / build / `git diff --check`: `PASS`
- source review: `PASS`。Integrated to main: `YES`（PR #14 merge commit `ebaff6d156813ba78b4c5c28818f9f55db9fd970`）
- real local dogfood APP DB private backup / `0006` migration / pre-post preservation / quick check / FK: `PASS`
- signed-in real-browser general R1 flow（identity-preserving conversion、defaults、Routine planning fields read-only、reload/no duplicate、Routine終了、Start/Complete）: `PASS`。browser console warning / error: `0 / 0`、exact HTTP status: `NOT_VERIFIED`
- real-browser inclusive end-date controlled-input path: `TOOLING_BLOCKED / NOT_VERIFIED`。browser automationでlive DOM propertyは`2026-08-31`になったが、successful `ConvertEntryToRoutine`のpersisted D-020 request fingerprintはNULL候補`37cf50b3cae324a1beafcbd4759e4e3302c69f36982ca3d8509becd0d99768c0`とexact matchし、date候補`eceb3d2cb615d55fa9f5963a64bb0bd4fe4be7b21bbd49c6688a0c536b42e57c`とは不一致だった。React controlled request stateへdate eventが届かず、Worker / DBは受信したNULL requestを正しく保存したため、Product / Worker persistence failureではない
- PR #14 / commit `f9324e866deb74277d2fd83c5945f2df4b2b95da` persistent nonprod evidence（2026-08-30）: APP `0006` migration / pre-post preservation、quick check / FK、R1 schema / constraint、existing Entry relation NULL、current Day revision・active Execution preservationは`PASS`
- exact PR headをexisting `taskchute-web-nonprod`へdeploy: `PASS`。Worker version `be96301c-f131-47b4-bf78-11d4433716b1`、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical APP/AUTH bindings、secret names不変
- authenticated general R1 browser（identity-preserving no-end conversion、defaults、planning fields read-only、reload/no duplicate/revision不変、Start/Complete、Routine終了、future occurrence 0）: `PASS`。browser console warning / error: `0 / 0`、exact HTTP status: `NOT_VERIFIED`
- deployed non-null inclusive-date subcheck: `TOOLING_BLOCKED / NOT_VERIFIED`。live DOM value `2026-08-31`を確認したがReact request stateへeventが届かずnon-null requestを発行できず、DBはNULLを保存したため、Product / Worker failureとは分類しない。作成したverification Routineはすべてnormal Web UIでcurrent Day終了状態へ戻し、future occurrenceは0
- post-verification APP/AUTH quick check / FK: `PASS`。AUTH full exportはpre-runとsize / SHA-256まで一致し、user / account / session / verificationは不変。bootstrap enable / public signup / secret changeは未実施
- main integration: `YES`（PR #14 merge commit `ebaff6d156813ba78b4c5c28818f9f55db9fd970`）。production: `NOT_RUN`。Released: `NO`

## Place / Location / Projections

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| PROJ-01 | Projection | DayBoard / Calendar / Timeline / Review / Mapを別canonical task-state authorityとして扱わない | Approved (D-016) | NOT_IMPLEMENTED |
| LOC-01 | Location | location permission denial / unavailableでもStart / Complete lifecycleは成功可能 | Approved (D-019) | NOT_IMPLEMENTED |
| LOC-02 | Location | planned Placeとobserved Execution Locationを区別する | Approved (D-019) | NOT_IMPLEMENTED |
| LOC-03 | Location | LocationSnapshotでcapture instant / accuracy等のobservation contextを保持できる | Approved (D-019) | NOT_IMPLEMENTED |
| LOC-04 | Location | location enrichmentのretryがduplicate Executionを生成しない | Approved (D-012, D-019) | NOT_IMPLEMENTED |

## Web First vertical slice

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| WEB-01 | Web | DayBoardをcanonical Entry orderで表示する | Approved (D-013) | PASS |
| WEB-02 | Web | Start成功後のrunning stateをfull-page reloadなしで表示する | Approved (D-013, D-020) | PASS |
| WEB-03 | Web | Complete後にNext Entryをprojectionして表示できる | Approved (D-013) | PASS |
| WEB-04 | Web | browser reload後もServer canonical stateからcorrect stateを復元する | Approved (D-013) | PASS |
| WEB-05 | Web | Project / Task+Entry作成、reorder、Start、Completeの通常mutationがfull-page reloadを要求しない | Approved (D-013, D-020) | PASS |
| WEB-06 | Web | async mutation failure / conflict時にClientだけのfalse-success stateを残さない | Approved (D-013) | PASS |
| WEB-07 | Web | ambiguous Reorder / Start / Completeは元operationだけを明示retryでき、別操作から旧operationを暗黙再送しない | Approved (D-020) | PASS |
| WEB-08 | Web | current DayBoard外のEntryに属するactive ExecutionもWebからCompleteできる | Approved (D-013, D-017) | PASS |
| WEB-DAY-STATUS-LAYOUT-01 | Web / DayBoard | startup loading copyは不要なserver実装用語を露出せず、Add Taskと代表的なplacement / lifecycle / Routine mutationはshared transient statusを使う。pending表示 / 消去でDayBoard直前のin-flow rowを増減させず、canonical reconciliation / retryとdeterministic error / conflict表示を維持する | Approved UX invariant | PASS |

Web suiteではdeterministic Reorder / Start conflict後のcanonical refetch、ambiguous operationのRetry / Discard、unrelated button guard、cross-day active Execution completionを明示的にcoverageしている。

`WEB-DAY-STATUS-LAYOUT-01` integrated evidence（2026-08-30）:

- focused / full Web: `65 PASS / 65`。startup copy、Add Task、Reorder、Start、Routine化のshared transient statusと旧in-flow pending row除去をcoverage
- typecheck / build / `git diff --check`: `PASS`
- source review: `PASS`。status surfaceがnormal layout flow外であることをsource / structural testで確認
- pixel-level real-browser geometry measurement: `NOT_RUN`。persistent nonprod / production verificationへは拡張しない

### Day Table UI-1 integrated evidence — 2026-08-30

- implementation commit: `da4a8c8316d60d942dc73fbd53bb90d15df5517b`（parent `55f829cef5129d57835490c63a15b4a89db74438`、subject `Realign Day Table UI`）
- changed runtime/test paths: `apps/web/src/web/App.tsx`、`apps/web/src/web/styles.css`、`apps/web/test/web/App.test.tsx`
- reviewed patch: 23,114 bytes、SHA-256 `9A18AAF28BB1D1411FB3E1779ACF748CB445CDE7AE9822167B473A17F7C64A16`、stable patch-id `8ef44268583103aa1467d49d58e27bfdf462a106`、`3 files changed, 75 insertions(+), 44 deletions(-)`
- source review: `PASS`
- focused Web / full Web: `PASS / 65 / 65 PASS`
- typecheck / production build / `git diff --check`: `PASS / PASS / PASS`
- Worker / D1 / migration suites: `NOT_RUN`（Web-only impact analysis。既存B1 / B2 / B3 / R1 evidenceは維持）
- signed-in real local browser（`http://127.0.0.1:5173/`、viewport `610 × 910`、logical Day `2026-08-30`）: `PASS`
- visible order `実行 | Task | Project | Section | Routine | 見積 | 開始予定`、状態/並び替え独立列なし、Execution Control lifecycle presentation、toolbar/header cleanup: `PASS`
- Task-cell pointer `↑/↓`、boundary disable、`Shift+↑`、reload canonical order、hover bounding-rect不変: `PASS`
- Routine independent column、non-Routine editor + Cancel、existing Routine-derived indicator/end state、Section / 見積 / 開始予定read-only: `PASS`
- Section edit、estimate `10分`、planned start `09:45` -> Focus、clear時Section維持、Start / Complete、reload、completed hide/show: `PASS`
- browser unexpected console errors / warnings: `0 / 0`
- pre/post local APP integrity: `PRAGMA quick_check = ok`、FK violations `0`、active Execution `0`、invalid `Sectionなし + non-null planned start` `0`、Routine duplicate `0`
- verification dataはnormal Web UIで残置: `UI1 verification A`（planned / Focus / estimate 600 sec / planned start NULL）、`UI1 verification B`（completed / Afternoon / ended Execution 1）、new Routine `0`、placement revision `3 -> 12`。Product defaultではない
- new Routine conversion / Routine end mutation: `NOT_RUN`（long-lived stateを避け、editor Cancel + existing Routine-derived rowsでpresentation/read-onlyを確認）
- D&D: `NOT_RUN`（UI-2以後）
- persistent nonprod UI-1 / production UI-1: `NOT_RUN / NOT_RUN`
- Released: `NO`

### Settings v0.1 integrated evidence — 2026-08-30

- implementation commit: `51242b08e015817108010839cd5234959da2fed5`（parent `f250a0bb6c0f5da66fd690d451e7f8a7a3e88a29`、subject `Implement Settings v0.1 navigation`）
- reviewed patch: 43,103 bytes、SHA-256 `8E60725C00824121568F4A45F083FFE59EA3FDC51B06FA9986D9B09751E07BB0`、stable patch-id `afb8edde279fba2db8a08ea1b3315735b0acb34e`、`8 files changed, 301 insertions(+), 86 deletions(-)`
- commit-vs-reviewed-patch mechanical comparison: exact changed path list / diff stat / stable patch-id一致、`PASS`
- ChatGPT source review: `PASS`
- focused Web / full Web / Worker-D1: `2 PASS / 67 PASS / 101 PASS`
- typecheck / local build / nonprod build / Wrangler nonprod dry-run / `git diff --check`: `PASS`
- implementation: Desktop Left Navigation `今日` / `設定`、Settings `Section` / `Project`、existing Section editor移設、owner-scoped `GET /api/v1/projects`、Project list / create移設、DayBoard temporary Section settings / standalone Project create撤去: `PASS`
- Section draft UX: `Section → Project → Section`、`Section → 今日 → 設定 / Section`、active Section再選択で未保存draftを保持し、明示Cancelでcanonical configurationへ戻す: automated / signed-in local / authenticated nonprod `PASS`
- UI continuity: Sidebar starting width `240px`、visible order `実行 | Task | Project | Section | Routine | 見積 | 開始予定`、独立Routine列、Section move時planned-start clear、estimate / planned start、Start / Complete、reload recovery: `PASS`
- signed-in local browser: Navigation / Settings、Section save / reload、current-Day freeze、original Section semantics restore、Project create / reload、temporary controls撤去、draft preservation / Cancel、browser console warnings / errors `0 / 0`: `PASS`
- persistent nonprod Worker: `taskchute-web-nonprod` / version `22578f99-6256-4027-a345-ce523c67d241` / `BOOTSTRAP_ENABLED=false`
- authenticated persistent nonprod browser: Navigation / Settings、Section edit / save / reload、current-Day freeze / original semantics restore、Project list / create / reload、draft preservation / Cancel、240px Sidebar、7列 / Routine列、planning / lifecycle / reload、console warnings / errors `0 / 0`: `PASS`
- persistent nonprod safety / integrity: existing AUTH_DB / APP_DBを保持、migration / DB recreation / secret変更なし、APP `PRAGMA quick_check = ok`、FK violations `0`、active Execution `0`、AUTHはSettings verificationでhealthy、destructive cleanupなし
- Product / Domain semantics / Material Decision: `UNCHANGED / NONE`
- GitHub canonical integration: implementation commit `51242b08e015817108010839cd5234959da2fed5`を`main`へIntegrated
- production / Released: `NOT_RUN / NO`

## Authentication / Authorization

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| AUTH-01 | Auth | unauthenticated requestからTaskChute Domain data / mutationへアクセスできない | Approved (D-021) | PASS |
| AUTH-02 | Auth | initial production flowでpublic self-signupを許可しない | Approved (D-021) | PASS |
| AUTH-03 | AuthZ | Client申告user IDではなくauthenticated principalからownerを確定する | Approved (D-021) | PASS |
| AUTH-04 | AuthZ | 別owner resource IDを指定してもServer authorizationが拒否する | Approved (D-021) | PASS |
| AUTH-05 | Bootstrap | initial userをoperator-only bootstrapで作成し、bootstrap中もpublic signupを有効化しない | Approved (D-021, D-022, D-023) | PASS |
| AUTH-06 | Bootstrap | AUTH_DB / APP_DBの片側成功後もbootstrapを安全に再実行・reconcileできる | Approved (D-022, D-023) | PASS |
| AUTH-07 | Identity | Better Auth subjectをseparate APP_DB mappingからstable app_user_idへ解決し、physical auth user IDをDomain authorityにしない | Approved (D-021, D-022) | PASS |
| AUTH-08 | Session | initial browser sessionがrolling 7日、update / renewal threshold 1日で動作する | Approved (D-022) | PASS |
| AUTH-09 | Bootstrap | bootstrap modeがmissing / empty / disabled / invalidならbody parseやbootstrap logicより前に404 postureでunavailableとなる | Approved (D-023) | PASS |
| AUTH-10 | Bootstrap | bootstrap modeがenabledでもmissing / wrong tokenをinformation disclosureなしにrejectし、correct tokenでflowを実行できる | Approved (D-023) | PASS |
| AUTH-11 | Secrets | bootstrap rejection response / normal error logにprovided bootstrap tokenを出力しない | Approved (D-022, D-023) | PASS |

## D1 feasibility gate

以下はProduct runtime実装前にlocal D1とtemporary remote D1の両方で実施したfeasibility evidenceである。

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| D1-SPIKE-01 | D1 | intentional failure時にtransaction partial stateを残さない | Approved (D-020) | PASS |
| D1-SPIKE-02 | D1 | concurrent Startでsuccess / active Execution / running Entryがexactly oneになる | Approved (D-020) | PASS |
| D1-SPIKE-03 | D1 | same-operation concurrent retryでExecutionをexactly oneだけ作る | Approved (D-020) | PASS |
| D1-SPIKE-04 | D1 | same operation IDをdifferent semantic requestへ再利用するとrejectする | Approved (D-020) | PASS |
| D1-SPIKE-05 | D1 | Complete retryで最初のended_atを維持する | Approved (D-020) | PASS |
| D1-SPIKE-06 | D1 | same placement revisionからのconflicting reorderはexactly one success | Approved (D-020) | PASS |
| D1-SPIKE-07 | D1 | reorder failure / conflictでmixed orderを残さない | Approved (D-020) | PASS |
| D1-SPIKE-08 | D1 | historical reference中のunsafe hard deleteをconstraintで防ぐ | Approved (D-016, D-020) | PASS |

D1 feasibility gateは`spike/d1-feasibility@eda694e22fd742827da5b90967c6b0305b885033`のcurrent harnessでLOCAL / temporary REMOTE双方のevidenceが揃い、`D1-SPIKE-01`〜`D1-SPIKE-08`をPASSとしてreview済み。詳細evidenceは`spikes/d1-feasibility/EVIDENCE.md`を参照する。

このPASSはD1で必要なatomicity / concurrency / idempotency strategyのfeasibility verificationであり、Product runtimeのremote / deployed verificationを代替しない。

## Android / Migration

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| ANDROID-OFFLINE-01 | Android | temporary network unavailableを考慮したoffline-capable behaviorを持つ | Approved (D-011) | NOT_IMPLEMENTED |
| MIG-01 | Migration | dry-runでsource / target dataを破壊しない | Proposed | NOT_IMPLEMENTED |

legacy ObsidianでのPASS結果を新PlatformのPASSへ自動継承しない。

一方、legacy regression scenarioは新Architecture向けTest contractを設計する際のreferenceとして利用する。

変更後の再verification範囲は`DEVELOPMENT_WORKFLOW.md`のimpact analysis原則に従う。
