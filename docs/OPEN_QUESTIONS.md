# Open Questions

ここにある項目は未決であり、記載されているcandidateやdirectionをApproved Decisionとして扱わない。

## Infrastructure

- Server / API implementation technology
- Web hosting / runtime technology
- Final D1 adoption
- Final R2 adoption
- DB schema
- API style / endpoints
- authentication / device authorization
- browser session / cookie strategy
- future native client authentication strategy
- backup / export strategy
- custom domainを採用する時期

## Web client

Webをprimary / universal clientとすること自体はD-014でApproved済み。

以下の具体方式・scopeはOpen:

- Web framework / build tool
- supported browser baseline
- responsive / adaptive layout scope
- mobile browserでのinteraction方針
- PWA install support
- Web offline capabilityをinitial requirementに含めるか
- service worker / cache strategy
- Web clientのlocal persistence scope
- deployment / preview environment strategy
- authentication UX

## Offline / Sync

Androidをoffline-capableとすること自体はD-011でApproved済み。

Web clientをoffline-capable / PWAとするかはOpen。

以下の実現方式・scopeはOpen:

- Android offline中に許可するoperation範囲
- Android local DB technology
- Web local persistence / offline scope
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
- D-013 Proposed Web-first vertical sliceをApproved contractへ昇格する条件
- First vertical sliceの詳細Acceptance criteria

## Client roadmap

- Wear OS / Pixel Watchのinitial feature scope
- Android native implementationへ進むentry criteria
- native iOS appへ進むentry criteria
- Android Widgetのinitial scope

## Documents

- Document identity / revision model
- Markdown editor library
- wiki-link compatibility scope
- general noteのinitial scope
- additional document types
- revision-history UX

## Attachments / Images

- Attachment identity / ownership / reference model
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
