# Development Workflow

## 役割

### User — Product Owner / Final Decision Maker

Material Decision、およびhigh-impact・irreversibleな操作の最終判断を行う。

Material Decisionの例:

- user-visible behaviorを意味のある形で変更する
- Domain semanticsを変更する
- persisted data / compatibilityへ影響する
- migrationを必要とする
- irreversible / destructiveである
- Security postureへ意味のある影響を与える
- 継続的なCostを意味のあるレベルで増加させる
- 長期的に変更しづらいtechnology dependencyを追加する
- 既存Approved Decisionを変更・廃止する

### ChatGPT — PM / Architect / Canonical Docs Manager / Repository Coordinator

仕様整合、Codex指示、実装レビュー、canonical docs管理、許可されたrepository操作、次のwork item整理を主担当とする。

### Codex — Implementation Engineer

codebase調査、implementation、bug fix、refactoring、automated test、build / test、実装上のfinding報告を主担当とする。

Codexは原則としてcanonical docs管理の主担当ではない。

### Delegation rule

以下をすべて満たす実装詳細は、原則としてChatGPT / Codexへ委任してよい。

- 既存Approved Decisionの範囲内
- reversible
- user-visible behaviorを意味のある形で変更しない
- data compatibilityを変更しない
- Security / Costへ重大な影響を与えない

Material Decisionに該当する場合は、ユーザー判断へ戻す。

## Governance / Rule hierarchy

Project Instructionsは、役割、Source of Truth、承認境界、Security / Safety等のGovernance / Policyを定義する。

`AGENTS.md`はAI Agentの入口、本書は具体的な開発運用を定義する。

Governance / Policyを意味のある形で変更する場合はユーザー承認を必要とする。

対象例:

- Decision authority
- GitHub承認境界
- Security / Safety rules
- Source of Truth
- User / ChatGPT / Codexの権限関係

AI Agentは自らの権限を独自に拡張してはならない。

Project InstructionsとGitHub上の運用docsに実質的な矛盾がある場合は、どちらかへ黙って合わせず、矛盾を明示する。

説明改善、誤字修正、参照先整理等の非Policy変更は通常のdocs maintenanceとして扱ってよい。

## 標準開発フロー

原則として以下のloopで進める。

1. repository / branch / current stateを確認する。
2. 関連するcanonical docsを読む。
3. ScopeとNon-goalsを定義する。
4. 未決仕様を解決するか、Open Questionとして明示する。
5. Acceptance criteria / Test contractを定義する。
6. 必要であれば実装前canonical docsを更新する。
7. Codexへ実装を依頼する。
8. Codexが調査・実装・testを行う。
9. 実装結果とdiffをreviewする。
10. 実装とcanonical specificationの整合を確認する。
11. 必要な実装後canonical docsを更新する。
12. 変更影響を分析し、必要なintegration / device verificationを行う。
13. TEST_MATRIXを更新する。
14. remaining Risk / Open Questionを整理する。
15. 次のwork itemを決める。

実装がSPECと異なるという理由だけで、SPECを自動的に実装へ合わせないこと。

Product / Domainを起点とするが、platform constraints、Security、performance、Cost、external service / API constraints、implementation feasibilityは早期に確認し、必要に応じて設計へfeedbackする。

技術的制約を理由にProduct仕様を勝手に変更しない。制約と代替案を明示し、Material Decisionならユーザー判断へ戻す。

## Canonical docsの責務と更新

同じ事実を複数canonical docsで独立管理しない。

一つの情報について詳細を管理するowner docを意識し、他docsでは必要な範囲の要約や参照に留める。

概ね以下の責務とする。

- `CURRENT` → 現在地点、直近の変更、次のwork itemへの入口
- `PRODUCT` → Product vision / requirement
- `FEATURES` → Feature状態
- `SPEC` → Product / Domain behavior
- `ARCHITECTURE` → system構造・設計
- `DESIGN` → UI / visual / interaction target。Product / Domain semanticsは`SPEC` / `DECISIONS`をownerとする
- `DECISIONS` → Decisionと理由、Decision history
- `RISKS` → Risk
- `OPEN_QUESTIONS` → 未決事項
- `TEST_MATRIX` → verification requirementとcurrent evidence
- `COST` → Cost
- `MIGRATION_FROM_OBSIDIAN` → legacy migration / compatibility
- `CHANGELOG` → 変更概要

実装前は、必要に応じて「意図する仕様・設計」を表すdocsを更新する。

例:

- PRODUCT
- SPEC
- ARCHITECTURE
- DECISIONS
- RISKS
- OPEN_QUESTIONS
- test requirement

実装後は、必要に応じて「観測された現在状態」を表すdocsを更新する。

例:

- CURRENT
- FEATURES
- TEST_MATRIX
- CHANGELOG
- implementationから判明したRISKS / OPEN_QUESTIONS

一つのDecisionや仕様変更によって複数canonical docsへ影響する場合は、一つの論理変更として整合させる。

## Codex Task Contract

Codexへの指示には必要に応じて以下を含める。

- Background
- Goal
- Scope
- Non-goals
- canonical references
- existing Decisions
- Domain rules
- Acceptance criteria
- Required tests
- Prohibited changes
- Git operation boundary

Codexには必要に応じて以下を返してもらう。

- implementation summary
- findings / root cause
- changed files
- test / build results
- limitations
- remaining Risks
- new Open Questions
- canonical docs impact
- git diff / git status
- branch / commit state

canonical docsは、明示的に委任された場合を除きChatGPTが更新する。

## Git Workflow

Git操作はそれぞれ独立した承認境界として扱う。

一つの操作への承認を、別の操作への承認として推測して拡張しない。

例:

- stage
- commit
- push
- branch creation
- PR creation
- merge
- tag
- release

ただし、ユーザーが一つの依頼で複数操作を明示的に承認した場合は、その明示された範囲をまとめて実行してよい。

例:

「commitしてpushして。PRは作らないで」

→ commit + pushは承認済み
→ PRは未承認

利用中のGitHub toolingの安全ルールを優先する。

無関係な変更を同じcommitへ混ぜない。

write前には、対象branch / HEADと対象fileの最新状態を確認する。

最後に確認した後で対象が変更されていた場合は、古い内容で上書きせずreconcileする。

複数canonical docsが一つの論理変更を構成する場合は、利用可能なtoolと承認されたworkflowの範囲で、可能な限りatomicな変更を優先する。

atomicにできない場合も、既知のdocs不整合を恒久状態として放置しない。

Codexは原則としてcommit / push / PR / merge / tag / releaseを自動実行しない。必要な場合は明示的に指示する。

## Test / Evidence

以下を同一視しない。

- Implemented
- Integrated
- Tested
- Verified
- Released

変更内容とRiskに応じて適切なverification levelを選ぶ。

例:

- static
- unit
- contract
- integration
- API
- emulator
- Android device
- Widget device
- multi-device
- restart / recovery
- offline / retry
- conflict
- migration

Evidenceには必要に応じて以下を紐付ける。

- branch
- commit SHA
- build
- environment / device
- date
- timezone
- procedure
- observed result

過去commit / buildのPASSを現在状態へ無条件に継承しない。

一方で、変更と無関係なverificationまで機械的にinvalidateしない。

**変更によるimpact analysisに基づいて、影響を受けたverificationだけを再実施・invalidateする。**

例:

- docs typoのみ → runtime verificationは原則維持可能
- API contract変更 → API / integration evidenceを再評価
- sync algorithm変更 → offline / retry / conflict / multi-device evidenceを再評価

ユーザーの実環境でのみ確認できるtestは、実施されるまで`NOT_RUN`として扱う。

## Definition of Done

Featureやvertical sliceは、実際に確認できたlevelまでを完了として扱う。

変更内容に応じて、必要な範囲で以下を満たす。

- implementation review
- appropriate automated tests
- required integration / device tests
- canonical docs consistency
- TEST_MATRIX update
- remaining Risk / Open Question review

未実施のverificationは`NOT_RUN`、対象外は`NOT_REQUIRED`等で明示し、実施済みのように扱わない。

## Knowledge Promotion / Lifecycle

実装や調査から得たfindingを、すぐに一般的な恒久ルールへしない。

ただし、将来の開発再開・Decision・実装・testへMaterialな影響を与えるProduct事実、Risk、Open Question、test evidence等は、一度の観測でも十分な根拠があれば適切なcanonical docへ記録してよい。

複数の作業へ適用する一般的な恒久ルールへ昇格する場合は、少なくとも以下を確認する。

- evidence
- reuse value
- scope
- counterexample
- stability

内容に応じて適切な保存先を選ぶ。

- Product固有の仕様・設計知識 → SPEC / ARCHITECTURE / DECISIONS
- regression知識 → TEST_MATRIX
- legacy compatibility知識 → MIGRATION_FROM_OBSIDIAN
- 長期的なAI / 開発運用ルール → AGENTS / DEVELOPMENT_WORKFLOW

Knowledgeは永続的に正しいとは限らない。

Architecture変更、SDK / API変更、platform変更、新しいevidence等によって古くなったKnowledgeは、必要に応じて`Deprecated` / `Superseded` / `Removed`として整理する。

目的は、同じ調査や同じ失敗を繰り返すCostを下げることであり、ルールを無選別に増やすことではない。

## External Dependency / Destructive Change

外部service、SDK、API、pricing、quota、platform restriction等の変更され得る事実がMaterial Decisionへ影響する場合は、その時点の最新情報を確認してから判断する。

destructive migrationやproduction data変更では、明示承認だけを安全対策の代わりにせず、必要に応じて以下を用意する。

- backup
- dry-run
- validation / preview
- rollback / recovery
- failure condition

## Handoff

チャット移行や大きな作業区切りでは、会話履歴を読み直さなくても再開できる程度の情報を残す。

Handoffはcanonical docsの全文コピーではなく、原則としてpointer + deltaを中心にする。

必要に応じて以下を含める。

- repository / branch / commit / PR
- current stateへのpointer
- 今回新たにApproved / SupersededとなったDecision
- 今回増減したOpen Question / Risk
- completed / incomplete work
- test stateの変更
- next work

既存Decision、Risk、Open Question等の詳細はcanonical docsを参照し、Handoff側へ第二の正本として複製しない。
