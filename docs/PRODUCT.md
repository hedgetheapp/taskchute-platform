# Product

## Vision

Obsidianを必須とせずに動作する、個人向けTaskChute Platformを構築する。

## Initial user model

- Single user
- Multiple devices / clients
- Personal use
- Multi-user、team、organization、billingは初期scope外

## Client direction

### Android

first-class clientとする。

将来的にToday board、Task detail、Project、Notes、Routine、execution flowを主要機能として扱う。

Androidはoffline-capableを前提とする。ただし、offline中に可能な操作範囲、local DB、command queue、conflict resolution、sync方式等は別途設計する。

### Android Widget

one-offなcompanionとして独立実装せず、Android appのDomain / API / cache architectureを再利用する。

### Obsidian

将来のoptional client / integrationとする。TaskChute本体の動作にObsidianを必須としない。

### Future

Wear OS、Web、MCP/API、その他clientは将来追加できる。

## Notes / Documents

TaskChute自身がNotes/Documents capabilityを提供する。

Project Note、Task Note、CommentはMarkdown-nativeなcontent semanticsを維持し、images/filesを扱えることを想定する。
