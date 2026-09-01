# DESIGN

## Status / authority

この文書は、TaskChute PlatformのUI / visual / interaction targetを記録するcanonical documentである。

現在canonical化済みのscopeは、Desktop WebのDay Table foundation、それに直接関係するcontrol / interaction、Day date navigation、Section / ProjectのSettings navigationとする。

- Product / Domain behaviorは`docs/SPEC.md`を正本とする。
- Approved Decisionとその状態は`docs/DECISIONS.md`を正本とする。
- Architectureは`docs/ARCHITECTURE.md`を正本とする。
- implementation / verification statusは`docs/FEATURES.md`、`docs/CURRENT.md`、`docs/TEST_MATRIX.md`を正本とする。
- この文書は新しいDomain semanticsを作らず、上記canonical docsと矛盾する場合は上記を優先する。

historical UI design referenceはbranch `docs/design-guidelines`、commit `e91bc916ccac5e9b95221602c4e4b2be90455ad6`に残る。ただし、その文書全体はDraft referenceであり、current canonical docsとのreconciliationを終えていないsectionを暗黙にApprovedへ昇格しない。

## Desktop Web navigation shell

Dayのdate navigationはDay ToolbarではなくTop Navigation / Day Headerへ置く。

基本形:

```text
‹   2026年8月27日（木）   ›      今日
```

- 前 / 次矢印で前日 / 翌日へ移動する。
- 日付clickでcalendar pickerを開く。
- `今日`でcurrent TaskChuteDayへ戻る。
- current TaskChuteDay表示中も`今日`controlの位置を維持し、disabled表示を基本とする。
- Headerのprimary informationはlogical dateとし、Task数、完了率、見積合計、実績合計等を重複して常設しない。
- TaskChuteDayがcivil dateをまたぐ場合もlogical dateをprimary表示とし、raw intervalやboundary informationを常時表示しない。
- keyboard targetとして`Shift+← / →`を前 / 次Day navigationに割り当てる。
- calendar pickerはmonth gridを基本とし、keyboard操作として矢印、`PageUp / PageDown`、`Enter`、`Esc`を扱えるtargetとする。

Day navigationのProduct / Domain semantics、future TaskChuteDayのmaterialization / freeze timing等は`SPEC` / `DECISIONS` / `OPEN_QUESTIONS`を正本とし、この文書だけで確定しない。

Desktopのprimary navigationはLeft Sidebarをtargetとする。

主要destination target:

- 今日
- カレンダー
- プロジェクト
- タスク
- ノート
- 分析
- 設定

underlying capabilityが未実装のdestinationについて、fake screenや無意味なdisabled navigationを先に出す必要はない。Settings等、現在のdogfood利用に必要なdestinationから段階的に導入してよい。

SidebarはDesktop初期幅約240pxをstarting pointとし、180〜420px程度のresize、open / closed stateとwidthの分離、閉じる直前のwidth復元をtargetとする。初期Desktop WebではSidebar preferenceをbrowser-localに保持してよい。

## Settings information architecture

Section / Projectの管理はDayBoardの常設controlではなく、dedicated Settings surfaceで行う。

initial Settings target:

- Section
- Project
- Modeはunderlying capability実装後に同じSettings information architectureへ追加する。

DayBoardは日々のTask planning / executionへ集中させる。現在DayBoard上に存在するProject-create / Section-settings convenience controlsはreplacement navigationが実装されるまでのtemporary accessであり、dedicated Settings accessが利用可能になった時点でDayBoardから撤去する。

### Section settings target

Section設定はcompact table editorを基本とする。

概念形:

```text
Icon  Section名       開始       終了       Accent
──────────────────────────────────────────────
      朝              05:00      09:00
      午前            09:00      12:00
      昼              12:00      13:00
      午後            13:00      18:00
      夜              18:00      29:00
```

- rename / boundary edit / add / delete等、Section configuration管理はSettings側へ集約する。
- icon / accentはtarget capabilityであり、underlying capability未実装の間はfake fieldやdisabled placeholderを要求しない。
- Section追加はDay Tableから行わない。
- Day TableのSection selectorは既存Sectionを選択するinteractionへ専念させる。
- Section selector内へSettingsへの導線を埋め込むことはinitial targetにしない。
- Section orderはtime authorityに従い、Settingsでarbitrary D&D reorderする対象にはしない。
- configurationのeffective timing、current-Day freeze、historical context等のsemanticsはD-038を正本とする。

### Project settings target

Projectのquick createとProject管理を分ける。

- Day TableのProject selectorからのquick createはdaily flowの低friction interactionとして許容する。
- Projectの一覧管理、user-defined display order等はdedicated Project Settingsで行う。
- user-defined Project orderはSettings上でD&D変更できるtargetとする。
- quick create時はユーザーが入力したProject名をauthorityとし、検索用normalization等を保存名へ勝手に変換しない。
- Project SettingsをDayBoardの常設editorとして置かない。

## Day Table foundation

Dayは一つの連続したDay Tableとして表示する。

- 一つのTask Rowは一つのEntryを表す。
- Section summary rowがDay内のTask Rowをgroupingする。
- `Sectionなし`は通常Sectionより上に置き、Taskまたは追加中draftがある場合だけ表示する。
- 通常SectionはTaskが0件でもsummary rowを表示する。
- Sectionごとのcard layoutには分割しない。
- 必要な列数がviewport幅を超える場合、列を黙って削るのではなく、固定領域を維持したhorizontal scrollを許容する。

## Fixed left structure

Day Tableの固定左領域は次とする。

`[Bulk selection slot] [Execution Control] [Task]`

- Bulk selection slotはlayout shiftを防ぐために予約するUI slotであり、data columnではない。
- Execution Controlはaction / stateを表す固定UI slotであり、通常のdata column customization対象ではない。
- Taskはfixed / stickyとし、hideまたはcolumn reorderの対象にしない。
- Bulk Selection capability自体は未実装である。固定slotはtarget structureを定めるもので、現在の実装状態を示さない。

## Execution state presentation

独立した`状態`text列は置かない。

TaskのStart / Complete / completed stateは、一つの円形Execution Controlで表現する。

- visible iconだけでなくaccessible labelとtooltipで意味を示す。
- lifecycle stateを色だけに依存して区別しない。
- lifecycle transition、active Execution、retry等のProduct / Domain semanticsは`SPEC` / `DECISIONS`に従う。

## Target column model

固定UI slotを含めたtarget orderは次とする。

`[Bulk slot] | [Execution Control] | Task | Project | Mode | Section | Routine | Note | 見積 | 開始予定 | 開始見込 | 開始 | 終了 | 実績`

Taskはtarget column listに含まれるが、固定・非表示不可である。Project以後が通常のcustomizable data columnsとなる。

### Capability exists / UI realignment possible

現在のruntimeに基盤能力があり、Day Table上の再配置を独立して進められる対象:

- Execution Control
- Task
- Project display
- Section
- Routine
- 見積
- 開始予定

見積は開始予定より前に置く。Entry placement / canonical orderはD-031 / D-039に従い、visual column orderから新しいDomain orderを作らない。

D-043のtarget interactionでは、開始予定の設定・変更が該当real Sectionをderiveし、real Sectionの明示選択が開始予定をSection開始minuteへ設定する。開始予定のclearと`Sectionなし`の選択はどちらもSection absence + `NULL`へ同期し、通常の編集操作から片方だけが残るstateを作らない。これはProduct / Domain targetであり、current runtimeは未対応である。

### Capability not implemented

以下はunderlying capabilityまたは十分なrow projection / editingが未実装である。

- Mode
- Note / Documents
- 開始見込
- fullerな開始 / 終了 / 実績row projectionとediting
- Bulk Selection actions

これらはtarget column modelから削除しない。一方、capability実装前にfake valueやdisabled placeholderだけの列を出さない。

## Routine placement

Routineは独立したtarget columnを持つ。

Day Table UI-1でMinimal Routine R1のbadge / editor / end state / actionを独立したRoutine列へ移した。これはpresentation realignmentであり、D-040のpersistence / materialization / lifecycle semanticsを変更しない。

D-044のR2A targetでは、current-Day planned Routine-derived Entryの`Section + 開始予定`同期unitと見積unitを編集できる。edit値はまずlocal candidateとして表示し、この時点ではServer writeを行わない。そのunitについて`今回だけ`または`ルーティンに反映`をexplicitに選択した後にだけpersistし、どちらもpreselectしない。cancel / Escape / dismissはcandidateを破棄してcanonical valueへ戻す。

Section + 開始予定は一つのscope choiceを共有し、見積は独立したscope choiceを持つ。overrideがあるunitのediting contextでは`ルーティンの設定に戻す`相当のactionを提示できるが、normal Day Tableへpermanent override badgeを追加しない。

R2A runtimeはcurrent-Day planned Routine-derived Entryへexplicit scope UXを実装済みである。R2B candidateではRoutine lifecycle / defaultsのprimary surfaceを独立Routine Boardへ移し、Day Table上のmanual Routine終了actionを撤去する。

## Routine Board

Sidebarの`ルーティン`はRoutine管理のprimary destinationである。initial visible columnsは`ON/OFF | drag handle | Routine | Project | 繰り返し | Section | 開始予定 | 見積 | 期間`とする。Board orderはDay orderと独立し、row clickによるimplicit navigationを行わない。

`＋ ルーティンを追加`はlocal blank OFF rowを作り、空名の間はno-write、名前commit後にpersistする。recurrence / period popoverはexplicit Save / Cancel、inline defaultsはserver-canonical reconciliationを使う。詳細implementation evidenceはCURRENT / FEATURES / TEST_MATRIXをownerとする。

## Task order and display column order

### Task planning order

Task planning order、planned-start由来のplacement、same-minute / planned-startなしcohortはD-031 / D-039を正本とする。Day Tableはordinary data sortを新しいcanonical Task orderとして導入しない。

### Manual Task reorder interaction

manual Task reorderはcanonicalに許可されたcohort内だけで行う。

- keyboard targetは`Shift+↑/↓`とする。
- pointer利用者向けにはD&Dまたは同等のaccessible interactionを提供する。
- target Day Tableに独立した`並び替え`data columnは置かない。
- current runtimeの`↑/↓`buttonsはTask cell内に置くtemporary pointer affordanceであり、独立したdata columnではない。

D&Dが利用可能になるまでのpointer affordanceをcontext action等にするかはlater runtime taskのimplementation detailとし、この文書では確定しない。

### Display column reorder

display column reorderはTask planning orderと別機能である。

- Project以後のdata columnsをheader interactionで並べ替えられるtargetとする。
- display column orderの変更はEntry position、planned start、Section placementを変更しない。
- ordinary header sortはtarget behaviorではない。

## Column customization target

- Project以後のdata columnsはreorder / hide / show / resize対象とする。
- Taskはfixedかつnon-hideableとする。
- Bulk slotとExecution Controlはfixed UI slotsとする。
- resizeとauto-fitをtargetとする。
- 初期実装ではdisplay order / width / visibility等をbrowser-local preferenceとして保持してよい。

column customization runtimeは未実装である。実装状態は`docs/FEATURES.md`で管理する。

## Day toolbar target

Day toolbarは、その日のTaskを操作・絞り込むcompact controlsへ限定する。

- Add Task
- Search
- Filter
- completed visibility
- Columns

task countをpermanent toolbar itemとして要求しない。`placement_revision`はServerとのconcurrency制御に使うinternal stateであり、target user-facing UIには表示しない。raw TaskChuteDay intervalもmain Day header / toolbarへ常時表示しない。

Project-createはProject selectorでのquick createに寄せ、Section configuration managementはdedicated Settingsへ置く。current DayBoard上のProject-create / Section-settings convenience controlsはreplacement navigationが実装されるまでtemporary accessとしてのみ残してよい。

## Section summary target

Section summaryはcontinuous Day Tableの一部とする。

- Section range
- completion count
- estimate summary
- Section-level `+` Task creation
- row focus
- collapse / expand
- per-Day collapse preference

Search / Filterはvisible row projectionを変更できるが、canonical Section summary / Domain factsを再定義しない。collapse、Search、Filter等が現在実装済みであるとはこの文書では主張しない。

## Keyboard / focus target

- `J/K`と`↑/↓`: row / Section summary focus navigation
- `Shift+↑/↓`: valid cohort内のmanual Task reorder
- `S`: focused TaskのStart / Complete
- `Tab / Shift+Tab`: visual column orderに沿うedit traversal
- text editing / IME composition中はglobal shortcutを発火しない
- Section summaryをfocus / collapseできるtargetとする

個々のshortcutのimplementation statusは`FEATURES` / `TEST_MATRIX`で管理する。

## Current implementation after UI-2B

current mainで実装済みのvisible heading orderは次である。

`実行 | Task | Project | Section | Routine | 見積 | 開始予定`

Day Table UI-1では、独立した`状態`列と独立した`並び替え`列を除き、Execution Controlへlifecycle action / state presentationを維持し、Routineを独立列へ移し、見積を開始予定より前へ配置した。pointer `↑/↓`はTask cell内のtemporary affordanceとして、keyboard `Shift+↑/↓`は既存interactionとして維持する。task count、`placement_revision`、raw TaskChuteDay intervalはnormal toolbar / Day headerから除いた。

UI-1は既存のServer-canonical command、retry / reconciliation、placement / ordering、Routine persistence semanticsを変更していない。

UI-2AはDay Tableへ明示的なminimum content widthとtable-owned horizontal scrollを追加し、heading / Task / draftの先頭へnon-interactive reserved Bulk slotを配置した。実用幅ではBulk / Execution Control / Taskをdeterministic CSS offsetでfixed / stickyにし、狭幅ではCSS-only fallbackでstickyを解除して全列へ到達可能にする。Bulk capability / control自体は追加せず、named heading orderとexisting interaction / Domain semanticsを維持する。implementation commit `43789c990ed91febb2bb6036c1f3970dfe8f34a1`とverification / docs commit `b66d6ee2248935fd36d338ea2794762ee51b6515`はGitHub canonical `main`へIntegrated済みであり、詳細な実装・evidence状態は`CURRENT` / `FEATURES` / `TEST_MATRIX`を正本とする。

UI-2BはSection summaryからnormal Section / `Sectionなし`をpointerまたはfocused summaryのEnter / Spaceでcollapse / expandできるようにし、collapse stateをlogical Dayごとのin-session stateとして保持する。focused planned / running Taskの`S`は既存のStart / Complete commandとcanonical reconciliationを使う。text editing / IME composition / key repeat / unsafe modifier中は発火しない。collapse stateのcross-reload / browser-local persistenceはまだ実装せず、broader per-Day preference targetを変更しない。implementation commit `3861b9839b55a1453b0e2f230f03728e8d85059b`はGitHub canonical `main`へIntegrated済みであり、詳細な実装・evidence状態は`CURRENT` / `FEATURES` / `TEST_MATRIX`を正本とする。

current runtimeでは、Day Navigation v0.1のTop Navigation date navigation / calendar pickerと、Settings v0.1のLeft Sidebar `今日` / `設定`およびdedicated Section / Project Settings surfaceを実装済みである。DayBoard上のtemporary Project作成controlとSection設定editorは撤去済み。broader Sidebar destination、resize / preference等の実装状態は`docs/FEATURES.md`、`docs/CURRENT.md`、`docs/TEST_MATRIX.md`を正本とする。

full target column modelはcurrent implementationより広い。Bulk capability、Mode、Note、開始見込、fullerな開始 / 終了 / 実績、column reorder / hide / show / resize / auto-fit / preference、Search / Filter、collapse stateのcross-reload persistence、D&Dまたはfullerなcontext interaction等はfuture workとして残る。responsive / mobileのexact policyは引き続きOpenであり、UI-2Aの狭幅fallbackをProduct Decisionへ昇格しない。

## Unreconciled historical scope

historical design branchにあるFloating Runner、context menu、Hit-a-Hint、Bulk actions、responsive / mobile等は、この文書へまだcanonicalizeしていない。必要なscopeごとにcurrent Product / Domain Decisionと再照合してから追加する。
