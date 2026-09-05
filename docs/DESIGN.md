# DESIGN

## Status / authority

この文書は、TaskChute PlatformのUI / visual / interaction targetを記録するcanonical documentである。

現在canonical化済みのscopeは、Desktop WebのDay Table foundation、それに直接関係するcontrol / interaction、Day date navigation、Section / ProjectのSettings navigationとする。

- Product / Domain behaviorは`docs/SPEC.md`を正本とする。
- Approved Decisionとその状態は`docs/DECISIONS.md`を正本とする。
- Architectureは`docs/ARCHITECTURE.md`を正本とする。
- implementation / verification statusは`docs/FEATURES.md`、`docs/CURRENT.md`、`docs/TEST_MATRIX.md`を正本とする。
- この文書は新しいDomain semanticsを作らず、上記canonical docsと矛盾する場合は上記を優先する。

## D-063 Modal / row Tab / non-blocking mutation interaction

D-063はDay Tableのpresentationとclient-side coordinationを対象とし、既存API・Domain・schema・migration・retry semanticsを変更しない。shortcut help、single / bulk confirmation、Routine conversion / scope choiceは共通centered Modal primitiveを使い、`role="dialog"`、`aria-modal="true"`、backdrop、initial focus、focus trap、Escape / backdrop / X close、trigger focus restoreを備える。Modal表示中は背景Day UIのshortcut・Tab・mutationを発火させない。

通常のrow Tab順はresolved visual column orderに従い、Bulk checkboxとExecution controlを通常Tabから除外する。disabled / hidden / read-only cellを飛ばし、Project / Sectionの変更後は同一row内の次のrelevant cellへ進み、端では隣接rowへ移る。`X / x`はfocused eligible visible Taskのselection toggleだけを行い、input / select / textarea / contenteditable、IME composition、Modal、calendar / helpでは抑制する。

actual Start / Endのsingle-cell editorは`HHMM` text inputを使い、valid outside blur、Enter、Tab、Shift+Tabで一度だけcommit、Escapeでcancelする。Start編集中にEndをinput化せず、invalid・unchanged・二重送信を保存しない。保存中はsubmitted valueをpending overlayで表示し、複数pendingを件数付きで示し、成功時にfresh canonical projectionへ収束させる。

client mutation coordinatorはEntry / Task、Day placement、Routine definition、global execution laneをconflict scopeとする。同一scopeだけを直列化し、独立row / cellは継続可能にする。ambiguous operationはexact operation identity / intentをretry registryへ保持し、後続の同じcommandを上書きしない。Complete A pending中のStart Bは、Aのsuccess reconcile後にfresh stateを再確認してqueue dispatchする。CAS、operation idempotency、active Execution最大1、overlap、placement revisionは既存契約のまま維持し、安全に満たせない場合は新しいlifecycle semanticsを追加せず停止する。

D-063はWeb-onlyであり、server / migration / schema変更、API contract変更、dependency追加、security posture変更を含めない。

## D-062 Day Table keyboard workflow, single-cell actual editing, Task-column resize, and calendar polish

Day TableのneutralなDay surfaceはkeyboard focusの入口とし、Task未フォーカス状態では`↓ / J`が最初のvisible Task、`↑ / K`が最後のvisible Taskへ移動する。focused Taskでは`S`をStart / Complete、`N`をcurrent SectionへのTask追加、`E`をordinary planned Task metadata editor、`D`を既存single planned delete confirmationへ割り当てる。`?`はshortcut help、`Esc`はeditor / menu / calendar closeとする。input / select / textarea / contenteditableまたはIME composition中はこのglobal workflowを抑制し、calendar内のkeyboard操作と混線させない。

actual Start / Endは同時に複数fieldを開かず、選択したcellだけを4桁`HHMM`のnumeric text inputへ切り替える。Startを編集してもEndはread-only projection buttonのままとし、End cellの選択で初めてEnd inputを開く。表示される値と入力値は`0900`のようにcolonなしとし、unset valueはtime `--:--`、estimate / actual duration `--分`とする。既存D-057 / D-060のactual validation、overlap、lifecycle、retry、forecast semanticsを変更しない。

Task headingには独立したright-edge resize handleを置き、Task columnのwidthを280〜640pxでbrowser-localに保持する。storageは既存`taskchute.web.day-columns.v2`へoptional `taskWidth`を加える後方互換のpreference拡張であり、server / D1同期、schema / API / Domain変更ではない。calendarはmonth gridとmonth / year navigation（`前年 / 前の月 / 次の月 / 翌年`）を同時に表示し、popover外クリックとEscapeで閉じる。

D-062はvisual / interaction polishに限定し、新migration・schema・API・Domain semanticsを追加しない。

## D-061 Day Table inline-editor ergonomics and resize anchoring

Day Tableのplanned Start、actual Start、actual Endはnative date pickerを使わない4桁`HHMM` text inputとする。入力は`inputMode="numeric"`、最大4文字、`HHMM` placeholderを持ち、4桁の時計値だけを受け付ける。planned Startは既存のDay boundaryを基準にlogical minuteへmapし、actualは既存のestablished Day / timezone / civil-date semanticsを再利用する。保存処理はAPI・Domain contractを拡張せず、既存`SetExecutionTimes`を呼ぶ。

Task名、Estimate、planned Start、actual timeのinline controlはcell幅を使い、行の高さ・font・alignmentは変更しない。blur、Enter、Tab、Shift+Tabはcommit、Escapeはcancel-onlyとする。同じEntryのactual Start inputからEnd inputへ移るfocusは同一editor内として扱い、早期commitせず、editor外へのblurまたは明示的commitで一度だけ保存する。入力中のD&D開始は既存のinteractive-target guardで除外する。

Column resizeは対象列のright boundaryを動かす。対象列のleft edgeとそれ以前の列を固定し、対象列と後続列の幅・位置だけをdeltaに応じて更新する。Task trackをflex余白の吸収先にせず、min/max width、local persistence、reorder、auto-fit、sticky / horizontal scrollを維持する。Delete actionだけはdestructive red styleとし、eligibilityやdomain semanticsは変更しない。

D-061は新migration / schema / API / Domain semanticsを追加しない。既存execution guardのSQLite比較精度修正はcanonical Instantの保存値を正確に照合する実装補正であり、D-057 / D-060の契約を変更しない。

## D-060 Day row editing

Day Tableのrow編集は、current-Dayのordinary planned Entryに限定する。Task名は表示文字列からinline text fieldへ切り替え、Enterでtrim済み値をcommit、Escapeでcancelする。Projectは同じrowのowner-scoped native selectorで既存候補だけを選択する。Routine、running / completed、past / future read-only、mutation-locked rowは編集controlを出さない。Task displayのclickとrow D&Dのthresholdは分離し、input / select / buttonをD&D開始面から除外する。

actualの開始 / 終了は旧dialogではなく、row内のStart / End cellを押すと同時に開く2つのinline fieldで直接編集する（表示形式はD-061で4桁`HHMM`へ更新）。focus移動で早期commitせず、Enterでcommit、Escapeでcancelする。エラーはrow近傍へ表示し、D-057のactual ordering、Day boundary、user-global no-overlap、active execution、retry / atomicity、forecast reconciliationをそのまま適用する。RevertEntryStartはD-058どおりcurrent UI capabilityへ戻さない。

completed current-Day rowのfar-right overflowは`複製`だけを提供する。複製先は新しいordinary planned Task / Entryであり、actual fact・Routine relation・completed lifecycleをコピーしない。completed sourceのdelete / date moveや、invalid planning pairの自動normalizationはUIから提供しない。D-060のProject selector、actual editor、completed duplicateのvisual polishは既存Day Tableのcolumn order、surface fill、stable scrollbar gutter、checkbox geometry、full-row D&Dと共存させる。

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

Current authenticated shellではSidebarを約240pxでopenし、close時はSidebarをrenderせずmain contentのgrid trackを1列へ戻す。open / closed preferenceはversioned browser-local storageへ保持し、Today / Routine Board / Settingsで共有する。Sidebar resize、saved custom width、icon-only railは未実装である。

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

## Desktop Day wide layout

Desktop Dayだけはcommon `.shell`の`1120px` capを外し、main content内で`calc(100% - 32px)`の左右gutterを保って利用可能幅へ広げる。Settings / Routine Board / Authのcommon `.shell`幅は変更しない。Day Tableは引き続き`.day-surface`がhorizontal scrollを所有し、minimum useful widthを下回るviewportでは既存のscroll fallbackを使う。

Day TableのTask trackは`minmax(280px, 1fr)`とし、Project / Section / Routine / estimate / planned-start / forecastのcompact trackを維持したままsurplus widthの主な受け手とする。列順、fixed-left Bulk / Execution / Task、Section summary、placeholder、collapse、D&D、calendar、Floating Runnerのpositioningは変更しない。Page-level horizontal overflowを新たに作らず、`max-width: 720px`では既存のsticky解除とtable-owned scrollを維持する。

Day Table column customization v0.1では、`.day-surface`が引き続きhorizontal overflowを所有し、resolved column tracksをheading / draft / normal rowで共有する。実用幅では固定左領域を維持し、720px以下ではhidden accessibility labelを含むpage-level overflowを作らず、table-owned scrollへ閉じ込める。

## Fixed left structure

Day Tableの固定左領域は次とする。

`[Bulk selection slot] [Execution Control] [Task]`

- Bulk selection slotはlayout shiftを防ぐために予約するUI slotであり、data columnではない。
- Execution Controlはaction / stateを表す固定UI slotであり、通常のdata column customization対象ではない。
- Taskはfixed / stickyとし、hideまたはcolumn reorderの対象にしない。
- Bulk Selection capabilityはv0.1 / v0.2A / v0.2B1 / v0.2B2を実装済みである。固定slotはtarget structureを定め、詳細なselection / Section commandの実装状態は下記専用sectionと`CURRENT` / `FEATURES` / `TEST_MATRIX`で管理する。

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
- 開始見込（read-only projection）
- 開始 / 終了 / 実績（Execution projection。表示はderived read-only。D-057の入力・訂正はhistorical compatibilityとして保持するが、current UI / API capabilityではない）

見積は開始予定より前に置く。Entry placement / canonical orderはD-031 / D-039に従い、visual column orderから新しいDomain orderを作らない。

D-043のtarget interactionでは、開始予定の設定・変更が該当real Sectionをderiveし、real Sectionの明示選択が開始予定をSection開始minuteへ設定する。開始予定のclearと`Sectionなし`の選択はどちらもSection absence + `NULL`へ同期し、通常の編集操作から片方だけが残るstateを作らない。これはcurrent runtimeへ実装済みである。D-057のmanual actual correctionはcurrent capabilityから撤去し、開始 / 終了 / 実績はread-only projectionとして表示する。

### Capability not implemented

以下はunderlying capabilityまたは十分なrow projection / editingが未実装である。

- Mode
- Note / Documents

これらはtarget column modelから削除しない。一方、capability実装前にfake valueやdisabled placeholderだけの列を出さない。表のactual列はExecution factからのderived read-only projectionを表示する。Bulk Selection v0.1 / v0.2A / v0.2B1 / v0.2B2の実装・verification状態は下記の専用sectionと`CURRENT` / `FEATURES` / `TEST_MATRIX`で管理する。

## Routine placement

Routineは独立したtarget columnを持つ。

Day Table UI-1でMinimal Routine R1のbadge / editor / end state / actionを独立したRoutine列へ移した。これはpresentation realignmentであり、D-040のpersistence / materialization / lifecycle semanticsを変更しない。

Routine columnは、current planned ordinary Entryではmutedなinline SVG iconを既存のRoutine化 editorへ開くactionとして表示する。Routine-derived Entryではaccent iconを表示し、visibleな`Routine化`buttonや冗長なbadgeを出さない。running / completed / non-current / locked等のprotected stateではmuted non-interactive iconとaccessible explanationだけを表示し、fake no-op actionを出さない。

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
- current runtimeのvisible `↑/↓`buttonsはcross-Section D&D v0.1で撤去した。独立したdata columnではなく、keyboard `Shift+↑/↓`は維持する。

UI-2CでTask cell内handleによるsame-Section / same-cohort D&Dを実装した。D-058ではvisible handleを撤去し、Task identity cell全体をplanned D&D surfaceとした。cross-Section D&D v0.1では、ordinary planned EntryをTask surfaceから別のvisible Section summary（`Sectionなし`を含む）へappendできる。expanded targetは末尾placeholder、collapsed targetはcueのみでauto-expandせず、successは既存`MoveEntry`を1回だけ使ってfull-Day canonical reconciliationを行う。interactive descendantからdragを開始せず、Routine-derived、running / completed、read-only / preview / locked stateはno-writeとする。keyboard `Shift+↑/↓`は維持し、final drag-and-drop library / fuller context interactionはfuture scopeである。

### Display column reorder

display column reorderはTask planning orderと別機能である。

- Project以後のdata columnsをheader interactionで並べ替えられるtargetとする。
- display column orderの変更はEntry position、planned start、Section placementを変更しない。
- ordinary header sortはtarget behaviorではない。

## Column customization target

- Project以後の9 data columnsはreorder / resize / auto-fit / hide / show対象とする。`列` menuのcheckboxは即時反映し、popoverはtoggle中に開いたまま保持する。
- Taskはfixedかつnon-hideableとする。
- Bulk slotとExecution Controlはfixed UI slotsとする。
- resizeとauto-fitをtargetとする。
- display order / width / visibilityはbrowser-local preferenceとして保持し、Server / API / D1 / cross-device同期を行わない。
- preference keyは`taskchute.web.day-columns.v2`、envelopeは`{version:2,order:[...],widths:{...},hidden:[...]}`とする。validな`taskchute.web.day-columns.v1`はv2へ移行し、全列visibleで開始する。malformed / incompatible / duplicate / unknown / missing keyは安全にrepairする。
- full orderはhidden columnを含む順序として保持し、visible orderはfull orderからhiddenを除いた解決順とする。hideはorder / widthを保持し、showは元位置・元幅へ戻す。`すべて表示`はhiddenだけをclearし、order / widthを変更しない。
- `初期状態に戻す`はcurrent data columnsのdefault order / width / visible stateだけを戻し、Sidebar、Section collapse、completed visibility、Task / Day dataは変更しない。
- effective grid tracks / table minimum widthはvisible columnsだけから算出し、heading / normal / draft / summary / placeholder / empty rowで共有する。hidden columnはaccessibility treeにも出さない。

column customization v0.1は実装済みである。registryがheading label、stable key、default/min/max width、cell class、renderer、reorder / resize / auto-fit / visibility behaviorを共有し、header drag-and-dropはvisibleなProject以後だけを対象とする。`列` triggerは明示accessible name、expanded state、real checkbox、Escape / outside click / trigger re-click dismissalを持つ。実装・verification状態は`docs/CURRENT.md` / `docs/FEATURES.md` / `docs/TEST_MATRIX.md`で管理する。

## Bulk Selection v0.1

- Day Table先頭のfixed-width Bulk slotへ、eligibleなplanned Entryのrow checkboxとheader select-allを置く。Bulk slot、Execution、Taskはfixed UI slotとして常時表示し、column customizationのhide / reorder対象にしない。
- eligibleはestablished Dayのplanning mutationが許可されたplanned Entryとする。running、completed、historical / read-only、未establishのdraft / preview、mutation-locked stateはdisabledまたは選択対象外とする。header select-allはviewportやexpanded Sectionだけでなく、collapse中を含むcurrent Day projection全体へ適用する。
- 選択はstable Entry IDのephemeral Web stateとし、localStorage、Server、API、D1へ保存しない。collapse、column customization、Sidebarの変更では維持し、reconcileで不在 / ineligibleをpruneし、reload、Day navigation、logout / identity change、成功後にclearする。
- selection toolbarは件数、`選択解除`、`削除`を提供する。削除は必ず明示確認を経由し、ordinaryのみ、Routine-derivedのみ、mixed selectionで処理内容を説明する。Escape / cancelでno-writeのまま確認を閉じ、triggerへfocusを戻す。
- 実行時はN件の個別mutationではなく、selected Entry IDsとDay placement revisionを一つの`BulkDeleteEntries` commandへ送る。ordinary planned EntryはそのDayのEntry rowだけをremoveし、Task identity、Project、他Day、Execution factsを保持する。Routine-derived planned EntryはEntry / RoutineDefinitionを変更せず、Occurrenceへ当日だけの`skip` suppressionを保存する。
- success後はcanonical Day projectionへreconcileし、relative order、Routine identity、future generation semanticsを維持する。atomic guard、owner scope、stale revision、operation replay / ambiguityは既存command conventionへ従う。Task hard delete、running cancellation、completed / interrupted delete、undo / restore、persisted selectionはこのsliceに含めない。
- narrow viewportではtoolbarをwrapし、Columns popoverをviewport内へ収める。Day Table自身がhorizontal scrollを所有し、既存のsticky / narrow fallbackとfixed slot alignmentを維持する。

## Bulk Selection v0.2A — Section change

D-052に基づくBulk Section changeは、D-051のselection surfaceを再利用する追加sliceである。toolbarは`N件選択中 | Section変更 | 削除 | 選択解除`とし、pickerはcurrent DayのSection orderと`Sectionなし`を提示する。Escape / outside click / cancelはwriteせず、成功後はselectionを維持する。Routine-derived Entryを含むselectionでは`Section変更`をdisabledにし、明示した理由をaccessible descriptionへ出す。running / completed / historical / preview / locked stateはselection / mutation対象外とする。

Section変更はN件の個別MoveEntryではなく、一つの`BulkMoveEntriesToSection` commandで行う。serverはowner-scoped Day、selected Entry、expected `placement_revision`、planned ordinary state、snapshotをatomicに検証する。real SectionはDay Section contextの`logical_start_minute`から`section_id + planned_start_minute`を同期し、`Sectionなし`は`section_id + planned_start_minute`をともに`NULL`へ同期する。実変更があるときだけDay revisionをcommand全体でexactly `+1`し、moverはcommand前のDay display orderを保ってtarget group末尾へappendする。同一Sectionのstart-only syncはpositionを変更せず、既にcanonicalなtargetはno-opとする。

operation fingerprint / replay、misuse rejection、stale revision、snapshot guard、rollback / ambiguous retryは既存D-020 command conventionへ従う。APP compatibility migration `0011_bulk_section_change.sql`は`operations.command_type`のCHECKだけを拡張し、既存rowsとEntry / Routine / Section schemaを変更しない。Bulk date / Project / Mode / Note、Routine bulk Section、cross-Day move、undo / restoreはこのsliceへ含めない。

## Bulk Selection v0.2B1 — Routine-inclusive Section occurrence change

D-053に基づくv0.2B1は、D-052のcurrent-Day Section pickerとselectionを再利用し、ordinary / Routine / mixedのplanned Entryを一つの`BulkMoveEntriesToSectionOccurrence` commandで処理する。Routine-derived Entryを含む場合、Section変更はcurrent occurrenceだけを対象とするexplicit `今回だけ変更` acknowledgementを必須にし、`Routineへ反映`を提示しない。pickerでのSection候補選択はlocal candidateであり、cancel / Escape / outside dismissはno-write、成功後はselectionを維持する。

request authorityは`operation_id`、current `taskchute_day_id`、selected `entry_ids`、target `section_id`、expected `placement_revision`だけとし、planned startやRoutineDefinition IDをclient authorityにしない。serverはDay Section contextの`logical_start_minute`をderiveする。real Sectionは`section_id + planned_start_minute`、`Sectionなし`は`NULL + NULL`へ同期し、RoutineはR2A typed fields `section_plan_override_present` / `section_override_id` / `planned_start_override_minute`へOccurrence単位で保存する。RoutineDefinition default、defaults revision、future / other Occurrence、schedule、pause / suppression、Routine Boardは変更しない。

同じeffective Section / startでもexisting overrideがない場合はoverride-only mutationとしてpersistし、visible placementとDay revisionは変更しない。既存overrideがtarget pairと同じ場合だけtrue no-opとする。visible Section / start / position change時はDay `placement_revision`をcommand全体でexactly `+1`し、override-onlyまたはtrue no-opでは増分しない。mixed moverはcommand前のcurrent Day display orderを保ってtarget group末尾へappendし、ordinaryとRoutineを別groupに分けない。owner / current-Day / lifecycle / Routine relation / origin Day / suppression / snapshot / stale revisionをatomicにguardし、operation fingerprint / replay / ambiguity / rollbackはD-020 conventionに従う。

APP compatibility migration `0012_bulk_routine_section_occurrence.sql`は`operations` tableの`command_type` CHECKへ`BulkMoveEntriesToSectionOccurrence`を追加するrebuildだけで、existing operation rows、Entry / Routine / Section / Day schema、新tableを変更・追加しない。Bulk `Routineへ反映`、multi-RoutineDefinition default propagation、future / past Routine bulk edit、Bulk date / Project / Mode / Note、cross-Day move、undo / restoreはこのsliceへ含めない。

## Bulk Selection v0.2B2 — per-Routine Section propagation scope

D-054に基づくv0.2B2は、D-052 / D-053のcurrent-Day Section pickerとselectionを再利用し、ordinary / Routine / mixedのplanned Entryを一つの`BulkMoveEntriesToSectionScoped` commandで処理する。ordinaryはcurrent Dayだけを対象とし、selected Routineごとにscopeをpreselectせず、`今回だけ`または`ルーティンに反映`を明示選択する。`すべて今回だけ` / `すべてルーティンに反映`はexplicit fill-all helperであり、helper後も各Routine rowを個別にoverrideできる。未選択Routineがある間はconfirmをdisabledとし、cancel / Escape / dismissはno-write、成功後はselectionを維持する。

request authorityは`operation_id`、current `taskchute_day_id`、全selected `entry_ids`、target `section_id`、Routineごとのscope、definition scopeの`expected_defaults_revision`、current `expected_placement_revision`とし、planned startやRoutineDefinition IDをclient authorityにしない。routine scopeはserverがEntry relationから解決し、duplicate / ordinary混入 / 欠落 / invalid scope / revision欠落を拒否する。semantically unorderedな配列はfingerprint前に正規化し、同一operationの同一requestをreplayする。

Occurrence scopeはD-053のcurrent occurrence override semanticsを再利用する。Definition scopeはD-044のcurrent single-Routine definition semanticsを再利用し、Definition default pairと`defaults_revision`をDefinitionごとに一回だけ更新し、selected current overrideをclearする。already-materializedなcurrent / future planned Entryのうちexplicit overrideのないものへpropagateし、他のexplicit override、past、running、completed、protected stateは維持する。default propagationを理由にfuture Day / Occurrence / Entryはmaterializeしない。複数Definitionのmutationも一つのatomic outcomeとする。

各affected Dayではpre-mutation canonical display orderを一度読み、ordinary / Occurrence / Definition propagationのmoverをDefinition単位で分けずtarget group末尾へstable appendする。target non-moverのrelative orderを保持し、same-start-only / override-only / metadata-onlyはpositionを変えない。visible EntryのSection / planned start / position changeがあるDayだけplacement revisionをcommand全体でexactly `+1`する。owner、lifecycle、suppression、Entry / Occurrence / Definition snapshot、全affected Day revision、Section contextをatomic guardし、partial writeを残さない。

APP compatibility migration `0013_bulk_routine_section_scoped.sql`はoperations command CHECK-onlyで、既存operation row / command type、Entry / Routine / Day / Section schema、PK / FKを変更しない。実装・verification状態は`docs/CURRENT.md`、`docs/FEATURES.md`、`docs/TEST_MATRIX.md`で管理する。

## Bulk Estimate change with per-Routine scope

D-055に基づくBulk Estimate changeは、D-051〜D-054のselection surfaceを再利用し、ordinary / Routine / mixedのeligible planned Entryへ一つのcommon positive estimateまたは明示的な`見積なし`（`NULL`）を適用する。Routineを含む場合、各selected Routine rowはpreselectせず、`今回だけ`または`ルーティンに反映`を明示選択する。`すべて今回だけ` / `すべてルーティンに反映`はfill-all helperであり、helper後のrow単位overrideを許可する。全Routine scopeが埋まるまでconfirmをdisabledにし、candidate表示・cancel・Escape・dismissはno-write、success後はselectionを維持する。

Occurrence scopeはD-044 / D-046のtyped occurrence estimate overrideを再利用し、`estimate_override_present = 1`とtarget（`NULL`を含む）をselected current occurrenceへ保存する。Definition scopeはselected current occurrence overrideをclearし、Definitionごとのdefault estimateと`defaults_revision`を一回だけ更新する。already-materializedなcurrent / future planned Entryのうちexplicit overrideがないものだけへpropagateし、past、running、completed、suppressed、protected stateは変更しない。unmaterialized future Day / occurrence / Entryは作成しない。same Definitionのscope不一致、stale defaults、selected state変更、owner / Day / lifecycle / snapshot不一致は一つのatomic rejectまたは既存のambiguous retry boundaryへ収束させる。

ordinary-only selectionはestablished displayed current / future Dayを許可する。Routine-inclusive selectionはserverがcanonical timezone / Day boundaryからcurrent Dayを解決し、non-current Dayを拒否する。estimate commandはSection、planned start、position、Day `placement_revision`をauthorityにもmutationにもせず、resultはselected effective value change、occurrence override change、non-selected propagation、Definition revisionを区別する。APP `0014_bulk_estimate_scoped.sql`は既存`operations`と、実装で再利用する`routine_command_guards`のcommand CHECK拡張だけを行うcompatibility-only migrationであり、新しいestimate persistence table / column / sentinelを追加しない。実装・verification状態は`docs/CURRENT.md`、`docs/FEATURES.md`、`docs/TEST_MATRIX.md`で管理する。

## Execution actual projection

開始 / 終了 / 実績は、Entryへ値を書き戻す列ではなく、current-valid Execution factsからのread-only projectionとする。D-058によりcurrent manual correction / Start Revert commandは提供しない。conceptual shapeは次である。

`execution_summary = { first_started_at, last_ended_at, completed_duration_seconds, active_started_at }`

複数のvalid Execution rowがある場合、開始は最初のstart、終了は最新のended time（active中は`—`）、実績はcompleted intervalの合計にcurrent display referenceからのactive elapsedを加える。logical Dayのtimezoneで表示し、Day boundaryを越える時刻は`25:10`のようなextended timeとする。D-057のmanual correction / Start Revertのhistorical migration・rowsはこのprojectionを壊さず保持するが、current UI / APIからhistory rewriteを導入しない。

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

Search / Filterはvisible row projectionを変更できるが、canonical Section summary / Domain factsを再定義しない。collapseはUI-2Bで実装済みであり、Search / Filterを実装済みとは主張しない。

## Keyboard / focus target

- `J/K`と`↑/↓`: row / Section summary focus navigation
- `Shift+↑/↓`: valid cohort内のmanual Task reorder
- `S`: focused TaskのStart / Complete
- `Tab / Shift+Tab`: visual column orderに沿うedit traversal
- text editing / IME composition中はglobal shortcutを発火しない
- Section summaryをfocus / collapseできるtargetとする

個々のshortcutのimplementation statusは`FEATURES` / `TEST_MATRIX`で管理する。

## Current implementation summary

current mainで実装済みのdefault visible heading orderは次である。

`実行 | Task | Project | Section | Routine | 見積 | 開始予定 | 開始見込 | 開始 | 終了 | 実績`

Day Table UI-1では、独立した`状態`列と独立した`並び替え`列を除き、Execution Controlへlifecycle action / state presentationを維持し、Routineを独立列へ移し、見積を開始予定より前へ配置した。keyboard `Shift+↑/↓`は既存interactionとして維持し、task count、`placement_revision`、raw TaskChuteDay intervalはnormal toolbar / Day headerから除いた。

UI-1は既存のServer-canonical command、retry / reconciliation、placement / ordering、Routine persistence semanticsを変更していない。

UI-2AはDay Tableへ明示的なminimum content widthとtable-owned horizontal scrollを追加し、heading / Task / draftの先頭へnon-interactive reserved Bulk slotを配置した。実用幅ではBulk / Execution Control / Taskをdeterministic CSS offsetでfixed / stickyにし、狭幅ではCSS-only fallbackでstickyを解除して全列へ到達可能にする。Bulk capability / control自体は追加せず、named heading orderとexisting interaction / Domain semanticsを維持する。implementation commit `43789c990ed91febb2bb6036c1f3970dfe8f34a1`とverification / docs commit `b66d6ee2248935fd36d338ea2794762ee51b6515`はGitHub canonical `main`へIntegrated済みであり、詳細な実装・evidence状態は`CURRENT` / `FEATURES` / `TEST_MATRIX`を正本とする。

UI-2BはSection summaryからnormal Section / `Sectionなし`をpointerまたはfocused summaryのEnter / Spaceでcollapse / expandできるようにし、collapse stateをlogical Dayごとのin-session stateとして保持する。focused planned / running Taskの`S`は既存のStart / Complete commandとcanonical reconciliationを使う。text editing / IME composition / key repeat / unsafe modifier中は発火しない。collapse stateはbrowser-local key `taskchute.web.day-section-collapse.v1`へlogical Day + stable Section identityでreload persistenceする。implementation commit `3861b9839b55a1453b0e2f230f03728e8d85059b`とpersistence commit `b81ea533c27dbcf81e3baae865f361d0f40f66e3`はGitHub canonical `main`へIntegrated済みであり、詳細な実装・evidence状態は`CURRENT` / `FEATURES` / `TEST_MATRIX`を正本とする。

UI-2CはTask cell内のcompact drag handleから、同じSectionかつ同じcanonical planned-start cohort内のplanned Entryをrow上半分 / 下半分へbefore / after配置するD&Dを実装した。最終orderは既存`ReorderEntries` commandとServer-canonical reconciliationから取得し、invalid / no-op dropはmutationしない。keyboard `Shift+↑/↓`は維持する。cross-Section D&D v0.1は後続の`MoveEntry` first sliceとして実装し、詳細な実装・evidence状態は`CURRENT` / `FEATURES` / `TEST_MATRIX`を正本とする。

cross-Section D&D v0.1はimplementation commit `89d4784fddca891421d3619def352ee1156f1c89`で、ordinary planned Entryの別Section append、`Sectionなし`の`NULL` planned-start同期、collapsed cue / no auto-expand、floating row visual、既存`MoveEntry` 1回、full-Day reconciliation / focus restorationを追加した。visible pointer `↑/↓`buttonsは撤去し、same-Section `ReorderEntries` semanticsと`Shift+↑/↓`は維持する。これは同一Day内のWeb-only first sliceであり、cross-Day move、Routine-derived write、running / completed / read-only / preview / locked mutation、fuller context interactionは含まない。

Start Forecast v0.1はD-032のderived projectionとして、`開始予定`の後ろへread-onlyの`開始見込`列を追加した。current Dayはserver projection生成時刻をanchorにactive Executionの見積残時間とtimed Section内planned Entryの見積を累積し、future established DayはDay startをanchorにする。planned startはforecast barrierではなく、completed / running自身、`Sectionなし`、past / record-noneは`—`表示とする。implementation commit `8939c4d6af95e2fd21b7d91e0e946bee29a6c1fb`はGitHub canonical `main`へIntegrated済みであり、詳細な実装・evidence状態は`CURRENT` / `FEATURES` / `TEST_MATRIX`を正本とする。

Day Table column customization v0.1は、Project / Section / Routine / 見積 / 開始予定 / 開始見込 / 開始 / 終了 / 実績のregistry-driven heading / row / draft alignment、header reorder、shared width resize、handle double-click auto-fit、browser-local order / width persistenceを実装した。fixed Bulk / Execution / Taskは対象外であり、Mode / Noteはruntime projectionへ追加していない。実績列はExecution summaryからのderived read-only projectionを表示する。D-057のactual time editor / commandとcurrent active StartのRevertはD-058で撤去し、0016と既存historical dataだけを保持する。implementation / fix commits `10584ba`、`6100d20`、`6316b0d`、`60eecdd`、`b3370d3d2e3de3ba113b1e3a55fbed893f3cc068`、`66d63efa790c06d2efefa769595508b7c5d6dbb5`はGitHub canonical `main`へIntegrated済みで、詳細なevidence状態は`CURRENT` / `FEATURES` / `TEST_MATRIX`を正本とする。

## D-058 Day Table simplification and capability withdrawal

D-058では、Day Tableのcurrent interactionを簡素化し、D-057で追加されたcurrent Product capabilityの`開始を取り消す`と`実績入力 / 実績訂正`を撤去する。撤去対象はvisible controlだけでなく、client contract / method、Web state / dialog / editor、Worker route / handler、command execution pathである。旧API pathはmutationを実行せず`404`とし、適用済み`0016_execution_correction.sql`と既存operations / lifecycle guards / executions / schema / rowsは変更しない。

- Bulk checkboxはreserved slotでunchecked / hover / checked / indeterminate / focus / disabledを表現し、row alignmentを変えない。
- planned EntryのTask identity cell全体をD&D surfaceとし、button / inputなどのinteractive descendantではdragを開始しない。keyboard `Shift+↑/↓`、same-cohort、cross-Section、owner / lifecycle / revision semanticsは維持する。
- Section summary row全体をpointer / Enter / Spaceでtoggleし、`aria-expanded`を更新する。`＋` Addはtoggleから分離する。
- eligible planned rowの右端に一つの`…` overflow menuを置き、既存の`日付変更` / `複製` / `削除` flowだけを収める。removed D-057 actionsは含めない。outside / Escape / stale closeとfocus restorationを扱う。
- data empty valueには小さくmutedな専用`EmptyValue`を使い、意味のあるhyphen・range・user textは置換しない。

開始 / 終了 / 実績は引き続きvalid Execution factsからのread-only projectionである。D-057のDecision・実装・migration・evidenceはhistorical recordとして保持し、D-058 implementation / verification状態は`docs/CURRENT.md`、`docs/FEATURES.md`、`docs/TEST_MATRIX.md`を正本とする。

## D-059 Day Table vertical space, stable scrollbar gutter, and full-row D&D surface

D-059はD-058のうちD&Dの開始面だけを具体的にsupersedeする。Day Tableは`.shell.day-shell`のcolumn flex layoutと`100dvh` minimumを使い、`.day-surface`がheader / toolbar下のviewport残余を`flex: 1 0 auto`で白いsurfaceとして使う。Task rowは既存の`min-height: 44px`、padding、densityを維持し、Taskが少なくてもsurfaceを下へ伸ばし、Taskが多い場合はcontentに応じて自然にpageへ伸ばす。固定height、clip、不要なinner vertical scrollbar / double scrollbarは導入しない。horizontal overflowは引き続きDay Tableが所有する。

page scrolling boundaryには`html { scrollbar-gutter: stable; }`を適用し、page vertical scrollbarの出現 / 消滅でDayのcentered positionやSidebar alignmentをshiftさせない。Settings / Routine / Authのcommon `.shell`幅は変更しない。Bulk slotのheader / row checkboxは同一の16×16 square、`aspect-ratio: 1 / 1`、paddingなし、grid centerを使い、checked / indeterminate markも同じbox内で中央表示する。

eligible planned Entryのrow rootがpointer D&D開始面であり、Task identityだけでなくProject、read-only Section / Routine、estimate、planned start / forecast、actual projection、EmptyValue、row whitespaceから開始できる。`isInteractiveDragTarget`が認識するcheckbox、Execution control、button、link、input、select、textarea、contenteditable、Routine control、inline editor、overflow trigger / menu itemは開始面から除外する。movement threshold、normal click / focus、planned-only、current planning boundary、Routine-derived / running / completed / read-only protection、same-cohort / same-Section Reorder、cross-Section Move、collapsed target、`Shift+↑/↓`、existing command / revision / retry semanticsは変更しない。

これはpresentation / interaction-onlyのDecisionであり、新しいProduct / API / Domain / persistence behavior、migration / schema、dependency、security posture changeを含まない。D-058の他のinteraction simplificationは維持する。

current runtimeでは、Day Navigation v0.1のTop Navigation date navigation / calendar pickerと、Settings v0.1のLeft Sidebar `今日` / `設定`およびdedicated Section / Project Settings surfaceを実装済みである。DayBoard上のtemporary Project作成controlとSection設定editorは撤去済み。Desktop Day wide layoutとauthenticated Sidebar open / closed preferenceの実装状態は`docs/FEATURES.md`、`docs/CURRENT.md`、`docs/TEST_MATRIX.md`を正本とする。

full target column modelはcurrent implementationより広い。Mode、Note、Search / Filter、fullerなcontext interaction、D-053を超えるBulk capability等はfuture workとして残る。browser-local preferenceはServer / API / D1 / cross-device同期を行わず、responsive / mobileのexact policyは引き続きOpenであり、UI-2Aの狭幅fallbackをProduct Decisionへ昇格しない。

## Unreconciled historical scope

historical design branchにあるFloating Runner、context menu、Hit-a-Hint、Bulk actions、responsive / mobile等は、この文書へまだcanonicalizeしていない。必要なscopeごとにcurrent Product / Domain Decisionと再照合してから追加する。
