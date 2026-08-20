# AGENTS.md

## 目的

このファイルは、TaskChute Platformで作業するAI Agent向けの最小入口です。

このファイルをProduct仕様やArchitectureの第二の正本として扱わないこと。

## 正本と読み方

正本repository:

`hedgetheapp/taskchute-platform`

重要な判断や実装を行う前に、必要なcanonical docsを読むこと。

まず以下を確認する。

- `docs/CURRENT.md`
- `docs/DECISIONS.md`
- `docs/OPEN_QUESTIONS.md`

そのうえで、作業内容に応じて以下を参照する。

- `docs/PRODUCT.md`
- `docs/FEATURES.md`
- `docs/SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/RISKS.md`
- `docs/COST.md`
- `docs/TEST_MATRIX.md`
- `docs/MIGRATION_FROM_OBSIDIAN.md`
- `docs/DEVELOPMENT_WORKFLOW.md`

canonical docs構成が変更された場合は、repository上の最新構成を優先すること。

## 作業原則

重要な未決事項を勝手に確定しないこと。

特にProduct、Domain、Architecture、identity、sync、migration、storage、API、authentication、security、cost、conflict semantics等へ意味のある影響を与える事項は、既存DecisionとOpen Questionを確認する。

以下を区別する。

- `Approved`
- `Proposed`
- `Recommendation`
- `Open Question`
- `Superseded`

コードとcanonical docsが食い違う場合は、その矛盾を報告する。実装へ合わせて自動的にSPECを書き換えないこと。

実装によって新しい事実が判明した場合は、必要に応じて以下を報告する。

- 仕様への影響
- Risk
- Open Question
- 必要なtest変更
- canonical docsへの影響

## Legacy reference

Legacy repository:

`hedgetheapp/taskchute-obsidian-mvp`

旧repositoryは、新Platformの仕様正本ではなくreference sourceである。

旧資産を再利用する場合は必要に応じて以下を区別する。

- `Referenced`: 挙動・知見のみ参照
- `Adapted`: 新Architecture向けに再設計
- `Ported`: compatibility確認後に直接移植

旧Architectureや巨大な`main.js`を丸ごと移植しないこと。

## Knowledge Promotion

作業中に得た発見を、すぐに恒久ルールへ昇格させないこと。

原則として以下の段階で扱う。

`Finding` → `再利用可能な知見` → `繰り返し確認されたルール`

将来の作業でも再利用価値があり、十分な根拠がある知見だけを、canonical docs、`AGENTS.md`、`DEVELOPMENT_WORKFLOW.md`等への昇格候補とする。

同じ調査や同じ失敗を将来のAgentが繰り返さないために有用な、失敗・制約・判断理由は適切な場所へ残す。

## Safety

repositoryはpublicであることを前提とする。

secret、credential、個人情報、private note/image、production data等をcommitしないこと。

GitHubへwriteする前に、対象branchと対象fileの最新状態を確認し、並行変更を古い内容で上書きしないこと。
