# Product

## Vision

Obsidianを必須とせずに動作する、個人向けTaskChute Platformを構築する。

## Initial user model

- Single user
- Multiple devices / clients
- Personal use
- Multi-user、team、organization、billingは初期scope外

## Client direction

### Web

primary / universal clientとし、initial development priorityを最優先とする。

対応browserを通じてWindows、Android、iOS等から利用でき、native appがなくてもCore TaskChute experienceを利用できることをtargetとする。

supported browser baseline、responsive / adaptive layout、PWA、Web offline capability等のexact scopeは別途設計する。

### Android

native first-class clientとする。

Webをprimary / universal clientとした上で、dedicated Android appではToday board、Task detail、Project、Notes、Routine、execution flowに加え、Widget、通知、native integration等のAndroid固有capabilityを扱える方向とする。

Androidはoffline-capableを前提とする。ただし、offline中に可能な操作範囲、local DB、command queue、conflict resolution、sync方式等は別途設計する。

### Android Widget

one-offなcompanionとして独立実装せず、Android appのDomain / API / local-state architectureを再利用する。

### Wear OS / Pixel Watch

companion clientとして対応対象とする。

running Task、next Task、Start / Complete等のexecution-oriented experienceを中心候補とし、exact scopeは別途設計する。

### iOS native

将来対応するが、native clientとしての優先度は低くする。

iOSからはまずWeb clientでCore TaskChute experienceを利用できることを前提とし、native iOS appは後続scopeとする。

### Obsidian

将来のoptional client / integrationとする。TaskChute本体の動作にObsidianを必須としない。

### Future

MCP/API、その他clientは将来追加できる。

## Notes / Documents

TaskChute自身がNotes/Documents capabilityを提供する。

Project Note、Task Note、CommentはMarkdown-nativeなcontent semanticsを維持し、images/filesを扱えることを想定する。
