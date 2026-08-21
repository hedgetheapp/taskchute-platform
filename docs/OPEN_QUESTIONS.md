# Open Questions

ここにある項目は未決であり、記載されているcandidateやdirectionをApproved Decisionとして扱わない。

## Infrastructure

- Server / API implementation technology
- Final D1 adoption
- Final R2 adoption
- DB schema
- API style / endpoints
- authentication / device authorization
- backup / export strategy

## Offline / Sync

Androidをoffline-capableとすること自体はD-011でApproved済み。

以下の実現方式・scopeはOpen:

- offline中に許可するoperation範囲
- Android local DB technology
- command queue / event model
- retry / delivery mechanism
- conflict resolution
- revision / optimistic concurrency
- push vs poll vs realtime
- reconnect時のconvergence / recovery behavior

Start / Completeのretry safety自体はD-012でApproved済みだが、具体mechanismはOpen。

## Core Domain / First vertical slice

- exact Task / Entry ID format
- Project / Section / Execution / Routine等のCore Domain model
- lifecycle state / invariantの詳細
- D-013 Proposed First vertical sliceをApproved contractへ昇格する条件
- First vertical sliceの詳細Acceptance criteria

## Documents

- Markdown editor library
- wiki-link compatibility scope
- general noteのinitial scope
- additional document types
- revision-history UX

## Attachments / Images

- D-008 storage separationをApprovedするか
- max image size
- camera-photo resize policy
- screenshot encoding policy
- keep-original option
- thumbnails
- deduplication
- orphan cleanup timing
- Obsidian export path / reference format
- deletion semantics

## Legacy migration

- migration baseline version
- existing Task / Entry / Routine identityをどこまでpreserveするか
- log / history import scope
- legacy Obsidian versionとのcoexistence period
- importerのexact contract
