# D-117 — Web Today / Sidebar / Routine UX Refinement v0.1

Status: **Approved**

## Decision

Desktop WebのToday / Sidebar / Routine列を、既存のTask・Entry・Project・Mode・Routine・Document
semanticsを変更せずに整える。

- TodayのProject列は、Projectの有無にかかわらず同じ幅のプロジェクトノートicon slotを表示する。
  Project未設定時は通常のcell背景を保ったdisabled control、設定済みは既存のProject Primary Note
  affordanceとする。
- current established Dayのordinary running Taskは、既存のCAS / retry / reconciliation境界を保ったまま
  Project / Mode metadataを編集できる。
- Routine列は、非Routineをgray icon、Routineをlight-blue/accent icon onlyで示し、背景色で状態を表現しない。
- Todayの既存D&Dは同じcanonical placement semanticsを使い、row / Section targetのinsertion feedbackを
  軽いanimation / highlightで明確にする。empty normal Sectionとempty `Sectionなし`のdropは既存の
  `MoveEntry`へplacementを付けずに委譲する。
- TodayのRoutine列から、ordinary TaskのRoutine化、completed Taskのfuture Routine作成、既存Routineの
  設定編集を、Routine Boardと同じrecurrence / planned start / estimate / Project / Mode / Section / 開始日
  の考え方を持つmodalで開始できる。操作は明示的なuser actionに限り、completionからの自動Routine化は行わない。
- Todayの表示から`TaskChuteDay`見出しを除去する。
- Sidebarの可視ラベルは、今日=`Taskchute`、ノート=`Note`、ルーティン=`Rotuine`、設定=`Setting`とし、
  各項目にiconを付ける。Sidebarはicons + labels、icons only、open/close control onlyの3状態を持つ。
- `＋ Taskを追加`と`表示`の配置は変更しない。

## Boundaries

D-117は既存のToday / D&D / Project Note / Routine commandのpresentation・entry-point refinementであり、
新しいcommand、schema / migration、dependency、Android、production、auto routineは追加しない。Routine
設定保存・変換・future creationは既存のtyped command、operation、revision、retry、reconciliation
boundaryへ委譲する。running ordinary TaskのProject / Mode editingは、D117で既に承認されたmetadata
capabilityを成立させるため、既存`UpdateTaskMetadata` / `SetEntryMode`のserver eligibilityとcurrent
projectionを後続correctiveで整合させる。このcorrectiveは新しいProduct semanticsではなく、承認済みの
D117 capabilityを実行可能にするための既存command alignmentであり、Task title、lifecycle、placement、
Day revision、Routine semantics、historical Mode snapshotは変更しない。

## Corrective implementation note

初回D117 implementationはWeb-onlyでrunning metadataをWorkerへ渡さずpartialになった。承認済みcorrectiveで、
current established Dayのordinary running Entryに限ってProjectをTask CASで、Modeをlive Entry relation CASで
更新可能とした。Modeの開始時snapshotは保持し、running projectionは明示的なlive Mode変更時だけlive relationを
表示する。operation fingerprint / exact replay、owner scope、auth、revision / ambiguity boundaryは既存実装を
再利用する。

## Canonical references

- D-039 / D-043: planned-start、Section、placement synchronization
- D-050: Duplicate boundary
- D-064 / D-085 / D-089: Routine Board、Routine metadata、recurrence semantics
- D-101 / D-103: Task / Project Primary Document affordance
- D-115 / D-116A / D-116B: current Web Today and Routine presentation / command reuse
