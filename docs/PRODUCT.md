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

通常のTask作成、ordering、Start / Complete等はpage全体をreloadせず、application-likeなinteractionで利用できることを要求する。

supported browser baseline、responsive / adaptive layout、PWA、Web offline capability等のexact scopeは別途設計する。

### Android

native first-class clientとする。

Webをprimary / universal clientとした上で、dedicated Android appではToday board、Task detail、Project、Notes、Routine、execution flowに加え、Widget、通知、location、native integration等のAndroid固有capabilityを扱える方向とする。

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

## Logical day experience

TaskChuteではcivil dateとlogical activity dayを同一視しない。

夜勤、深夜活動、生活リズム差等に対応できるよう、TaskChuteDayのday boundaryを設定可能にする方向とする。

UIでは必要に応じて`24:00`を超えるextended-time notationを扱えるようにしつつ、actual execution timestampは実時間として保持する。

## Notes / Documents

TaskChute自身がNotes/Documents capabilityを提供する。

Project Note、Task Note、CommentはMarkdown-nativeなcontent semanticsを維持し、images/filesを扱えることを想定する。

TaskとProjectはそれぞれPrimary Documentを持てる。Routineの共通noteはTask Noteを利用し、必要な場合だけ各Routine occurrenceにも日別noteを持てる方向とする。

日別Routine noteを毎日空で自動生成することは要求せず、必要時に作成できる設計とする。

## Review / historical experience

将来Reviewでは、TaskChuteで蓄積したhistorical factsを複数の視点から振り返れることをtargetとする。

例:

- logical day / week / month
- Project別の実績時間
- Task / Section別の実績
- Routineの実施履歴 / streak
- estimateとactualの比較
- 過去のqualitative note

現在のTask / Project設定を変更したことで、過去の実績の意味が黙って書き換わらないことを要求する。

DayBoard、Calendar、Timeline、Reviewは同じDomain / historyから異なるviewとして構成できる方向とする。

## Place / Location / travel use case

将来、Taskのplanned destinationと実行時のactual locationを扱えるようにする。

例として、旅行をProject、観光地やレストランをTaskとして計画し、旅行中のTask executionをしおりとして利用し、後から訪れた場所や実行履歴をMap / Reviewで振り返れることをtargetとする。

planned Placeとactual observed locationは区別する。

location permissionを許可しない場合でもCore TaskChute experienceは利用できることを要求する。

continuous route trackingは別の将来capabilityとして扱い、初期Location機能の前提にはしない。
