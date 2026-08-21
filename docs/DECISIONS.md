# Decisions

Statuses: Approved / Proposed / Superseded

## D-001 — Independent TaskChute Platform
Status: Approved

TaskChuteをObsidian plugin専用productから、Obsidianを必須としない独立Platformへ再構築する。

## D-002 — Server-centric target authority
Status: Approved

新Platformでは、structured TaskChute stateのtarget canonical authorityをTaskChute Serverとする。

これはlegacy Obsidian実装の現在のauthorityを遡って変更するものではない。

## D-003 — Android is a native first-class client
Status: Approved

dedicated Android appをnative first-class clientとして構築する。

Webをprimary / universal clientとした上で、AndroidではWidget、通知、native integration、offline capability等のplatform-specific experienceを提供できる方向とする。

Android WidgetはAndroid client architectureを再利用する方向とする。

## D-004 — Obsidian becomes optional
Status: Approved

Obsidianをrequired runtimeとしない。将来のsynchronized client / integrationとして扱う。

## D-005 — Single-user first
Status: Approved

初期Productはone user / multiple devicesを前提とする。

Multi-user、team、organization、billingは初期scope外とする。

## D-006 — Markdown-native documents
Status: Approved

TaskChute自身がNotes/Documents capabilityを所有し、content semanticsはMarkdown-nativeとする。

## D-007 — Shared attachment capability
Status: Approved

Project Notes、Task Notes、Commentsはimages/filesを扱う共通Attachment capabilityを利用する。

## D-008 — Split binary object storage
Status: Proposed

structured data、Markdown、attachment metadataとbinary image/file storageを分離する案をleading directionとする。

Cloudflare D1 + R2はcandidateであり、storage separation自体も含めてfinal Decisionではない。

## D-009 — Legacy reuse by semantics first
Status: Approved

legacy repositoryは主にdomain semantics、data migration、regression knowledgeのreferenceとして利用する。

legacy codebase / architectureをwholesale-copyしない。

## D-010 — Task identity and Entry identity are distinct
Status: Approved

Task definition identityとboard placement / execution identityを別概念として扱う。

TaskとEntryはそれぞれstable identityを持ち、mutable title等をidentityとして利用しない。

1つのTaskが複数のEntryとして現れることを許容する。

exact ID formatは別途設計する。

## D-011 — Android is offline-capable
Status: Approved

Android clientはtemporary network unavailabilityを考慮したoffline-capable designとする。

offline中に可能なoperation範囲、local DB、queue、sync、conflict resolution等の実現方式は別途Decisionする。

## D-012 — Start / Complete are retry-safe
Status: Approved

Start / Completeはnetwork ambiguity等による同一operationの再送で、二重実行やstate inconsistencyを起こさないretry-safe behaviorを満たす。

具体的なAPI / command mechanismはArchitecture detailとして別途設計する。

## D-013 — Initial First vertical slice candidate
Status: Proposed

Project、Tasks、Today-board ordering、Start / Complete、Web client、browser reload recoveryを通すsliceを初期candidateとする。

Android、Widget、Wear OSはinitial First vertical sliceには含めない。

Core Domain model設計後に再評価し、Approved implementation contractへ昇格するか判断する。

## D-014 — Web is the primary universal client
Status: Approved

Web appをinitial development priorityが最も高いprimary / universal clientとする。

対応browserを通じてWindows、Android、iOS等からCore TaskChute experienceを利用できることをtargetとし、native appをTaskChute利用の必須条件としない。

Androidはnative first-class client、Wear OS / Pixel Watchはcompanion target、native iOS appは将来対応のlow-priority clientとする。

supported browser baseline、PWA、Web offline capability、Web hosting technology等の具体方式は別途設計する。
