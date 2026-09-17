# D-118 — Routine Enabled / Delete Lifecycle v0.1

Status: **Approved**

## Decision

Routineの`enabled`と`delete`を、current logical dateを境界とする明確なlifecycleとして定義する。

### Enabled / Disabled

- user-facing stateは`有効 / 無効`とし、別の`停止 / 再開`概念は作らない。
- `有効`はrecurrence / period条件に従ってRoutine由来Taskを生成する。
- `無効`へ切り替えたlogical date以降は、新しいRoutine由来Taskを生成しない。
- 無効化時点ですでにmaterializeされている同日以降のRoutine由来Taskは、planned / running / completedを問わず削除する。
- 無効化logical dateより前のRoutine由来Entry / Execution / historical factsは保持する。
- `無効 → 有効`は確認なしで行い、有効へ戻したcurrent logical dateからrecurrence eligibilityを再開する。
- 無効期間はbackfillしない。再有効化より前のlogical dateへ遡ってRoutine由来Taskを生成しない。
- 再有効化当日がschedule / period上eligibleであれば、そのlogical dateは通常のcurrent-Day materialization対象となる。

### Delete

- user-facingにRoutine archiveという概念は提供しない。Routineは`削除`のみを提供する。
- Routine deleteはuser-facingには復元不可であり、archive一覧 / restore UIを提供しない。
- deleteしたlogical date以降は、新しいRoutine由来Taskを生成しない。
- delete時点ですでにmaterializeされている同日以降のRoutine由来Taskは、planned / running / completedを問わず削除する。
- delete logical dateより前のRoutine由来Entry / Execution / historical factsは保持する。
- RoutineDefinition identityはhistorical reference保護のためphysical hard deleteを必須としない。既存D-064のinternal tombstone / soft-delete foundationは利用可能だが、これはuser-facing archive capabilityではない。
- current/future child cleanup後にmaterializerが同じRoutineを再生成してはならない。

### Destructive current-Day cleanup

無効化または削除のlogical dateに対象Routine由来Entryが存在する場合、そのEntryがplanned / running / completedのいずれでも対象とする。running / completed Entryに紐づくcurrent-Day Execution / actual factも、そのcurrent-Day Routine Taskを削除するために対象となる。

このdestructive scopeはあくまでmutation当日のcurrent logical date以降であり、それ以前のhistorical Entry / Executionへ遡及しない。

## UI

### Routine enabled control

- Desktop Web Routine Boardの既存checkboxをON/OFF switchへ変更する。
- ON/OFFは確認ダイアログなしで切り替える。
- OFF mutationが失敗・競合・ambiguousの場合、client表示だけを確定させずcanonical stateへreconcileし、既存retry / exact-operation boundaryを維持する。
- Android Settingsは既にswitch controlを使用しているため、見た目のcheckbox→switch変更はDesktop Webのみ必須とする。shared server semanticsはAndroidからのenabled mutationにも同じように適用する。

### Routine delete confirmation

Routine deleteは明示確認を必須とする。

Title:

`このRoutineを削除しますか？`

Body:

`今日以降のこのRoutine由来Taskを削除し、今後は生成しません。`

`過去の日付の履歴は残ります。`

- actionsは`キャンセル` / `削除`。
- initial focusは`キャンセル`。
- `削除`は既存destructive actionと同じ赤系統で表示する。
- `Escape`押下で削除せず確認UIを閉じる。
- backdrop clickでも削除せず確認UIを閉じる。
- successful delete後は通常Routine一覧から消え、archive / restore surfaceは表示しない。
- Routine deleteを提供するclient surfaceは、意味の異なる古いconfirmation textを残さない。

## Atomicity / authority

- current logical dateはserver-side user settings / timezone / day-boundaryからmutation時に解決する。client supplied dateをauthorityにしない。
- disable / enable / deleteはauthenticated owner scope、existing operation fingerprint / exact replay、settings revision / board revision、CAS / retry / reconciliation boundaryを維持する。
- disable / deleteとcurrent/future child cleanupはpartial stateを残さないatomic mutationとする。
- current/future RoutineOccurrence / snapshot / suppression等のphysical representationは、same-day restore / no-backfill / no-regenerationとhistorical integrityを満たす範囲でimplementationへ委譲する。user-visible current/future Routine Taskが残存または意図せず再生成されてはならない。

## Supersession / compatibility

D-118はD-047 / D-064のRoutine lifecycleを全置換しない。recurrence evaluator、inclusive period、owner scope、operation/revision safety、historical protection、no-backfillの基礎は維持する。

D-118がnarrowに変更するのは次の点だけである。

- `無効`を一時的なgeneration suppressionだけではなく、mutation logical date以降のmaterialized Routine Task cleanupを伴うstateとして定義する。
- Routine deleteをuser-facing archiveではなく復元UIのない`削除`として定義する。
- delete logical date以降のmaterialized Routine Taskをlifecycle stateに関係なくcleanupする。

過去日のRoutine historyをretroactiveに削除するDecisionではない。

## Boundaries

- Routineのhard-delete / storage compaction / generic retention policyは本Decisionに含めない。
- 個人利用前提のため、internal soft-delete recordを容量理由だけで破壊する要件は置かない。
- recurrence ruleそのもの、Project / Mode / Section / estimate default semantics、Day boundary semantics、Routine conversion semanticsは変更しない。
- production migration / deployは本Decisionの承認に含まれない。
- 新schema / migrationはApprovedしていない。existing `SetRoutineEnabled` / `DeleteRoutine` commandと現在schemaで実現不能と判明した場合はSTOPしてProduct Ownerへ戻す。

## Canonical references

- D-047: Routine Board and R2B recurrence lifecycle
- D-064: Routine Board refinement / existing soft-delete tombstone
- D-067: current-Day completed Entry destructive delete safety reference
- D-086 / D-087 / D-089: recurrence evaluator / calendar semantics
- D-104: retry / reconciliation / repository safety
- D-114: Android Settings Routine management
