# Changelog

## Unreleased

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
- D1 `batch()` + conditional SQL + database constraintsによるatomicity / concurrency / idempotency strategyのfeasibilityをVerifiedとした。exact production schema / migration SQL / command-specific algorithm / infrastructure failure reconciliationは引き続き実装設計として未確定。

### Runtime foundation decisions

- D-022をApprovedし、initial runtimeで新規作成するentity IDをUUIDv7のopaque identityとする方針を確定。ID timestampをDomain ordering authorityには使用しない。
- First sliceのSectionをuser-global stable entityとし、APP persistence baselineをapp user / auth mapping / settings / Project / Section / TaskChuteDay / Task / Entry / Execution / operationの最小stable-reference modelとして確定。
- initial bootstrapではIANA timezone、TaskChuteDay boundary、initial Sectionsを明示入力し、暗黙のProduct defaultを適用しない。DST ambiguous / nonexistent local timeはTemporal-compatibleな`compatible` semanticsで扱う。
- initial userをoperator-only one-shot bootstrapで作成し、public signupをbootstrap中も有効化しない方針を確定。bootstrapはAUTH_DB / APP_DB partial failureからrecoverableにする。
- initial browser sessionをrolling 7日 / update threshold 1日とし、same Worker内でseparate `AUTH_DB` / `APP_DB` D1 bindingsを利用するphysical boundaryを確定。
- `FEATURES.md`のD1 concurrency / atomicity spike statusをcanonical evidenceに合わせて`Verified`へ修正。

### Runtime bootstrap implementation

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
- remote D1 Product runtime verification、deployed Worker verification、production verificationは未実施。Reorder / Start / Complete / Execution runtimeは次increment。
