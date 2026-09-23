### Android move-success feedback / Routine enabled toggle corrective — 2026-09-23

- Todayの前日・次日・指定日MoveToDay成功時に永続成功文を表示しないようにし、既存のfailure / ambiguous / retryとMoveToDay semanticsを維持。
- Routineカードのenabled Switchを状態ラベル・accessibility付きで明示し、D-118どおり有効 / 無効へ統一。既存SetRoutineEnabled経路、編集、削除は不変。
- Implementation 3327d056a11ce99bb3d9d252330fbb40fb93c7a3、Today / Settings focused instrumentation各1 / 1 PASS、Android JVM / compile / assemble / diff-check PASS。
- Exact-SHA CI 35821183604 PASS、Web/Worker SKIP。APK artifact ID 10733521142。Galaxy S23はNOT_RUN、ProductionはNOT_RUN、ReleasedはNO。

# Changelog

## Unreleased
### D-134 Android Running Progress Player — 2026-09-23

- current DayのRunningTaskPanelを104dp progress playerへ置換。elapsed / remaining / progress / overrunはdisplay-onlyで、Completeは既存commandを再利用。Futureでは非表示、Pastはread-only。
- Implementation `419eb5a0a766c7837838f49fe45f5f4a731010d4`、RunningProgress `8 / 8`、Android JVM `168 / 168`、exact-SHA CI `35817804199` Android JVM / signed APK PASS、Web/Worker SKIP。artifact `taskchute-android-debug-419eb5a0a766c7837838f49fe45f5f4a731010d4` / ID `10732232016`。
- Today AVD全surfaceは`35 / 44`でpartial、Running panel focused / MainActivity / UI tree / crash bufferはPASS、final full Today rerunはNOT_VERIFIED。Galaxy S23は`NOT_RUN / PRODUCT_OWNER_MANUAL`、Productionは`NOT_RUN`、Releasedは`NO`。


### D-133 Android Routine full create / edit parity — 2026-09-22

- Android Routine Create / EditをTask名、Project、Mode、Section、開始予定、見積、繰り返し、開始日、終了日のfull formへ統一。Createは既存`CreateRoutine`の1回のatomic write、Scheduleは親Add / Saveまでlocal draft、`900` / `0900` / `09:00`はcanonical minuteへ正規化。
- Implementation `62d4d804db0683a6bc33cad0f4c4722212201fb0`、Worker focused `19 / 19`、Android Settings focused `18 / 18`、typecheck、debug assemble / instrumentation compile、exact-SHA CI `35725615763`、APK artifact `taskchute-android-debug-62d4d804db0683a6bc33cad0f4c4722212201fb0`（ID `10693353178`、expiry `2026-09-29T12:13:17Z`）はPASS。
- Persistent nonprod `taskchute-web-nonprod` deploy / guard / runtime / read-only DB safety PASS。Worker version `90d25052-a1f8-45e3-9f9f-6d12601265c3`。CUA kernel resetのためauthenticated Web / isolated QAはNOT_RUN、QA作成・cleanup・既存data mutationなし。schema / migration / dependency / Production操作なし。Galaxy S23は`NOT_RUN / PRODUCT_OWNER_MANUAL`、Releasedは`NO`。
### D-114 Android Routine create defaults corrective — 2026-09-22

- Android new Routine creation now carries the entered planned start and estimate through the existing atomic CreateRoutine request. The start minute resolves to exactly one current Routine Board Section; estimate minutes are stored as seconds. Title-only payloads remain backward compatible with null defaults.
- Worker focused 18 / 18, Android Settings focused tests, Web typecheck, debug APK / instrumentation compile, and exact-SHA CI 35708401799 (Android + Web/Worker) passed. APK taskchute-android-debug-a741a9562b885e1276e8011cfab735d5f5b5a556, artifact 10685921671, expiry 2026-09-29T09:08:13Z.
- Persistent nonprod taskchute-web-nonprod deploy / guard / runtime / read-only DB safety passed, Worker version 8de80f39-d1e3-47ef-810c-e5435b7cefa4. Authenticated Web and isolated QA were not run because the CUA helper was unavailable. No existing-data mutation, schema/migration/dependency change, or Production operation. Galaxy S23 is NOT_RUN / PRODUCT_OWNER_MANUAL; Released is NO.

### D-132 SetExecutionTimes actual-Section parity corrective — 2026-09-22

- Planned→Running / Completedの`SetExecutionTimes`でもactual startのSectionをserver-authoritativeに解決し、sectioned sourceを元Sectionに残す不整合を修正。cross-Sectionは既存placement CAS、atomic move・lifecycle / Execution作成、revision `+1`、same-Sectionはrevision不変、planned start保持、D-081 execution-first projectionを維持。
- Webはplanned actual-time requestへcurrent placement revisionを追加し、AndroidはCREATE / EDIT chainでsectioned Plannedを含め最新revisionを送信。新API route / command / schema / migration / dependency / optimistic persistenceは追加していない。
- Implementation `ea137da294dc7f7e239228dca49bacc2ff8150f8`、Worker focused `7 / 7`、Web App `298 / 298`、Android focused repository test、typecheck、exact-SHA CI `35683758984` rerun、persistent nonprod deploy/runtime/DB safetyはPASS。Worker version `73378404-e353-4aeb-b36d-3eafe7de3204`。Authenticated Web QAはCUA session unavailable、Galaxy S23 / Production / Releasedは`NOT_RUN / NOT_RUN / NO`。

### D-131 Section current/future reconciliation — 2026-09-22

- Section configuration update now reconciles current and already-established future Day contexts to the latest Section configuration while preserving established past Day history and avoiding materialization of unestablished future Days.
- Planned starts are re-derived through the canonical `[start, end)` Section intervals; `Sectionなし` remains paired with a null planned start. Routine-derived entries retain the D-043 pair, and running/completed entries preserve lifecycle and execution facts while using a surviving adjacent Section when their prior Section is removed.
- Each affected Day advances `placement_revision` exactly once per successful update, exact operation replay is idempotent, ordering uses the existing canonical tie-break, and the update remains atomic through existing assertion / operation semantics.
- Implementation `fb0d0542d4509912aaaa4e5e306ad65a395cc241` is covered by focused Worker evidence (`63 / 63` PASS), additional Section interval / B3 / Day Navigation coverage (`38 / 38` PASS), typecheck, and `git diff --check`. Exact `main@63174582...` passed the canonical nonprod build/deploy guard and was deployed to `taskchute-web-nonprod` as version `cb6f27b7-d9b8-4a4b-a2fb-c18c782c9dcf`; runtime/DB safety passed. Authenticated Web verification was `AUTHENTICATED_BROWSER_NOT_RUN`, production is `NOT_RUN`, and Released is `NO`.

### Android Today actual-time prefill / Running projection / consecutive Quick Add corrective

- Running / Completed editorの実績時間prefillを、compact入力parserとは分離したISO Execution instant formatterへ修正。`editor.day.establishmentTimezone`で`HH:mm`へ変換し、端末timezoneをauthorityにしない。
- Plannedの開始時間のみ保存は、既存`SetExecutionTimes` contractの`ended_at: null`でRunningへ遷移する経路をfocused regressionで固定。Running rowの開始・終了見込みはD-130どおりcanonical actual startとfull estimateから投影し、estimateなしでは開始だけを表示する。
- consecutive Quick Addは、Add / planned-start成功応答の最新`placement_revision`をmemory-onlyで記憶し、次のCREATEとstale conflict後のRetryへ再適用。CASを弱めず、409を成功扱いしない。
- 変更前artifact `a42862aa0b274f828d6426cbd16a7511d1ba5cc8`のGalaxy S23 evidenceは、actual-time prefill、Running projection `--:--`、consecutive Quick Addをそれぞれ`FAIL / USER_REPORTED`として記録。correctiveのGalaxy S23は`NOT_RUN`、Productionは`NOT_RUN`、Releasedは`NO`。
- Implementation `94b3a57437ae6d908d2c038ebb8f4c6ca31ac566`、local Android JVM `149 / 149`、instrumentation compile、debug assemble、`git diff --check`、exact-SHA CI `35597482215`はPASS。Web / WorkerはAndroid-only classifierでSKIP。fresh APK artifactは`taskchute-android-debug-94b3a57437ae6d908d2c038ebb8f4c6ca31ac566`（ID `10637282407`、expiry `2026-09-28T12:07:39Z`）。

### Android lifecycle editor / current-Day delete / placement guard / forecast parity

- Current logical Dayのordinary Planned / Running / Completed editor capabilityを実装し、`SetExecutionTimes`、D-116A historical Project / Mode、compact actual-time parserを既存contractへ接続。
- current-Day Running / Completed単体削除を既存`DeleteCompletedEntry` route / DTO / operationへ接続。D-067 Completed semantics、D-128 Running guard、Task / Project / Mode / Routine identity保持、atomic deleteを維持。
- D-129のcanonical Section `actual_end_instant` guardをAndroid D&D preview / dropとWorkerのentry planning / bulk moveへ適用し、ended Sectionを新規manual placementから除外。
- Androidの開始・終了見込みをWeb Start Forecast相当へ整合し、見積・実績durationを総分数表示へ統一。Header DatePickerとTask Actions DatePickerを共有化し、RunningTaskPanelを72dp内で上下中央揃え。
- Android JVM `149 / 149`、full Worker `37 files / 341 tests`、full Web `14 files / 478 tests`、typecheck、instrumentation compile、debug assembleはPASS。authenticated runtime、Galaxy S23、persistent nonprod destructive delete E2E、production、Releaseは未確認。

### D-127 Android Drag Immediate-Cancel Corrective

- `TodayTaskRow`のvertical long-press drag ownerをouter stable Boxの`rowDragGestureModifier` 1個へ限定。inner Task content Columnに残っていた二重`pointerInput`を削除し、horizontal swipeは維持する。
- placeholder切替時にinner visualがcompositionから外れても、outer gesture hostが同一pointer sequenceを保持し、long-press後のmove / dropをcancelしない構造へ修正。
- Artifact `aaa372086dd5e533ca5d0e32664bfa0c254490ce`のGalaxy S23 immediate-cancelは`FAIL / USER_REPORTED`として履歴保持。新corrective artifact `b46d10ff5231a3d08157bea16ffb26b523420624`はProduct OwnerのGalaxy S23確認で`PASS / USER_REPORTED`。AVD runtimeは`NOT_RUN / HUNG`、productionは`NOT_RUN`、Releaseは`NO`のまま。

### D-127 Android Drag Reorder Regression Corrective

- 前版でsource Entryをsynthetic placeholderへ置換した際にdrag gesture ownerがcompositionから消え、drop commandが送信されないregressionを修正。provisional previewは実source Entryを同じ`task.id` stable keyのままtarget位置へ移動し、そのrowだけをteal placeholder visualとして描画する。
- gesture host / `pointerInput`をsource rowの外側で維持し、lifted overlayだけにpointer deltaを適用。same-section / cross-section / empty / Completed-only Section / cancelの既存placement semantics、既存command、server authorityは維持する。
- Artifact `3f4bb61fc37af76f2ff6699a456aceba75533fbb`のGalaxy S23 drag failureは`FAIL / USER_REPORTED`として記録。今回のcorrectiveのGalaxy S23、AVD runtime、screenshot comparison、production、Releaseは未確認。

### D-127 Android Quick Add focus / drag targeting / transient feedback corrective

- Quick AddのProject / Mode / Section pickerが明示的にfocus ownerとなり、Task名fieldのinitial focusを奪い返さないよう修正。picker操作時はtext IMEを閉じる。
- drag中のprovisional presentationをsource rowのtarget移動から、source除去 + 独立placeholder + pointer-following lifted overlayへ変更。Completed / Routine-derived rowはanchorにせず、completed-only / empty Sectionは既存Section-only planned-tail semanticsへ委譲する。
- deterministic operation failureだけをgeneration token付きのtransient feedbackとし、AccessibilityManagerの推奨timeout後に同一failureだけをdismiss。ambiguous / auth / full-screen load failureはD-125どおり維持。
- `TodayDirectManipulationTest` / `TodayOptimisticTest` focused JVM 26 tests、Android-test compileはPASS。今回のcorrectiveのGalaxy S23、AVD runtime、screenshot comparison、production、Releaseは未実施。off-screen auto-scrollは追加していない。Worker/API、schema、migration、dependency、D-127 semanticsは変更なし。

### D-127 Android Today device-findings corrective

- Galaxy S23で報告されたD-127の5件（Quick Add focus reclaim、optimistic edit/lifecycle flicker、drag provisional-order oscillation、Completed actual metadataの開き括弧欠落）をsource-level correctiveとして修正。
- CREATEの初期focusをopen session単位へ限定し、成功後のoptimistic overlayを対応するsilent canonical reconcileまで保持。Realtime invalidationはoptimistic mutation中に表示へ割り込ませない。
- drag hit-testはdrag開始時のgeometry snapshotを使い、provisional animation自身がtarget判定を反転させない。Completed actual metadataは開き括弧を独立した非clip要素として表示。
- 旧artifact `taskchute-android-debug-2c6c272b5b0897a9d00ad6d8ff47d44b42d31098` はGalaxy S23 `FAIL / USER_REPORTED`。今回のcorrective artifactは実機 `NOT_RUN`、screenshot comparison / production / Releaseは未実施。Worker/API、schema、migration、dependency、D-127 semanticsは変更なし。

### D-127 Android Today local-feel / motion corrective

- Quick AddのTask名・開始予定・見積を48dp compact fieldへ整合し、CREATE時のTask名focusとCancelのsingle-line表示を追加。
- Task drag中の仮Entry順序をstable keyとCompose item placement animationで表示し、canonical Dayはdropまで変更しない。
- Task add / edit / reorder / placement / start / completeをmemory-only optimistic presentationで即時反映し、成功後はvisible `REFRESHING`なしのsilent canonical reconcileへ接続。
- Today Task Noteの本文をBasicTextFieldへ置き換え、`Markdown`ラベルを除去。NotesControllerのautosave/CAS/conflict/ambiguous retry semanticsは維持。
- D-127実機、Galaxy S23、authenticated screenshot、production、Releaseは未確認。Worker/API、schema、migration、dependencyは変更なし。

### D-121 Android Today Figma parity bundle corrective

- Quick Addのcurrent/future visibility、canonical timezone由来の初期Section、候補ロード中disabled、`900` / `0900`を含む`HH:mm`正規化を整合。
- Selection footer、Task Note Today Bottom Sheet、Swipe / Task Actions、Running panel、Drag feedback、Task Row metadataのFigma差分を修正。
- Task Primary NotesControllerのautosave/CAS/ambiguous retry/safe flush、Future/Past、D&D、lifecycle semanticsを維持。成功deleteの通知だけ抑止。
- Android JVM、instrumentation compile、debug assembleはPASS。authenticated runtime、physical device、screenshot comparisonは未実施。

### D-100 Executable Development Workflow

- `apps/web`へauthoritative `preflight`、明示surface必須の`verify:fast` / `verify:standard` / `verify:heavy`、per-step timing artifact、保守的な`evidence:summary`を追加。既存profile policy、persistent/manual evidence分離、production禁止は変更しない。

### D-072 Mode Settings management

- Mode Settingsへcurrent-tab title search、`使用中` / `アーカイブ` tab、archive / restore、確認付きhard deleteを追加。
- archived Modeは新規assignment候補から除外し、既存assignmentの表示、clear、activeへのreplaceを維持。
- Mode deleteはlive relationだけをclearし、Task / Entry / Execution / historical snapshot / Day placementを保持するAPP `0022_mode_archive_delete.sql`を追加。
- 検索やtabで絞り込まれたreorderでもcanonical full orderを維持し、archiveは位置を保持、delete後だけpositionをcompact。
- local focused / migration / full regression、persistent nonprod APP `0022` migration、authenticated browser search/archive/restore/delete E2E、DB integrityはPASS。承認済み使い捨てD072 fixtureだけをhard deleteし、planned live relation clear、completed snapshot retention、Task/Entry/Execution retention、board compaction/revisionを確認した。production / restore / AUTH migration / tag / releaseは未実施。

### Bootstrap

- Obsidian依存から独立したTaskChute Platform repositoryを初期化。
- Server-centricなtarget architectureを記録。
- single-user / multi-deviceの初期scopeを記録。
- Web appをprimary / universal clientかつinitial development priority最優先とする方針をApprovedとして記録。
- Androidをnative first-class client、Wear OS / Pixel Watchをcompanion target、native iOS appをfuture / low priorityとするclient strategyを記録。
- Markdown-nativeなNotes/Documents方針を記録。
- Notes/Commentsで共有するAttachment capability要件を記録。
- legacy Obsidian repositoryをsemantics / migration / regression knowledgeのreferenceとして扱う方針を記録。
- Project Instructions、`AGENTS.md`、`DEVELOPMENT_WORKFLOW.md`のAI開発Governanceを整合。
- canonical docsを日本語ベースへ整理し、doc ownerとDecision状態の不整合を修正。
- Androidをoffline-capableとする方針、およびStart / Completeのretry safetyをApprovedとして記録。
- First vertical sliceをServer + Web + browser reload recovery中心へ更新。

### Core Domain / Architecture design

- D-013を`Proposed`からApproved Server + Web First vertical sliceへ昇格し、async Web mutation、Start / Complete、active Execution max 1、Next Entry、reload recoveryをimplementation contractとして確定。
- Task / Entry / Execution、Project、Section、RoutineDefinition / RoutineOccurrenceのCore Domain foundationをApprovedとして整理。
- Entry identityをTaskChuteDay / Section移動で維持し、ordering authorityをEntry identityとする方針を確定。
- RoutineOccurrenceのorigin TaskChuteDayをEntry延期後も保持し、actual execution dayと区別できる方針を確定。
- configurable TaskChuteDayをcivil dateと分離し、canonical timezone + DayBoundaryPolicyによるcontinuous `[start, end)` intervalとして整理。
- DayBoard / Calendar / Timeline / Review / MapをDomain / historical factsからのprojectionとして整理し、過去historyのretroactive reclassificationを避ける方針を確定。
- Task / Project Primary Documentとoptional RoutineOccurrence Documentのfoundationを追加。
- planned Placeとobserved Execution Locationを分離し、Start / Complete location captureをoptional / best-effortとする将来拡張方針を追加。
- Web initial stackとしてReact + Vite SPA、Server APIとしてCloudflare Workers、structured persistenceとしてCloudflare D1をApproved。
- Native clientはWeb React codeの直接流用を前提とせず、Android / Wear OSはKotlin + Compose、native iOSはSwift + SwiftUIを第一候補とする方針を記録。
- APIをconceptual Command / Queryへ分離し、client-issued mutationのlogical operation identity、placement revision、silent last-write-wins禁止、atomic command原則を追加。
- Better AuthをTaskChute Serverのinitial application authとして採用し、email/password、secure browser session、public signup disabled、auth identityとTaskChute app user identityの分離を確定。
- D1 exact transaction / constraint strategyを本runtime前にlocal + remote concurrency / atomicity spikeで検証するGateを追加。
- D1 spike用`D1-SPIKE-01`〜`D1-SPIKE-08`をTEST_MATRIXへ追加し、未実施evidenceを`NOT_RUN`として記録。
- D1 feasibility spikeをcurrent harnessでlocal D1とtemporary remote D1の両方に対して実施し、`D1-SPIKE-01`〜`D1-SPIKE-08`のPASS evidenceを取得・reviewした。
- local test runnerのport / persisted state共有によるfixture干渉を特定してrun単位隔離へ修正し、reorder concurrency contractはHTTP winner・stored result・final D1 orderの一致まで検証するよう強化した。
- D1 `batch()` + conditional SQL + database constraintsによるatomicity / concurrency / idempotency strategyのfeasibilityをVerifiedとした。exact production schema / migration SQL / command-specific algorithm / infrastructure failure reconciliationは実装incrementごとに確定・reviewする方針とした。

### Runtime foundation decisions

- D-023をApprovedし、initial-user bootstrapを通常runtimeではdisabled、explicit modeがexact `"true"`の場合だけavailableとするlifecycleを確定。enabled中もtoken必須とし、provisioning後はmode disable + token remove / rotateを要求する。
- D-022をApprovedし、initial runtimeで新規作成するentity IDをUUIDv7のopaque identityとする方針を確定。ID timestampをDomain ordering authorityには使用しない。
- First sliceのSectionをuser-global stable entityとし、APP persistence baselineをapp user / auth mapping / settings / Project / Section / TaskChuteDay / Task / Entry / Execution / operationの最小stable-reference modelとして確定。
- initial bootstrapではIANA timezone、TaskChuteDay boundary、initial Sectionsを明示入力し、暗黙のProduct defaultを適用しない。DST ambiguous / nonexistent local timeはTemporal-compatibleな`compatible` semanticsで扱う。
- initial userをoperator-only one-shot bootstrapで作成し、public signupをbootstrap中も有効化しない方針を確定。bootstrapはAUTH_DB / APP_DB partial failureからrecoverableにする。
- initial browser sessionをrolling 7日 / update threshold 1日とし、same Worker内でseparate `AUTH_DB` / `APP_DB` D1 bindingsを利用するphysical boundaryを確定。
- `FEATURES.md`のD1 concurrency / atomicity spike statusをcanonical evidenceに合わせて`Verified`へ修正。

### Runtime bootstrap implementation

- `BOOTSTRAP_ENABLED` gateをrequest body parseより前へ追加し、missing / disabled / invalid modeとtoken不備をinformation disclosureのない404 postureに統一。mode / token / partial-failure recovery / public signup regressionをlocal automated testへ追加。
- PR #3でFirst production runtime bootstrap sliceを`main`へmerge。
- React + Vite SPAとCloudflare Worker runtime scaffoldを追加。
- Better Auth `1.7.1`をexact pinし、public signup disabled、operator-only bootstrap、rolling 7日 / update threshold 1日sessionを実装。
- same Worker内にseparate `AUTH_DB` / `APP_DB` D1 bindingsを実装し、Better Auth subjectからstable TaskChute `app_user_id`へmappingするPrincipal境界を追加。
- bootstrapをAUTH_DB / APP_DB partial failureからrecoverableにし、secret / passwordをtracked fileや通常logへ残さない運用を実装。
- explicit IANA timezone / TaskChuteDay boundaryからcurrent logical dayをresolve / materializeし、actual intervalとestablishment contextを保存。
- DST nonexistent / ambiguous boundaryをTemporal-compatible `compatible` semanticsで処理し、actual resolved boundary instantでday membershipを判定。
- CreateProjectとAddTaskToDayを実装し、Task / Entry separate UUIDv7 identity、optional Project relation、explicit Entry positionをAPP_DBへ保存。
- logical operation replay、different-semantic operation-ID misuse rejection、request fingerprint version 1、placement revision conflict protectionを実装。
- unexpected infrastructure failureをdeterministic Domain rejectionへ誤保存せず、canonical Query + same-operation retryへreconcileできるfailure pathを実装。
- same-operation concurrent raceがstored winner resultへ収束するようrejection persistence raceを修正し、owner-scoped temporary guard / assertionを追加。
- Web DayBoardでlogin/logout、Project作成、Task + Entry追加、pending feedback、canonical refetch、browser reload recoveryを実装。
- local evidenceとしてWorker / D1 34件 + Web 7件 = 41件PASS、typecheck / production build / fresh local migrations / FK checks PASSを取得し、implementation bundle / GitHub PR diff reviewもPASS。
- remote D1 Product runtime verification、deployed Worker verification、production verificationは未実施のまま。

### Runtime lifecycle / ordering implementation

- PR #5でFirst Server + Web vertical sliceのlifecycle / ordering incrementを`main`へmerge。
- `0002_lifecycle_ordering.sql`でExecution persistence、lifecycle operation support、既存operation rowを保持するmigrationを追加。
- `executions`へuser-wide active Execution最大1をenforceするpartial UNIQUE indexを追加。
- ReorderEntriesを実装し、TaskChuteDay-level `placement_revision`によるstale conflict rejection、same-operation replay、misuse rejection、atomic rollbackを実装。
- ReorderをEntryごとのUPDATEから`json_each`を利用するset-based updateへ変更し、200 Entryの未承認capを削除。mutation batch statement数をEntry数から分離した。
- StartEntryを実装し、planned EntryのみStart、exactly one active Execution、別active Execution時no implicit interrupt、same-operation retry safetyを実装。
- CompleteEntryを実装し、running Entryとactive Executionを終了、first `ended_at` preservation、same-operation retry safetyを実装。
- Start / Completeは`placement_revision`を変更しない。
- current projectionへactive Executionとlifecycle-aware Nextを追加し、Next以外のplanned Entryもactive ExecutionがなければStart可能にした。
- TaskChuteDay境界をまたぐactive Executionを分割せず保持し、current DayBoard外のEntryに属するExecutionもWebからComplete可能にした。
- Webへmove up/down、Start、Complete、pending / conflict reconciliationを追加。
- ambiguous Reorder / Start / Completeは元operation専用Retryとclient-side Discardを表示し、retained operation中はunrelated mutationから旧operationを暗黙再送しないようguardを追加。
- 64 Entry set-based Reorder、stale conflict replay、cross-owner Reorder、Next advancement、cross-day active Execution、HTTP lifecycle routes、path/body mismatch、ambiguous Retry / Discard等のcoverageを追加。
- current local evidenceをWorker / D1 49件 + Web 18件 = 67件PASSへ更新。`npm ci`、typecheck、production build、fresh migrations、existing operation upgrade、FK checks、active Execution index、`git diff --check`もPASS報告。
- source-only reviewで初回3 blockerを検出・修正後に再review PASS、GitHub PR #5 diff reviewもPASS。
- remote D1 Product runtime verification、deployed Worker verification、deployment / production smokeは引き続き`NOT_RUN`。Implemented / Integrated / local TestedをVerified / Releasedへ自動昇格しない。
