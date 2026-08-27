# TaskChute Platform — DESIGN.md

> Status: Draft
>
> この文書は TaskChute Platform の UI / Visual Design に関する設計指針を定義する。
>
> Product仕様、Domain、Architecture、Decisionの正本は`main`上のcanonical docsとする。本書はそれらを変更・上書きしない。
>
> UI上の表現から新しいDomain semanticsを暗黙に追加してはならない。

## 1. デザイン方針

TaskChute PlatformのUIは、**「一日のTaskと現在の実行状態を、少ない認知負荷で把握・操作できること」**を最優先とする。

Notionのような、シンプル、高密度、情報中心、控えめな装飾、十分な余白、一貫したinteractionを基本とする。ただしNotionそのものを再現せず、TaskChute固有の時間管理・実行管理へ最適化する。

参考: [awesome-design-md-jp / Notion](https://github.com/kzhrknt/awesome-design-md-jp/tree/main/design-md/notion)

基本原則:

- **Simple** — 必要以上に装飾しない。
- **Dense** — 一日のTaskを俯瞰できる。
- **Temporal** — 時間の流れを感じられる。
- **Execution First** — 現在実行しているTaskを見失わない。
- **Continuous** — Sectionで一日の流れを分断しすぎない。
- **Predictable** — 同じ操作は同じ見た目・同じ挙動にする。
- **Keyboard First** — Mouseだけでなくkeyboardでも日常操作を高速に行える。

## 2. Visual foundation

### 2.1 Color

- 基本背景: `#FFFFFF`
- サブ背景: `#F7F7F5`
- 基本テキスト: `#191919`
- セカンダリテキスト: `#787774`
- Border: `#E9E9E7`
- Primary Accent: `#2383E2`

状態色は補助として使い、色だけへ意味を依存させない。

- 未実行: Gray
- 実行中: Blue / Accent
- 完了: Greenまたはmuted completed表現
- Interrupt historical: Neutral / muted
- Warning: Red / Orange系を必要箇所だけに限定

### 2.2 Typography

基本フォントはOS標準の読みやすいSans Serifを優先する。

候補: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

日本語はOS標準日本語fontへfallbackする。

- 本文: 14px前後
- 補助情報: 12〜13px
- 重要情報: 14〜16px / Medium〜Semibold

### 2.3 Spacing / density

基本単位は4px。主に`4 / 8 / 12 / 16 / 24 / 32px`を利用する。

Day Tableは一般的Web appよりやや高密度を許容するが、click / touch hit area、keyboard focus、可読性を犠牲にしない。

### 2.4 Border / shadow / radius

- Border: 基本`1px solid #E9E9E7`
- 通常Table / Paneに強いshadowを使わない。
- Floating Runner等のfloating UIだけ軽いshadowを許容する。
- 基本radiusは4〜8px、floating UIは8〜12px。
- Task Row単位をcard化しない。

## 3. Desktop基本画面構成

主要領域:

1. Top Navigation
2. Left Sidebar
3. Day Toolbar / Task Controls
4. Day Table
5. Task Note Pane
6. Floating Runner
7. 将来のgeneric Right Detail Pane

### 3.1 Top Navigation

主にSidebar開閉、TaskChuteロゴ、前日 / 翌日 / 今日、日付選択、検索、設定、アカウント等を置く。

### 3.2 Left Sidebar

主要Navigation候補:

- 今日
- カレンダー
- プロジェクト
- タスク
- ノート
- 分析
- 設定

Desktop初期幅は約240pxをstarting pointとし、180〜420px程度でresize可能にする。open / closedとwidthを分離し、閉じる直前の幅を復元する。

初期Desktop WebではSidebar幅とopen stateをbrowser `localStorage`へ保持する方向とする。

## 4. Day Table foundation

Day TableはTaskChuteの中心UIであり、一日のTaskを**1つの連続したTable**として表示する。

- 原則`1 Task Row = 1行`。
- Sectionごとに別Card / 別Tableへ分割しない。
- Section summary rowで一日の時間帯をgroupingする。
- Task名等は基本1行。列幅を超える内容はwrapせずclipする。
- Viewportを超えた場合は横scrollを許容し、列を自動削除しない。
- 実行済みhistorical rowは表示 / 非表示を切り替えられる。
- 空の通常SectionもSection summary rowを表示する。
- `Sectionなし` groupは該当Taskがある場合だけ通常Sectionより上に表示する。

## 5. Fixed left area / sticky behavior

横scrollしても、左側の以下3要素は常に画面へ残す。

```text
[Bulk selection slot] [Execution Control] [Task]
```

この3要素をleft sticky areaとして扱い、`Project`以降を横scroll対象とする。

### 5.1 Bulk selection slot

- fixed-widthのselection slotを通常時から確保する。
- 通常時は空に見せる。
- Bulk Selection Mode時だけ同じslot内へcheckboxを描画する。
- Bulk modeへ入ってもExecution Control / Task名 / 他列を1pxも横shiftさせない。

### 5.2 Execution Control

独立した「状態」text列は置かず、Task名の左に**1つの円形Execution Control icon**を置く。

`○`と`▶`を横並びにするのではなく、circle outlineの中に状態glyphを配置する。

概念例:

```text
( ▶ )  未実行 / Start
( ■ )  実行中 / Complete
( ✓ )  完了
```

Interrupt historical rowのexact glyphはvisual prototypeで確定するが、通常Start / Complete controlとは明確に区別する。

- 未実行: click / `S`でStart。
- 実行中: click / `S`でComplete。
- 完了 / historical:通常Start対象にしない。
- Tooltip / accessible labelを必須とする。

## 6. Default columns

固定left areaに続く初期data列は以下とする。

```text
Task
Project
Mode
Section
Routine
Note
見積
開始予定
開始見込
開始
終了
実績
```

`Bulk slot`と`Execution Control`は固定UI slotであり、通常のdata column customization対象にはしない。

初期幅starting point:

| Column | Initial width direction |
| --- | ---: |
| Task | 280px前後〜flex |
| Project | 140px前後 |
| Mode | 110px前後 |
| Section | 110px前後 |
| Routine | 56px前後 |
| Note | 56px前後 |
| 見積 | 72px前後 |
| 開始予定 | 88px前後 |
| 開始見込 | 88px前後 |
| 開始 | 88px前後 |
| 終了 | 88px前後 |
| 実績 | 88px前後 |

Link / Comment等のcapabilityは将来optional columnとして追加可能だが、現時点のdefault Day Table列には含めない。

## 7. Column customization

### 7.1 Day Table上で直接reorder

`Project`以降のcolumn headerを左右へdragしてその場で並び替えられる。

- drop位置をline等で明示する。
- resize handleをdragした場合はreorderではなくresizeを優先する。
- `Task`はleft sticky foundationなので移動 / 非表示不可。
- Bulk slot / Execution Controlも固定。

### 7.2 Column menu

Day Toolbarに`列`menuを用意する。

- 表示 / 非表示checkbox
- `Project`以降のcolumn order変更
- `初期状態に戻す`

Day Table headerからのD&DとColumn menuのorderは常に同期する。

### 7.3 Resize / Auto Fit

- header境界dragでlive resize。
- 境界double clickでその列をAuto Fit。
- hit areaはvisual 1px線より広く取る。

### 7.4 Sortしない

一般Tableのようなheader clickによるdata sortは行わない。

Task順はTaskChuteのplanning / forecast authorityなので、Project列click等でexecution orderを変更しない。

### 7.5 Persistence

初期Desktop Webでは、data columnの順序、幅、表示 / 非表示をbrowser `localStorage`へ保存し、同じbrowserで復元する方向とする。

## 8. Row focus / hover / edit state

Row focus、Bulk checkbox selection、Running stateは別概念として扱う。

- hover: 行背景をわずかに変える。
- Row focus: 薄い背景 + 左端の細いaccent / outline等。
- running: focusとは別の軽いaccent / Task名Semibold等。
- field edit: 対象cellへ明確なfocus ring。

強い全面blue fillは避ける。

Section summary rowもRow focus対象とし、Task Rowと同じvisual languageを使う。

## 9. Section grouping / summary

D-030 / D-031に従う。

基本例:

```text
⌄  ☀  05:00–09:00  朝      ☑ 6/12      ⌛ 2時間40分      ◷ ██████────  1時間20分      ＋
```

表示要素:

- collapse chevron
- user-configurable icon
- Section logical time
- Section名
- completed / total Task count
- estimate合計
- actual Section capacity usage bar + remaining capacity
- compact `＋` Task追加

### 9.1 Section count

Quick Interruptで生成されたTaskも通常Taskとして総数へ含める。Interruptで終了したhistorical rowも実行済み件数として扱える。

`実行済みを非表示`にしてもSection summaryはvisibility filterで再集計しない。

### 9.2 Estimate summary

- Section所属Entryの見積合計。
- estimate progress barは付けない。
- Section durationを超えた場合、estimate textだけをwarning color等で示す。

### 9.3 Capacity bar

- estimateではなくvalid Execution actualを利用。
- Section intervalとのactual overlap durationで集計。
- ExecutionがSection境界をまたげば各Sectionへoverlap分だけ分配。
- barは0〜100%でcapし、Task placementのspilloverを100%超えとして表現しない。
- neutral gray系を基本とし、Section accentをbar全体へ強制しない。

### 9.4 Collapse

- Section summary自身は常に表示。
- 初回はexpanded。
- collapse stateは`TaskChuteDay × Section`ごとに独立記憶。
- 初期Desktop WebではlocalStorage等のUI preference。
- J/K navigationではcollapsed child rowsをskipする。

### 9.5 Empty Section

通常SectionはTask 0件でも表示する。0件時はsummaryを簡略化してよい。

### 9.6 Sectionなし

`Sectionなし`は「今日やるが実行時間帯をまだ決めていない」temporary Day-planning group。

- Taskがあるときだけ通常Sectionより上に表示。
- time interval / capacity barなし。
- collapse可能。
- 開始予定を入力したら該当Sectionへ自動move。
- StartしたらStart時刻のcurrent Sectionへmoveしてから実行。
- 開始見込計算対象外。

### 9.7 Section settings

Section設定画面はcompact table editorを基本とする。

```text
Icon  Section名       開始       終了                    Accent
────────────────────────────────────────────────────────────
 ☀    朝              05:00      09:00                   ●  ×
 ◷    午前            09:00      12:00                   ●  ×
 ◇    昼              12:00      13:00                   ●  ×
      午後            13:00      18:00                   ●  ×
      夜              18:00      29:00（翌05:00）        ●  ×
```

Section順は時間順から自動決定し、manual reorder handleは置かない。

境界、追加、削除、historical context、extended-time notationはD-030に従う。

## 10. Project / Mode / Section selector

### 10.1 Project / Mode common UX

ProjectとModeは同じselector interactionを使う。

```text
検索…
────────────
候補A
候補B
...
────────────
＋ 新規Project / Modeを作成
```

- clickまたはfield focusから選択。
- keyboard文字入力ですぐ検索開始。
- `↑ / ↓`候補移動、`Enter`決定、`Esc`閉じる。
- match 0件では入力値を使ったquick create entryを出す。
- quick createのinitial required fieldは名前だけとし、作成後そのTaskへ即設定。
- quick createしたProject / Modeは設定順の末尾へ追加する。

### 10.2 Romaji Japanese search

IMEで日本語変換しなくても日本語labelを検索しやすくする。

最低限の検索pipeline:

1. direct substring match
2. 大文字小文字 / 全角半角等のnormalization
3. ひらがな / カタカナnormalization
4. romaji input → かな変換によるmatch
5. 利用可能なreading indexがある場合の漢字読みmatch

例:

```text
Project: タスクシュート開発
search: tasuku
→ タスクシュート開発
```

検索用romajiを新規Project名へ勝手に日本語変換して保存しない。quick create時はユーザーが入力したnameをauthorityとする。

### 10.3 Project / Mode settings order

別設定画面でuser-defined orderをD&D変更できる。

```text
Project設定                 Mode設定
≡ TaskChute Platform        ≡ 集中
≡ 仕事                      ≡ 軽作業
≡ 個人開発                  ≡ 移動
```

通常selectorはこの設定順を使う。検索中はmatch relevanceを優先し、検索終了後は設定順へ戻る。

### 10.4 Section selector

Section selectorはtime orderで表示する。

```text
Sectionなし
朝      05:00–09:00
午前    09:00–12:00
...
────────────
Section設定を開く…
```

Day TableからSectionをquick createしない。Section追加は全日coverageに影響するため、Section設定画面で行う。

Section直接変更は未実行Taskのみを基本とし、D-031に従い開始予定をclearする。

## 11. Task field inline edit

Row選択状態で`Tab`を押すと、最初の**現在表示されているeditable field**へ入り、追加の`Enter`なしでそのまま編集可能状態にする。

Tab orderは現在のvisual column orderに追従する。

read-onlyの`開始見込` / `実績`等はTab対象からskipする。非表示columnもskipする。

基本:

- `Tab`: 確定して次editable field。
- `Shift+Tab`: 確定して前editable field。
- `Enter`: current fieldを確定。
- `Esc`: current editを破棄しRow selectionへ戻る。

Field edit / IME composing中はglobal single-key shortcutを発火させない。

### 11.1 Task name

- inline text edit。
- Task名はrequired。
- 新規Taskが未確定かつ空のまま`Esc`された場合はその新規rowを破棄。

### 11.2 Estimate

optional。入力例:

```text
30      → 30分
30m     → 30分
1h      → 60分
1h30m   → 90分
```

空なら`—`。見積なし自体はwarningにしない。

### 11.3 Planned start

入力例:

```text
900     → 09:00
09:00   → 09:00
1330    → 13:30
29:00   → 29:00（翌05:00）
```

D-031に従い、値変更時はSectionを自動resolveする。空にした場合はcurrent Sectionを維持する。

### 11.4 Start forecast

read-only。D-032に従う。

- completed / interrupted: `—`
- running自身: `—`
- Sectionなし: `—`
- past Day: `—`
- future / current unexecuted: derived forecast

owning Section終了を超えた場合だけsubtle warning color + Tooltip。

例:

```text
開始見込 12:18
Tooltip: 開始見込がSection終了 12:00 を超えています
```

開始予定と開始見込が単に違うだけではwarningにしない。

### 11.5 Actual start / end / duration

D-033に従う。

- Start controlでactual startを自動記録。
- 実行中のEndは`—`。
- Running中の実績はlive elapsed。
- Complete controlでcurrent timeをendとして確定。
- Actual start / endはユーザーが直接入力・後修正可能。
- Running TaskへEndを入力したら指定時刻でComplete。
- Actual durationはread-only derived。
- completed actual start / end修正後はduration / Section capacity等を即再計算。

Execution overlapは保存不可。衝突Taskを可能な範囲で示す。

```text
「資料作成」の実行時間 10:00–11:00 と重複しています
```

auto shiftしない。

### 11.6 Estimate overrun

Day Tableでは実績値だけをsubtle warning colorにする。

Tooltip例:

```text
見積を15分超過
```

Table内に別の`+15分`列は追加しない。

## 12. Task ordering / D&D

D-031をvisual interactionへ反映する。

Section内:

1. 開始予定なしTask — manual order
2. 開始予定ありTask — planned start昇順
3. 同一planned start — manual stable tie-break

- planned start editで自動reposition。
- planned startありTaskを時刻順違反の位置へ固定できない。
- 同時刻Task間はreorder可能。
- 開始予定なしTaskは`Shift+↑/↓`またはD&Dでmanual reorder可能。
- Section間D&DはSection変更としてplanned startをclearし、移動先の開始予定なし領域へ入る。
- completed / interrupted historical rowはmove / reorder不可。

## 13. New Task / insert

### 13.1 Keyboard `I`

Task Row selected:

- 選択Taskの直下へnew Taskを挿入。
- 同じSectionをinitial placementとする。
- planned startは空。
- Project / Modeは勝手に前Taskから継承しない。
- Task名fieldへ即focus。

Section summary selected:

- そのSectionへnew Task。
- planned startなし領域へ入る。

Sectionなし selected:

- SectionなしTaskを作成。

### 13.2 Section summary `＋`

`I`と同じSection直下Task作成入口として使用する。

## 14. Task context menu

Task Row右端の`…`を通常時はmuted、hover / Row focus時に濃くする。layout shiftしないようslotは維持する。

右clickまたは`Shift + F10`でも同じmenuを開く。

```text
前日へ移動
翌日へ移動
日付を選択…
────────────────
ルーティン設定…
タスクを複製
タスクノートを開く
────────────────
削除
```

`セクションを移動`は入れない。Section columnがprimary入口。

Menu mode:

- `↑ / ↓`: item移動
- `Enter`: 実行
- `Esc`: 閉じる
- 通常single-key shortcutは停止

利用不可actionもmenuから消さずdisabledで同じ位置へ残す。必要ならTooltipで理由を示す。

### 14.1 Day move

未実行Taskのみ。

- 前日 / 翌日: immediate move。
- 日付を選択: calendar pickerを開く。
- 過去Dayも選択可能。
- 移動先は`Sectionなし` + planned start clear。
- Task名 / Project / Mode / estimate / Note等は維持。
- Routine TaskはそのOccurrenceだけを移動し、Routine schedule自体は変更しない。

Calendar picker:

```text
‹     2026年 8月      ›
月 火 水 木 金 土 日
...
今日
```

- date clickで選択・moveを確定してよい。
- arrow keysで日付移動。
- `PageUp / PageDown`で月移動。
- `Enter`選択。
- `Esc`cancel。

### 14.2 Duplicate

`Ctrl+C`（Row selection mode）またはmenu。

copy:

- Task名
- Project
- Mode
- Section
- estimate
- planned start
- day-specific Task Note

copyしない:

- actual start / end
- Execution history
- actual duration
- completed / interrupted state
- forecast
- Routine relation

duplicate先はfresh未実行Task。Routine Taskをduplicateしても新Taskは通常Taskとし、Routine iconはinactive状態にする。

同じplanned startを持つ場合は同時刻manual tie-breakで元Task直下を優先する。

text edit中の`Ctrl+C`は通常clipboard copyとして動作する。

### 14.3 Delete

- 未実行: delete可能。
- running: delete可能。current executionをvalid actualから除外し、Taskをnormal Day projectionからremoveするD-037 semantics。
- completed / interrupted historical: disabled。

Single confirmation例:

```text
「資料作成」を削除しますか？

[キャンセル]  [削除]
```

Runningの場合は実行中Taskを含むことを明示する。

Dialog中:

- `← / →`: button選択
- `Enter`: 決定
- `Esc`: cancel

Routine Taskのday deleteでは、Routine本体へ影響しないことを補助表示する。

## 15. Routine column

Routineは独立したcompact column。

**同じRoutine iconを常時表示し、色でrelation有無を補助表示する。**

```text
↻  Routineあり: accent color
↻  Routineなし: muted gray
```

- Routineあり: click / Enterで元Routine設定への入口。
- Routineなし: click / EnterでこのTaskからRoutine作成への入口。
- Routine columnをprimary入口とする。
- `… → ルーティン設定…`もsecondary入口として残す。

Routine relationを色だけへ依存させず、Tooltip / accessible labelも付与する。

## 16. Routine edit scope popup

Routine由来TaskのRoutine default対象fieldをDay Tableで編集したら、確定時に**反映scopeを明示的に聞く**。

例:

```text
この変更をどこに反映しますか？

見積
15分 → 30分

[今回だけ]   [ルーティンに反映]
```

- default focus / safest choiceは`今回だけ`。
- `今回だけ`: current Occurrence field override。
- `ルーティンに反映`: Routine defaultを更新し、D-034に従いfuture applicable Occurrenceへ反映。
- `Esc`: edit自体をcancelし元値へ戻す。

対象例:

- Task名
- Project
- Mode
- Section
- estimate
- planned start
- Task Note

対象外:

- actual start
- actual end
- actual duration
- forecast
- execution state

SectionをRoutineへ反映する場合もplanned startとのauthority ruleはD-031に従う。Sectionを直接変更すればplanned start defaultをclearする。

Task Noteは1文字入力ごとではなく、Note edit sessionの確定時に一度scopeを聞く。

## 17. Routine settings

基本layout:

```text
Routine設定
────────────────────────
名前
[ 朝のメール確認 ]

繰り返し
[ 営業日 ▾ ]

開始日
[ 2026/08/26 ]

終了
● なし
○ 日付まで [ 2026/12/31 ]

Task defaults
────────────────────────
Project       [ 仕事 ▾ ]
Mode          [ 集中 ▾ ]
Section       [ 朝 ▾ ]
見積          [ 15分 ]
開始予定      [ 08:00 ]
Task Note     [ ... ]

状態: 有効
[ Routineを停止 ]

               [キャンセル] [保存]
────────────────────────
Routineを削除
```

終了日はinclusive。count-based終了条件はinitial scopeに入れない。

停止済みRoutineでは停止状態 / 停止日と`Routineを再開`入口を表示する。再開日は明示選択し、停止期間をbackfillしない。

Routine deleteは強めのconfirmationを出し、過去Task / Execution historyが残ることを説明する。

## 18. Routine recurrence patterns

initial selector:

```text
毎日
日ごと

営業日
休日
祝日

毎週
週ごと

毎月指定日
月ごと
毎月第N曜日
月末
月末営業日
```

### 18.1 日ごと

```text
[ 3 ] 日ごと
```

calendar day interval。営業日skipはしない。

### 18.2 毎週

```text
[月] [火] [水] [木] [金] [土] [日]
```

複数曜日選択可。祝日でもcalendar weekdayなら発生する。

### 18.3 週ごと

```text
[ 2 ] 週ごと
[月] [火] [水] [木] [金] [土] [日]
```

### 18.4 毎月指定日

```text
[ 5 ] [ 15 ] [ 25 ]
＋ 日付を追加
```

複数指定可。存在しない31日等はその月だけskipし、月末へclampしない。

### 18.5 月ごと

```text
[ 2 ] か月ごと
日付 [ 15 ] 日
```

存在しない日付はskip。

### 18.6 毎月第N曜日

```text
[ 第2 ▾ ] [ 月曜日 ▾ ]
```

`第1〜第5 / 最終`を扱う。存在しない第5はskip。

### 18.7 月末 / 月末営業日

- 月末: civil month最終日。
- 月末営業日: D-035 effective workday判定でmonth内最後の営業日。

## 19. Workday / holiday settings

Routine settingsとは別の全体設定として扱う。

### 19.1 指定休日

```text
指定休日
────────────────────────
日付          理由
2026/09/29   代休
2026/10/02   有給
2026/12/30   会社休日

＋ 指定休日を追加
```

`理由`はoptional free text。固定categoryにしない。

### 19.2 営業日扱い

```text
営業日扱い
────────────────────────
日付          理由
2026/09/23   休日出勤
2026/10/10   棚卸し

＋ 営業日扱いを追加
```

同一日を指定休日 / 営業日扱いの双方へ同時登録しない。

Routine selector上の意味:

- `営業日`: user override後のeffective workday。
- `休日`: user override後のeffective holiday。
- `祝日`: public holiday factそのもの。

したがって祝日を休日出勤として営業日扱いにした日は、`営業日Routine`と`祝日Routine`の双方に該当し、`休日Routine`には該当しない。

## 20. Routine occurrence UX

Projected / Materializedの内部差を通常UIへ出さない。

ユーザーからは常に「その日に予定されたRoutine Task」に見せる。

- day-only deleteはOccurrence Skip。Routine本体は残る。
- Skip済みOccurrenceはreloadで復活させない。
- day moveはそのOccurrenceだけのscheduled-date override。
- Routine schedule変更で明示move済みOccurrenceを勝手に消さない。
- schedule変更で同日重複が生じてもauto dedupeしない。必要ならlight notification。
- Calendar Viewの具体interaction / implementationは後続設計とし、現Day UI scopeでは実装要求しない。

## 21. Note column / Task Note Pane

Task Noteは独立columnとする。ユーザーは他data columnと同様に非表示 / reorder可能。

Note columnはcompact icon action。

- Noteあり: iconを少し濃くする。
- Noteなし: muted。
- click: そのTaskのTask Note Paneを開く。
- `… → タスクノートを開く`も同じ動作。

### 21.1 Pane content

Pane headerに**Task名だけ**を表示し、Project / Mode / Section / estimate等の重複情報は置かない。

```text
Task Note                         ×
──────────────────────────────────
資料作成
──────────────────────────────────

[ Note editor ... ]
```

- Task名 + editor + closeを基本構成。
- autosaveを基本とする。
- Pane幅はdrag resize可能。初期約360pxをstarting point。
- widthをlocal preferenceとして記憶できる方向。

### 21.2 Active Note target

**Row focusへ自動追従しない。**

ユーザーが能動的にNoteを開いたTaskへPaneを固定する。

- J/Kで別Taskへfocus移動してもPane内容は変わらない。
- 別TaskのNote buttonを押したときだけPane targetを切り替える。

Routine Task Noteを編集した場合はSection 16のscope popupをedit session確定時に出す。

## 22. Keyboard interaction

Keyboard操作はRow / Section focusをfoundationとする。

### 22.1 Row / Section selection mode

| Key | Action |
| --- | --- |
| `J` / `↓` | 次のvisible Task / Sectionへfocus |
| `K` / `↑` | 前のvisible Task / Sectionへfocus |
| `S` | selected未実行TaskをStart / running TaskをComplete |
| `U` | selected current running Taskを「未実行に戻す」 |
| `I` | Task追加 |
| `Shift+↑ / ↓` | manual reorder可能範囲でTask移動 |
| `D` | delete confirmation |
| `X` | Bulk Selection toggle |
| `F` | Hit-a-Hint mode |
| `Ctrl+C` | Task duplicate |
| `Shift+F10` | Task context menu |
| `Shift+← / →` | 前 / 次Day Board |
| `?` | shortcut help |
| `Tab` | selected Taskの最初のvisible editable fieldへ入り、即edit-ready |
| `Esc` | current modeから1段戻る / cancel |

Section summary selected時の`Enter`はcollapse / expand。

### 22.2 Field edit mode

- single-key global shortcutを停止。
- normal文字入力 / IMEを優先。
- `Tab / Shift+Tab`でvisible editable fields間移動。
- `Enter`で確定。
- `Esc`で変更破棄してRow selectionへ戻る。

### 22.3 Modal / menu mode

Modal / overlayが開いている間はそのcomponentのkeyだけを有効にし、`S / D / I / U / X / F / J / K`等をglobal actionとして発火させない。

### 22.4 IME

IME composing中はone-key global shortcutを発火しない。

## 23. Hit-a-Hint

`F`でHit-a-Hint modeへ入る。

- 現在visibleな**actionable element**へtemporary hint overlayを付ける。
- read-only cellはactionがない限りhint対象にしない。
- 対象例: Day navigation、Execution Control、editable cells、selector、Routine / Note button、Section collapse、Section `＋`、context action等。
- hintは1〜2文字等の短いsequenceを利用する方向。
- mode中の文字入力はhint filter / activation専用。
- `D / S / U / I / X / J / K`等を通常shortcutとして実行しない。
- `Esc`でexit。

exact hint alphabet / assignment algorithmは後続visual / implementation detail。

## 24. Bulk Selection

`X`でBulk Selection Modeへ入り、focused eligible Taskをtoggleする。

- Row focusとcheckbox selectionは別。
- J/Kはfocusだけを移動。
- Xでfocused Taskのselection toggle。
- Dでbulk delete confirmation。
- Escでselection clear / mode exit。
- delete完了後はmode exit。

eligible:

- 未実行Task
- running Task

not eligible:

- completed historical
- interrupted historical

running Taskをbulk deleteへ含める場合、confirmationで明示する。

fixed Bulk slotにcheckboxを描画するため、mode entryでTable layoutをshiftさせない。

## 25. Interrupt / Quick Interrupt display

D-028に従う。

例:

```text
Task A running
Task B planned

Task BへInterrupt
↓
Task A interrupted historical
Task B running
Task A continuation planned
```

continuationのTask名へ`続き`等を自動追加しない。

Quick Interruptではdefault title `（割込）` Taskを即生成・Startし、現在時刻のcurrent Sectionへ配置する。

Quick Interrupt Taskも通常Taskとしてcount / history / Section capacityへ参加する。

nested Quick Interruptを許容する。

## 26. Complete後focus

Complete後に次Taskを自動Startしない。

canonical completion後、Day上の次の実行可能TaskへRow focusを移動する。

- historical / Start不能rowをskip。
- collapsed child等visibilityも考慮。
- 必要ならscroll into view。
- Bulk selectionは変更しない。
- 次がなければ無理にfocusを作らない。

## 27. Floating Runner

active Executionが存在するときだけ、Main content下部中央付近にcompact floating UIとして1つ表示する。

full-width footerにはしない。Desktop幅は400〜600px程度、約480pxをstarting pointとする。

基本情報:

- Task名
- logical daily work chain全体の累積actual
- original estimate（あれば）
- progress bar
- Revert current Start
- Quick Interrupt
- Complete
- Minimize

### 27.1 Planning情報を入れない

Floating Runnerはexecution focusに限定し、開始予定 / 開始見込 / schedule deltaを表示しない。それらはDay Tableで扱う。

### 27.2 Progress

current Execution segmentだけでなく、同じlogical daily work chain全体のvalid actualをnumeratorとする。

- estimateあり: `actual / original estimate`。
- barは100%でcap。
- elapsedは超過後も増える。
- estimateなし: elapsedのみを意味ある値として表示し、根拠なくbarを増やさない。

### 27.3 Estimate overrun

Runner全体を赤くしない。

例:

```text
01:07:32 / 見積60分   +7分
```

`+7分`等のoverrun部分だけsubtle warning color。

### 27.4 Navigation / title edit

- Task名clickでRunner内inline edit可能。
- Routine Task title editならSection 16のscope選択を適用する。
- interactive element以外のRunner body clickでDay Tableのrunning rowへscroll + focus。

### 27.5 Actions

icon-only + Tooltip / accessible label。

- Revert: D-029のcurrent Start取消。
- Quick Interrupt: D-028。
- Complete: primary action。

### 27.6 Minimize

MinimizeするとRunner本体を完全に畳み、restore controlだけを残す。

```text
[⌃]
```

- minimized preferenceを同browserで保持。
- minimized中にExecution終了すればrestore controlも消える。
- 次Task Start時もminimized preferenceを維持できる方向。

## 28. Executed history visibility

Day Tableで`実行済みを表示 / 非表示`を切り替えられる。initialは表示。

非表示対象:

- completed row
- interrupted historical row

running / unexecutedは残す。

visibility変更はprojectionだけで、historical fact / Section summaryを変更しない。

初期Desktop Webではlast stateをlocalStorageへ保持する方向。

## 29. Accessibility

- 色だけで状態を表現しない。
- iconにはTooltip / accessible label。
- keyboard focusを常に視認可能にする。
- sufficiently large hit area。
- keyboard-onlyで主要Day操作へ到達可能にする。
- browser / OS standard shortcutとのconflictを実機検証する。
- `Ctrl+C`はRow selection modeだけduplicateとして扱い、text edit / text selectionではstandard clipboard behaviorを維持する。

## 30. Responsive direction

Desktopをinitial primary targetとする。

ただし、Sidebar、Task Note Pane、Floating Runner、Day TableをDesktop固定layoutへ過度にcoupleしない。

Tablet / Mobileでは同じcolumn density / sticky幅 / keyboard bindingをそのまま要求せず、別responsive interactionを設計できる構造にする。

## 31. Current Day UI structure

```text
Top Navigation
↓
Left Sidebar
↓
Day Toolbar
  - 新規Task
  - Filter
  - 実行済み 表示 / 非表示
  - 列
↓
Day Table
  Fixed sticky left
    - Bulk slot
    - circular Execution Control
    - Task
  Reorderable / hideable data columns
    - Project
    - Mode
    - Section
    - Routine
    - Note
    - 見積
    - 開始予定
    - 開始見込
    - 開始
    - 終了
    - 実績
  ↓
  Sectionなし（Taskがあるときだけ）
  ↓
  Section summary
  ↓
  Task Rows
  ↓
  next Section ...
↓
Task Note Pane（明示open時）
↓
Floating Runner（active Execution時）
```

## 32. 未確定事項

以下は後続設計 / prototype / implementation検証で詰める。

- exact row height / column minimum width / icon glyph / pixel metrics
- interrupted historical Execution Control exact icon
- exact Hit-a-Hint alphabet / label assignment
- browser / OSごとのshortcut conflict / accessibility validation
- final D&D library / interaction implementation
- Task Note editor library / autosave conflict UX
- Project / Mode漢字reading indexのexact生成方式
- public holiday data source / update UX
- Routine recurrence controlのexact component styling
- Right generic Detail Pane exact UX
- Floating Runner exact animation
- Mobile / Tablet UI
- Project画面
- Calendar画面 / Calendar interaction（Routine projection foundationはcanonical Decisionで保持するが、具体Viewは後続）
- Notes画面
- Analytics画面
- Section logical timeのactual instant mapping / DST edge UX
- user-selected TaskChuteDay boundaryとinitial Section templateのexact onboarding UX
- Section icon picker / accent palette exact component
- Section collapse state / column preference等をaccount / device syncするか
- continuation indicatorの必要性
- remaining estimate 0以下で未完了の場合のre-estimation UX
- running delete / cancelled historyをReview UIへどう露出するか

これらを本DESIGN.mdだけでProduct / Domain仕様として確定しない。
