# D-120 — Bulk Task Move / Reorder v0.1

Status: **Approved**

## Scope

D-120は、Day Tableの複数選択Entryを一つのlogical move blockとして扱うWebの
move / reorder capabilityを定める。選択順ではなく、mutation前のcanonical Day display
orderをblock内部順序とする。current established Dayと、D-119により明示的に開かれた
established future Dayを対象とし、past Dayのmutationは追加しない。

## Placement

同一Sectionの合法なplanned-start cohort内のblock reorderはcanonical
`ReorderEntries` semanticsを使う。Sectionをまたぐrelative placement、空のSection、
空の`Sectionなし`へのblock moveは、既存のowner-scoped operation / placement revision
boundaryを再利用するatomicなbulk occurrence placementとして扱う。target Sectionの
canonical planned-start、`Sectionなし`の`planned_start = NULL`、Routine occurrence-only
overrideはServerが導出する。複数のsingle-entry mutationを連鎖させてpartial successを
作らない。

同じcanonical placementへのdropはno-opとし、placement revisionやoccurrence overrideを
不要に変更しない。selected Entry set、anchor、cohort、Day eligibility、stale revision、
operation fingerprint / replayは一つのatomic command boundaryで検証する。running、completed、
歴史行、Routine以外の不適格行を部分的に変更しない。

## Interaction

複数選択時のlong-press D&Dと`Shift + ↑ / ↓`は、同一Sectionのblock reorderまたは
cross-Sectionのatomic block moveへ接続する。empty Section / empty `Sectionなし`はheader
drop surfaceを使用し、relative anchorを省略して既存canonical placementへ委譲する。
unselected rowからdragを開始した場合は、そのrowのsingle-entry D&Dとして扱い、既存選択を
引き継がない。通常のrow tap、Start、overflowなどのinteractive descendantはdragを開始しない。

対象はordinary planned EntryとRoutine-derived planned Entryの両方だが、RoutineをDay画面から
編集・移動する場合のscopeは常にそのoccurrenceだけとする。Day画面には`今回だけ / ルーティンに
反映`のscope chooserを表示せず、RoutineDefinitionのdefaultは変更しない。Routine defaultの
変更はRoutine画面で行う。既存の明示的なoccurrence override reset semanticsは維持する。

## Compatibility boundary

D-020、D-039、D-043、D-050、D-066、D-079、D-083、D-096、D-112、D-119のoperation、
CAS、retry、reconciliation、historical authority、future-Day establishmentを正本として再利用する。
D-112のgroup D&D未実装制約は、D-120のatomic bulk placementが提供する範囲だけsupersedeする。

このDecisionはWeb Day interactionと既存bulk commandのAPI contract拡張に限る。Android UI、
past-Day mutation、new execution semantics、new recurrence semantics、schema / migration、
dependency、realtime protocol、offline storage、production rolloutは追加しない。
