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

### 2.3 一日の流れを分断しない

Morning / Day / Evening等のSectionは独立したカードとして表示しない。

一日のタスク全体を**1つの連続したテーブル**として表示する。Sectionはテーブル内の区切り行として扱う。

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

ステータスはテキストまたはアイコンと組み合わせる。

### 3.3 Sectionカラー

Sectionは非常に薄い背景色または小さなカラーインジケータによって識別する。

例:

- Morning: Yellow系
- Day: Orange系
- Evening: Purple系

Section全体を強い色で塗りつぶさない。

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

Task詳細表示用のRight Detail Paneを将来的に設ける。現段階では詳細UIそのものは確定しない。

ただしメイン画面には、**Right Detail Paneを開くためのボタン**をあらかじめ配置できる設計とする。Paneが閉じている状態を基本表示とする。

## 10. Task Controls

Day Table上部にタスク操作領域を配置する。

主な要素は、新しいタスクを入力、フィルター、追加、その他操作。

画面下部に別の「タスクを追加」領域は設けず、タスク追加操作は上部へ集約する。

## 11. Day Table

Day TableはTaskChuteの中心UIである。一日のタスクを**単一のテーブル**として表示する。

Morning / Day / Eveningごとに別々のテーブルを作らない。全体を1つの外枠で囲み、Section間に独立したカードBorderや大きな余白を設けない。

構造:

```text
Header
Section A
Task
Task
Section B
Task
Task
Section C
Task
```

## 12. Table Header

列HeaderはDay Tableの最上部に一度だけ表示する。SectionごとにHeaderを繰り返さない。

基本列:

| 選択 | ステータス | タスク | タグ | 予定時間 | 実行時間 |
| --- | --- | --- | --- | --- | --- |

「#」列は使用しない。

## 13. Checkbox列

最左列は複数選択用Checkboxとする。

Checkboxは**タスク行だけ**に表示する。Section Headerには表示しない。Headerには全タスク選択用Checkboxを配置できる。

Checkboxの役割は**行選択**であり、タスクの実行状態を表現するものではない。

## 14. Status列

Checkbox列とは別にStatus列を設ける。配置は `Checkbox → Status → Task` とする。

Statusはタスクの状態を表示する。

例:

- `○ 未開始`
- `▶ 実行中`
- `✓ 完了`

状態は色だけでなく、アイコンまたはテキストでも識別可能にする。

## 15. Task列

Task名はテーブル内で最も重要な情報の1つとして扱い、十分な横幅を確保する。

実行中タスクはSemibold等で若干強調してよい。

長いTask名は必要に応じて省略表示し、詳細表示手段を別途提供する。

## 16. Tag列

Taskの分類を小さなBadgeとして表示する。

Badgeは淡い背景色を使用し、強い彩度を避ける。

## 17. 時間列

時間情報は比較しやすい位置へ揃える。

基本列は予定時間と実行時間。

例: 予定時間 `60m`、実行時間 `32:18`。

実行中の実行時間はPrimary Accentで強調してよい。

## 18. Column Resize

Table Headerの各列境界にはドラッグ可能なResize Handleを設ける。

ユーザーはHeader境界を左右へドラッグすることで列幅を変更できる。

Resize Handleは通常時には目立たせず、hover / drag時に視認性を高める。列Headerの境界線は常時薄く表示する。

## 19. Section Header

SectionはTable内の専用行として表示する。

表示情報候補:

- Sectionカラー
- Section名
- 時間帯
- 合計予定時間

**Section HeaderにはCheckboxを表示しない。Statusも表示しない。**

Section Headerはタスクではないため、Task Rowとは明確に役割を分ける。

## 20. Sectionの連続性

Sectionごとに独立したBorderを作らない。Sectionは視覚的には区切るが、構造的には同じDay Tableの一部とする。

```text
┌──────────────────┐
│ Header           │
├──────────────────┤
│ Morning          │
│ Task             │
│ Task             │
├──────────────────┤
│ Day              │
│ Task             │
│ Task             │
├──────────────────┤
│ Evening          │
│ Task             │
└──────────────────┘
```

## 21. Floating Runner

現在実行中のタスクは、画面下部のFloating Runnerでも表示する。

画面横幅いっぱいの固定Footerにはせず、**小型のFloating UI**として表示する。

基本配置は画面下中央。背景はWhite、Borderは薄いGray、Shadowは控えめ、Radiusは8〜12px程度とする。

## 22. Floating Runnerの目的

Floating Runnerの目的は、**「現在何を実行しているかを、画面のどこにいても確認できること」**である。

情報を詰め込みすぎない。

基本表示候補:

- 実行状態
- Task名
- 経過時間
- 予定時間
- 完了操作

詳細操作は必要に応じて別UIへ展開する。

## 23. Floating Runnerのサイズ

Floating Runnerはコンパクトにし、画面横幅いっぱいに広げない。

Desktopでは概ね `400〜600px` 程度を目安とする。ただし固定値ではなく、Task名やViewportに応じて調整する。

## 24. Border

Borderは情報構造を示すために使用する。

基本は `1px solid #E9E9E7`。強いBorderは避ける。

Tableでは外枠、Header、Row、Columnを薄いBorderで整理する。

## 25. Shadow

ShadowはFloating UI等、高さの違いを示す場合に限定する。

Tableや通常Panelへ過度にShadowを使用しない。Floating Runnerでは軽いShadowを使用してよい。

## 26. Corner Radius

基本は4〜8px、Floating UIは8〜12px。

Table Row単位で角丸を使用せず、Day Table全体にのみ軽いRadiusを適用する。

## 27. Interaction

Interactive elementはhover状態を持つ。

対象例: Button、Table Row、Navigation、Column Resize Handle、Sidebar Resize Handle、Icon Button。

hoverによる変化は控えめにする。

## 28. Selection

CheckboxでTask Rowを選択した場合、選択状態を背景色などで識別可能にする。

選択状態とTask Statusを混同しない。

- Selection: ユーザーが現在選択している行
- Status: Taskそのものの実行状態

として明確に分離する。

## 29. Density

TaskChuteでは一日のTask一覧性が重要なため、一般的なWebアプリよりやや高密度なUIを許容する。

ただし、クリック領域、読みやすさ、タッチ操作を損なわない。

DesktopではTable Rowを比較的コンパクトにする。

## 30. Accessibility

色だけで状態を表現しない。

Iconには必要に応じてTooltip / accessible labelを提供する。Keyboard navigationを考慮し、Focus stateを削除しない。十分なContrastを確保する。

## 31. Responsive Design

Desktopを最初の主要Targetとする。

ただし、Sidebar、Right Detail Pane、Floating Runner、Day Tableは将来的なTablet / Mobile対応を阻害しない構造とする。

Desktop固有の固定配置へ過度に依存しない。

## 32. 現在のUI構成案

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
↓
Day Table
  Header
    - Checkbox
    - Status
    - Task
    - Tag
    - Planned Time
    - Actual Time
  Morning
    - Task
    - Task
  Day
    - Task
    - Task
  Evening
    - Task
↓
Floating Runner
```

Right Detail Paneは通常閉じている。Left Sidebar / Right Detail Paneの双方に開閉手段を用意する。

## 33. 未確定事項

以下は今後設計する。

- Right Detail Pane
- Mobile UI
- Tablet UI
- Project画面
- Calendar画面
- Notes画面
- Analytics画面
- Settings画面
- Drag & Drop詳細挙動
- Column幅の保存方法
- Column表示/非表示
- Floating Runner展開UI
- Keyboard shortcuts
- Context menu
- Bulk actions

これらを本DESIGN.mdだけで仕様確定しない。

## 34. 参考デザイン

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

## 35. Design Principle Summary

TaskChute PlatformのUIは次を基本原則とする。

- **Simple** — 必要以上に装飾しない。
- **Dense** — 一日のTaskを俯瞰できる。
- **Temporal** — 時間の流れを感じられる。
- **Execution First** — 現在実行しているTaskを見失わない。
- **Continuous** — Sectionで一日の流れを分断しない。
- **Predictable** — 同じ操作は同じ見た目・同じ挙動にする。
