# DESIGN

## Status / authority

この文書は、TaskChute PlatformのUI / visual / interaction targetを記録するcanonical documentである。

現在canonical化済みのscopeは、Desktop WebのDay Table foundationと、それに直接関係するcontrol / interactionに限定する。

- Product / Domain behaviorは`docs/SPEC.md`を正本とする。
- Approved Decisionとその状態は`docs/DECISIONS.md`を正本とする。
- Architectureは`docs/ARCHITECTURE.md`を正本とする。
- implementation / verification statusは`docs/FEATURES.md`、`docs/CURRENT.md`、`docs/TEST_MATRIX.md`を正本とする。
- この文書は新しいDomain semanticsを作らず、上記canonical docsと矛盾する場合は上記を優先する。

historical UI design referenceはbranch `docs/design-guidelines`、commit `e91bc916ccac5e9b95221602c4e4b2be90455ad6`に残る。ただし、その文書全体はDraft referenceであり、current canonical docsとのreconciliationを終えていないsectionを暗黙にApprovedへ昇格しない。

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

D-034の`今回だけ / Routineへ反映` scope choiceとfield override persistenceが実装されるまで、Routine由来EntryのSection / 開始予定 / 見積はcurrent R1 contractどおりread-onlyとする。

Routine defaultの一field変更が他のdefaultへ与える影響など、未決のR2A coupling semanticsをこの文書では確定しない。

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

current Project-create / Section-settings convenience controlsは、replacement navigationが実装されるまでtemporary accessとして残してよい。

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

## Current implementation after UI-1

current mainで実装済みのvisible heading orderは次である。

`実行 | Task | Project | Section | Routine | 見積 | 開始予定`

Day Table UI-1では、独立した`状態`列と独立した`並び替え`列を除き、Execution Controlへlifecycle action / state presentationを維持し、Routineを独立列へ移し、見積を開始予定より前へ配置した。pointer `↑/↓`はTask cell内のtemporary affordanceとして、keyboard `Shift+↑/↓`は既存interactionとして維持する。task count、`placement_revision`、raw TaskChuteDay intervalはnormal toolbar / Day headerから除いた。

UI-1は既存のServer-canonical command、retry / reconciliation、placement / ordering、Routine persistence semanticsを変更していない。

full target column modelはcurrent implementationより広い。Bulk slot runtime、sticky / fixed-left final structure、Mode、Note、開始見込、fullerな開始 / 終了 / 実績、column reorder / hide / show / resize / auto-fit / preference、Search / Filter、Section collapse、D&Dまたはfullerなcontext interaction等はUI-2以後のfuture workとして残る。

## Unreconciled historical scope

historical design branchにあるbroader Navigation、Settings、Floating Runner、context menu、Hit-a-Hint、Bulk actions、responsive / mobile等は、この文書へまだcanonicalizeしていない。必要なscopeごとにcurrent Product / Domain Decisionと再照合してから追加する。
