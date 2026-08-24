# Product

## Vision

Obsidianを必須とせずに動作する、個人向けTaskChute Platformを構築する。

TaskChute Platformは、単なるTask管理toolではなく、ユーザーの行動、実行履歴、計画、知識、思考、感情、メモ、Documentを蓄積し、後から時間軸と情報同士の関係の両方から辿れる**個人の情報基盤 / life log**を目指す。

TaskChuteによる「いつ、何をし、どれだけ時間を使ったか」という行動・実行の時間軸と、Obsidian的なMarkdown-native knowledge management / linkingを同じPlatform上で統合する。

このPlatformを見れば、過去のある時点について、何をしていたか、何を考えていたか、何を感じていたか、どのような知識やメモを残していたかを可能な限り再構築できることをlong-term targetとする。

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

## Routine-centered execution

RoutineはTaskChuteにおけるcross-day reuseの中核capabilityとして扱う。

同じ行動を繰り返す場合、同名Taskを毎日手作業で再現したり、title一致を暗黙の共有keyとして扱ったりするのではなく、Routineとして定義して日々の行動を開始しやすくすることを重視する。

Routineは見積、Mode、Link等の繰り返し利用するdefault / reusable informationを供給できる方向とし、その日ごとのTaskでは必要に応じて個別に変更できることを要求する。

その日のLink、Comment、Note、実行履歴等はday-specific historical contextとして保持でき、後からRoutine側を変更しても過去の日の意味を黙って書き換えない。

同じtitleが複数日に存在することだけを理由に、Task identity、Note、Link等を自動的に共有・統合しない。cross-dayで共有する情報はRoutineまたは明示的なrelationを通じて扱う。

## Notes / Documents

TaskChute自身がNotes/Documents capabilityを提供する。

Project Note、Task Note、CommentはMarkdown-nativeなcontent semanticsを維持し、images/filesを扱えることを想定する。

TaskとProjectはそれぞれPrimary Documentを持てる。Routineの共通noteはTask Noteを利用し、必要な場合だけ各Routine occurrenceにも日別noteを持てる方向とする。

Task / Project等へ従属しない**standalone Document / general note**もfirst-classに作成できることを要求する。standalone DocumentとTask / Project / RoutineOccurrence等のDocumentは共通Document foundation上で扱い、相互非互換な別storageへ分断しない。

Document同士をlinkでき、link先からbacklinkとして逆方向の関係を辿れることをtargetとする。内部linkのexact syntax、rename時の解決、link authority、indexing、Graph View等のexact semantics / UXは別途設計する。

NotesはTask / Projectに付随する補助情報だけではなく、知識、思考、感情、メモ等を独立して蓄積し、行動・実行履歴と後から関連付けて辿るためのtop-level Product capabilityとして扱う。

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
