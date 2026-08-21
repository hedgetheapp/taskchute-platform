# Current

Date: 2026-08-21

## Status

Architecture / Bootstrap。Runtime implementationはまだ開始していない。

canonical baselineは`docs/initial-canonical-baseline`で整備中であり、現時点では`main`へ未統合。

## Current source-of-truth state

- Project Instructionsはfreeze方針で確定済み。
- `AGENTS.md`と`docs/DEVELOPMENT_WORKFLOW.md`はProject Instructionsへ整合済み。
- canonical docsは日本語ベースへ整理し、Decision / Risk / Open Question / Testの責務を再確認済み。
- Runtime codeは未実装。

## Approved direction

正式なDecisionの正本は`docs/DECISIONS.md`とする。

現在の主要なApproved direction:

- TaskChuteをObsidian非依存の独立Platformとして再構築する。
- structured TaskChute stateのtarget canonical authorityはTaskChute Serverとする。
- Android dedicated appをfirst-class clientとする。
- Androidはoffline-capableを前提とする。ただしoffline中に可能な操作範囲やsync方式は未決。
- 初期user modelはsingle-user / multi-deviceとする。
- TaskChute自身がMarkdown-nativeなNotes/Documentsを持つ。
- Notes/Commentsは共通のAttachment capabilityを使う。
- Task identityとEntry identityは別概念とする。
- Start / Completeはnetwork retry等による再送で二重実行や不整合を起こさないretry-safe behaviorを要求する。
- legacy Obsidian repositoryはmigration、domain semantics、regression knowledgeのreferenceとして利用する。

## Proposed / Open

- D-008: structured dataとbinary attachment storageの分離は`Proposed`。
- 現在の10-step First vertical slice案は`Proposed`。Core Domain model設計後に再評価する。
- D1 / R2 / Workersを含むInfrastructure、DB schema、API、auth、sync/conflict方式等は未決。

## Important distinction

上記は新Platformのtarget stateを示す。legacy Obsidian実装の現在のauthorityを遡って変更するものではなく、旧実装では引き続きVault Markdown等の既存authorityが有効である。

## Next

1. canonical baselineのintegration readinessを最終reviewする。
2. baselineを`main`へ統合するかユーザーが判断する。
3. Core Domain modelを設計する。
4. Proposed First vertical sliceを再評価し、Acceptance criteria / Test contractを確定する。
5. storage / API / sync等のtechnology・architecture Decisionを必要な順に行う。
6. Approved vertical sliceからruntime implementationを開始する。
