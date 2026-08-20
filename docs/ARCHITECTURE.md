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
   Android Client         Android Widget       Obsidian Client
   local cache            running / next       optional
   TaskBoard / Notes      quick actions         .md projection
```

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

Object storage candidate
- images
- binary attachments
```

Cloudflare D1/R2 are leading candidates, not final decisions.

## Client principle

Android is a first-class client with local cache/offline-capable design. Widget should reuse Android domain/API/cache rather than use a separate widget-only backend.

## Obsidian principle

Do not carry the legacy Obsidian plugin architecture into the new platform core. A future Obsidian client should act as an adapter that projects/synchronizes Server state and Documents into Vault Markdown/files.

## Legacy reuse

Prefer to reuse identity/lifecycle/Routine/ordering/offline/idempotency lessons and regression scenarios. Avoid wholesale reuse of the monolithic `main.js`, Vault-as-platform-authority, DOM UI code, and `data.json`-centric runtime design.
