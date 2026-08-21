# Specification

この文書は、明示的にApprovedされたbootstrap-level behaviorを定義する。

API endpoint名、DB schema、auth方式、local DB、command queue、conflict algorithm等は、別途DecisionされるまでOpenとする。

## User model

- 初期はone user
- multiple devices / clients
- device identityとsync safetyは必要
- registration、team、organization、billingは初期scope外

## Client availability

Web appをprimary / universal clientとし、initial development priorityを最優先とする。

- 対応browserを通じてWindows、Android、iOS等からCore TaskChute experienceを利用できることをtargetとする。
- native appをTaskChute利用の必須条件としない。
- Android dedicated appはnative first-class clientとして後続対応する。
- Wear OS / Pixel Watchはcompanion clientとして対応対象とする。
- native iOS appは将来対応するが、優先度は低い。
- supported browser baseline、responsive / adaptive behavior、PWA、Web offline capability等のexact scopeは未決。

## Core identity

Task definition identityとboard placement / execution identityは別概念とする。

- Task identityはstableでなければならない。
- Entry identityはstableでなければならない。
- mutableなtitleをidentityとして扱わない。
- 1つのTaskが複数のEntryとして現れることを許容する。
- identityが曖昧な場合、推測したtargetを黙ってmutateしない。
- exact ID formatは未決。

## Lifecycle retry safety

Start / Completeは、network ambiguity等によって同一operationが再送された場合でも、二重実行や不整合を起こさないretry-safe behaviorを満たす。

具体的な実現方式は未決であり、command ID、idempotency key、transaction設計等をここでは固定しない。

## Android offline capability

Android clientはtemporary network unavailabilityを考慮したoffline-capable designとする。

offline中に許可するoperation範囲、local persistence、queueing、sync、conflict resolution等の具体方式は未決。

Web clientをoffline-capable / PWAとするか、そのinitial scopeをどこまで含めるかは未決。

## Notes / Documents

- TaskChuteがDocumentsを所有する。
- Document bodyはMarkdown-nativeとする。
- Documentにはstable identityが必要。
- revision / version semanticsを将来持てる設計余地を残す。
- Webはprimary clientとして将来的にread / editできることを要求する。
- Androidも将来的にread / editできることを要求する。
- 将来のObsidian projectionでは、実用上可能な範囲でMarkdown semanticsを保持する。

## Comments

- CommentはMarkdownを扱えること。
- Commentはimagesを扱えること。
- NotesとCommentsは共通のAttachment modelを利用する。

## Images / Attachments

必要capability:

- stable attachment identity
- metadata
- reference / ownership relation
- deletion / orphan-cleanup strategy
- Web upload
- Android upload
- future Obsidian file projection

binary-storage providerおよびstructured dataとのstorage separationは未確定。D-008は`Proposed`であり、Cloudflare R2はleading candidateの一つにすぎない。

## Proposed First vertical slice

Status: Proposed

以下はCore Domain model設計後に再評価するcandidateであり、現時点ではApproved implementation contractではない。

1. Server上に1つのProjectを作成する。
2. 3つのTaskを作成する。
3. Today boardへexplicit orderで配置する。
4. Web clientが3つすべてを表示する。
5. Web clientから1つのTaskをStartする。
6. Serverがrunning stateを記録する。
7. Web clientからCompleteする。
8. 次のTaskが利用可能になる。
9. browserをreloadする。
10. reload後もcorrect stateを復元する。

Android、Android Widget、Wear OSはこのinitial First vertical sliceには含めない。
