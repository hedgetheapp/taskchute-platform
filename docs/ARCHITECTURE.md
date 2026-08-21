# Architecture

## Target overview

```text
                         TaskChute Server
                    +------------------------+
                    | Canonical Task State   |
                    | Tasks / Entries        |
                    | Projects / Routines    |
                    | Sections / Execution   |
                    | Ordering / Lifecycle   |
                    +------------------------+
                    | Documents / Notes      |
                    | Markdown-native        |
                    +------------------------+
                    | Attachment Metadata    |
                    +------------------------+
                    | Sync / Commands / API  |
                    +-----------+------------+
                                |
          +---------------------+---------------------+
          |                     |                     |
          v                     v                     v
      Web Client          Android Client       Other Clients
  primary / universal     native first-class   Wear OS companion
  browser-based           local state/cache    iOS native future
                          Android Widget       Obsidian optional
```

この図はtarget architectureの概念図であり、未決のDB schema、API、sync algorithm、storage provider、Web frameworkを確定するものではない。

図中のDomain labelもworking scopeを示す概念表現であり、Project / Section / Execution / Routine等のexact Domain modelやentity boundaryを確定するものではない。

## Storage direction

Working direction only:

```text
Relational store candidate
- tasks
- entries
- projects
- sections
- executions
- documents / markdown
- comments
- attachment metadata

Binary storage candidate
- images
- binary attachments
```

structured data / Markdown / attachment metadataとbinary image/file storageを分離するD-008は`Proposed`である。

Cloudflare D1 / R2はleading candidatesであり、final Decisionではない。

## Client principle

Web appをprimary / universal clientとし、initial development priorityを最優先とする。

対応browserを通じてWindows、Android、iOS等からCore TaskChute experienceを利用できることをtargetとする。supported browser baseline、responsive / adaptive behavior、PWA、Web offline capability、hosting/runtime technology等の具体Architectureは未決。

Androidはnative first-class clientであり、offline-capableであること自体はApproved requirementとする。

ただし、local DB、cache構造、offline中のoperation範囲、command queue、sync protocol、conflict resolution等の具体Architectureは未決。

Android Widgetは可能な限りAndroid appのDomain / API / local-state architectureを再利用し、widget-only backendを別系統で持たない方向とする。

Wear OS / Pixel Watchはcompanion clientとしてServerと同じDomain / API contractを利用する方向とし、exact feature scopeは未決。

native iOS appは将来のlow-priority clientとし、それ以前もiOSからWeb clientを利用できる構成をtargetとする。

## Retry safety principle

Start / Completeはretry-safe behaviorを必要とする。

具体的なcommand / API mechanismは未決であり、idempotency key等の特定technologyをこの段階では固定しない。

## Obsidian principle

legacy Obsidian plugin architectureを新Platform coreへ持ち込まない。

将来のObsidian clientはadapterとしてServer stateとDocumentsをVault Markdown/filesへprojection / synchronizationする方向とする。

## Legacy reuse

identity、lifecycle、Routine、ordering、offline/retry、Ack ambiguity、idempotency、regression scenario等の知見を優先して再利用する。

以下のwholesale reuseは避ける。

- monolithic `main.js`
- Vault-as-platform-authority
- Obsidian DOM UI code
- `data.json`-centric runtime design
