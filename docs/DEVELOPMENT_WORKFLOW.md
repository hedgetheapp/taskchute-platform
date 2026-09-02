# Development Workflow

## 役割

### User — Product Owner / Final Decision Maker

Material Decision、およびProject Instructionsでユーザー判断が必要とされる操作を最終判断する。

Material Decisionの例:

- user-visible behaviorを意味ある形で変更する
- Domain semanticsを変更する
- persisted data / compatibilityへ影響する
- migrationを必要とする
- irreversible / destructiveである
- Security postureへ意味ある影響を与える
- 継続的なCostを意味あるレベルで増加させる
- 長期的に変更しづらいtechnology dependencyを追加する
- 既存Approved Decisionを変更 / 廃止する

### ChatGPT — PM / Architect / Canonical Docs Manager / Repository Coordinator

仕様整合、Decision整理、Acceptance criteria / Test contract、Codex指示、独立diff / evidence review、canonical docs管理、承認済みrepository操作、次work item整理を主担当とする。

### Codex — Implementation Engineer

codebase調査、implementation、bug fix、refactoring、automated test、build / static check、local / integration verification、finding報告、およびApproved scope内で許可されたGit / nonprod操作を主担当とする。

### Delegation rule

以下を満たす実装詳細は原則ChatGPT / Codexへ委任してよい。

- 既存Approved Decisionの範囲内
- reversible
- data compatibility / Security / Costへ重大影響がない
- 新しいMaterial Decisionを必要としない

Material Decisionに該当する場合はユーザー判断へ戻す。

## Governance / Rule hierarchy

Project Instructionsは、役割、Source of Truth、承認境界、Security / Safety等のGovernance / Policyを定義する。

`AGENTS.md`はAI Agentの入口、本書は具体的な開発運用を定義する。Product仕様 / Architecture / Decision / implementation / verificationの正本は各canonical docs / code / `TEST_MATRIX` / GitHub実状態とする。

Project Instructionsと本書に実質的な矛盾がある場合はProject Instructionsを優先し、矛盾を黙って残さない。

Governance / Policyを意味ある形で変更する場合はユーザー承認を必要とする。説明改善、誤字修正、参照先整理等の非Policy変更は通常docs maintenanceとして扱ってよい。

## 標準開発フロー

原則として以下のloopで進める。

1. repository / branch / HEAD / remote stateを確認する。
2. 関連canonical docsとcurrent code / `TEST_MATRIX`を読む。
3. Scope / Non-goals / Acceptance criteria / Test contractを定義する。
4. 未決事項がMaterial Decisionならユーザーへ戻し、そうでなければ既存Approved Decision内で解決する。
5. 必要なら実装前canonical docsを整合する。
6. Codex Task Contractを作成し、調査 → 実装 → test → verificationを進める。
7. ChatGPTがdiff / evidenceを独立reviewする。
8. Approved scope内の通常開発は、Project Instructionsの継続承認に従いcommit → fast-forward push → persistent nonprod verification → canonical docs maintenance / pushまで一気通貫で進める。
9. `TEST_MATRIX` / Risk / Open Question / CURRENT等をcurrent evidenceへ整合する。
10. 次work itemを整理する。

実装がSPECと異なるという理由だけで、SPECを自動的に実装へ合わせない。

Product / Domainを起点とするが、platform constraints、Security、performance、Cost、external service / API constraints、implementation feasibilityは早期に確認し、必要に応じて設計へfeedbackする。

## Canonical docsの責務と更新

同じ事実を複数canonical docsで独立管理しない。owner docを意識し、他docsでは必要な要約 / pointerに留める。

- `CURRENT` → 現在地点、直近変更、次work itemへの入口
- `PRODUCT` → Product vision / requirement
- `FEATURES` → Feature状態
- `SPEC` → Product / Domain behavior
- `ARCHITECTURE` → system構造・設計
- `DESIGN` → UI / visual / interaction target
- `DECISIONS` → Decisionと理由 / history
- `RISKS` → Risk
- `OPEN_QUESTIONS` → 未決事項
- `TEST_MATRIX` → verification requirementとcurrent evidence
- `COST` → Cost
- `MIGRATION_FROM_OBSIDIAN` → legacy migration / compatibility
- `CHANGELOG` → 変更概要

実装前は必要に応じて意図する仕様・設計を更新し、実装後は観測されたcurrent state / evidenceを更新する。

既に決定済みの内容やApproved scope内の事実を反映するdocs maintenanceは通常開発フローに含めてよい。Material Decisionを含むdocs変更は先にユーザー判断へ戻す。

## Codex Task Contract

複数step・実装・調査・verificationを伴う作業は原則Markdown Task Contractで渡す。

必要に応じて以下を含める。

- repository / target branch
- current Source of Truthへのpointer
- Background / Goal
- Scope / Non-goals
- canonical references / Approved Decisions / Domain rules
- Acceptance criteria
- Required tests / evidence
- Prohibited changes
- STOP conditions
- Git / nonprod operation boundary
- Required handoff
- model routing

Task Contractは仕様正本ではない。Codexは実行前にcurrent branch / HEAD / remote / canonical docsを確認し、矛盾時はcanonical docsを優先して報告する。

Task ContractだけでMaterial Decisionを新規確定しない。

## Codex Model Routing

Codexの利用量を抑えつつ品質を維持するため、通常は以下のroutingを使う。

### 基本方針

- 主実装担当は **Luna xhigh**。
- Solは常用せず、指定された難所だけ **Sol Medium**へescalateする。
- Terraは原則使用しない。
- Product / Domainの新しいMaterial DecisionはCodex内で決めずSTOPして報告する。

通常のTask Contract実行はspeed mode `Fast (1.5x)`を基本とし、主実装をLuna xhigh、探索・軽量実行をLuna Low〜Mediumへ配分する。品質・安全性・STOP条件の判定はspeed modeによって省略しない。

### Luna xhigh

主に以下を担当する。

- Task Contractに基づく通常実装
- UI / API / Worker実装
- automated test追加
- 明確なbug fix
- routineなrefactoring
- local verification
- 仕様が既に確定している範囲のdocs修正
- final source reviewの第一段階

### Luna Low〜Medium

軽量なread / execution作業は可能な限りこちらへ落とす。

- repository / relevant file探索
- canonical docs該当箇所抽出
- grep / git status / diffstat
- test実行
- build / typecheck
- test count / log収集
- read-only DB integrity確認
- mechanicalなdocs consistency check

### Sol Mediumへのescalation条件

以下の場合だけSol Mediumへescalateする。

- migration / schema設計の判断が必要
- concurrency / atomicity / retry / idempotencyが絡む
- auth / securityに関わる
- canonical docs間にMaterialな矛盾がある
- 原因不明のtest / browser / DB failure
- architecture上の複数案から選択する必要がある
- data compatibility / historical semanticsへ影響する可能性がある
- Lunaで安全に判断できない重要な曖昧さがある

運用上の注意:

- 単に不安だからSolへ上げない。
- Lunaで解決可能な実装・調査をSolに重複させない。
- Solへescalateする場合は、何が曖昧で、なぜLunaだけでは危険かを簡潔に示す。
- SolはMedium固定。High / xhigh等へ上げない。
- subagent数を増やすためだけの並列化をしない。
- 同じ調査を複数モデルで重複させない。
- final source reviewはLunaで一度行い、上記難所を含む場合のみSol Mediumでも該当箇所を確認する。
- ChatGPTによる独立diff / evidence reviewを後段で行う前提とし、Codex自身でProduct仕様を補完・変更しない。

Codexは開始時に、Luna xhigh / Luna Low〜Medium / Sol Medium候補の担当範囲を短く示し、確認待ちせず作業を開始する。

終了時に以下を報告する。

- Luna xhighが実施した作業
- 軽量Lunaが実施した作業
- Sol Mediumへのescalation有無と理由
- test / verification結果
- routingが問題なく機能したか

## Git / Nonprod Workflow

Git / nonprod操作はProject Instructionsの承認境界に従う。

ユーザーがwork itemの実施を承認し、既存Approved DecisionおよびTask Contractの範囲内なら、以下を個別承認へ分割しない。

- implementation commit
- `main`へのfast-forward push
- persistent nonprod backup / recovery validation
- Approved済みmigrationのpersistent nonprod適用
- persistent nonprod deploy
- persistent nonprod browser / API / DB verification
- evidenceに基づくcanonical docs commit / fast-forward push

write前には必ずbranch / HEAD / remote / relevant filesを再確認し、non-fast-forwardやunexpected remote changeを黙って上書きしない。無関係な変更を同じcommitへ混ぜない。

以下は通常開発の継続承認外であり、必要になった時点でSTOPする。

- 新規Material Decision / Approved Decision変更
- Task Contract開始時点で未承認のmigration / persisted schema変更
- destructive / irreversible operation
- backup restore / recovery実行
- production migration / deploy / data mutation
- branch creation
- PR creation / update
- merge
- tag
- Release
- Security postureへの意味ある変更
- 継続Costの意味ある増加
- 長期的technology dependency追加
- Materialなcanonical contradiction
- fast-forwardできないremote state / scope外変更

利用中のGitHub toolingの安全ルールは常に守る。

## Test / Evidence

以下を同一視しない。

- Implemented
- Integrated
- Tested
- Verified
- Released

変更内容とRiskに応じて適切なverificationを選ぶ。Evidenceには必要に応じてbranch / commit SHA / build / environment / device / procedure / observed resultを紐付ける。

過去PASSを現在状態へ無条件継承せず、変更と無関係なevidenceまで機械的にinvalidateしない。

**impact analysisに基づいて、影響を受けたverificationだけ再実施 / invalidateする。**

ユーザー環境でしか確認できないtestは実施まで`NOT_RUN`。対象外は`NOT_REQUIRED`等で明示する。

nonprod PASSだけでproduction Verified / Releasedへ昇格させない。

## Definition of Done

Feature / vertical sliceは実際に確認できたlevelまでを完了として扱う。変更内容に応じて必要な範囲で以下を満たす。

- implementation review
- appropriate automated tests
- required integration / device / migration verification
- canonical docs consistency
- `TEST_MATRIX` update
- remaining Risk / Open Question review

## Knowledge Promotion / Lifecycle

実装や調査から得たfindingを無条件に恒久ルールへ昇格させない。

将来のDecision / 実装 / testへMaterialなProduct事実、Risk、Open Question、test evidenceは適切なcanonical docへ残す。

複数作業へ適用する一般ルールへ昇格する場合はevidence / reuse value / scope / counterexample / stabilityを確認する。

- Product固有の仕様・設計知識 → SPEC / ARCHITECTURE / DECISIONS
- regression知識 → TEST_MATRIX
- legacy compatibility知識 → MIGRATION_FROM_OBSIDIAN
- 長期AI / 開発運用ルール → AGENTS / DEVELOPMENT_WORKFLOW

古くなったKnowledgeは必要に応じて`Deprecated` / `Superseded` / `Removed`として整理する。

## External Dependency / Destructive Change

外部service、SDK、API、pricing、quota、platform restriction等の変更され得る事実がMaterial Decisionへ影響する場合は最新情報を確認する。

destructive migrationやproduction data変更では、承認だけを安全対策の代わりにせず、backup / dry-run / validation / rollback or recovery plan / failure conditionを用意する。

## Handoff

チャット移行や大きな作業区切りでは、会話履歴を読み直さなくても再開できる程度のpointer + deltaを残す。

必要に応じて以下を含める。

- repository / branch / commit / PR
- current stateへのpointer
- 新たにApproved / SupersededとなったDecision
- 増減したOpen Question / Risk
- completed / incomplete work
- test state変更
- next work

既存Decision等の詳細をHandoffへ第二の正本として複製しない。
