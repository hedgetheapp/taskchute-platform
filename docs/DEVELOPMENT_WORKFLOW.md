# Development Workflow

## 役割

### User — Product Owner / Final Decision Maker

重要なProduct / Domain / Architecture Decision、およびhigh-impact・irreversibleな操作の最終判断を行う。

### ChatGPT — PM / Architect / Canonical Docs Manager / Repository Manager

仕様整合、Codex指示、実装レビュー、canonical docs管理、許可されたrepository操作を主担当とする。

### Codex — Implementation Engineer

codebase調査、implementation、refactoring、automated test、build / test、実装上のfinding報告を主担当とする。

Codexは原則としてcanonical docs管理の主担当ではない。

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
12. 必要なintegration / device verificationを行う。
13. TEST_MATRIXを更新する。
14. remaining Risk / Open Questionを整理する。
15. 次のwork itemを決める。

実装がSPECと異なるという理由だけで、SPECを自動的に実装へ合わせないこと。

## Canonical docsの更新タイミング

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

一つの操作への承認を、別の操作への承認として扱わない。

例:

- stage
- commit
- push
- branch creation
- PR creation
- merge
- tag
- release

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

変更内容に応じて適切なverification levelを選ぶ。

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

過去commit / buildのPASSを現在状態へ自動継承しない。

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

## Knowledge Promotion

実装や調査から得たfindingを、すぐに恒久ルールへしない。

原則として以下の段階で扱う。

`Finding` → `再利用または独立再観測` → `検証された再利用知識` → `必要に応じて恒久ルール`

内容に応じて適切な保存先を選ぶ。

- Product固有の仕様・設計知識 → SPEC / ARCHITECTURE / DECISIONS
- regression知識 → TEST_MATRIX
- legacy compatibility知識 → MIGRATION_FROM_OBSIDIAN
- 長期的なAI / 開発運用ルール → AGENTS / DEVELOPMENT_WORKFLOW

目的は、同じ調査や同じ失敗を繰り返すCostを下げることであり、ルールを無選別に増やすことではない。

## External Dependency / Destructive Change

外部service、SDK、API、pricing、quota、platform restriction等に依存する重要Decisionでは、その時点の最新情報を確認する。

destructive migrationやproduction data変更では、明示承認だけを安全対策の代わりにせず、必要に応じて以下を用意する。

- backup
- dry-run
- validation / preview
- rollback / recovery
- failure condition

## Handoff

チャット移行や大きな作業区切りでは、会話履歴を読み直さなくても再開できる程度の情報を残す。

必要に応じて以下を含める。

- repository / branch / commit / PR
- current state
- Approved Decisions
- Proposed items
- Open Questions
- completed / incomplete work
- test state
- remaining Risks
- next work

Handoffは補助情報であり、canonical docsを第二の正本として複製しない。
