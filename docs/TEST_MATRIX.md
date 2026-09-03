# Test Matrix

First Server + Web vertical slice、D-038 B1 / B3、D-039 B2、D-040 Minimal Routine R1、Day Table UI-1 / UI-2A / UI-2B / UI-2C / cross-Section D&D v0.1、D-041 / D-042 Day Navigation v0.1、D-043 synchronization、D-044 / D-045 / D-046 Routine R2A first slice、D-047 / D-048 Routine R2B Board、D-050 Duplicate first sliceは実装・GitHub `main`統合済み。R2B source review / local automated / real-local migration・browser / persistent nonprod migration・preservation・deploy・authenticated representative browserはPASS。D-049 initial production creation / migration / secure bootstrap / smokeもPASSし、initial release scopeでReleasedは`YES`。remote multi-Day propagation、詳細retry / concurrency、R2B inclusive end-date browser、production deep feature mutation等は各sectionの`NOT_RUN` / `NOT_VERIFIED`境界を維持する。

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
- initial production smoke test: `PASS`（D-049 scope。deep feature mutationは`NOT_RUN`）

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

以下はD-043でApprovedしたruntime requirementである。implementation commit `7d3c0cb0881dfc11725af6ff45eabad69f86a22a`でordinary EntryとRoutine selected scopeへ実装し、GitHub `main`へIntegrated済み。Source Review、Worker / D1 `117 / 117`、Web `78 / 78`、migration regression `2 scenarios`、typecheck / build / diff-check、real-local migration / signed-in browserはPASS。

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| SECTION-START-SYNC-01 | Section edit | real Sectionを明示選択すると、開始予定を選択Sectionの`logical_start_minute`へexactly設定する | Approved (D-043) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| SECTION-START-SYNC-02 | Section edit | real Section変更が以前の開始予定を選択Sectionの開始minuteで置き換える | Approved (D-043) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| SECTION-START-SYNC-03 | Sectionなし | `Sectionなし`の明示選択がSection placementをabsenceにし、開始予定を`NULL`へclearする | Approved (D-038, D-043) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| SECTION-START-SYNC-04 | Planned-start clear | 開始予定の直接clearが`planned_start_minute = NULL`と`Sectionなし`を同時に確定する | Approved (D-043) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| SECTION-START-SYNC-05 | Planned-start edit | 開始予定の設定・変更がそのminuteを含むreal Sectionをderiveする | Approved (D-030, D-043) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| SECTION-START-SYNC-06 | Boundary | Section boundary minuteが`[start, end)`に従って後続Sectionへ属する | Approved (D-030, D-043) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| SECTION-START-SYNC-07 | Extended time | `24:30` / `28:00`等のextended wall-clock開始予定とSection開始minuteで同じ同期規則を維持する | Approved (D-030, D-039, D-043) | PASS (LOCAL_AUTOMATED) |
| SECTION-START-SYNC-08 | Routine parity | ordinary EntryとRoutine-derived Entryの選択済みscope内で同じSection / planned-start invariantを適用する | Approved (D-034, D-043) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| SECTION-START-SYNC-09 | Atomicity | Section、planned start、canonical order / tie-break、placement revision exactly +1、operation resultをatomicに確定しpartial stateを残さない | Approved (D-020, D-039, D-043) | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD representative) |
| SECTION-START-SYNC-10 | Retry / Conflict | stale revision、same-operation retry / misuse、infrastructure ambiguityをD-020 / D-039に従って安全に処理し同期effectを二重適用しない | Approved (D-020, D-039, D-043) | PASS (LOCAL_AUTOMATED) |
| SECTION-START-SYNC-11 | Reload | mutation成功後とreload後にSection / planned-startの同期したcanonical stateを復元する | Approved (D-043) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| SECTION-START-SYNC-12 | Lifecycle / History | running / completed / interrupted、historical context、non-current execution restrictionを変更せず、許可されたplanned editingだけへ同期規則を適用する | Approved (D-030, D-041, D-042, D-043) | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD representative) |
| SECTION-START-SYNC-13 | Invariant | `Sectionなし` + non-null開始予定をnormal mutation pathとstored canonical stateで作らない | Approved (D-039, D-043) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| SECTION-START-SYNC-14 | Invariant | real Section + `NULL`開始予定をnormal user-editable mutation pathで作らない | Approved (D-043) | PASS (LOCAL + REAL_LOCAL + NONPROD) |

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

- private ignored APP exportを作成・検証: `PASS`（27,490 bytes、SHA-256 `492AFF9D4179420E16738867D336EF34A68C4D65DAC7CAA1A5716D5CC51FAB70`。private filesystem pathは記録しない）
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

## Duplicate first slice

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| DUPLICATE-01 | Eligibility | current established Dayまたはestablished future Dayのplanned Entryだけをsourceにでき、past / running / completed / interruptedは対象外とする | Approved (D-050) | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD) |
| DUPLICATE-02 | Identity / fields | 新Task / Entry identityを作り、title、Project、Section、estimate、planned startをcopyする。sourceは変更しない | Approved (D-050) | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD) |
| DUPLICATE-03 | Placement | sourceとsame Day / Section / planned-start cohortのimmediate-afterへatomicに挿入し、canonical orderとplacement revisionを維持する | Approved (D-050) | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD) |
| DUPLICATE-04 | Sectionなし | `Sectionなし` + planned start `NULL`のsourceをduplicateしてもSectionなし / `NULL`を維持する | Approved (D-050, D-043) | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD) |
| DUPLICATE-05 | Routine | Routine-derived sourceから作るduplicateはnormal planned Entryとなり、Routine relation / Occurrenceを持たずsource Routineを変更しない | Approved (D-050, D-040) | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD) |
| DUPLICATE-06 | Lifecycle | current DayでduplicateをStart → Completeでき、active Executionが最終的に0へ戻る。non-current DayのStartはdisabled | Approved (D-013, D-050) | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD) |
| DUPLICATE-07 | Reload / feedback | Duplicate pending中にvisible / accessible `Taskを複製・照合中…`を表示し、full-page reloadなしで成功、reload後もduplicateを復元する | Approved (D-020, D-050) | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD) |
| DUPLICATE-08 | Past boundary | established past / record-none pastではDuplicate write surfaceを提供せず、history / Dayをfabricateしない | Approved (D-042, D-050) | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD) |
| DUPLICATE-09 | Retry / concurrency | same-operation replay、semantic misuse、stale revision、source lifecycle change、identity collision、same-base concurrency、infrastructure ambiguityでpartial / duplicate effectを残さない | Approved (D-020, D-050) | PASS (LOCAL_AUTOMATED) |
| DUPLICATE-10 | Migration | `0009_duplicate_entry.sql`がexisting operations / data / identity / historyを保持し、`DuplicateEntry` command typeを受理する | Approved (D-050) | PASS (LOCAL + REAL_LOCAL + NONPROD_MIGRATION) |
| DUPLICATE-11 | Regression | B1 / B2 / B3、R1 / R2A / R2B、Day Navigation、UI-1 / UI-2、Start Forecastの既存semanticsを維持する | Approved regression contract | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD representative) |

Duplicate first slice local / persistent nonprod evidence（2026-09-02）:

- implementation commits `1d68a74148da211bfae76b6f36b86cb18f23e7fc` / `47d998e37bd12fc591b43c3624324ad237f3ca46` / `3573aaafcfcda651bc850dae706f8dd5157efe65`で`main`へ`IMPLEMENTED / INTEGRATED`。APP `0009_duplicate_entry.sql` migration、source review、local automated、real-local、persistent nonprod migration / deploy / authenticated browser / APP integrityは`PASS`
- local focused Duplicate integration `11 / 11 PASS`、Worker / D1 `147 / 147 PASS`、Web `109 / 109 PASS`、migration regression `3 scenarios PASS`、typecheck / build / `git diff --check` `PASS`
- persistent nonprod pre/post migrationでAPP pending `0009 -> 0`、quick check `ok`、FK `0`、baseline aggregates Days / Tasks / Entries / Executions / Operations / Routines / Occurrences `8 / 32 / 32 / 15 / 168 / 6 / 6`を保持。isolated restore quick check / FK / aggregates一致、APP `0009` schema constraintで`DuplicateEntry`を受理
- exact pushed `main`からWorker version `1dda19d4-5212-4d69-96a8-b6b2656de8bb`へdeployし、root `200`、protected API `401`、bootstrap route `404`、`RUNTIME_ENV=nonprod` / `BOOTSTRAP_ENABLED=false` / expected bindingsを確認
- authenticated browserでordinary planned、`Sectionなし`、Routine-derived、established future sourceのDuplicate、pending feedback、immediate-below placement、field copy、reload、current-Day Start / Complete、past read-onlyを確認。browser console warnings / errors `0 / 0`
- final APP aggregates Days / Tasks / Entries / Executions / Operations / Routines / Occurrences `8 / 38 / 38 / 16 / 177 / 7 / 7`（delta `+0 / +6 / +6 / +1 / +9 / +1 / +1`）。DuplicateEntry operations `5`、active Execution / duplicate active group / orphan Entry `0`。verification dataはcleanupせず残置
- final AUTH quick check `ok`、FK `0`、users / accounts / sessions `1 / 1 / 2`。AUTH migration / credential / session resetなし
- detailed retry / misuse / stale revision / concurrency / ambiguity / logical-past overlapはlocal automated evidenceに限定し、production feature verificationは`NOT_RUN`、Releasedは`NO`

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
| ROUTINE-R2A-CANDIDATE-01 | Routine R2A / Web | Routine-derived editable unitのcandidate表示ではServer writeせず、scopeをpreselectしない | Approved (D-044) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| ROUTINE-R2A-CANCEL-01 | Routine R2A / Web | scope選択前のcancel / Escape / dismissがno-writeでcanonical valueを復元する | Approved (D-044) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| ROUTINE-R2A-SCOPE-01 | Routine R2A / Scope | Section + planned startを一unit、estimateを別unitとして`今回だけ / ルーティンに反映`を個別選択する | Approved (D-043, D-044) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| ROUTINE-R2A-ESTIMATE-01 | Routine R2A / Override | `今回だけ`estimate valueとexplicit `NULL`をno-overrideと区別してcurrent occurrenceだけへpersistする | Approved (D-044) | PASS (LOCAL + REAL_LOCAL + NONPROD representative: value) |
| ROUTINE-R2A-SECTION-01 | Routine R2A / Override | `今回だけ`real Section + in-range planned startと`Sectionなし + NULL`をD-043同期pairとしてpersistする | Approved (D-043, D-044) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| ROUTINE-R2A-RELOAD-01 | Routine R2A / Persistence | occurrence overrideとeffective valueがreload / restart後も維持される | Approved (D-044) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| ROUTINE-R2A-DEFAULT-01 | Routine R2A / Definition | `ルーティンに反映`がcurrent valueとRoutine defaultを更新し、current occurrenceの同unit overrideをclearする | Approved (D-044) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| ROUTINE-R2A-PROPAGATE-01 | Routine R2A / Propagation | non-overridden materialized current/future planned occurrenceへnew defaultを反映し、explicit overrideを上書きしない | Approved (D-034, D-044) | PASS (LOCAL_AUTOMATED + REAL_LOCAL representative) |
| ROUTINE-R2A-HISTORY-01 | Routine R2A / History | past / running / completed / interrupted / otherwise protected stateをdefault propagationでretroactiveにrewriteしない | Approved (D-034, D-044) | PASS (LOCAL_AUTOMATED + REAL_LOCAL representative) |
| ROUTINE-R2A-NO-MATERIALIZE-01 | Routine R2A / Materialization | default updateだけでfuture Day / RoutineOccurrenceを作らず、後のD-040 materializationがnew defaultを利用する | Approved (D-040, D-041, D-044) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| ROUTINE-R2A-RESET-01 | Routine R2A / Reset | overrideをcurrent Routine defaultへ戻し、Definitionを更新せずscope再選択なしでoverrideをclearする | Approved (D-044) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| ROUTINE-R2A-CHROME-01 | Routine R2A / Presentation | permanent override badgeを必須にせず、override時のreset affordanceをediting contextで提示する | Approved (D-044; canonical DESIGN) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| ROUTINE-R2A-REVISION-01 | Routine R2A / Atomicity | Section-plan、order、affected Day revision exactly once、override/default/propagation、operation resultをpartial effectなしで確定する | Approved (D-020, D-039, D-043, D-044) | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD representative) |
| ROUTINE-R2A-RETRY-01 | Routine R2A / Retry | same-operation replay、different-semantic misuse、stale revision / concurrency、infrastructure ambiguityでeffectを二重適用しない | Approved (D-020, D-044) | PASS (LOCAL_AUTOMATED) |
| ROUTINE-R2A-SCOPE-GUARD-01 | Routine R2A / Server | current logical Dayのplanned Routine-derived Entryだけを許可し、future / past / running / completed / interrupted mutationをServerでno-write rejectする | Approved (D-041, D-042, D-044) | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD representative) |
| ROUTINE-R2A-SCHEMA-01 | Routine R2A / Schema | typed Section-plan / estimate override columnsとunit別presenceによりno override / inheritとexplicit NULLを区別し、invalid combinationをschema / application constraintでrejectする | Approved (D-044, D-046) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| ROUTINE-R2A-SCHEMA-OWNER-01 | Routine R2A / Schema | Section override referenceがowner-scoped FKを維持し、historical Day Section membershipをtransaction validationする | Approved (D-038, D-043, D-046) | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD representative) |
| ROUTINE-R2A-DEFAULT-REVISION-01 | Routine R2A / Concurrency | Routine default revisionがinitial 0から進み、stale default editをsilent LWW / partial propagationなしでrejectする | Approved (D-020, D-044, D-046) | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD representative) |
| ROUTINE-R2A-MIGRATION-01 | Routine R2A / Migration | typed occurrence override persistenceを追加しexisting RoutineOccurrence identity/contentを保持し、existing occurrenceを各unit no overrideで開始してquick check / FK checkを通す | Approved (D-044, D-046) | PASS (LOCAL + REAL_LOCAL + NONPROD) |
| ROUTINE-R2A-NORMALIZE-01 | Routine R2A / Migration | editable planned ordinary Entry / Routine defaultのlegacy real Section + NULLをauthoritative Section startへnormalizeし、Sectionなし + NULLは維持する | Approved (D-043, D-045) | PASS (LOCAL_AUTOMATED + REAL_LOCAL no-candidate gate + NONPROD representative: RoutineDefinition 3 / Entry 0) |
| ROUTINE-R2A-NORMALIZE-FAIL-01 | Routine R2A / Migration | authoritative Section startがambiguous / missingなら推測・Section drop・partial normalizationなしでfail safelyする | Approved (D-045) | PASS (LOCAL_AUTOMATED) |
| ROUTINE-R2A-NORMALIZE-HISTORY-01 | Routine R2A / Migration | running / completed / interrupted等のprotected historyをnormalizationでretroactiveにrewriteしない | Approved (D-045) | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD) |
| ROUTINE-R2A-REGRESSION-01 | Routine R2A / Regression | D-043 ordinary Entry sync、D-040 conversion/materialization/end、D-041 future no-write、D-042 past gap、placement/order/retry/lifecycleを維持する | Approved regression contract | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD representative) |
| ROUTINE-DOC-01 | Documents | Routine共通noteはTask Primary Documentを利用できる | Approved (D-018) | NOT_IMPLEMENTED |
| ROUTINE-DOC-02 | Documents | RoutineOccurrenceはoptional Documentを持ち、同一Occurrenceの複数Entryで共有できる | Approved (D-018) | NOT_IMPLEMENTED |
| DOC-01 | Documents | Markdown save/read round-tripでcontent semanticsを保持する | Approved (D-006) | NOT_IMPLEMENTED |
| DOC-02 | Documents | Task / Projectのlogical Primary Document identityをowner identityと分離する | Approved (D-018) | NOT_IMPLEMENTED |
| ATTACH-01 | Attachment | Noteでimage attachmentを扱える | Approved (D-007) | NOT_IMPLEMENTED |
| ATTACH-02 | Attachment | Commentでimage attachmentを扱える | Approved (D-007) | NOT_IMPLEMENTED |

Routine R2A local implementation / verification evidence（2026-08-31）:

- implementation commit: `7d3c0cb0881dfc11725af6ff45eabad69f86a22a`（parent `9f772bba67ea69272ea286a8824091f0b738ed36`、subject `Implement Routine R2A first slice`）、21 files、`+1837 / -107`
- reviewed patch SHA-256: `825B2CE369E25CBFE85C6958609E9F71B5B77EE65BB008C97C1F0D69AE20A164`、stable patch-id: `38b0a0f43462966c66c83b148fc91233d5efbae8`、Source Review: `PASS`
- Worker / D1: `117 / 117 PASS`、Web: `78 / 78 PASS`、migration regression: `2 scenarios PASS`、typecheck / production build / `git diff --check`: `PASS`
- real-local preflight / private backup validation / backup-copy `0007` dry-run / preservation gate: `PASS`。pre-migration schemaは`0006`まで、`quick_check = ok`、FK violations `0`、active Execution `0`。backup copyは`21 tables / 247 rows`を保持し、dry-run `46 commands PASS`
- D-045 authority classificationはA `8` / B `0` / C `0` / D `0` / E `0`。live `0007` migrationは`46 checks PASS`、`quick_check = ok`、FK violations `0`、placement revision `3 -> 3`、legacy normalization対象Entry / RoutineDefinitionは`0 / 0`、protected history A `8 -> 8`、existing RoutineDefinition `2` / RoutineOccurrence `2`のidentity / contentを保持
- signed-in real-browser A〜M: `PASS`。ordinary EntryのSection / planned-start full sync、Routine estimate / Section-planの`今回だけ`、`ルーティンに反映`、default reset、revision increment、reload、future no-materialization、past read-only、Routine終了を確認。browser console warning / errorは`0 / 0`、exact HTTP statusは`NOT_VERIFIED`
- browserで確認したrepresentative values: estimate default `900` → occurrence `1500` → reset `900`、definition `900 -> 1800` / defaults revision `0 -> 1`。Section-plan overrideはLunch / `720`、explicit NULL、reset Focus / `540`、definition Evening / `1080` / defaults revision `1 -> 2`。future `2026-09-01`はDay / Occurrenceを生成せず、past `2026-08-30`はread-only
- multi-Day propagation、same-operation retry / misuse、stale revision / concurrency、infrastructure ambiguity、injected rollback、D-045 fixture normalization / fail-safeはlocal automated evidenceであり、real-browser PASSへ拡張しない
- GitHub `main` integration: implementation `7d3c0cb0881dfc11725af6ff45eabad69f86a22a` + evidence docs `d1283eb6ef10c9a0997a36427a09b89042250f96`。persistent nonprod representative verificationは以下のblockで`PASS`、production: `NOT_RUN`、Released: `NO`

Routine R2A persistent nonprod verification evidence（2026-09-01）:

- exact source / deploy: `main@8d1348e25df23518415cf9829aea6c4eb89e9f4c` → existing `taskchute-web-nonprod` deployment `4e493bc3-68ac-4b1b-a74e-ad9eb01e71ff` / Worker version `b18c5dab-6976-4564-815e-78dda6024b34`、traffic `100%`、startup `50 ms`
- environment: `RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、AUTH_DB `taskchute-auth-nonprod` / `60085f8d-0c4e-4c15-98e9-3ce178398041`、APP_DB `taskchute-app-nonprod` / `6ad7e35f-5d03-4be3-9b00-46cd713a51c3`。binding / resource / config / secret変更、AUTH migration / credential / session resetは`NO`
- pre-migration: APP `0001`〜`0006` applied、pending exactly `0007_routine_r2a.sql`、partial R2A schemaなし、APP `quick_check = ok` / FK violations `0` / active Execution `0`、AUTH pending `0`。D-045 authority A / B / C / D / Eは`5 / 0 / 0 / 3 / 0`
- private repository-external APP exportを検証: `108,905 bytes`、SHA-256 `561E665DDE2B8755EFE8EAC4E4616D4C9AE31FE016D39DC7865D62CF3E255F32`。private filesystem pathと不整合なexact timestampはcanonical docsへ記録しない
- isolated restore `259 commands PASS`、direct isolated `0007` `45 commands / exit 0`。pre-state一致、new schema / constraint / index / operation type、identity / count preservation、quick check / FKは`PASS`。live migration applyはwrapper / trackingを含む`46 commands / exit 0`で、pending `0`、schema / data resultとintegrityは一致
- live normalization: ordinary Entry `0`、RoutineDefinition `3`。protected historical planned Entries `5`は不変、existing RoutineDefinitions `4`は`defaults_revision = 0`、existing RoutineOccurrences `4`はtyped override absentで開始し、全Day placement revisionを保持
- authenticated browser A〜M: candidate no-write（Escape / outside click / Cancel）、unit別scope、estimate one-off `45分` → reset `30分` → Routine default `50分`、Section-plan one-off Day / `12:00` → `Sectionなし / NULL` → reset Morning / `04:00` → Routine default Evening / `20:00`、reload persistenceを`PASS`
- representative revisions: estimate applyでdefaults revision `0 -> 1`かつplacement revision不変、Section-plan mutationsでplacement revision `8 -> 9 -> 10 -> 11 -> 12`、Routine applyでdefaults revision `1 -> 2`、current override absenceを確認
- ordinary D-043: Morning / `04:00`、Day / `12:00`、planned start `21:15`からEvening derive、exact boundary `12:00`、clearから`Sectionなし / NULL`、reload、Morning / `04:00` restoreを`PASS`
- future previewはDay / Occurrence / Entry `0 / 0 / 0`を維持。established pastはAdd / planning / reorder / Start / R2A read-onlyかつplacement revision不変。normal UIのRoutine終了はcurrent Entry / Occurrenceを保持しfuture occurrence `0`で`PASS`
- final APP: pending `0`、`quick_check = ok`、FK / transient guards / active Execution / duplicate verification occurrence / future verification occurrence / duplicate active groupはすべて`0`。AUTH: `quick_check = ok`、FK `0`、users / accounts / sessions `1 / 1 / 2`
- runtime / security: root `200`、unauthenticated protected API `401`、new Worker version `100%`、browser console warnings / errors `0 / 0`。bootstrap POSTは`NOT_RUN`、browser-internal exact network statusは`NOT_VERIFIED`
- remote multi-Day propagation、detailed retry / misuse / concurrency / ambiguity / injected rollback、missing-authority fail-safe、positive Entry normalization fixture、extended-time `24:30` / `28:00`はremote `NOT_RUN`で、local automated evidenceをremote PASSへ拡張しない
- production: `NOT_RUN`、Released: `NO`、Material Decision: `NO`

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
| WEB-DAY-COLUMNS-REGISTRY-01 | Web / Day Table | target orderをfixed Bulk / Execution / TaskとProject以後のstable registry keyへ分離し、heading / draft / normal rowが同じresolved order / tracksを共有する | Approved (Task Contract) | PASS (LOCAL_AUTOMATED + NONPROD) |
| WEB-DAY-COLUMNS-PREFERENCE-01 | Web / Day Table | order / widthをversioned browser-local envelopeへ保存し、duplicate / unknown / missing / malformed / incompatible payloadとStorage failureをsafeに扱う。Server / API / D1 / cross-device同期は行わない | Approved (Task Contract) | PASS (LOCAL_AUTOMATED + NONPROD) |
| WEB-DAY-COLUMNS-INTERACTION-01 | Web / Day Table | Project以後だけをheader D&D reorder対象とし、fixed slots / Entry order / placement / lifecycleをmutationしない。resizeはshared heading / row trackをmin/max内で更新する | Approved (Task Contract) | PASS (LOCAL_AUTOMATED); browser D&D `NOT_VERIFIED` |
| WEB-DAY-COLUMNS-AUTOFIT-01 | Web / Day Table | resize handleのdouble-click auto-fitがlabel / cell contentを考慮し、既存幅から縮小・拡大でき、同じbrowser-local width preferenceへ保存する | Approved (Task Contract) | PASS (LOCAL_AUTOMATED + NONPROD) |
| WEB-DAY-COLUMNS-ROUTINE-01 | Web / Day Table / Routine | ordinary current planned / derived / protected stateをcompact inline SVG icon、accessible label、existing Routine editor / no-op boundaryで表示する | Approved (Task Contract) | PASS (LOCAL_AUTOMATED + NONPROD) |
| WEB-DAY-ACTUAL-PROJECTION-01 | Web / Day Table / Execution | multiple current-valid Execution factsからfirst start、last ended、completed interval合計、active elapsedをread-only projectionし、active end `—`とlogical extended timeを表示する | Approved (D-016, D-032, Task Contract) | PASS (LOCAL_AUTOMATED + NONPROD lifecycle) |
| WEB-DAY-COLUMNS-RESPONSIVE-01 | Web / Day Table | 1920 / 1440 / 1280 / 720pxでpage-level overflowを作らず、wide table ownership、narrow sticky fallback、Sidebar open / close / reopen、既存row / editor interactionを維持する | Approved (Task Contract) | PASS (NONPROD) |

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

### Day Table UI-2A integrated evidence — 2026-09-01

- implementation commit: `43789c990ed91febb2bb6036c1f3970dfe8f34a1`（parent `7ca3156c0d7a724c9efc64b258c4ca85b2d11e60`、subject `Implement Day Table UI-2A`）とverification / docs commit `b66d6ee2248935fd36d338ea2794762ee51b6515`はGitHub canonical `main`へIntegrated済み
- changed runtime/test paths: `apps/web/src/web/App.tsx`、`apps/web/src/web/styles.css`、`apps/web/test/web/App.test.tsx`
- structural contract: named heading order `実行 | Task | Project | Section | Routine | 見積 | 開始予定`を維持し、その前にheading / Task / draftでexactly oneのnon-interactive / non-focusable / unlabeled reserved Bulk slotを配置。Bulk action / fake controlは未実装
- layout contract: Day Table minimum content width `1040px`、table-owned horizontal overflow、実用幅でBulk `24px` / Execution `52px` / Task `280px`をdeterministic offsetでfixed-left。狭幅ではCSS-onlyでstickyを解除し、horizontal scrollで全列へ到達可能
- focused changed Web: `PASS`。full Web: `84 / 84 PASS`。typecheck / production build / `git diff --check`: `PASS`。Wrangler user-log writeはsandbox `EPERM` warningを出したがbuildはexit `0`
- Worker / D1 / migration: `NOT_RUN / NOT_REQUIRED`（Web markup / CSS / Web test only impact analysis。Product / Domain / API / persistence semanticsは変更なし）
- signed-in real local browser `http://127.0.0.1:5173/`、logical Day `2026-09-01`: `PASS`。wide `1440 x 900`ではtable overflow不要、medium `980 x 820`ではDay Table `client 706px / scroll 1040px`でfixed-left geometryをscroll前後とも維持、narrow `640 x 820`ではsticky fallback後も全列へ到達しbody horizontal overflowなし
- medium scroll時のBulk / Execution / Task geometryはx `257 / 281 / 333`、width `24 / 52 / 280`でheading / Task / draftが整合。Project以後はfixed-leftの背面をscrollし、Section summary / empty messageは可読性を維持。opaque background / z-index / subtle boundaryにbleed / clipping / overlapなし
- planned / hover / focus / running / completed rowでfixed-left cellsがrow backgroundを維持。completed title line-through、reorder controls hover、vertical page scroll: `PASS`
- pointer `↑/↓`と`Shift+↑/↓`でcanonical orderを往復し、Add draft alignment、Section、estimate `15分`、planned start / Section full sync、existing Routine-derived R2A editor access、Start / Runner / Complete、completed hide/show、reload canonical reconciliation: `PASS`
- browser console warnings / errors: `0 / 0`
- private ignored APP backup: `593,920 bytes`、SHA-256 `B30F8DB17EC4113CECA16BA13CF8924B2AB36A3A3326F0B3D3049243F7FC7DE7`、backup `quick_check = ok` / FK violations `0`。private path / row contentは記録しない
- APP baseline / final: Days `5 -> 5`、Tasks `27 -> 29`、Entries `27 -> 29`、Executions `10 -> 11`、active Execution `0 -> 0`、Routine definitions `4 -> 4`、Occurrences `4 -> 4`。final `quick_check = ok`、FK violations `0`、duplicate Task Routine `0`、UI-2A verification Entryのinvalid placement `0`
- normal UI verification dataを残置: `UI2A planned verification`（planned / Focus / estimate `900 sec` / planned start `540`）と`UI2A lifecycle verification`（completed / Focus / ended Execution 1）。direct SQL setup / cleanupなし
- ChatGPT source review: `PASS`。authorized 3 Web pathsのみ、fake capability / new dependency / Material Decisionなし。persistent nonprod representative verification: `PASS`（2026-09-02 consolidated block参照）、production: `NOT_RUN`、Released: `NO`

### Day Table UI-2B integrated evidence — 2026-09-01

- implementation commit: `3861b9839b55a1453b0e2f230f03728e8d85059b`（parent `fc5a967d2c4a5d91aa35eb998f5ad48d48af1a29`、subject `Implement Day Table UI-2B`）はGitHub canonical `main`へIntegrated済み
- changed runtime/test paths: `apps/web/src/web/App.tsx`、`apps/web/src/web/styles.css`、`apps/web/test/web/App.test.tsx`。Product / Domain / API / persistence semantics、新dependency、migrationは変更なし
- implementation: normal Section / `Sectionなし`のpointer collapse / expand、focused summary Enter / Space、logical Day別state、collapsed SectionからのAdd展開、non-empty draft保護、focused planned / running Taskの`S` Start / Complete。browser-local Section collapse persistenceは別commit `b81ea533c27dbcf81e3baae865f361d0f40f66e3`でIntegrated済み
- focused changed Web: `7 PASS`。full Web: `91 / 91 PASS`。typecheck / production build / `git diff --check`: `PASS`。Wrangler user-log writeはsandbox `EPERM` warningを出したがbuildはexit `0`
- Worker / D1 / migration: `NOT_RUN / NOT_REQUIRED`（Web runtime / CSS / Web test only impact analysis）
- signed-in real local browser `http://127.0.0.1:5173/`、logical Day `2026-09-01`: `PASS`。normal Section / `Sectionなし`のpointer、Enter / Space、collapsed row非表示、canonical order復元、collapsed Add、completed表示との独立性、Day A → B → A state復元を確認
- focused planned Taskの`S` Start → Runner → focused running Taskの`S` Complete、completed no-op、text input中の`S` no-op: `PASS`。key repeat / modifier / IME guardはlocal automated evidenceで`PASS`
- UI-2A / existing interaction regression: pointer reorder、`Shift+↑/↓`、`J/K`、見積 `10分`、開始予定 `16:00`とSection同期、Routine R2A access、reload canonical reconciliation、medium `980 x 820` horizontal scroll / fixed-left smoke: `PASS`
- browser console warnings / errors: `0 / 0`
- private ignored APP backup: `593,920 bytes`、SHA-256 `06DFF19CDDCC427C26604009A9A57A0D8D75591FB9F9465D350050DFCB1801EB`、backup `quick_check = ok` / FK violations `0`。private path / row identifierは記録しない
- APP baseline / final: Days `5 -> 5`、Tasks `29 -> 31`、Entries `29 -> 31`、Executions `11 -> 12`、Operations `162 -> 170`、active Execution `0 -> 0`。final `quick_check = ok`、FK violations `0`、invalid Section placement `0`、duplicate active Execution group `0`、duplicate Routine occurrence Entry `0`
- normal UI verification dataを残置: UI-2B reorder verification Task 2件。既存`UI2A planned verification`はStart / Completeでcompletedへ遷移。direct SQL setup / cleanupなし
- source self-review: `PASS`。persistent nonprod representative verification: `PASS`（2026-09-02 consolidated block参照）、production: `NOT_RUN`、Released: `NO`

### Section collapse persistence v0.1 — 2026-09-03

- implementation commit: `b81ea533c27dbcf81e3baae865f361d0f40f66e3`（subject `Persist Section collapse preference`）をGitHub canonical `main`へIntegrated済み。変更は`apps/web/src/web/App.tsx`、`apps/web/test/web/App.test.tsx`のみで、API / Worker / shared contract / D1 / migration / dependencyは変更なし
- persistence contract: versioned browser-local envelope `{ version: 1, days: { [logicalDate]: string[] } }`をkey `taskchute.web.day-section-collapse.v1`へ保存。normal Sectionはstable Section ID、`Sectionなし`は`unsectioned` sentinelで識別し、Task / Section titleやDomain dataは保存しない。Server同期・cross-device preferenceは対象外
- local automated: collapse focused `6 PASS`、full Web `115 / 115 PASS`、core `147 / 147 PASS`、focused Day Navigation `5 PASS`、typecheck / production build / `git diff --check` `PASS`. reload restoration（collapsed / re-expanded）、logical Day isolation across remount、`Sectionなし`、malformed / incompatible payload fallback、stale Section key prune、Add auto-expand、non-empty draft protection、completed visibility、keyboard / ARIA regressionを確認
- persistent nonprod deployment: exact pushed `main`を`CLOUDFLARE_ENV=nonprod`でbuildし、generated target `taskchute-web-nonprod`（`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical AUTH_DB / APP_DB binding）をdry-run `PASS`後deploy。Worker version `2d4facea-cf0d-47b3-a247-053cd97b12ab`
- authenticated browser: current Day Section collapse → reload → collapsed、expand → reload → expanded、別logical Dayの独立state、戻り復元、`Sectionなし` collapse → reload、collapsed SectionからAdd時自動展開（blank draftをCancel）、completed visibilityとの独立性、summary metrics、keyboard / `aria-expanded`を`PASS`。browser console warnings / errors `0 / 0`
- security / integrity: root `200`、unauthenticated protected API `401`、`BOOTSTRAP_ENABLED=false`を確認。APP pending migrations `0`、`PRAGMA quick_check=ok`、FK violations `0`、active Execution `0`、aggregate Days / Tasks / Entries / Executions / Operations `8 / 38 / 38 / 16 / 177`（collapse-only verificationによるdelta `0`）。AUTH quick check `ok`、FK `0`、users / accounts / sessions `1 / 1 / 2`。bootstrap write、migration、cleanupは未実施
- classification: Section collapse persistence `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / PERSISTENT_NONPROD_VERIFIED`、production `NOT_RUN`、Released `NO`

### Day Table UI-2C integrated evidence — 2026-09-01

- implementation commit: `95701371d6fe25be1a966789254944b3a1f41eca`（parent `60aeefb1651c773bd6c727666b3efd0541e9e262`、subject `Implement Day Table UI-2C`）はGitHub canonical `main`へIntegrated済み
- changed runtime/test paths: `apps/web/src/web/App.tsx`、`apps/web/src/web/styles.css`、`apps/web/test/web/App.test.tsx`。Product / Domain / API / shared contract / persistence semantics、新dependency、migrationは変更なし
- implementation: planned / planning-enabled / persistent DayのTask cell内handleだけをdrag sourceとし、same Section / same canonical planned-start cohort内でrow上半分=`before`、下半分=`after`のfull `entry_ids`を作る。invalid / no-op / intervening different cohort / cross-Sectionはno mutation。既存`ReorderEntries` operation / placement revision / retry / reconciliation / focus restorationを共有し、visible pointer `↑/↓`buttonsは後続cross-Section sliceで撤去し、`Shift+↑/↓`を維持
- focused Web: `4 PASS`。full Web: `101 / 101 PASS`。typecheck / production build / `git diff --check`: `PASS`。Wrangler user-log writeはsandbox `EPERM` warningを出したがbuildはexit `0`
- Worker / D1 / migration: `NOT_RUN / NOT_REQUIRED`（Web runtime / CSS / Web test only impact analysis）
- signed-in real local browser `http://127.0.0.1:5173/`、logical Day `2026-09-01`: `PASS`。actual mouse dragでplanned-startなしcohortを複数行移動し、canonical reconciliation / reload persistence / actual reverse restoreを確認。equal non-null planned-start cohortもactual mouse dragで往復確認
- different planned-start cohortとcross-Sectionへのactual attempted drag: valid indicatorなし、order不変、Operations `180 -> 180`。running / completedはhandleなし。automatedではNULL/non-null、different minute、intervening cohort、cross-Section、no-op、read-only、mutation lockを確認
- existing interaction regression: `Shift+↑/↓`、`J/K`、Section collapse / expand、`S` Start / Complete、estimate / planned-start editor、Section / Routine controls、canonical reload: `PASS`。visible pointer buttonsは撤去済み、input / select / button descendantsはdraggableではない
- medium `900 x 700`: Day Table `client 611px / scroll 1040px`。horizontal scroll `7 -> 327`後もTask x `333`、handle x `343`を維持し、fixed-left / horizontal scroll conflictなし
- fresh-tab browser console warnings / errors: `0 / 0`
- private ignored APP backup: `593,920 bytes`、SHA-256 `2D2A334929A0CB78AC1261B0500B5B4D61E12D65A967E3269E282847DF8C9BDA`、backup `quick_check = ok` / FK violations `0`。private path / row identifierは記録しない
- APP baseline / final: Days `5 -> 5`、Tasks `31 -> 34`、Entries `31 -> 34`、Executions `12 -> 13`、Operations `170 -> 186`、active Execution `0 -> 0`。final `quick_check = ok`、FK violations `0`、invalid planned reorder cohort `0`、duplicate active Execution group `0`、duplicate Routine occurrence `0`
- normal UI verification dataを3 Task残置。Task追加、planned start設定、reorder、Start / Completeはすべてnormal UI / existing command経由で、direct SQL setup / cleanupなし
- source self-review: `PASS`。same-cohort boundary、full order、one drop / one operation、transient state、control safety、authorized 3 Web pathsのみを確認。persistent nonprod representative verification: `PASS`（2026-09-02 consolidated block参照）、production: `NOT_RUN`、Released: `NO`

## Day Table cross-Section D&D v0.1 integrated evidence — 2026-09-03

- implementation commit: `89d4784fddca891421d3619def352ee1156f1c89`（subject `Add cross-Section drag and drop`）をGitHub canonical `main`へpush済み
- changed runtime / test paths: `apps/web/src/web/App.tsx`、`apps/web/src/web/styles.css`、`apps/web/test/web/App.test.tsx`。Worker / API / shared contract / D1 / migration / dependencyは変更なし
- implementation: ordinary planned Entryのnoninteractive row surface / existing visual handleから同一Dayの別visible Section summary（`Sectionなし`含む）へappend。expanded targetは末尾placeholder、empty targetはsummary直下、collapsed targetはcueのみでauto-expandなし。drag中rowはelevated visualとし、accessible entityのduplicateは作らない
- command boundary: successごとに既存`MoveEntry` requestを1回だけ送信し、`taskchute_day_id` / `section_id` / `expected_placement_revision`を使う。full-Day canonical reconciliationとtarget focusを実行し、follow-up `ReorderEntries`は発行しない。D-043のreal Section / `Sectionなし`とplanned-start同期を再利用する
- no-write boundary: Routine-derived、running / completed、read-only / preview / locked state、same-Section / no-op / invalid targetはmutationしない。visible pointer `↑/↓`buttonsは撤去し、same-Section `ReorderEntries`と`Shift+↑/↓`は維持
- focused Web `116 / 116 PASS`、full Web `122 / 122 PASS`、Worker / D1 `147 / 147 PASS`、typecheck / production build / `git diff --check`: `PASS`。Worker / D1 / migrationはWeb-only impact analysis上`NOT_REQUIRED`だが、既存Worker suiteはregression確認のため実行。build時のWrangler user-log `EPERM` warningはあったがexit `0`
- persistent nonprod: exact `main@89d4784fddca891421d3619def352ee1156f1c89`を`taskchute-web-nonprod` / Worker version `638a78b6-e842-45bb-975c-98e4b6b9e9ac`へdeploy。generated config / dry-run、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、canonical AUTH_DB / APP_DB bindingを`PASS`
- authenticated browser `https://taskchute-web-nonprod.taskfulness-sync.workers.dev/`、logical date `2026-09-03`: existing ordinary planned Entryのactual mouse D&D `Evening → Day`、collapsed `Morning` targetのno-auto-expand、Sectionなし表示、reloadを`PASS`。final canonical reloadはalertなし、Sectionなし `0/2`、Morning / Day `0/0`、Evening `0/1`。console warnings / errors `0 / 0`
- API / DB safety: root `200`、unauthenticated protected API `401`、disabled bootstrap POST `404`。APP D1 read-only queryは`changes=0` / `rows_written=0`、placement revision `16`、`PRAGMA quick_check = ok`、FK violations `0`、対象DayはSectionなし planned `2`（planned-start `NULL`） / Evening planned `1`。operationsは`MoveEntry` success `19` / domain rejection `1`、`ReorderEntries` success `13` / revision conflict `1`
- verification data / cleanup: existing normal nonprod verification dataをUI mutation経由で確認し、direct SQL write・migration・cleanupは未実施。test data / session retentionは既存Open Questionを維持
- source self-review: `PASS`。new Domain semantics / migration / dependency / policy変更なし、existing `MoveEntry` call pathとsame-Section Reorder pathを分離、no implicit routine scope、pending mutation lock、full reconcile / focus restorationを確認
- classification: cross-Section D&D v0.1 `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / PERSISTENT_NONPROD_VERIFIED`、production `NOT_RUN`、Released `NO`

## Desktop Day wide layout + Sidebar collapse v0.1 integrated evidence — 2026-09-03

- implementation commit: `74f7b24`（subject `Widen Desktop Day layout`）をGitHub canonical `main`へpush済み。changed runtime / test pathsは`apps/web/src/web/App.tsx`、`apps/web/src/web/styles.css`、`apps/web/test/web/App.test.tsx`。Worker / API / shared contract / D1 / migration / dependencyは変更なし
- implementation: Day-only `.day-shell`は`width: calc(100% - 32px); max-width: none`、common `.shell`は`1120px` capを維持。`.day-surface`は`overflow-x: auto`のownerを維持し、Task trackは`minmax(280px, 1fr)`、その他のcompact trackと列順、Bulk / Execution / Task sticky foundation、narrow fallbackを維持
- Sidebar: open stateは`240px minmax(0, 1fr)`、closed stateはSidebarをrenderせず`minmax(0, 1fr)`の1列。reopen controlはauthenticated content内でToday / Routine / Settingsに共有。storage keyは`taskchute.web.sidebar.v1`、envelopeは`{version:1,open:boolean}`、malformed / incompatible / Storage exceptionはopen fallback、read/write failureはnavigationを壊さない。resize / saved width / server syncは未実装
- local automated: focused Web `120 / 120 PASS`、full Web `126 / 126 PASS`、typecheck、production build、`git diff --check` `PASS`。Worker / D1 / migration suiteはpresentation-only impact analysisで`NOT_REQUIRED`
- persistent nonprod: generated config / dry-run、Worker `taskchute-web-nonprod` version `2886e754-6266-4eda-8260-76d7703f8f29`、exact pushed main `74f7b24`、AUTH / APP pending migrations `0`、`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、AUTH_DB / APP_DB bindingを`PASS`

| viewport | Sidebar state | Day shell | Task track | table scroll | page overflow |
|---|---|---:|---:|---|---|
| 1920px | open | 1648px | 848px | none (`1646 / 1646`) | none (`1920 / 1920`) |
| 1920px | closed | 1888px | 1088px | none (`1886 / 1886`) | none (`1920 / 1920`) |
| 1440px | open | 1168px | 368px | none (`1166 / 1166`) | none (`1440 / 1440`) |
| 1280px | open | 1008px | 332px within `1130px` minimum | owned by `.day-surface` (`1006 / 1130`) | none (`1280 / 1280`) |
| 720px | open | 464px | 332px within `1130px` minimum | owned by `.day-surface` (`462 / 1130`), sticky `static` | none (`720 / 720`) |

- authenticated browser `https://taskchute-web-nonprod.taskfulness-sync.workers.dev/`、logical date `2026-09-03`: 1920 open / close / reopen、closed reload persistence、1440 / 1280 / 720 responsive width、720 sticky fallback、Routine / Settings non-Day shell glance、Today / Routine / Settings preference sharing、calendar month grid `42` cells、Section collapse / expand、empty Add Task draft cancel、rightmost `開始見込` reachabilityを`PASS`。console warnings / errors `0 / 0`
- D&D / alignment regression: local full Webのexisting same-Section / cross-Section / no-write / keyboard D&D coverageは`126 / 126 PASS`、browserではwidened table / Section summary alignment / placeholder-compatible surfaceをstatic確認。Cua actual dragはtarget / UI / DB writeの変化がないno-opだったためmutation successとは扱わず、nonprod Domain dataを追加変更していない
- API / DB safety: root `200`、unauthenticated protected API `401`、disabled bootstrap POST `404`。AUTH / APP remote read-only `PRAGMA quick_check = ok`、FK violations `0`、`changes=0`、`rows_written=0`。layout verificationによるdirect SQL write / migration / cleanupなし
- source self-review: `PASS`。Day-only widening、non-Day `.shell` preservation、elastic minimum-safe Task track、table-owned scroll、sticky fallback、released Sidebar track、browser-local safe storage、shared reopen control、no Domain/API/Worker/data/dependency changeを確認
- Product / Domain / Architecture / Policy Decision: `UNCHANGED / NONE`
- classification: Desktop Day wide layout + Sidebar collapse v0.1 `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / PERSISTENT_NONPROD_VERIFIED`、production `NOT_RUN`、Released `NO`

## Day Table column customization + actual projection v0.1 integrated evidence — 2026-09-03

- implementation commits: `10584ba`（`Customize Day Table columns`）、`6100d20`（auto-fit縮小修正）、`6316b0d`（mobile overflow修正）、`60eecdd`（hidden label containment修正）をGitHub canonical `main`へIntegrated済み
- changed runtime / test paths: `apps/web/src/shared/contracts.ts`、`apps/web/src/web/day-columns.ts`、`apps/web/src/web/App.tsx`、`apps/web/src/web/styles.css`、`apps/web/src/web/worker/application/load-current-day.ts`、`apps/web/test/web/App.test.tsx`、`apps/web/test/web/day-columns.test.ts`、`apps/web/test/b2.integration.test.ts`
- source review: `PASS`。fixed Bulk / Execution / Taskとcustomizable Project以後の分離、registry-driven heading / draft / normal row alignment、stable storage repair、handle resize / auto-fit、Routine action boundary、read-only Execution projection、existing command / lifecycle pathの再利用を確認
- structural contract: default order `実行 | Task | Project | Section | Routine | 見積 | 開始予定 | 開始見込 | 開始 | 終了 | 実績`。Project以後の9 data columnsだけがreorder / resize / auto-fit対象で、fixed slotsは不変。Mode / Note、hide / show、manual actual correctionは未実装
- browser-local preference: key `taskchute.web.day-columns.v1`、envelope `{version:1,order:[...],widths:{...}}`。local automatedでduplicate / unknown / missing / version repair、reorder persistence、Storage-safe boundaryを確認。Server / API / D1 / cross-device同期なし
- actual projection contract: `execution_summary = { first_started_at, last_ended_at, completed_duration_seconds, active_started_at }`。複数completed intervalを合計し、active中はcurrent display referenceからelapsedを加算、終了は`—`、logical Day boundary越えはextended timeで表示。projectionはread-onlyでEntry / Executionへderived valueを書き戻さない
- local automated: Web focused changed suites / full Web `129 / 129 PASS`、focused Worker projection `8 / 8 PASS`、full Worker / D1 `151 / 151 PASS`、typecheck、production build、`git diff --check` `PASS`。migration / new dependencyは`NOT_REQUIRED`
- persistent nonprod deployment: exact pushed `main@60eecdd`を`CLOUDFLARE_ENV=nonprod`でbuildし、generated target `taskchute-web-nonprod`（`RUNTIME_ENV=nonprod`、`BOOTSTRAP_ENABLED=false`、AUTH `60085f8d-0c4e-4c15-98e9-3ce178398041`、APP `6ad7e35f-5d03-4be3-9b00-46cd713a51c3`）を確認。pending migrationはAUTH / APP `0 / 0`、Worker version `75a19e18-1311-4620-9cc6-8374c8bb740d`
- authenticated nonprod browser: default order、Project resize `100 → 220 → reload保持 → 150復元`、auto-fit縮小、derived / ordinary / protected Routine icon、normal UI Start → running → Complete → reloadでactual列保持を`PASS`。runningは開始 `10:04` / 終了 `—` / 実績 `0分`、complete後は開始 `10:04` / 終了 `10:04` / 実績 `0分`
- browser D&D boundary: header column Cua dragはorder / visible indicator / data mutationとも変化しないno-opだったため`NOT_VERIFIED`。local automated D&D reorder / persistenceは`PASS`であり、browser no-opをmutation successへ昇格しない。row D&D / existing entry reorder regressionはlocal suiteのcoverageを維持
- responsive browser: page `docScroll`は1920 / 1440 / 1280 / 720pxで各viewport内、Day Table `client / scroll`は`1646 / 1646`、`1166 / 1280`、`1006 / 1280`、`462 / 1280`。720pxはsticky static + table-owned scroll、Sidebar close / reopenも`PASS`
- browser console warnings / errors: `0 / 0`
- API / DB safety: root `200`、unauthenticated protected API `401`、disabled bootstrap POST `404`。AUTH / APP remote read-only `PRAGMA quick_check = ok`、FK violations `0`、read-only query `rows_written = 0`。layout preferenceはDBへ書き込まず、Start → Completeは既存nonprod verification Taskへの意図的normal UI lifecycle write 1件
- production / release: production feature-specific verification `NOT_RUN`、Released `NO`
- classification: Day Table column customization + actual projection v0.1 `IMPLEMENTED / INTEGRATED / LOCAL_TESTED / PERSISTENT_NONPROD_VERIFIED`。remaining boundariesはhide / show、Mode / Note、fixed slot reorder、Sidebar resize、Server / cross-device preference、manual correction、cross-Day / fuller context interaction

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

## Start Forecast v0.1 integrated evidence — 2026-09-01

- implementation commit: `8939c4d6af95e2fd21b7d91e0e946bee29a6c1fb`（subject `Implement Start Forecast v0.1`）はGitHub canonical `main`へIntegrated済み
- focused shared forecast `9 / 9 PASS`、focused Day Navigation `12 / 12 PASS`、focused Web forecast / surface `3 / 3 PASS`
- Worker / D1 `133 / 133 PASS`、Web `103 / 103 PASS`、typecheck / production build / `git diff --check` `PASS`
- signed-in real-local browser: current / future established / future preview / established past、actual pointer D&D、Start / Complete、`S`、Section collapse、R2A editor、medium-width horizontal scroll / sticky Taskを`PASS`
- real-local APP: private ignored backup validation、final `quick_check = ok`、FK violations `0`、active Execution `0`、duplicate active group `0`、forecast schema object `0`
- fresh-tab console warnings / errors: `0 / 0`
- extended wall-clock forecast formatはautomated `PASS`、controlled real-browserは`NOT_RUN`
- migration / dependency: `NOT_REQUIRED`、persistent nonprod representative verification: `PASS`（2026-09-02 consolidated block参照）、production: `NOT_RUN`、Released: `NO`

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| START-FORECAST-01 | Current anchor | current Dayはserver projection生成時刻を基準とし、client clockはAPI pollingやDB writeなしに前進する | Approved (D-032) | PASS (LOCAL_AUTOMATED + REAL_LOCAL) |
| START-FORECAST-02 | Active Execution | running Entryの見積残時間をactual instant arithmeticで算出し、超過は0、見積NULLはcurrent instantを使う | Approved (D-032) | PASS (LOCAL_AUTOMATED + REAL_LOCAL) |
| START-FORECAST-03 | Queue | timed Section内のplanned Entryをcanonical Section / Entry orderで見積累積し、planned startをbarrierにしない | Approved (D-032) | PASS (LOCAL_AUTOMATED + REAL_LOCAL) |
| START-FORECAST-04 | Exclusion | completed / running自身、`Sectionなし`、untimed legacy、past / record-noneをforecast対象外として`—`表示する | Approved (D-032) | PASS (LOCAL_AUTOMATED + REAL_LOCAL) |
| START-FORECAST-05 | Future | established future DayはDay startをanchorにし、preview readはDay / Entry / RoutineOccurrenceをmaterializeしない | Approved (D-032, D-041) | PASS (LOCAL_AUTOMATED + REAL_LOCAL) |
| START-FORECAST-06 | Display | Day timezoneとlogical dateからsame-day / post-midnight extended `HH:mm`を表示し、Day endを越えてもclampしない | Approved (D-032) | PASS (LOCAL_AUTOMATED; real-browser extended time NOT_RUN) |
| START-FORECAST-07 | Compatibility | reorder / lifecycle / Section collapse / Routine R2A / responsive horizontal-scroll behaviorを維持する | Approved (D-032; canonical DESIGN) | PASS (LOCAL_AUTOMATED + REAL_LOCAL) |
| START-FORECAST-08 | Boundary | D-028 Interrupt / D-033 manual actual correction等の未実装scopeを暗黙に追加しない | Approved (D-028, D-032, D-033) | PASS (SOURCE_REVIEW) |

## R-016 established future Day follow-up Add evidence — 2026-09-02

- implementation commit: `04254f60b1dfb25e66550b940b9df6b28fdf616f`（subject `Fix established future Day task addition`）はGitHub canonical `main`へIntegrated済み
- changed runtime / test paths: `apps/web/worker/application/add-task-to-day.ts`、`apps/web/test/day-navigation.integration.test.ts`、`apps/web/test/web/App.test.tsx`。migration / dependency / shared contract / forecast semantics変更なし
- focused Day Navigation `14 / 14 PASS`、focused Start Forecast `9 / 9 PASS`、focused Web established-future request `1 PASS`、Worker / D1 `135 / 135 PASS`、Web `103 / 103 PASS`
- typecheck / production build / `git diff --check`: `PASS`
- signed-in real-local browser: future preview no-write、同じfuture Dayへのnormal UI 1件目 → 2件目 → 3件目Add、後続estimate更新、forecast更新、reload / navigation復元、non-current Start disabledを`PASS`。console warnings / errorsは`0 / 0`
- real-local APP: private ignored backup validation、final `quick_check = ok`、FK violations `0`、active Execution `0`、tested logical dateのDay exactly 1、Entry / Task exactly 3、historical Section context重複 `0`、orphan `0`
- persistent nonprod representative verification: `PASS`（2026-09-02 consolidated block参照）、production: `NOT_RUN`、Released: `NO`

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| R016-01 | Routing | owner-scoped established future Dayが存在すれば、revision 0 establishment validationより先に解決してestablished-Day mutationへ委譲する | Approved (D-020, D-041) | PASS (LOCAL_AUTOMATED + REAL_LOCAL) |
| R016-02 | Establishment | Dayが存在しない場合だけrevision 0でSection contextと最初のTaskをatomicにestablishする | Approved (D-020, D-038, D-041) | PASS (LOCAL_AUTOMATED + REAL_LOCAL) |
| R016-03 | Revision | established future Dayへの後続Addはcurrent canonical placement revisionを要求し、成功ごとにexactly +1、stale revisionはno partial writeでrejectする | Approved (D-020, D-041) | PASS (LOCAL_AUTOMATED + REAL_LOCAL) |
| R016-04 | Historical context | establishment後のSection configuration変更を後続Addへ再materializeせず、frozen historical contextを維持する | Approved (D-038, D-041) | PASS (LOCAL_AUTOMATED + REAL_LOCAL) |
| R016-05 | Retry / concurrency | exact same-operation retryは重複を作らず、同revisionのdistinct concurrent follow-upは一方だけ成功してcanonical stateへ収束する | Approved (D-020, D-041) | PASS (LOCAL_AUTOMATED) |
| R016-06 | Web request | established future DayへのWeb Addはcanonical Day ID、logical date、current placement revisionを送る | Approved (D-020, D-041) | PASS (LOCAL_AUTOMATED + REAL_LOCAL) |
| R016-07 | Compatibility | preview no-write、Start Forecast、non-current execution boundary、reload / navigation recoveryを維持する | Approved (D-032, D-041) | PASS (LOCAL_AUTOMATED + REAL_LOCAL) |

## Persistent nonprod current-main consolidated verification — 2026-09-02

- exact source / deploy: `main@59fd1f97a936bfc26946d454b44edaaa28df21b2` → existing `taskchute-web-nonprod` Worker version `1cf68d11-b878-42f1-9a90-f9585d6f3d4d`。pre-deploy versionは`4257b1ff-1be1-416d-aed5-699c46c914f0`、rollbackは`NOT_RUN / NOT_REQUIRED`
- migration / preservation: AUTH / APP pending migrations `0 / 0`でremote migrationは不要。private ignored APP export `157,714 bytes` / SHA-256 `D4BEA62AE37D5EB66C7C34BBC77A8B32659BA898B8B245F6D0242AF23DC7875B`をisolated restoreし、`quick_check = ok`、FK violations `0`、baseline counts一致を`PASS`。private path、signed URL、user data、credential / session content、secret valueは記録しない
- automated / static: focused Day Navigation `14 / 14`、focused Start Forecast `9 / 9`、Worker / D1 `135 / 135`、Web `103 / 103`、migration regression `3 scenarios`、typecheck、exact nonprod build、Wrangler dry-run、`git diff --check`は`PASS`。upload `1854.86 KiB` / gzip `376.16 KiB`、Worker startup `39 ms`
- UI-2A: wide / medium / narrowでtable-owned horizontal scroll、applicable widthのfixed-left Bulk / Execution / Task foundation、narrow static fallback、rightmost column到達、presentation-only Bulk slotをauthenticated browserで`PASS`
- UI-2B: normal Section / `Sectionなし`のpointer・keyboard collapse / expand、logical Day A → B → Aのstate復元、focused planned Taskの`S` Startとrunning Taskの`S` Complete、lifecycle guardを`PASS`。browser-local cross-reload persistenceは下記Section collapse persistence evidenceで`PASS`
- UI-2C（2026-09-02時点のhistorical evidence）: same Section / same canonical planned-start cohort内のactual pointer D&D、canonical reorder / reload persistence / reverse restore、cross-Sectionとdifferent-cohort invalid drop no-op、当時のpointer `↑/↓`維持を`PASS`。`Shift+↑/↓`はautomated regression `PASS`。2026-09-03のcross-Section D&D v0.1とvisible pointer button撤去のcurrent evidenceは直後の専用sectionで記録し、この行のcurrent interaction claimをsupersedeする
- Start Forecast v0.1: current Dayの10m / 20m chaining、planned start非barrier、reorder recalculation、active Execution残見積、Complete reconciliation、`Sectionなし` / non-current / pastの`—`・read-only境界、`開始見込`列を含むtable usabilityを`PASS`。D-028 Interrupt / D-033 manual actual correctionへscopeを拡張しない
- R-016 representative: future `2026-09-10` preview前後のDay / Entry / RoutineOccurrenceは`0 -> 0`。normal Webの1件目Addでatomic establishmentし、2件目 / 3件目、reload、navigate away / back、non-current Start disabledを`PASS`。final Day `1`、Entries `3`、historical Section contexts `3`、duplicate context `0`、placement revision `5`
- representative regression: calendar picker、previous / next、`Shift+Left / Shift+Right`、Today return、future preview / establishment / reload、past record-none read-only、established past frozen history、Settings Section / Project、Routine Board、duplicate RoutineOccurrence `0`、authenticated general flowを`PASS`。browser console warnings / errorsは`0 / 0`
- final APP integrity: `quick_check = ok`、FK violations / active Executions / duplicate active groups / duplicate RoutineOccurrences / orphan Entriesはすべて`0`。Days `7 -> 8`、Tasks `26 -> 32`、Entries `26 -> 32`、Executions `13 -> 15`、Operations `147 -> 167`、RoutineOccurrences `6 -> 6`。verification dataはcleanupせず残置
- final AUTH integrity: `quick_check = ok`、FK violations `0`、pending migrations `0`、users / accounts / sessions `1 / 1 / 2`。credential / session contentは記録しない
- security / deployment posture: root `200`、unauthenticated protected API `401`、bootstrap route `404`、`BOOTSTRAP_ENABLED=false`、production resource混入なし、secret value未取得を`PASS`。productionは`NOT_RUN`、Releasedは既存scopeを越えて変更しない
- remote logout → reloginは`NOT_RUN`。R016 detailed retry / misuse / concurrency / ambiguity / rollbackは`LOCAL_AUTOMATED` evidenceのみで、remote representative PASSへ拡張しない

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

## Routine R2B Board candidate

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| ROUTINE-R2B-01 | Migration | duplicate Task Routineをfail-safe rejectし既存identity/historyを保持 | D-047, D-048 | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD_MIGRATION) |
| ROUTINE-R2B-02 | Domain | new RoutineはOFF、ON resume日はeligible current occurrenceをexactly once作成 | D-047 | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD representative) |
| ROUTINE-R2B-03 | Domain | OFF intervalはpast backfillせずexisting factsを保持 | D-047 | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD representative) |
| ROUTINE-R2B-04 | Domain | daily / N-day / weekly + inclusive period eligibility | D-047 | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD representative; controlled inclusive end-date browserはTOOLING_BLOCKED / NOT_VERIFIED) |
| ROUTINE-R2B-05 | Domain | current planned occurrenceをschedule suppression / restoreしduplicateを作らない | D-047 | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD representative) |
| ROUTINE-R2B-06 | Domain | Board default propagationはR2A overrideとhistorical stateを保護 | D-043, D-044, D-047 | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD representative) |
| ROUTINE-R2B-07 | Domain | Task current title/Projectとhistorical occurrence snapshotを分離 | D-047 | PASS (LOCAL_AUTOMATED; past-Day real browser NOT_RUN) |
| ROUTINE-R2B-08 | Ordering | Board orderはDay / materialization orderと独立、stale revision/replay safe | D-047, D-048 | PASS (LOCAL_AUTOMATED) |
| ROUTINE-R2B-09 | Web | Sidebar Board、columns、blank no-write add、inline/popover/toggle/search/tabs | D-047 | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD representative) |
| ROUTINE-R2B-10 | Compatibility | Day manual end actionなし、legacy APIとR2A chooser/resetを維持 | D-047 | PASS (LOCAL_AUTOMATED + REAL_LOCAL + NONPROD representative) |

R2Bはcommit `304e73f`でmainへIntegrated。local / real-local / persistent nonprod representative evidenceは`PASS`。productionはinitial release smokeのみ`PASS`で、R2B deep mutationは`NOT_RUN`。D-049 initial releaseとしてReleasedは`YES`。

2026-09-01 local candidate evidence: Source Review `PASS`。OFF Routineのmetadata更新で既存planned occurrenceを誤suppressionする問題をreal browserで検出し、pauseはfuture generationのみを止め既存factのschedule authorityを変えないよう修正した。focused R2B Worker/D1 `7 / 7 PASS`、full Worker/D1 `124 / 124 PASS`、Web `84 / 84 PASS`、migration regression `3 scenarios PASS`（R2A normalization、R2B preservation/constraints、duplicate-Task fail-safe、chain through `0008`）、typecheck / production build / `git diff --check` `PASS`。Wrangler user-log writeはsandbox `EPERM` warningを出したが各required commandはexit `0`。

Real-local evidence: private ignored APP exportを作成し、size `141,876 bytes` / SHA-256 `EFAD923C08343AF517A5CDBA91CCBD8BF95823A1AAF74B47AA06BB06792820C9`、isolated restore / `0008` dry-run / pre-existing 22 table data fingerprint一致、`quick_check = ok` / FK violations `0`を確認してからlive APP DBへ`0008_routine_r2b_board.sql`のみを適用した。post-migrationで既存Task / Entry / Execution / Routine / Occurrence件数、active Execution `0`、duplicate Task Routine `0`を保持し、existing 3 Routinesにschedule / Board item / snapshotを各3件materializeした。signed-in browserではblank draft cancel no-write、OFF create、Project / Section / planned start / estimate、N-day / weekly / daily、ON exactly-once、OFF fact preservation、current schedule suppression / restore、reload no-duplicateを確認し、console warning / error `0 / 0`。verification RoutineはOFF、current occurrence `1`、suppression `0`で残置した。controlled inclusive end-date inputはDOM `2026-09-03`を確認したがrequest stateへ反映されずDBは`NULL`のため`TOOLING_BLOCKED / NOT_VERIFIED`、past-Day historical title / Project browser subcaseは`NOT_RUN`。APP / AUTHともfinal `quick_check = ok` / FK violations `0`。persistent nonprod evidenceとD-049 production release evidenceは後続blockを正本とする。

Persistent nonprod release evidence（2026-09-01）: APP private export `125,596 bytes` / SHA-256 `B5273005EBF86A056799E55919A9C8AE4EB2E899C107A8811B23F3C9EFE85240`をisolated restoreし、`0008` dry-run / preservation / quick check / FKをPASSしてからremote `0008`のみを適用した。exact `main@0228573d67c75305c94a632d2d3d75999b14a19a`をWorker version `4257b1ff-1be1-416d-aed5-699c46c914f0`としてdeploy。authenticated browserでblank no-write、OFF create、Project / Section / planned start / estimate、N-day / weekly / daily、ON exactly-once、OFF fact preservation、schedule suppression / restore、R2A今回だけ / default reset、future no-materialization、established-past read-only、reload no-duplicateをPASSし、console warning / errorは`0 / 0`。controlled inclusive end-dateはtooling boundaryにより`NOT_VERIFIED`。verification RoutineはOFFで残置し、APP/AUTH final quick check / FK、active Execution `0`、bootstrap disabledをPASSした。

## Initial production release gate

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| PROD-01 | Resource | named production Workerとseparate AUTH / APP D1をapproved naming / locationで作成する | D-049 | PASS |
| PROD-02 | Security | public Workerをbootstrap-disabledのまま、loopback local Worker + remote production D1でinitial bootstrapする | D-023, D-049 | PASS |
| PROD-03 | Data | productionをcleanに開始し、nonprod historyをcopyせずexplicit timezone / boundary / Sectionsだけをbootstrap inputにする | D-022, D-049 | PASS |
| PROD-04 | Recovery | bootstrap後にAUTH / APP baseline exportとTime Travel bookmark/infoを取得し、restoreを自動実行しない | D-049 | PASS |
| PROD-05 | Smoke | bootstrap 404、signup disabled、login / Today / Routine Board / Settings / reloadをsynthetic domain dataなしで確認する | D-049 | PASS |
| PROD-06 | Cost | current Free limits内で開始し、paid upgradeを暗黙に行わない | D-049 | PASS |

Initial production release evidence（2026-09-01）:

- exact canonical `main@0228573d67c75305c94a632d2d3d75999b14a19a`からWorker `taskchute-web-production` version `0cab9b2c-2984-4dcd-b784-719a6b8ced1d`をdeploy。`workers_dev=true`、preview URLs disabled、`BOOTSTRAP_ENABLED=false`
- separate production AUTH / APP D1（`apac`）へAUTH `0001` / APP `0001`〜`0008`を適用しpending `0`。nonprod historyはcopyせずclean start
- loopback-only bootstrapとnormal loginをPASS。public bootstrap endpoint `404`、unauthenticated protected API `401`、public signup disabled postureを維持。credential / token / hashはcanonical docsへ記録していない
- initial Section configurationをnormal Settings UI / canonical APIでMorning `04:00–12:00`、Day `12:00–20:00`、Evening `20:00–28:00`として保存。version `1` / items `3`、APP quick check / FKをPASS
- Time Travel bookmarkとprivate ignored AUTH / APP exportを取得しisolated restoreをPASS。restoreは実行していない
- signed-in production smokeでToday、empty Routine Board、Settings Section / Project、reload、console warning / error `0 / 0`をPASS。synthetic Project / Task / Routine dataは作成していない
- final APP / AUTH quick check `ok`、FK violations `0`、active Execution `0`。production deep mutationは`NOT_RUN`、Released `YES`
