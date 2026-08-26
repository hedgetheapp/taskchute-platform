# TaskChute Platform — DESIGN.md

> Status: Draft
>
> この文書は TaskChute Platform の UI / Visual Design に関する設計指針を定義する。
>
> Product仕様、Domain、Architectureに関する正本は、それぞれ対応するcanonical docsとする。本書はそれらを変更・上書きするものではない。
>
> UI上の表現から新しいDomain semanticsを暗黙に追加してはならない。

## 1. デザイン方針

TaskChute PlatformのUIは、**「一日のタスクと現在の実行状態を、少ない認知負荷で把握・操作できること」**を最優先とする。

デザインはNotionのような、シンプル、高密度、情報中心、控えめな装飾、十分な余白、一貫したレイアウトを基本とする。

参考: [awesome-design-md-jp / Notion](https://github.com/kzhrknt/awesome-design-md-jp/tree/main/design-md/notion)

Notionそのものを再現するのではなく、TaskChuteの時間管理・実行管理に適したUIへ調整する。

## 2. 基本原則

### 2.1 情報を主役にする

装飾よりもタスク、時間、実行状態などの情報を優先する。

過度なグラデーション、強いシャドウ、大きな装飾、不要なカード分割は避ける。

### 2.2 現在の状態を明確にする

ユーザーが画面を見たとき、今どのタスクを実行しているか、どこまで完了しているか、次に何をするかを素早く把握できることを重視する。

実行中タスクは他の状態より視覚的優先度を高くする。

### 2.3 一日の流れをSectionで把握する

一日のタスク全体は**1つの連続したDay Table**として扱うが、TaskChuteDay上の時間帯を素早く把握できるよう、各Sectionの先頭にSection summary rowを表示する。

Sectionごとに独立したCard / 別Tableへ分割せず、Section summary rowとその配下のTask Rowを同じDay Table内で連続表示する。

Section summary rowは単なる装飾separatorではなく、Section時間帯、Task件数、見積合計、Section容量のactual使用状況を確認する情報行として扱う。

## 3. カラー

### 3.1 基本カラー

- 基本背景: `#FFFFFF`
- サブ背景: `#F7F7F5`
- 基本テキスト: `#191919`
- セカンダリテキスト: `#787774`
- Border: `#E9E9E7`
- Primary Accent: `#2383E2`

### 3.2 ステータスカラー

状態の色は補助情報として使用し、色だけに意味を依存しない。

例:

- 未開始: Gray
- 実行中: Blue
- 完了: Green
- 割り込み終了: Neutral / muted

ステータスはアイコンとaccessible label / Tooltipを組み合わせる。

### 3.3 Sectionカラー

SectionはユーザーがSection単位でiconとaccent colorを設定できる方向とする。

- accentは主にSection iconとSection名へ適用する。
- 時間帯、Task件数、見積、容量bar等のsummary情報は原則neutral colorを維持する。
- defaultはmuted gray系とし、ユーザーが色指定しなくてもSectionが過度に目立たないようにする。
- Section row全体を強いaccent colorで塗りつぶさない。
- iconとSection名へ同じaccentを適用し、icon color / text colorを別々に細分化した設定は初期scopeで必須にしない。

## 4. タイポグラフィ

基本フォントはOS標準の読みやすいSans Serifを優先する。

候補: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

日本語についてはOS標準日本語フォントへ自然にfallbackさせる。

- 本文: 14px前後
- 補助情報: 12〜13px
- 重要な情報: 14〜16px / Medium〜Semibold

大きな見出しを多用しない。TaskChuteは情報密度を重視する。

## 5. スペーシング

基本単位は4pxとする。主に `4px / 8px / 12px / 16px / 24px / 32px` を使用する。

テーブルでは縦方向の余白を抑え、一画面に十分な数のタスクを表示できるようにする。

## 6. 基本画面構成

Desktop版の主な領域:

1. Top Navigation
2. Left Sidebar
3. Task Controls
4. Day Table
5. Floating Runner
6. Right Detail Pane（将来）

## 7. Top Navigation

Top Navigationには主に、Sidebar開閉、TaskChuteロゴ、前日、翌日、今日、日付選択、検索、設定、アカウントなどを配置する。

操作頻度の低い機能は視覚的優先度を下げる。

## 8. Sidebar

左Sidebarには主要Navigationを配置する。

主要Navigation候補は、今日、カレンダー、プロジェクト、タスク、**ノート**、分析、設定とする。D-025に従い、NotesはTask / Projectの従属UIだけではなくtop-level Product capabilityとして入口を持つ。

DesktopのSidebar幅は初期値を`240px`とし、右端のResize Handleを左右へドラッグして変更できるようにする。

- 最小幅: `180px`
- 最大幅: `420px`
- Resize Handleのhit areaは境界線そのものより広く確保し、通常時は目立たせずhover / drag時に視認性を高める。
- drag中はSidebar幅をリアルタイムに変更し、Main contentも追従する。
- 最小幅まで縮めても自動的にSidebarを閉じない。resizeとopen / closeは別操作とする。

SidebarはTop Navigation等の明示操作で完全に閉じられる。閉じた状態は`0px`相当とし、狭いicon-only Sidebarを別の第三状態として必須にはしない。閉じた状態でも再表示できる操作を必ず残す。

再表示時は閉じる直前のSidebar幅へ戻す。Sidebarの最後の幅とopen / closed状態は、初期Desktop Webではbrowser `localStorage`に保存し、同じbrowserで次回利用時に復元する。account間 / device間の同期は現段階では要求しない。

将来的なレスポンシブ対応を考慮し、Sidebarが常時表示されることを前提にしない。Mobile / Tabletで同じresize behaviorをそのまま要求するものではない。

## 9. Right Detail Pane

Task詳細やDocumentを表示するRight Detail Paneを将来的に設ける。現段階では詳細UIそのものは確定しない。

ただしメイン画面には、Right Detail Paneを開くための操作を配置できる設計とする。Paneが閉じている状態を基本表示とする。

## 10. Task Controls

Day Table上部にタスク操作領域を配置する。

主な要素は、新しいタスクを入力、フィルター、追加、**実行済みを表示 / 非表示**、その他操作。

画面下部に別の「タスクを追加」領域は設けず、タスク追加操作は上部へ集約する。Section summary rowにはそのSectionへ直接Taskを追加するcompactな`＋`操作を併用できる。

## 11. Day Table

Day TableはTaskChuteの中心UIである。一日のタスクを**単一のテーブル**として表示する。

- 原則として `1 Task Row = 1行` とする。
- Task名を含むセルは基本1行表示とし、列幅を超える内容は折り返さずclipする。ellipsis `...` は使用しない。
- Table全体がViewport幅を超える場合は横スクロールを許容し、列を自動的に消さない。
- 実行済みhistory rowは表示 / 非表示を切り替えられる。初期状態は表示とする。
- Sectionごとに別Tableや独立Cardへ分割しない。
- 通常SectionはTaskが0件でもSection summary rowを表示する。空Sectionであること自体を一日の余白として把握できるようにする。
- Section未設定Entryが存在する場合だけ、通常Sectionより上に特殊な`Sectionなし` groupを表示する。

## 12. Table Header / Default Columns

列HeaderはDay Tableの最上部に一度だけ表示する。

初期列順は以下とする。

| 選択 | 状態 | タスク名 | プロジェクト | モード | セクション | 見積時間 | 開始予定時間 | 開始見込時間 | 開始時間 | 終了時間 | 実績時間 | ルーティン | リンク | コメント | ノート |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

この順序は初期値であり、ユーザーは列順を変更できる。

Tag列は現時点のdefault Day Table列には含めない。将来必要になった場合は追加列として再検討する。

## 13. Checkbox列

初期状態では最左列を複数選択用Checkboxとする。

Checkboxの役割は**行選択**であり、Taskの実行状態やrow focusを表現するものではない。Headerには全Task選択用Checkboxを配置できる。

Checkbox列も他列と同様にユーザーが並び替え可能とする。

## 14. Status列

Status列は**cell内をicon-only**とし、Checkbox列とは分離する。

基本表示:

- `○` 未実行
- `▶` 実行中
- `⏸` 割り込み終了したExecution区間
- `✓` 完了

IconにはTooltip / accessible labelを提供する。

Status cellは実行操作のprimary入口として利用する。

- 未実行の`○`を操作するとStartする。
- running中の`▶`を操作するとCompleteする。
- 別Taskがrunning中に未実行Taskを開始する場合は、D-028のexplicit Interrupt workflowを実行する。
- 完了 / 割り込み終了したhistorical rowは通常のStart / Complete操作対象にしない。

## 15. Task名列

Task名はテーブル内で最も重要な情報の1つとして扱い、初期状態で十分な横幅を確保する。

- Task名は1行表示。
- 列幅を超えた場合はclipし、ellipsisは使用しない。
- 実行中TaskはSemibold等で若干強調してよい。
- Interrupt continuationで生成された同名Taskへ、Task title自体に「続き」等の文字列を自動追加しない。
- continuation indicatorを別途追加するかは必要性を確認して後続設計する。

## 16. Project / Mode / Section

### Project

ProjectはTask名と同じcellへ埋め込まず、独立列として表示する。

### Mode

D-026に従い、Modeはユーザー定義で意味をProduct側に固定しない。その日のEntryごとに0..1 Modeを選択できる。

### Section

Sectionはその日のEntryの配置文脈として独立列に表示する。

D-030に従い、基本Section configurationはユーザー設定のTaskChuteDay全体をgap / overlapなくcoverする。Section順序は時間順から決まり、manual Section reorderは持たない。

Quick Interruptで自動生成するその日のTaskは、割り込みを開始した時刻のcurrent Sectionへ配置する。元TaskのSectionを単純copyする挙動にはしない。

### Section summary row

各通常Sectionの先頭に、Day Table全列を横断するSection summary rowを表示する。Task Rowと同じ列へ情報を無理に割り当てず、summary row専用のcompact layoutを持つ。

基本構成例:

```text
⌄  ☀  05:00–09:00  朝      ☑ 6/12      ⌛ 2時間40分      ◷ ██████────  1時間20分      ＋
```

情報の意味:

- `⌄ / ›`: Section展開 / 折りたたみ。
- `☀`: Sectionごとにユーザー設定可能なicon。
- `05:00–09:00`: Section logical time。補助情報としてSection名より弱く見せる。
- `朝`: Section名。iconとともにSection identityの中心情報。
- `☑ 6/12`: 実行済み件数 / Section内総Task row数。Quick Interruptで生成されたTaskも分母へ含め、Complete済みとInterruptで終了したhistorical rowを実行済み件数へ含める。
- `⌛ 2時間40分`: Section所属Entryの合計見積。完了済み・実行中になっても計画時の見積をsummaryから消さない。
- `◷ + bar + 1時間20分`: Section容量のactual使用状況。barはactual使用時間が増えるほど左から右へ埋まる。右側の時間は残りSection容量を表す。
- `＋`: そのSectionへ直接Taskを追加する。

合計見積がSection容量を超える場合は、`⌛`の時間値をred等のwarning colorで示す。見積そのものにはprogress barを付けない。

容量barは**見積ではなくExecution実績**を基準にする。Section durationを100%とし、そのSectionのactual interval内でvalid Executionが占有したoverlap durationを左から右へ埋める。ExecutionがSection境界をまたぐ場合、各Sectionのbarにはその時間帯とoverlapした分だけ反映する。barは最大100%であり、Section所属Taskのspilloverをbarの100%超過として表現しない。

通常時のbarはneutral gray系を基本とし、Section accent colorを必須適用しない。

Section summaryは「実行済みを非表示」のprojection filterで再集計しない。historical rowをTableから隠しても、`6/12`、合計見積、容量使用状況はSection全体のsummaryを維持する。

### Section collapse

- Section summary row左端のchevronでSection配下Task Rowを開閉できる。
- Section summary row自体は折りたたみ中も常に表示する。
- 初めてそのTaskChuteDayを開く場合は全Section展開をdefaultとする。
- collapse状態は**TaskChuteDay × Section**単位で記憶し、別日の同じSectionへ自動共有しない。
- 例として8/25の「朝」を折りたたんでも、8/26の「朝」は独立した状態を持つ。8/25へ戻った場合は8/25で最後に使用した状態を復元する。
- 初期Desktop Webではbrowser `localStorage`等のUI preferenceとして保持する方向とし、account / device間syncは現段階では要求しない。
- running Taskが折りたたまれたSection内に存在しても、Sectionを強制展開しない。実行中Taskの全体把握はFloating Runnerでも担保する。

### 空Section

通常SectionはTaskが0件でも表示する。0件時は`☑ 0/0`や`⌛ 0分`を必須表示せず、summaryを簡略化してよい。

```text
⌄  ☀  13:00–18:00  午後      タスクなし      ◷ ──────────  5時間      ＋
```

### Sectionなし group

Section未設定Entryが1件以上存在する場合だけ、通常Sectionより上に`Sectionなし` groupを表示する。

```text
⌄  Sectionなし      ☑ 1/3      ⌛ 45分
   ○ Task A
   ○ Task B
   ✓ Task C

⌄  ☀ 05:00–09:00  朝  ...
```

- `Sectionなし`は時間帯 / Section容量を持たないため、容量barは表示しない。
- Taskが0件ならgroup自体を表示しない。
- 通常のSection設定画面にはSection entityとして表示しない。
- rename / delete / icon / accent colorの設定対象にしない。
- SectionなしEntryをStartした場合、D-030に従いStart時刻のcurrent SectionへEntryを配置してからStartする。
- `Sectionなし` groupも日別collapse状態を持てる。

### Section内 / Section間Task移動

未実行Taskはdrag & dropでSection内のexplicit orderを変更でき、Section summary rowをまたいで別SectionへdropするとSection placementも変更する。

- Section間dragではdropした位置へ挿入する。
- Section fieldから別Sectionを選択した場合は移動先Section末尾へ入れる。
- 移動後は両SectionのTask件数と合計見積を即時再計算する。
- Executionのactual容量使用はTask placement変更で過去へ移動させない。actual intervalとSection時間帯のoverlapから算出する。
- completed / interrupted等のhistorical rowはSection移動・manual reorder不可とする。

### Section直接Task追加

Section summary row右端にcompactな`＋`を置く。通常時は低優先度で、hover / focus時に操作可能であることを明確にする。

`＋`から作成したTask / EntryはそのSectionを初期placementとして作成する。空Sectionでも同じ操作を利用できる。

### 基本Section設定画面

基本Section設定は、カードをSectionごとに分割せず、**icon / Section名 / 開始時間 / 終了時間 / accent color**を並べるcompactなtable editorを基本とする。時間順がconfiguration orderのauthorityなので、manual reorder用drag handleや順序列は置かない。

基本構成例:

```text
Icon  Section名       開始時間       終了時間              Accent
──────────────────────────────────────────────────────────────
 ☀    朝              05:00          09:00                 ●    ×
 ◷    午前            09:00          12:00                 ●    ×
 ◇    昼              12:00          13:00                 ●    ×
      午後            13:00          18:00                 ●    ×
      夜              18:00          29:00（翌05:00）      ●    ×
```

05:00 boundary時のvisual/default exampleとして以下を利用できる。

| Section名 | 開始時間 | 終了時間 |
| --- | --- | --- |
| 朝 | 05:00 | 09:00 |
| 午前 | 09:00 | 12:00 |
| 昼 | 12:00 | 13:00 |
| 午後 | 13:00 | 18:00 |
| 夜 | 18:00 | 29:00（翌05:00） |

TaskChuteDay boundary自体はユーザー設定であり05:00へ固定しない。最初のSection開始と最後のSection終了は、そのユーザーのTaskChuteDay boundaryへ一致させる。

#### Icon / Accent

- Section iconはSectionごとにユーザーがicon picker等から変更できる。
- icon未設定も許容できる方向とする。
- accent colorもSectionごとに指定できる。
- default accentはmuted grayとし、設定しないユーザーの画面をカラフルにしすぎない。
- accentは主にiconとSection名へ使用する。

#### Inline edit / autosave

- Section名、時間、icon、accentは設定画面内で直接編集できる。
- Section名は空文字を許可しない。
- 時間はkeyboard直接入力とtime pickerの双方を利用できる方向とする。
- 画面全体の大きな「保存」buttonは置かない。
- Enter、blur、time picker確定等で編集を確定し、configuration全体がvalidな場合にautosaveする。
- 編集途中のinvalid stateはServerへ保存しない。
- 保存中は必要に応じて控えめな`保存中…`、成功後は`保存済み`等のstatusを表示できる。
- Escで編集中の変更を取り消せるinteractionを基本とする。

#### Boundary edit / validation

- Section configurationはTaskChuteDay全体をgap / overlapなくcoverする。
- 最初のSection開始はTaskChuteDay開始、最後のSection終了はTaskChuteDay終了へ一致する。
- 隣接Sectionの境界は共有値として扱う。例として「朝」の終了を`09:00 → 10:00`へ変更した場合、次の「午前」の開始も`10:00`へ連動させる。
- Section順序は時間順で自動的に決まり、manual reorder UIは設けない。
- Day boundary変更で端Sectionだけの伸縮によりvalidityを維持できる場合は端Sectionを追従させる。
- Day boundaryが内部Section境界を追い越す等、既存Section構成を壊す変更は勝手にSection削除 / 再構成せず、保存を止めて調整を促す。

#### Section追加

Section追加は既存Sectionの**分割**として扱う。

例:

```text
午後  13:00 ───────── 18:00
```

へ16:00境界で「夕方」を追加すると:

```text
午後  13:00 ─ 16:00
夕方  16:00 ─ 18:00
```

`＋ Sectionを追加`では、分割対象 / 境界時間と新Section名等を入力し、valid configurationになった場合だけ作成する。

#### Section削除

- 各row右端に小型の`×` delete controlを置く。独立した「操作」列見出しは設けない。
- `×`は枠付きprimary buttonにせず、muted grayの低優先度iconとして表示し、hover / focus時に視認性を高める。
- 視覚的には小さくてもhit areaとaccessible label / Tooltip「Sectionを削除」を確保する。
- 誤操作を避けるため削除前に確認を挟んでよい。
- 削除Sectionの時間帯は原則として次Sectionへ吸収し、最後のSectionを削除する場合のみ前Sectionへ吸収する。
- 削除Sectionの未実行Taskは吸収先Sectionへ移す。
- 実行済みhistorical rowは削除前Sectionのidentity / 名前 / 当時の時間帯を保持する。

#### Extended time表示

Section時間はTaskChuteDay基準のlogical timeとして入力・表示する。

- `24:00`未満は通常のtime valueだけを表示する。
- `24:00`以上はextended-time valueを主表示とし、civil timeを**同じ行の括弧内補助表示**として添える。例: `29:00（翌05:00）`。
- 括弧内の`翌05:00`はあくまで補助なので、main timeより小さいfont size / muted grayを使用する。
- 補助表示の有無でrow / inputの縦幅を変えない。
- TaskChuteDay boundaryが05:00の場合、翌03:00は`27:00（翌03:00）`、翌05:00は`29:00（翌05:00）`のように表示する。

#### Rename / historical display

Section名または時間帯を変更しても、過去のEntry / Execution / Review等では当時のSection名と時間帯を維持する。過去DayのSection summaryも当時のSection intervalを基準に表示する。

## 17. 時間列

時間系は以下を区別する。

- **見積時間**: その日のTaskのplanned estimate。ユーザー入力値。
- **開始予定時間**: ユーザーが各Taskへ明示入力する予定値。前TaskやSectionから自動算出しない。
- **開始見込時間**: D-026に従うderived projection。exact算出式は後続設計。
- **開始時間**: actual Execution start fact。
- **終了時間**: actual Execution end fact。
- **実績時間**: actual Execution duration。

Interrupt continuationの見積列にはremaining estimateを通常の時間値として表示する。`残`等のprefixを必須にせず、例として元Task `30分`、continuation `20分` のように表示する。

continuationのremaining estimateはReviewの見積合計へ加算しない。Review semanticsはD-028に従う。

## 18. Column Interaction

Day Tableの**すべての列**を同一の基本interaction modelで扱う。

### Resize

- 各列境界にResize Handleを設ける。
- Header境界を左右へdragすると、その列の幅をlive resizeする。
- Resize Handleのhit areaは視覚的な1px境界線より広く確保する。
- cursorは`col-resize`等の適切なresize cursorを使用する。
- 列幅にはcontrolsを操作不能にしないための実用的minimumを設けてよい。

### Auto Fit

- 列境界をdouble clickすると、その列をAuto Fitする。
- Auto FitはHeaderと現在表示対象となっているcell contentを基準に必要幅を算出する。
- 全列Auto FitはHeader context menuから実行できる。

### Column Reorder

- Header本体を左右へdragすると列順を変更する。
- HeaderのResize Handle領域をdragした場合はreorderではなくresizeを優先する。
- reorder中は挿入先をline等で明確に示す。

### Persistence

初期Desktop Webでは、列幅、列順、表示 / 非表示、pin状態をbrowser `localStorage`へ保存し、同一browserで復元する方向とする。account / device間syncは現段階では要求しない。

## 19. Column Context Menu

列Headerのcontext menuから少なくとも以下を操作できるようにする。

- この列を非表示
- 左に固定
- 右に固定
- Auto Fit
- すべてAuto Fit

表示 / 非表示やpinはユーザー設定であり、default column setそのものを変更しない。

## 20. Routine / Link / Comment / Note Columns

右側の4列は内容全文を表示する列ではなく、関連情報へアクセスするcompact action columnとする。

### Routine

- Routine由来のその日のTaskではRoutineとの関係が分かる状態にする。
- 通常TaskからRoutine iconを操作した場合は、即座にRoutine化せずPopover等を開き、「Routineを作成」「元Routineを開く」等の操作へ進める。
- RoutineはD-027に従い、cross-day reuseの主要mechanismとして扱う。

### Link

- Linkはdefaultでその日のTask文脈に属する。
- 複数Linkを扱える方向とし、icon操作からPopover等で参照 / 編集できる。
- Routineからdefault Linkを供給できるが、その日のLinkは個別変更できる。

### Comment

- Commentはその日のTaskに対する軽量な記録として扱う。
- 長期知識Documentとは役割を分離する。

### Note

- Day TableのNote actionは、その日の作業文脈のNoteを優先して開く。
- Routine由来の場合、特定日のRoutineOccurrence DocumentとRoutine共通のTask Primary Documentの双方へ到達できる構造を許容する。
- 非Routineでもtitle一致だけを理由に別日のNoteを自動共有しない。
- Document foundation / link / backlinkはD-006、D-018、D-025、D-027に従う。

各action iconは、情報がある状態と空の状態を過度に派手にせず識別可能にし、Tooltip / accessible labelを提供する。

## 21. Row Focus / Selection / Running State

Row focus、Checkbox selection、Execution statusは別概念として表示する。

- **Row focus**: 次にkeyboard / execution操作の対象となる行。
- **Selection**: Checkboxによるbulk operation対象。
- **Running state**: 現在Executionがactiveな行。

実行中行はStatus iconだけでなく、薄いAccent背景やTask名Semibold等で行全体を軽く強調する。

Row focusは実行中表示より弱いoutline、edge indicator等で識別可能にする。色だけに依存しない。

## 22. Complete後のFocus移動

Complete後に次Taskを自動Startしない。

Completeが成功しcanonical stateへ反映された後、Dayのexplicit orderに従って**次の実行可能Taskへrow focusを自動移動**する。

- completed / interrupted history等のStart不能rowはskipする。
- 必要に応じてfocus対象が見える位置までscrollする。
- 実行済み表示ONの場合も次の実行可能Taskへfocusする。
- 実行済み表示OFFの場合は完了 / interrupted history rowが非表示になった後、次の実行可能Taskへfocusする。
- 次の実行可能Taskが存在しない場合は自動Startせず、focusを無理に作らない。
- Checkbox selectionは自動変更しない。

## 23. Interrupt / Quick Interrupt表示

D-028のInterrupt workflowでは、例として以下の状態遷移を表示する。

```text
▶ Task A   30分
○ Task B   15分
○ Task C   20分
```

Task BへInterruptすると:

```text
⏸ Task A   30分
▶ Task B   15分
○ Task A   20分
○ Task C   20分
```

- 最初のTask Aはcompletedではなくinterrupted historical rowとして残す。
- Task Bをrunning表示する。
- Task A continuationはBの直下へ生成する。
- continuationのTask名へ「続き」等を自動追記しない。
- continuationの見積はremaining estimateを通常の時間表示で示す。
- Task BをCompleteしてもTask A continuationは自動Startしない。Complete後のfocus ruleに従い、continuation Aへfocusする。

Floating RunnerのQuick Interruptを実行した場合は、その場でdefault title `（割込）` のその日のTaskを生成してStartする。確認Dialogを挟まず、割り込みの開始時刻を即時記録することを優先する。

```text
▶ Task A
   ↓ Quick Interrupt
⏸ Task A
▶ （割込）
○ Task A
```

`（割込）`も通常のTask Rowとして表示し、特別なbadge / background colorを必須にしない。Task名はFloating Runnerから実行中に編集でき、例として`（割込）`から`田中さんから電話`へ変更してもexecution historyは維持する。

Quick Interrupt中にさらにQuick Interruptする場合も同じ表示モデルを繰り返す。

```text
⏸ Task A
⏸ 電話対応
▶ 来客対応
○ 電話対応
○ Task A
```

最深部の割り込みをCompleteしても親Taskは自動Startせず、直近で中断されたTaskのcontinuationへfocusする。

## 24. 実行済みVisibility

Day Tableでは**「実行済みを表示 / 非表示」**をユーザーが切り替えられるようにする。初期状態は**表示**とする。

実行済みを非表示にした場合、少なくとも以下のhistorical rowをDay Tableから除外表示する。

- `✓` Complete済みrow
- `⏸` Interruptで終了したhistorical row

`▶` 実行中rowと`○` 未実行 / 再実行可能rowは表示対象に残す。

これはprojection上のvisibility変更であり、Execution、Interrupt、Review対象の実績等のhistorical factを削除・変更しない。Section summaryの件数、見積、容量使用状況もvisibility filterで再計算しない。

初期Desktop Webでは最後の表示 / 非表示状態をbrowser `localStorage`へ保存し、同じbrowserで復元する方向とする。account / device間syncは現段階では要求しない。

## 25. Keyboard Interaction

Keyboard中心の高速操作は**高優先度のDesign topic**として扱う。

Row focusをkeyboard interactionのfoundationとして利用できる構造にする。ただし現時点では具体的なkey bindingを確定しない。

後続設計では少なくとも以下をまとめて検討する。

- row focus上下移動
- Start / Complete / Interrupt
- Task追加
- cell edit
- column / table navigation
- mouse D&Dの代替操作
- shortcut conflict / browser / OS differences
- accessibility

## 26. Floating Runner

現在activeなExecutionが存在するとき、その実行中TaskをFloating Runnerとして表示する。active Executionがない場合はRunnerを表示しない。user全体でactive Execution最大1つのため、Runnerも最大1つとする。

画面横幅いっぱいの固定Footerにはせず、**Main content areaの下部中央付近に固定する小型Floating UI**とする。Desktopでは下端から概ね`20〜24px`程度のgapを目安とし、Sidebar幅にかかわらずMain content側の中心を基準に配置する。

背景はWhite、Borderは薄いGray、Shadowは控えめ、Radiusは8〜12px程度とする。

基本構成例:

```text
┌───────────────────────────────────────────────┐
│ ▶ Task A                    18:00 / 30分   [⌄]│
│ ███████████████████────────────────────       │
│                               [↶] [↪] │ [✓]  │
└───────────────────────────────────────────────┘
```

Runnerには少なくともTask名、logical daily work chainの累積実績時間、当初見積がある場合の見積時間、progress bar、execution actionを表示する。

## 27. Floating Runner Interaction / Progress

### Task名とDay Table navigation

- Task名をクリックするとRunner内でinline editする。通常TaskとQuick Interruptの`（割込）`を同じinteractionで編集できる。
- Runner本体のうちTask名 / action button等のinteractive element以外をクリックすると、Day Tableを現在実行中Taskのrowまでscrollし、そのrowへfocusする。
- Day Tableへ戻る専用iconは追加しない。Runner本体の広いclick surfaceをnavigationに利用する。
- inline editのexact keyboard / blur behaviorはimplementation時にaccessibilityを含めて調整する。

### Progress

Runnerのprogressは**現在のExecution segmentだけではなく、同じlogical daily work chain全体**を表す。

例として当初見積30分のTaskを10分実行してInterruptし、後からcontinuationを再Startして5分実行中なら、Runnerは`15:00 / 30分`、progress 50%相当を表示する。continuation開始時に`0 / 20分`へresetしない。

- numeratorは同一logical daily work chainのvalid Execution実績の累積とする。
- 割り込み先Taskの実績時間は元Taskのprogressへ含めない。
- D-029で取り消されたcurrent Executionはvalid actualとして累積へ含めない。
- 見積がある場合、progress ratioは累積actual / 当初見積を基本とする。
- 当初見積へ到達 / 超過した場合、bar自体は100%でcapするがelapsed表示は増え続ける。例: `36:42 / 30分`。
- 見積超過を強い赤色やflashで強調しない。必要なwarningはtime text等の控えめな表現に留める。
- 見積がないTaskでもprogress barの物理領域を消さない。同じ高さ / 幅のneutral・mutedなtrackを表示し、elapsedに応じて根拠なくbarを伸ばさない。

Day Tableのcontinuation行ではD-028に従いremaining estimateを表示できるため、Runnerのwhole-work progressとDay Tableのremaining estimateは別の表示semanticsとして共存する。

### Execution actions

主要execution actionはicon-onlyを基本とし、Tooltip / accessible labelを必須とする。

- `↶`系: **未実行に戻す**。D-029に従い現在のactive Execution / 今回のStartだけを取り消す。Tooltip / accessible labelは「未実行に戻す」。
- `↪`系: **Quick Interrupt**。D-028に従い`（割込）`をその場で生成して即Startする。Tooltip / accessible labelは「割り込みを開始」。pause iconは単なる停止と誤解しやすいため第一候補にしない。
- `✓`系: **Complete**。primary actionとして右端へ置き、secondary action群との間に控えめなseparatorを設けてよい。

Quick Interruptでは発生時刻のcurrent SectionをD-030に従って使用する。validなTaskChuteDay内では基本Sectionがgapなくcoverするためcurrent Sectionを解決できる。

Completeが成功するとactive ExecutionがなくなるためRunnerは消え、Section 22のruleに従って次の実行可能Taskへfocusする。次Taskは自動Startしない。

## 28. Floating Runner Size / Minimize

Floating Runnerはコンパクトにし、画面横幅いっぱいに広げない。Desktopでは概ね`400〜600px`程度を目安とし、通常状態は約480px前後をvisual prototypeのstarting pointとする。ただし固定値ではなく、Task名やViewportに応じて調整する。

Runnerには初期designからminimize操作を用意する。minimizeは情報量を少し減らす操作ではなく、**Runner本体を完全に畳み、restore controlだけを残す**。

通常状態:

```text
┌───────────────────────────────────────────────┐
│ ▶ Task A                    18:00 / 30分   [⌄]│
│ ███████████████████────────────────────       │
│                               [↶] [↪] │ [✓]  │
└───────────────────────────────────────────────┘
```

Minimized:

```text
                       [⌃]
```

- minimized中はTask名、timer、progress、`↶` / `↪` / `✓`をすべて隠す。
- restore controlは32〜36px程度のround / rounded-squareをstarting pointとし、Tooltip / accessible labelを「実行中タスクを表示」とする。
- minimized中にactive TaskがComplete等で終了した場合、restore controlも消える。
- 次に別TaskをStartした場合もminimized preferenceを維持し、restore controlだけの状態から開始する。
- 初期Desktop Webではexpanded / minimized preferenceをbrowser `localStorage`へ保存し、同一browserで復元する方向とする。account / device間syncは現段階では要求しない。

exact icon glyph、pixel metrics、animation、mobile placementはvisual prototype / responsive designで調整する。

## 29. Border

Borderは情報構造を示すために使用する。

基本は `1px solid #E9E9E7`。強いBorderは避ける。

Tableでは外枠、Header、Row、Columnを薄いBorderで整理する。

## 30. Shadow

ShadowはFloating UI等、高さの違いを示す場合に限定する。

Tableや通常Panelへ過度にShadowを使用しない。Floating Runnerでは軽いShadowを使用してよい。

## 31. Corner Radius

基本は4〜8px、Floating UIは8〜12px。

Table Row単位で角丸を使用せず、Day Table全体にのみ軽いRadiusを適用する。

## 32. Interaction

Interactive elementはhover状態を持つ。

対象例: Button、Table Row、Navigation、Column Resize Handle、Sidebar Resize Handle、Icon Button。

hoverによる変化は控えめにする。

## 33. Density

TaskChuteでは一日のTask一覧性が重要なため、一般的なWebアプリよりやや高密度なUIを許容する。

ただし、クリック領域、読みやすさ、タッチ操作を損なわない。

DesktopではTable Rowを比較的コンパクトにする。exact row height / initial column widthsはvisual prototypeで最終調整する。

## 34. Accessibility

色だけで状態を表現しない。

Iconには必要に応じてTooltip / accessible labelを提供する。Keyboard navigationを考慮し、Focus stateを削除しない。十分なContrastを確保する。

## 35. Responsive Design

Desktopを最初の主要Targetとする。

ただし、Sidebar、Right Detail Pane、Floating Runner、Day Tableは将来的なTablet / Mobile対応を阻害しない構造とする。

Desktop固有の固定配置へ過度に依存しない。

## 36. 現在のUI構成案

現時点のDay画面:

```text
Top Navigation
↓
Left Sidebar
  - 今日
  - カレンダー
  - プロジェクト
  - タスク
  - ノート
  - 分析
  - 設定
↓
Task Controls
  - 新規Task
  - Filter
  - 実行済み 表示 / 非表示
↓
Day Table
  Header
    - 選択
    - 状態
    - タスク名
    - プロジェクト
    - モード
    - セクション
    - 見積時間
    - 開始予定時間
    - 開始見込時間
    - 開始時間
    - 終了時間
    - 実績時間
    - ルーティン
    - リンク
    - コメント
    - ノート
  ↓
  Sectionなし（Entryが存在するときだけ）
  ↓
  Section summary row
    - collapse / icon / 時間帯 / Section名
    - 完了数 / 総Task数
    - 合計見積
    - Section容量actual使用bar / 残り容量
    - SectionへTask追加
  ↓
  Task Rows
  ↓
  次Section summary row ...
↓
Floating Runner
  - Task名 / 累積実績 / 当初見積
  - Progress
  - 未実行に戻す / Quick Interrupt / Complete
  - Minimize
```

Right Detail Paneは通常閉じている。Left Sidebar / Right Detail Paneの双方に開閉手段を用意する。

## 37. 未確定事項

以下は今後設計する。

- Right Detail Pane exact UX
- Floating Runner exact icon glyph / pixel metrics / animation
- Mobile UI
- Tablet UI
- Project画面
- Calendar画面
- Notes画面
- Analytics画面
- Settings画面（Section設定以外）
- Section logical timeのactual instant mapping / DST edge UX
- user-selected TaskChuteDay boundaryとinitial Section templateのexact onboarding UX
- Section icon picker / accent paletteのexact component
- Section collapse stateのaccount / device syncを将来行うか
- Section所属Taskのspilloverを別途表示するか
- exact initial column widths / minimum widths
- continuation indicatorを追加するか
- 開始見込時間のexact calculation
- remaining estimateが0以下でも未完了の場合のre-estimation UX
- Keyboard shortcutsのexact mapping（優先度高）
- Bulk actions

これらを本DESIGN.mdだけでProduct / Domain仕様として確定しない。

## 38. 参考デザイン

主なVisual Design参考: [Notion Design System](https://github.com/kzhrknt/awesome-design-md-jp/tree/main/design-md/notion)

参考にする要素:

- Color philosophy
- Typography
- Spacing
- Border
- Radius
- Information density
- Minimal visual hierarchy
- Interaction simplicity

TaskChute固有のDomain / Workflowについては、TaskChute Platformのcanonical docsを優先する。

## 39. Design Principle Summary

TaskChute PlatformのUIは次を基本原則とする。

- **Simple** — 必要以上に装飾しない。
- **Dense** — 一日のTaskを俯瞰できる。
- **Temporal** — 時間の流れを感じられる。
- **Execution First** — 現在実行しているTaskを見失わない。
- **Continuous** — Sectionで一日の流れを分断しすぎない。
- **Predictable** — 同じ操作は同じ見た目・同じ挙動にする。
