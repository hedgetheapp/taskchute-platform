# D-098 — Today Add focus continuity and hierarchical Escape

Status: **Approved**

## Decision

Todayのcurrent established DayでTaskを追加した直後は、pending Add rowをcanonical rowへ置き換えるreconcileが、ユーザーの最新のfocus intentを奪ってはならない。Add完了前にユーザーがTab、Shift+Tab、Arrow / J / K、pointer、Escape、inline editorの移動でfocusを移した場合は、そのfocus intentをAddの既定row focusより優先する。focusがpending row内に残っている場合は、raw DOM nodeではなく、Task row / cell / controlの意味的locatorを使ってcanonical rowの同じcellまたはcontrolへ復元する。row外へ移動している場合はcreated rowへ戻さない。ユーザーのfocus移動がない場合は、既存のcreated rowへの既定focusを許可する。ambiguous-success reconciliationにも同じ規則を適用する。

Task row内のEscapeは階層を一段だけ上がる。inline editor / inputのEscapeは編集をcancelして同じcellの通常focus surfaceへ戻し、その同一イベントがrow handlerへ伝播してrow focusへ二段跳びしない。通常のcell / controlからの別のEscapeはowning Task rowへ移動し、row自身がfocus済みなら追加の移動を行わない。既存のmenu、popover、dialog、native control、IMEのより具体的なkeyboard ownerを優先し、既存のoverlay close / focus restore semanticsを維持する。

## Boundary

このDecisionはWebのfocus coordinationとToday Day Tableのkeyboard interactionだけを対象とする。Task / Entry identity、Add persistence、placement、Worker / API、schema / migration、dependency、lifecycle semanticsは変更しない。D-097のcontinuous row focus frame、D-074のkeyboard workflow、既存のinline editorのcommit / cancel規則を維持する。

## Evidence

Implementationとautomated / persistent nonprod evidenceは`docs/CURRENT.md`、`docs/TEST_MATRIX.md`、`docs/RISKS.md`へ記録する。production、restore、destructive cleanup、branch / PR / merge / tag / Releaseは対象外とし、Releasedは`NO`とする。
