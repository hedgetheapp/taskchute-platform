# D-089 — Routine workday / holiday recurrence

Status: **Approved — Product semantics**

Approved by Product Owner on 2026-09-11.

Implementation migration gate: **APP schema migration approval is still required before implementation starts.**

## Goal

D-035 / D-036でApproved済みの`営業日 / 休日 / 祝日 / 月末営業日`Routine recurrenceを、D-088で実装したeffective workday / holiday calendar authorityへ接続する。

D-089は次の4つをRoutine Boardのrecurrence choiceとして扱えるようにするProduct semanticsを確定する。

- `営業日`
- `休日`
- `祝日`
- `月末営業日`

既存D-034のRoutine occurrence / history protection、D-086のshared recurrence evaluator / materialization / suppression / exactly-once / retry semantics、D-087のN-week semantics、D-088のofficial snapshot / effective-day classifier / user override semanticsを維持する。

## Canonical relationship

- D-035: effective workday / holiday semanticsのProduct source
- D-036: initial Routine recurrence targetとして`営業日 / 休日 / 祝日 / 月末営業日`をApproved済み
- D-086: current typed Routine recurrence / shared evaluator / materialization foundation
- D-087: `every_n_weeks`のcalendar-week anchorをsupersede
- D-088: official Japanese holiday snapshot + effective-day classifier + user override foundation
- D-089: D-088 authorityをRoutine recurrenceへ接続する

D-089はD-035 / D-036 / D-088を置き換えず、Routine側のexact Product-visible membershipとunknown behaviorを補完する。

## User-visible recurrence semantics

### 営業日

Candidate logical dateについて、D-088 shared classifierの**effective classificationが`workday`**ならeligible。

したがって:

- snapshot coverage内の通常平日 → eligible
- Saturday / Sunday → ineligible
- official holiday / official `休日` → ineligible
- user `指定休日` → ineligible
- user `営業日扱い` → eligible
- coverage外weekdayでoverrideなし → ineligible (`unknown`をworkdayと推測しない)
- coverage外weekday + user `営業日扱い` → eligible

### 休日

Candidate logical dateについて、D-088 shared classifierの**effective classificationが`holiday`**ならeligible。

したがって:

- Saturday / Sunday → eligible
- official holiday / official `休日` → eligible
- user `指定休日` → eligible
- user `営業日扱い` → ineligible
- coverage内の通常平日 → ineligible
- coverage外weekdayでoverrideなし → ineligible (`unknown`をholidayと推測しない)
- coverage外weekday + user `指定休日` → eligible

### 祝日

`祝日`Routineは、D-088 official Japanese calendar snapshotに**official entryが存在する全日付**をeligibleとする。

D-089では内閣府CSV上のentryをlabel種類で分割しない。

つまり対象には以下を含む。

- `元日`、`成人の日`等の国民の祝日
- 振替休日等、CSV上でlabelが`休日`のofficial entry
- その他、内閣府CSVにofficial entryとして掲載された日

User overrideはofficial calendar factを消さないため、official entryの日を`営業日扱い`へ変更しても`祝日`Routineのeligibilityは維持する。

これはD-035の「public holiday factとeffective workday classificationは別authority」という原則を維持する。

Coverage外ではofficial entryを推測しないため、`祝日`Routineはeligibleにならない。User `指定休日`もofficial holiday factではないため、`祝日`Routineの対象にはしない。

### 月末営業日

各civil calendar monthについて、D-088 shared classifierでeffective=`workday`となる**最後の日**をeligibleとする。

Civil month-endそのものを基準に後方探索し、Saturday / Sunday / official entry / user指定休日等をskipする。

User `営業日扱い`はworkdayとして扱うため、月末の休日を営業日扱いにした場合、その日が月末営業日になり得る。

`unknown`をworkday/holidayへ推測しない。

月末からcandidateまでの判定に`unknown`が残り、candidateが「その月の最後の営業日」であることを確定できない場合、そのmonthについて`月末営業日`Routineを生成しない。

User overrideによって必要なunknown weekdayがすべて確定し、最後のeffective workdayを一意に決定できる場合のみeligibleとする。

## Period boundary

既存Routine period semanticsを維持する。

- `start_logical_date`より前はeligibleではない
- `end_logical_date`がある場合はinclusive
- period外へbackfillしない

月末営業日がstart前なら、そのmonthは発生しない。

## Shared calendar / recurrence authority

D-089の4 recurrenceをUI / SQL / Workerごとに独立実装しない。

Routine recurrenceのshared authorityは、D-088 shared effective-day classifierとofficial snapshot factを利用する。

Conceptually:

```ts
routineEligible({
  schedule,
  candidateLogicalDate,
  startLogicalDate,
  endLogicalDate,
  effectiveDayContext,
})
```

または同等のshared domain compositionとする。

Exact function signature / adapter boundaryはimplementation detailだが、Routine Board UIが独自にholiday判定を持つことは禁止する。

Runtime external holiday API callは追加しない。

## Unknown semantics

D-088の`unknown`をRoutine側でboolean falseへ潰して「通常平日」と推測しない。

- 営業日: unknown → not eligible
- 休日: unknown → not eligible
- 祝日: official entryなし → not eligible
- 月末営業日: last workdayを確定できないunknownがあるmonth → no eligible date

Unknownはerrorではない。公式data未公表/coverage外というknowledge stateである。

## Calendar override change behavior

Product Owner approved that calendar setting changes affect **unexecuted/planned Routine state**, while historical/executing state remains protected.

UserがD-088 `指定休日 / 営業日扱い`をcreate/update/deleteした場合、calendar-based Routine eligibilityは最新effective calendarへ追従する。

### Reconcile対象

- already-materialized planned/unstarted Routine occurrenceで、calendar changeによりeligibilityが変わるもの
- established current/future Dayで、calendar changeにより新たにeligibleとなり、existing R2B materialization rules内で安全にmaterialize可能なもの

### Protected

次はretroactiveに書き換えない。

- running
- completed
- interrupted
- historical snapshot
- past historical state
- explicitly moved occurrence
- explicit skip
- protected occurrence-level override semantics

D-034 / D-086のexisting protectionを維持する。

### Directly affected dates

`営業日 / 休日 / 祝日`はcandidate date単位のclassificationを使う。

- User override editは`営業日 / 休日`へ影響する
- `祝日`はofficial factのみを見るため、user override editだけではeligibilityを変えない

### 月末営業日のmonth scope

1 dateのoverride changeでも、同じcalendar monthの`月末営業日`が別日へ移動し得る。

そのため月末営業日は対象month全体をre-evaluateし、materialized planned stateがあればexisting suppression / reconciliation protectionの範囲で整合させる。

Unestablished future Dayをcalendar settings changeだけのために大量生成しない。

## Snapshot update behavior after Routine integration

D-088 snapshotが将来更新され、official factが追加/訂正された場合、D-089 recurrence evaluationは新snapshotをauthorityとする。

ただしrepository snapshot更新/deployだけを理由にhistorical stateをrewriteしない。

既存coverage内fact correctionがalready-materialized planned Routine stateへ影響する場合は、snapshot diff review時にMaterial impactを評価し、必要なpersistent reconciliationを通常maintenanceとして黙って実行しない。

新しいfuture coverage追加は、unmaterialized future occurrenceについて次の通常materialization時から新authorityを利用する。

## Routine Board UX

Recurrence editorへ以下を追加する。

- 営業日
- 休日
- 祝日
- 月末営業日

これら4種に曜日/interval/day-of-month等の追加inputは不要。

Compact labelも同じ日本語表示を基本とする。

Unknown coverageの説明をRoutine Boardの常設chromeとして追加することはD-089の必須要件にしない。必要なvalidation/help copyはreversible UI detailとしてdelegatedする。

Existing recurrence editorのSave / Cancel / Escape no-write / invalid draft behaviorを維持する。

## Persistence / migration boundary

Current `routine_schedules.schedule_kind`はDB CHECKでD-086の10 kindsに固定されているため、D-089の4 recurrence kindをpersistするにはAPP schema migrationが必要である。

D-089 Product semanticsのapprovalだけでは、このmigration execution approvalを代替しない。

Implementation開始前にProduct Ownerから、current next APP migration slotを使うschema migrationをD-089 scopeへ含める明示承認を得る。

2026-09-11 current main `94d5e567109ef74a314d00c06754ee36bc462056`ではAPP migration chainは`0027_workday_holiday_calendar.sql`まで存在するため、expected next slotは`0028`である。ただし実装開始時のGitHub current stateをauthorityとする。

Migration approval後のphysical requirements:

- existing schedule rowsを意味変更せずpreserve
- D-086/D-087 10 existing kindsを保持
- D-089 4 kindsをtyped schedule relationへ追加
- irrelevant interval/day/weekday fieldsはNULL
- Routine / Task / Occurrence / Entry / Execution identityをrewriteしない
- AUTH migrationなし

Exact persisted kind strings / SQL table rebuild detailsはimplementation detail。

## Historical safety

D-089 implementation/deployによってpast historyを一括再生成しない。

- no past backfill
- no completed/running rewrite
- no moved occurrence merge
- no hard delete of Routine history
- no future unestablished Day bulk creation

Calendar changeによるreconciliationもD-034/D-086のplanned/editable protection boundary内に限定する。

## Verification contract

Minimum automated coverage:

### Pure eligibility

- 営業日: normal weekday / weekend / official holiday / designated holiday / workday override / unknown
- 休日: weekend / official holiday / designated holiday / workday override / unknown
- 祝日: named official holiday / CSV `休日` / workday override still eligible / designated holiday-only is not official / outside coverage
- 月末営業日: weekday month-end / weekend month-end / official holiday near month-end / designated holiday / workday override / leap year / year boundary / unknown-blocked month
- start/end inclusive period

### Existing recurrence regression

All D-086 / D-087 kinds unchanged.

### Materialization / reconciliation

- eligible current established Day materializes exactly once
- ineligible calendar day does not materialize
- user override can suppress planned calendar Routine
- user override can restore/materialize newly eligible planned Routine within existing safe boundary
- month-end workday can move within same month after override
- official `祝日` occurrence unaffected by workday override
- moved / skipped / overridden protected state preserved
- running/completed/history preserved
- race / CAS / retry regression remains PASS

### UI

- four new labels save/reload
- explicit Save / Cancel
- Escape no-write
- current start/end period editor unchanged
- same-tab persistence
- fresh authenticated tab when environment permits

### Migration

After migration approval:

- fresh chain
- upgrade from current prior migration
- all existing schedule rows preserved
- all existing operation rows preserved if command CHECK changes are required
- invalid typed combinations rejected
- quick_check / FK

## Nonprod verification

After migration approval and local PASS, standing development approval applies through persistent nonprod:

- fresh APP/AUTH backup + isolated recovery validation
- APP migration apply
- no AUTH migration
- exact-main deploy
- authenticated browser verification
- read-only APP/AUTH integrity
- canonical docs closeout

Before D-089 browser verification, the disposable D-088 nonprod override currently documented at `2026-09-14` should be reset through the authenticated Settings UI if a valid session is available, so D-089 evidence begins from a known calendar fixture state. Do not directly mutate D1 merely to clean the fixture.

## Non-goals

D-089 does not add:

- country/locale selector
- arbitrary holiday provider
- runtime external holiday API
- company-calendar bulk import
- annual Calendar view
- historical Routine regeneration
- count-based recurrence ending
- production migration/deploy
- automatic correction of old official snapshot facts without impact review

## Operation boundary

After explicit APP migration approval, normal D-089 development standing approval may proceed through persistent nonprod.

STOP for:

- unapproved schema/data migration beyond the D-089 typed schedule extension
- new Product semantics
- destructive/irreversible operation
- historical rewrite outside Approved boundary
- external dependency / meaningful recurring cost
- Security posture change
- production operation
- restore/recovery execution
- branch / PR / merge / tag / Release
- non-fast-forward/unexpected remote state

## Expected completion classification

If implementation, migration, local/full tests, persistent nonprod migration/deploy/browser/DB verification all PASS:

`APPROVED / IMPLEMENTED / INTEGRATED / TESTED / MAIN_PUSHED / WORKDAY_HOLIDAY_RECURRENCE_VERIFIED / PERSISTENT_NONPROD_MIGRATED / PERSISTENT_NONPROD_DEPLOYED / AUTHENTICATED_BROWSER_VERIFIED / DB_INTEGRITY_VERIFIED / PRODUCTION_NOT_RUN / RELEASED_NO`
