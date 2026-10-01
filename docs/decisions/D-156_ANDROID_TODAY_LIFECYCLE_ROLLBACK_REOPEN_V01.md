# D-156 — Android Today Lifecycle Rollback / Reopen v0.1

Status: **Approved**

## Context

Android TodayのTask Editorはcurrent established DayのRunning / Completed Entryに対してactual start / endを表示・編集できるが、current implementationでは次の逆方向lifecycle transitionを許可しない。

- Runningでactual startをclearしてPlannedへ戻す
- Completedでactual endをclearしてRunningへ戻す

D-057ではcurrent active Startの取消とmanual Execution correctionを一度Approvedしたが、D-058でcurrent Product capabilityとしてwithdrawした。その後D-060 / D-138によりAndroidを含むactual-time editingの一部は再導入されたが、Start RevertとCompleted reopenは依然禁止されている。

Product Ownerは2026-10-02に、Android Task Editorから次の操作を行えることをApprovedした。

## Decision

### 1. Running → Planned

current established DayのRunning Entryは、Task Editorでactual startを空欄にし、actual endも空欄の状態で保存するとPlannedへ戻る。

この操作は「現在のStartを誤入力として取り消す」correctionであり、logical work chain全体やearlier valid historyを巻き戻さない。

Server canonical outcome:

- 対象Entryがcurrent Runningであることをguardする
- 対象Entryのcurrent active Executionだけを削除する
- Entry lifecycleを `running → planned` にする
- current `section_id`、`planned_start_minute`、`position`、estimate、Task metadata、Mode、Routine occurrence identityを変更しない
- Day `placement_revision`を変更しない
- earlier valid Execution factsが存在する場合は保持する
- cancelled/tombstone/audit rowはこのsliceでは追加しない

D-057のhistorical `RevertEntryStart` semanticsをこのcurrent-Day correctionに限って再採用し、D-058のwithdrawalを狭くsupersedeする。既存のoperation fingerprint / exact replay / owner isolation / stale snapshot guardを維持する。

### 2. Completed → Running

current established DayのCompleted Entryは、Task Editorでactual startを保持したままactual endを空欄にして保存するとRunningへ戻る。

Server canonical outcome:

- 同じExecution identityと `started_at` を保持する
- `ended_at` を `NULL` にする
- terminal outcomeをactive Executionに整合する状態へ戻す
- Entry lifecycleを `completed → running` にする
- Section、planned start、position、placement revisionは変更しない
- Task / Project / Mode / Routine identityは変更しない

これは新しいExecutionを作らず、Completed Executionの終了入力を訂正して同じExecutionを再びactiveにするcorrectionである。

### 3. No-overlap / active Execution guard

Completed → Runningはuser-global Execution invariantを維持する。

- 別のactive Executionが存在する場合はrejectする
- 対象start以降に別のvalid Executionがあり、endをNULLにするとoverlapする場合はrejectする
- 他Executionを自動削除・短縮・shiftしない
- overlapやactive-Execution conflict時はTask Editorへ保存失敗として返し、canonical stateを再照合する

したがって、例えばAが09:00–09:30、Bが09:30–10:00で完了しているとき、AのendだけをclearしてAを09:00→Runningへ戻す操作はBとoverlapするためrejectする。

### 4. Validation / direct Completed → Planned

- Running: start blank + end blankをPlanned rollbackとして許可する
- Running: endだけ残してstartをblankにする入力は引き続きinvalid
- Completed: startあり + end blankをRunning reopenとして許可する
- Completed: startとendを同時にblankにして直接Plannedへ戻す操作はv0.1では提供しない

CompletedをPlannedへ戻したい場合は、まずendをclearしてRunningへ戻し、canonical reconcile後にstartをclearしてPlannedへ戻す2-stepとする。

### 5. Scope

対象:

- current established Day
- Android Today Task Editorから編集可能なRunning / Completed Entry
- ordinary Entryと、同じTask Editor lifecycle metadata capabilityを持つRoutine-derived occurrence
- server canonical lifecycle / Execution correction
- Android optimistic presentation / reconcile
- D-155 reminder schedulerの既存canonical reconcile

対象外:

- past Day / future Day lifecycle correction
- Web UIでのreopen/revert affordance追加
- Wear UI
- interrupted / continuation chainの巻き戻し
- Pause / Resume
- multiple Execution segment editor
- correction audit history / tombstone
- schema / migration / new lifecycle state
- production / Release

Routine-derived occurrenceで本操作を行ってもRoutine Definition、recurrence schedule、default plan、他occurrenceは変更しない。

### 6. Reminder interaction

D-155のreminder semanticsは変更しない。

- Running → Planned後はcanonical reconcileによりactive overrun scheduleを解除し、start reminderは既存D-155条件に従って再評価する
- Completed → Running後はcanonical active Executionに基づいてoverrun reminderを既存D-155条件で再評価する
- past scheduled instantを新たに即時通知する等のfallbackは追加しない

## Supersession

D-156は以下を狭くsupersedeする。

- D-058の `RevertEntryStart` current capability withdrawalを、current established DayのAndroid Task Editor Running→Planned correctionに限って解除する
- D-057 / current `SetExecutionTimes` の「Completed Entryはend clearでreopen不可」を、current established DayのCompleted→Running correctionに限って変更する
- D-138のRunning / Completed Task Editor validationで、Runningはstart必須、Completedはstart+end必須だった制約を上記2 transitionに限って変更する

D-057 / D-058のhistorical evidenceは書き換えず保持する。

## Verification intent

Worker/API focused verification must cover:

- Running → Planned success
- active Execution delete and lifecycle update are atomic
- placement / planned start / position / revision preservation
- stale lifecycle / wrong owner / wrong Execution / replay / misuse rejection
- Completed → Running success
- same Execution identity / started_at preservation
- ended_at NULL / terminal outcome / lifecycle convergence
- another active Execution rejection
- later completed Execution overlap rejection
- exact adjacency and non-overlap acceptance where applicable
- Routine-derived current-Day parity without RoutineDefinition mutation

Android focused verification must cover:

- Running editor accepts clearing both actual fields and saves to Planned
- Completed editor accepts clearing only end and saves to Running
- Completed both-blank remains invalid
- optimistic lifecycle presentation and immediate reopen
- failure preserves/reconciles canonical state
- D-155 reminder settings are not reset

Persistent nonprod verification is required because Worker lifecycle semantics change. Production remains NOT_RUN unless separately approved.
