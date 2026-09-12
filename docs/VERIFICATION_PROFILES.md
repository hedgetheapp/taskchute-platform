# Verification Profiles

## Purpose

TaskChute Platformのverification品質を維持したまま、変更と無関係なtest / build / persistent nonprod verificationの反復を減らす。

本書は`docs/DEVELOPMENT_WORKFLOW.md`の`impact analysisに基づいて、影響を受けたverificationだけ再実施 / invalidateする`原則を具体化する。

Verification Profileは**最低検証ライン**であり、test省略の権利ではない。impact analysis、実装中のfinding、failure、不確実性により必要なら必ず上位profileまたは追加verificationへ昇格する。

## Executable helpers (D-100)

以下の`apps/web` commandは、既存profileを自動決定するauthorityではなく、選択済みprofileのcommon automated coreを実行するhelperである。

- `npm run preflight`はGitHub `origin/main`をfetchと直接参照で更新確認し、branch / HEAD / upstream / ahead-behind / dirty paths / optional base comparison / risk signalsを表示する。remote refreshが成立しない場合は失敗する。`--offline`は非authoritative inspectionとして明示される。
- `npm run verify:fast|standard|heavy -- --surface web|worker|cross|migrations|docs`はaffected surfaceを必須にし、surfaceに応じたfull Web / Worker-D1 suite、typecheck、build、diff checkを実行する。migrationsはmigration verificationも含む。HEAVY固有のmigration / recovery、persistent nonprod、API、browser、DBは別途残る。
- `--nonprod-static`はexact nonprod build、既存`verify:nonprod-deploy` guard、Wrangler dry-runだけを追加し、実deployは行わない。
- `npm run evidence:summary`は最新のignored timing artifactと現在Git stateをMarkdown-styleで表示する。manual / persistent evidenceの既定値は`NOT_RUN`であり、explicit stateも許可値だけを受け付ける。canonical docsは自動編集しない。

helperのPASSはautomated coreのPASSに限る。未実施のbrowser / persistent nonprod / API / DBをPASS扱いしない。`NOT_REQUIRED`はsource reviewでruntime / boundary非影響を確認した場合だけ付与する。profile policy、impact analysis、evidence reuse、escalationのauthorityは本書と`DEVELOPMENT_WORKFLOW.md`に残る。

## Quality invariants

Profileに関係なく以下を維持する。

- Product / Domain / Approved Decisionをtest削減のために変更しない。
- 変更されたbehaviorにはdeterministicなfocused testを置く。
- 変更したpackage / boundaryの既存regressionを再実施する。
- source reviewで実際のimpact surfaceを確認してから`NOT_REQUIRED`を付ける。
- failure原因が不明なままtestを除外・skipしない。
- 実施していないpersistent nonprod / browser / device verificationをPASS扱いしない。
- `Implemented` / `Integrated` / `Tested` / `Verified` / `Released`を混同しない。
- Security / destructive / production / approval boundaryはprofileで弱めない。
- Task Contract開始後にimpactが広がった場合、開始時profileへ固執せず昇格する。

## Profile selection

最初に変更予定fileだけで決めず、関連code / canonical docs / call path / shared contractを短く調査してprofileを選ぶ。

### FAST

対象:

- isolated CSS / layout / visual corrective
- copy / aria label / minor presentation change
- isolated Web component behaviorで、global keyboard、async coordination、shared contract、Worker/APIへ影響しないもの
- Approved Decision内の小さくreversibleなcorrective

FASTへ入れてはいけない例:

- document / window capture listenerやglobal shortcut変更
- cross-row / cross-component focus authority
- async reconcile / pending state coordination
- mutation queue / retry / concurrency
- `apps/web/src/shared`等のcross-layer contract変更
- Worker/API/persistence/auth/security/migration

最低verification:

- changed behaviorのfocused automated test
- **affected packageのfull suite**。Webだけがaffectedならfull Webを維持する
- relevant typecheck / normal build
- source review / `git diff --check`
- visual / interaction変更は必要なbrowser evidenceを定義する

非affected package:

- source reviewでboundary非影響を確認できた場合のみ`NOT_REQUIRED`
- 例: CSS-only / Web-local correctiveでWorker/D1を変更せずshared contractも触れない場合、full Worker/D1は`NOT_REQUIRED`としてよい

Persistent nonprod:

- immediate verificationが必要なwork itemでは通常どおり実施する
- 同一surfaceの小さなFAST correctiveをまとめてaggregate nonprod verificationしてもよい
- batchする場合、各work itemはそれまで`PERSISTENT_NONPROD_NOT_RUN` / browser `NOT_RUN`のまま保持し、Verifiedへ昇格させない
- 次work itemの設計・判断が未検証browser behaviorへ依存する場合はbatchせず先にverificationする
- aggregate verification前に累積diffへ改めてimpact analysisを行う

### STANDARD

対象:

- 新しいuser-visible Web feature
- keyboard / focus / navigation behavior
- global document/window event ownership
- 複数component間のstate coordination
- async pending/reconcileを含むが、persistence / queue / retry semantics自体は変更しないもの
- reversibleなcross-component UX change

代表例:

- D-099のようなHit-a-Hint / global shortcut interaction
- focus ownershipを複数surfaceで調整する変更

最低verification:

- behavior-specific deterministic tests
- affected packageのfull suite
- neighboring interaction regression
- relevant typecheck / build
- source review / `git diff --check`
- user-visible interactionならpersistent nonprodのrepresentative browser verificationを原則実施
- deployする場合はexact nonprod build / deploy guard / required dry-run / API safety checksを実施

Worker/D1:

- Web-localでshared contract / Worker/API call semanticsを変更していないことをsource reviewで確認できれば`NOT_REQUIRED`
- shared contract、request/response shape、Worker behaviorへ触れた時点でcross-layer verificationへ昇格する

### HEAVY

対象:

- Worker / API semantics
- shared cross-layer contract変更
- persisted data / schema / migration
- auth / security
- mutation queue / dependency graph
- retry / ambiguous outcome / idempotency / concurrency / atomicity
- historical compatibility / frozen snapshot semantics
- destructive operation
- external dependency追加または長期dependency変更
- 原因不明のintegration / browser / DB failure

最低verification:

- focused tests
- full affected suites。cross-layerなら通常Web + Worker/D1双方
- integration / migration regression as applicable
- typecheck / build / exact nonprod build / deploy safety gates
- persistent nonprod API / browser / DB evidence as applicable
- migrationならbackup / recovery validation等、current workflowのhard gate
- required integrity probes
- relevant canonical docs / TEST_MATRIX evidence update

HEAVYは時間短縮を理由にFAST / STANDARDへ降格しない。

## Automatic escalation

以下を発見した場合は少なくともSTANDARDへ昇格する。

- global keyboard / focus / pointer capture
- 複数surfaceのfocus ownership
- async canonical reconcileとUI intentの競合
- app navigation / routingを跨ぐinteraction
- impact範囲が開始時調査より広い

以下を発見した場合はHEAVYへ昇格する。

- mutation queue / retry / ambiguous outcome / concurrency / idempotency
- Worker/API behavior変更
- persisted schema / migration / compatibility
- auth / security
- destructive / irreversible semantics
- shared contract変更がWebとWorker双方へ波及
- 原因不明のfailureで安全な影響範囲を確定できない

昇格は失敗ではない。品質を維持するための通常動作として扱う。

## Affected-package rule

`full suite`はrepository全体の全suiteを機械的に意味しない。

- Web-local implementationのみ → Web packageがaffected
- Worker-local implementationのみ → Worker/D1側がaffected
- shared contracts / API boundary → Web + Worker/D1がaffected
- schema / migration → migration + Worker/DB boundaryがaffectedし、必要に応じてWebも追加

`NOT_REQUIRED`は「実行時間を短くしたいから」ではなく、source reviewで非影響を説明できる場合だけ使う。

## Persistent nonprod batching

FAST correctiveではpersistent nonprodのbatch verificationを許可する。ただし品質上の条件を満たすこと。

- 各changeはlocal automated / affected full suite / static gateをPASSしてmainへintegration済み
- batch中の各changeはpersistent evidenceをPASSへ昇格しない
- aggregate deploy前にmainの累積diff / affected behaviorを再確認する
- representative browser scenariosはbatch内の各changed behaviorをcoverする
- failure時はどのchangeが原因か切り分け、未確認項目をPASS扱いしない
- migration / auth / security / queue / retry / concurrency / destructive operationはbatch目的でFAST扱いしない

STANDARD / HEAVYは原則work item単位でpersistent nonprod verificationする。合理的理由がある場合だけimpact analysisとTEST_MATRIXへ明示してbatchする。

## Task Contract compression

Task Contractは共通workflowを毎回全文複製しなくてよい。

Task Contractには原則として以下を記載する。

- verification profile (`FAST` / `STANDARD` / `HEAVY`)
- profileを選んだimpact analysisの短い理由
- work-item固有のAcceptance criteria
- work-item固有のfocused tests / browser scenarios
- profile標準から追加・除外するverificationと理由
- MaterialなSTOP条件またはそのwork item固有のSTOP条件
- current Source of Truth pointer

Git / nonprod approval boundary、production禁止、一般的なworkflow、model routing等は`DEVELOPMENT_WORKFLOW.md` / Project Instructionsを参照し、Task Contractへ機械的に全文再掲しない。

ただし、work item固有の危険な操作や通常境界からの例外は必ず明示する。

## Evidence / handoff

Handoffには少なくとも以下を残す。

- selected profile
- actual affected surface
- profile escalationの有無と理由
- 実行したfocused / full affected suites
- `NOT_REQUIRED`としたsuiteとsource-review根拠
- persistent nonprod / browser / DBの実施状態
- final classification

Profile名だけで`Verified`を主張しない。`TEST_MATRIX`とcurrent evidenceが最終authorityである。
