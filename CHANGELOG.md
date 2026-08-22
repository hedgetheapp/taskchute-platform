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
