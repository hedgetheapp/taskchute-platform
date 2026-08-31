# Current

Date: 2026-08-31

## Status

First Server + Web vertical sliceは`IMPLEMENTED / INTEGRATED`。D-023 bootstrap lifecycle security incrementも`IMPLEMENTED / INTEGRATED / LOCAL_TESTED`。D-024 persistent non-production verification environmentは`APPROVED`かつremote verification済み。

PR #3でruntime bootstrap sliceを、PR #5でReorder / Start / Complete / Execution lifecycle incrementを`main`へmergeした。PR #6でPR #5 merge後のcanonical docsをcurrent implementation / evidenceへ整合し、PR #7でcurrent-state maintenanceをmergeした。PR #8でD-023 bootstrap lifecycle security incrementを、PR #10でD-024 persistent non-production environment configurationを`main`へmergeし、PR #11でそのmerge後current stateを整合した。persistent non-production remote runtime verificationはPASS。production verificationは未実施。

その後、Day planning / Routine設計をcanonical docsへ進め、D-026〜D-037をApproved。2026-08-28にD-038をApprovedし、Section persistence foundationと次のDay dogfood implementation順を確定した。Dogfood Day v0.1-A UI shellとB1はPR #13で`main`へmerge済み。B1は`IMPLEMENTED / INTEGRATED`で、source review、local automated verification、real local APP DB migration、signed-in browser verification、persistent non-production migration / runtime / browser verificationはPASSした。B1 production verificationとreal Japanese IMEは`NOT_RUN`、Releasedは`NO`。D-039でApprovedしたB2 planned-start persistence / command contractはcommit `316ad0d88f0f88d1445991904da587b1e0987dab`で`main`へ`IMPLEMENTED / INTEGRATED`となり、source review、local automated verification、real local APP DB migration、signed-in browser verification、persistent non-production migration / runtime / authenticated browser verificationはPASSした。B2 production verificationは`NOT_RUN`、Releasedは`NO`。D-038 B3 Section settings lifecycleはcommit `2481c4916ca2f694f07d6808a4482bea28c79a80`で`main`へ`IMPLEMENTED / INTEGRATED`となり、source review、automated verification、real local APP DB `0005` migration、signed-in browser verification、persistent non-production APP `0005` migration / preservation / deployed runtime / authenticated browser verificationはPASSした。B3 production verificationは`NOT_RUN`、Releasedは`NO`。D-040 Minimal Routine R1 daily dogfood sliceはruntime commit `f9324e866deb74277d2fd83c5945f2df4b2b95da`とnonprod evidence docs commit `c63a98f22ab685370d3e20f1f15f480fab951ae8`をPR #14 merge commit `ebaff6d156813ba78b4c5c28818f9f55db9fd970`で`main`へ統合済み。source review、isolated migration / Worker-D1 / Web automated evidence、real local APP DB `0006` migration / preservation、signed-in real-browserのgeneral R1 flowは`PASS`。v6でserver-canonical reconciliation semanticsを変えず、transient pending statusによるDayBoard layout shiftを解消し、ChatGPT source review `PASS`、focused / full Web `65 / 65 PASS`、typecheck / build / `git diff --check` `PASS`を確認した。persistent nonprod APP `0006` migration / preservation、PR head deploy、authenticated general R1 browser flowは`PASS`で、deployed Worker versionは`be96301c-f131-47b4-bf78-11d4433716b1`。real-browser controlled inclusive end-dateとdeployed non-null inclusive-date subcheckはbrowser automation event mismatchにより`TOOLING_BLOCKED / NOT_VERIFIED`、productionは`NOT_RUN`、Releasedは`NO`。

Day Table UI-1はcommit `da4a8c8316d60d942dc73fbd53bb90d15df5517b`（`Realign Day Table UI`）でcurrent `main`へ`IMPLEMENTED / INTEGRATED`となった。独立した状態/並び替え列を除き、Routineを独立列へ移し、current visible orderを`実行 | Task | Project | Section | Routine | 見積 | 開始予定`へ整合した。source review、focused Web、full Web `65 / 65 PASS`、typecheck、production build、`git diff --check`、signed-in real local browser verification、APP integrityは`PASS`。browser console errors / warningsは`0 / 0`。UI-1 persistent nonprod / production verificationは`NOT_RUN`、Releasedは`NO`。

Settings v0.1はimplementation commit `51242b08e015817108010839cd5234959da2fed5`（`Implement Settings v0.1 navigation`）でcurrent `main`へ`IMPLEMENTED / INTEGRATED`となった。Desktop Left Navigationの`今日` / `設定`、Settingsの`Section` / `Project`、owner-scoped Project list、Settings内Project作成を実装し、既存Section editorとProject作成をDayBoardのtemporary controlからSettingsへ移した。UI-1の7列と独立Routine列、Section configuration semantics、current-Day freezeは維持している。ChatGPT source review、focused Web `2 PASS`、full Web `67 PASS`、Worker / D1 `101 PASS`、typecheck、local / nonprod build、Wrangler nonprod dry-run、`git diff --check`、signed-in local browser、persistent nonprod authenticated browser / integrityは`PASS`。corrected nonprod Worker versionは`22578f99-6256-4027-a345-ce523c67d241`。productionは`NOT_RUN`、Releasedは`NO`。

D-041 `Non-materializing Day navigation and mutation-time future Day establishment`はApproved。未来日をviewするだけではTaskChuteDay / historical context / RoutineOccurrence / Entryを作らず、non-persistent previewとして扱う。最初のsuccessful day-specific planning mutationでDay establishmentとmutation effectをatomicに確定し、失敗時はDayだけを残さない。establish後のcontextはhistorical authorityとしてfreezeする。Day Navigation v0.1 runtimeはlocal implementation commit `6f183c28242a1cd30211ea8e0c4f1e1dc23329bb`（`Implement Day Navigation v0.1`）として実装済みだが、GitHub / remote `main`へは未統合である。

D-042 `Non-established past Day is an empty read-only historical gap`はApproved。未establishの過去日はrecord-none read-only projectionとして表示し、current settingsからhistorical interval / Section contextを捏造せず、Routine / Task / Entry / planning stateをbackfillしない。established past Dayはexisting frozen canonical contextを表示する。このruntime behaviorもDay Navigation v0.1 local implementation commitに含まれる。

Day Navigation v0.1は`IMPLEMENTED`（local reviewed commit）で、ChatGPT source review、focused Day Navigation integration `12 PASS`、Worker / D1 `113 PASS`、Web `74 PASS`、focused auth-boundary Web `2 PASS`、migration regression `1 scenario / 46 data/schema checks PASS`、typecheck、build、`git diff --check`は`PASS`。signed-in local browserのgeneral Day Navigation flow、future preview / first Add、past read-only、UI-1 regression、console warnings / errors `0 / 0`も`PASS`。logout → relogin → current Dayのreal-browser subcaseはcredential handlingを行わなかったため`NOT_RUN`だが、explicit logout / 401後の選択日resetはautomated Webで`PASS`。migration追加とdependency追加はなく、persistent nonprod / productionは`NOT_RUN`、Releasedは`NO`、GitHub / remote integrationは`NO`である。

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
- Settings v0.1 navigation: `51242b08e015817108010839cd5234959da2fed5`
- Day Navigation v0.1: `6f183c28242a1cd30211ea8e0c4f1e1dc23329bb`（local reviewed commit、remote未統合）

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

D1 feasibility gateは引き続きPASS / Verified。current Product runtimeはFirst vertical slice scopeでImplemented + Integratedかつlocal automated evidence / implementation review / GitHub PR diff reviewがPASSしている。persistent non-production remote D1 Product runtime / deployed Worker verificationもPASSした。ただしproduction smokeは未実施であり、Product runtime全体をVerified / Releasedとは扱わない。

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
- D-041で未来Dayのnon-materializing read preview、first successful mutationによるatomic establishment、failure / retry / concurrency、historical freeze、D-040 current-Day Routine boundaryをApprovedした。Day Navigation v0.1 runtimeはlocal commit `6f183c28242a1cd30211ea8e0c4f1e1dc23329bb`でImplemented / Source Reviewed / Local Testedだが、remote `main`へ未統合で、persistent nonprod / productionは`NOT_RUN`。
- D-042で未establish past Dayのempty record-none / read-only / no-fabrication / no-backfillと、established past Dayのcanonical history表示をApprovedした。new past editing / historical correctionは別scopeとする。
- D-038 B1はPR #13でcurrent `main`へIntegrated済みで、Implemented / Integrated / Local Tested / Source Reviewed / Signed-in Local Browser Verified / Persistent Nonprod Remote Verified。B1 production verificationは`NOT_RUN`。
- D-038 B2はcommit `316ad0d88f0f88d1445991904da587b1e0987dab`でcurrent `main`へImplemented / Integrated済み。source review、automated/local migration、signed-in local browser、persistent nonprod migration / runtime / authenticated browser evidenceはPASS。B2 production verificationは`NOT_RUN`。
- D-038 B3はcommit `2481c4916ca2f694f07d6808a4482bea28c79a80`でcurrent `main`へImplemented / Integrated済み。source review、automated verification、real local `0005` migration、signed-in local browser、persistent nonprod `0005` migration / preservation / deployed runtime / authenticated browser、current-Day freeze evidenceはPASS。next-Day materializationのautomated evidenceはPASSだがreal browserは`NOT_RUN`。persistent nonprodのraw console warning/error exact countは`NOT_VERIFIED`、production verificationは`NOT_RUN`、Releasedは`NO`。
- production smokeは`NOT_RUN`。

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

## Persistent non-production increment

Current `main`では、repository-side persistent non-production configを実装・統合済み。local検証・source review・GitHub PR diff reviewもPASS。2026-08-22にpersistent non-production remote environmentを作成してremote verificationを実施しPASSした。

- Worker: `taskchute-web-nonprod`
- URL: `https://taskchute-web-nonprod.taskfulness-sync.workers.dev`
- current Worker version: `22578f99-6256-4027-a345-ce523c67d241`（Settings v0.1 persistent nonprod verification）
- `AUTH_DB`: `taskchute-auth-nonprod` / `60085f8d-0c4e-4c15-98e9-3ce178398041`
- `APP_DB`: `taskchute-app-nonprod` / `6ad7e35f-5d03-4be3-9b00-46cd713a51c3`
- D1 location hint: `apac`
- jurisdiction: none
- observed placement: APAC; AUTH primary response HKG / APP primary response NRT
- remote migrations: AUTH `0001_better_auth_1_7_1.sql` PASS、APP `0001_runtime_bootstrap.sql`〜`0006_minimal_routine_r1.sql` PASS、pending 0
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

Production smokeは`NOT_RUN`。Product runtime overallは`NOT_VERIFIED`、Releasedは`NO`。

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
- Production smoke test: `NOT_RUN`
- Product runtime overall: `NOT_VERIFIED`
- Released: `NO`

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

First Server + Web vertical slice、D-023 bootstrap lifecycle security、persistent non-production config increment、D-038 B1/B3、D-039 B2、D-040 Minimal Routine R1はcurrent `main`でImplemented / Integratedまで完了済み。R1 persistent nonprod `0006` migration / preservation / deploy / authenticated general browserもPASS。

Day Table foundationは`docs/DESIGN.md`をcanonical UI targetとし、UI-1はcurrent `main`へImplemented / Integrated済みである。current visible orderは`実行 | Task | Project | Section | Routine | 見積 | 開始予定`で、独立した`状態` / `並び替え`列はなく、Task cell内pointer reorderと独立Routine列を持つ。UI-2以後にはBulk slot runtime、sticky / fixed-left final structure、Mode / Note / 開始見込 / fuller actual columns、column customization、Search / Filter、Section collapse、D&D等が残る。

Settings v0.1はcommit `51242b08e015817108010839cd5234959da2fed5`でcurrent `main`へImplemented / Integrated済みで、source review、local browser、persistent nonprod authenticated browser / integrityはPASSした。新しいProduct / Domain Decisionは追加しておらず、broader Project管理、Mode Settings、Sidebar resize / preference等を実装済みへ昇格しない。

Day Navigation v0.1はlocal reviewed commit `6f183c28242a1cd30211ea8e0c4f1e1dc23329bb`として実装済みで、D-041に従うprevious / next、custom calendar、Today return、keyboard navigation、未来日のnon-persistent preview / atomic planning establishmentと、D-042に従うpast unestablished record-none / read-only表示を含む。source review / local automated / signed-in general browser evidenceは`PASS`、logout → reloginのreal-browser subcase、persistent nonprod、productionは`NOT_RUN`。GitHub / remote integrationは未実施であり、future Routine preview、past historical correction、non-current DayのStart / Completeは引き続きscope外である。

UI-1のstructural prerequisite完了によりR2A Web workはその観点では再開可能になった。ただしD-034の`今回だけ / Routineへ反映`を永続化・command化する際のcross-field coupling等のMaterial Product semanticsは未決のままであり、このcurrent-state maintenanceはそれらをApprovedまたはimplementation-readyへ昇格しない。

R1後続scopeの選定 / R2AはDay Navigation v0.1の後続gateとして残る。real-browser controlled inclusive end-dateとdeployed non-null inclusive-date subcheckはtooling boundaryにより`NOT_VERIFIED`を維持し、productionは別gateとする。R1のmain integration完了をproduction verification / Product全体のVerified / Releasedへ自動拡張しない。

1. direct bootstrap POST / public signup remote POST、B1 real Japanese IME、B3 next-Day real-browser materialization、B3 remote raw console exact countは未検証の境界を維持する。
2. nonprod test data / session retention・cleanup policyは別Open Questionとして維持する。
3. production deployment strategy / production smoke contractは別途Material Decision / explicit approvalとして扱い、nonprod PASSを自動継承しない。
4. R1を越えるRoutine recurrence / override / projection、Documents / Review / Android等は別scopeとして維持する。

B1 / B2 / B3 / R1のpersistent nonprod remote PASSをproduction Verified / Product全体のVerified / Releasedと混同しない。R1はImplemented / Integrated / Local Verified / Persistent Nonprod Remote Verifiedだが、productionは`NOT_RUN`、Releasedは`NO`。
