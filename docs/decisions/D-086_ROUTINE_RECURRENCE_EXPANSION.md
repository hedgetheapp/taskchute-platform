# D-086 — Routine recurrence expansion

Status: **Approved**

Approved by Product Owner on 2026-09-10.

## Goal

Routineの繰り返し表現を、既存の`毎日` / `N日ごと` / `曜日指定`を壊さず、週・月単位の実用的なパターンまで一つのvertical sliceで拡張する。

D-086は単なるRoutine Boardの選択肢追加ではなく、current Day materialization、Routine schedule editによるsuppression / unsuppression、pause / resume、existing materialized planned occurrence、historical protection、retry / CASが同じrecurrence semanticsを利用することを要求する。

## Existing compatibility baseline

D-086以前のtyped schedule authorityは`routine_schedules`であり、既存shapeは以下である。

- `daily` — 毎日
- `every_n_days` — N日ごと
- `weekly` — 曜日指定

`routine_definitions.recurrence_type = 'daily'`はR1/R2A由来のlegacy compatibility markerであり、typed schedule authorityではない。D-086でもこれを新schedule authorityへ昇格させず、既存値を互換目的で保持する。

既存`daily` / `every_n_days` / `weekly` rowとその意味はmigration後も変更しない。特に既存`weekly`は曜日集合だけで毎週eligibleとなる現在の意味を維持し、start-date anchored interval semanticsへreinterpretしない。

## Approved recurrence patterns

D-086では以下を一括対応する。

1. `毎日`
2. `N日ごと`
3. `毎週` + 曜日指定
4. `N週間ごと` + 曜日指定
5. `毎月○日`
6. `毎月末日`
7. `毎月 第N ○曜日`（第1〜第5）
8. `毎月 最終○曜日`
9. `Nか月ごと ○日`
10. `Nか月ごと 月末`

`N週間ごと`と`Nか月ごと`のNは2以上とする。exact upper boundはexisting input-safety conventionに沿う実装詳細とするが、通常利用を不必要に狭く制限しない。

## Canonical calendar semantics

Recurrence eligibilityはTaskChuteDayの**logical date**に対するcalendar ruleとして判定する。browser timezone、UTC instant、24時間duration、Execution instantをrecurrence authorityにしない。

Routineのinclusive period boundaryを維持する。

- candidate logical date < `start_logical_date` → ineligible
- `end_logical_date != NULL`かつcandidate logical date > end → ineligible
- otherwise schedule ruleを評価する

### Every N days

既存semanticsを維持する。

`start_logical_date`をday 0として、candidateまでのcivil-day差が`N`の倍数ならeligible。

### Weekly

既存`weekly`は選択した曜日ならeligibleであり、start dateはperiod下限としてだけ働く。interval phaseへは使わない。

### Every N weeks

`start_logical_date`をanchor day 0とし、そこから連続する7日blockをweek index 0, 1, 2...として扱う。

- `week_index = floor(days_since_start / 7)`
- `week_index % N == 0`のblockだけactive
- active block内で指定曜日に一致するcandidateをeligibleとする

この定義はlocale依存の「週の開始曜日」をauthorityにせず、start date anchorを明確に保つ。start dateより前の曜日はperiod boundaryにより発生しない。

### Monthly day-of-month

`毎月○日`は1〜31日を指定する。

その日付が存在する月だけeligibleとし、存在しない月は**skip**する。末日への丸めを行わない。

例:

- 毎月31日 → 1/31, 3/31, 5/31 ...
- 2月、4月等に31日を自動生成しない

### Monthly last day

`毎月末日`は各calendar monthの実際の最終日をeligibleとする。

- 通常年2月 → 2/28
- 閏年2月 → 2/29
- 4月 → 4/30
- 1月 → 1/31

`毎月31日`とは別semanticsである。

### Monthly Nth weekday

`毎月 第N ○曜日`はN=1..5とする。

candidateがその月の指定曜日のN回目に一致するときだけeligible。第5曜日が存在しない月は**skip**し、翌月や月末へ繰り上げ / 繰り下げしない。

### Monthly last weekday

`毎月 最終○曜日`は、その月に存在する指定曜日のうち最後の日だけをeligibleとする。

### Every N months — day-of-month / last day

`Nか月ごと`は`start_logical_date`が属するcalendar monthをmonth phase 0とする。

- `month_index = (candidate.year - start.year) * 12 + (candidate.month - start.month)`
- `month_index % N == 0`のmonthだけactive
- day-of-monthまたはlast-day ruleをそのactive monthへ適用する
- candidateがstart dateより前ならperiod boundaryによりineligible

`Nか月ごと ○日`で指定日が存在しないactive monthはskipする。`Nか月ごと 月末`はactive monthのactual last dayを使う。

D-086では`Nか月ごと 第N曜日 / 最終曜日`までは追加しない。将来拡張可能なschema設計余地は残してよいが、current Product capabilityとして露出しない。

## Leap year / year boundary

calendar calculationはGregorian calendarのvalid civil date semanticsに従う。

最低限以下を正しく扱う。

- leap year 2/29
- non-leap year 2/28
- 12月→1月のyear boundary
- month length 28 / 29 / 30 / 31
- start dateが月末付近の場合

invalid dateをJavaScript Dateのsilent rollover等で別日に変換してeligible扱いしない。

## One recurrence authority

D-086ではschedule eligibilityの意味を複数箇所へ独立実装しない。

現行codeには、current-Day Routine materialization SQL内の複数predicateと、Routine Board update側TypeScript helperにschedule判定が分散している。D-086実装では、Product semanticsを表す**一つのpure Domain recurrence evaluator**をcanonical application ruleとし、materialization / missing-count / schedule edit / suppression reconciliation等が同じruleから結果を得る構造へ寄せる。

D1 mutationのatomic guardで同じTypeScript関数を直接呼べない場合、candidateをDomain evaluatorで判定した後、transaction guardはschedule row / period / revision等のread snapshotが変化していないことをCASで保証し、別の独立calendar algorithmをSQLへ再実装しないことを優先する。

performance上のprefilterは許容するが、prefilterをrecurrence correctness authorityにしない。

## Schedule edit / materialized occurrence behavior

Routine schedule / period変更時は既存R2B behaviorを維持する。

- past / running / completed / interrupted等のhistorical factをrewriteしない
- existing historical RoutineOccurrence / Entry identityを削除・再生成しない
- editableなmaterialized planned occurrenceだけをnew schedule eligibilityへreconcileする
- newly ineligible planned occurrenceはexisting suppression semanticsに従う
- newly eligibleで既存suppressionがschedule/period由来ならexisting unsuppression semanticsに従う
- explicit skip等、別authorityのsuppressionをschedule editが黙って解除しない
- moved Routine occurrenceのexisting protection semanticsを維持し、schedule editだけを理由に別Dayへ戻したり削除したりしない
- occurrence Section / estimate / Mode等のexplicit overrideを変更しない
- Routine Definition defaultsをschedule edit以外の理由で変更しない
- schedule editだけでunestablished future TaskChuteDay / RoutineOccurrence / Entryを作らない

current-Day lazy materializationは、そのcurrent logical dateがnew recurrence evaluatorでeligibleなRoutineだけをexactly-once materializeする。

D-041 future unestablished Dayのnon-materializing behaviorは維持し、D-086だけでfuture Routine previewを追加しない。

## Pause / resume / archive / period

recurrence eligibilityと以下の既存boundaryを混同しない。

- start/end period
- Routine pause interval
- Routine archive / ended state
- occurrence suppression

最終materialization eligibilityはexisting boundaryすべてを満たす必要がある。D-086はpause/resume/archive semantics自体を変更しない。

## Routine creation / conversion

新規Routine Board createおよびordinary EntryからのRoutine化は、既存どおり初期scheduleを`毎日`とする。D-086追加patternを暗黙defaultにしない。

作成後にRoutine Boardの繰り返しeditorから新patternへ変更できる。

## Routine Board UX

Routine Boardの`繰り返し`editorで全Approved patternを選択・編集できる。

表示は内部codeではなく人間が読める日本語にする。例:

- `毎日`
- `3日ごと`
- `月・水・金`
- `2週間ごと 月・水・金`
- `毎月15日`
- `毎月末日`
- `毎月 第2月曜日`
- `毎月 最終金曜日`
- `3か月ごと 10日`
- `2か月ごと 月末`

UI editorはinvalid / incomplete draftをServerへ送らない。cancel / Escapeは既存Routine Board interaction boundaryを維持しno-writeとする。

## Persistence / migration

APP persisted schema変更はApproved。D-086はcurrent chain上のnext APP migration slot `0026`を使用する。ただし実装開始時にcurrent migration chainを再確認し、slotが変わっていればcanonical current stateを優先する。

Migrationは`routine_schedules`のtyped schedule shapeを後方互換に拡張する。

Required compatibility:

- pre-0026 `daily` rowsを同じ`daily`意味で保持
- pre-0026 `every_n_days` rowsとintervalをそのまま保持
- pre-0026 `weekly` rowsとweekday maskをそのまま保持
- RoutineDefinition / RoutineOccurrence / Entry / Execution / override / suppression / operation history identityとrow semanticsをrewriteしない
- `routine_definitions.recurrence_type`をnew schedule kindへ書き換えない
- migration failure時にpartial schema / partial row conversionを残さない
- `PRAGMA quick_check` / FK integrityを維持

exact columns / CHECK layoutはimplementation detailだが、new typed scheduleがinvalid combinationを保存できないconstraintを持つこと。

AUTH migrationは不要。new external dependencyは追加しない。

## Reliability / concurrency

既存`UpdateRoutine`のoperation identity / fingerprint / replay / misuse / `settings_revision` / transaction guard / ambiguous outcome boundaryを維持する。

Schedule updateとcurrent-Day ensure/materializationが競合しても、old scheduleとnew scheduleを混在させたpartial outcomeをcommitしない。

同一Routine / logical dateについてduplicate RoutineOccurrence / duplicate Entryを生成しない。existing unique identity / exactly-once materialization invariantを維持する。

## Verification contract

最低限以下をautomated regressionで確認する。

### Existing compatibility

- daily unchanged
- every_n_days unchanged
- weekly unchanged
- migration preserves existing schedule rows exactly
- current-Day existing Routine behavior regression

### New calendar patterns

- N weeks + weekday, including start-date midweek
- every month day 1 / 28 / 29 / 30 / 31
- monthly 31 skip on short month
- month end on 28 / 29 / 30 / 31-day months
- leap year 2/29
- nth weekday N=1..5
- missing fifth weekday skip
- last weekday
- N months day-of-month
- N months last-day
- December / January year boundary
- period start/end inclusive boundaries

### Lifecycle / reconciliation

- schedule edit suppresses only eligible planned materialized targets
- schedule edit can restore appropriate schedule/period-suppressed planned occurrence when newly eligible
- explicit skip / protected suppression not accidentally cleared
- running/completed/history unchanged
- moved Routine occurrence protection unchanged
- Section / estimate / Mode occurrence override unchanged
- pause/resume unaffected
- no future Day materialization caused by editing a schedule

### Reliability

- exact replay
- operation-id misuse rejection
- stale settings revision rejection
- schedule edit vs materialization race / snapshot guard
- duplicate occurrence prevention
- migration fresh chain and upgrade chain

Persistent nonprod migration requires a fresh pre-migration APP/AUTH backup/export and isolated recovery/readability validation before applying `0026`. If that gate cannot be proven PASS, do not apply persistent nonprod migration.

## Non-goals

D-086 does not add:

- yearly / annual recurrence
- specific arbitrary date list
- business-day / holiday calendar recurrence
- `Nか月ごと 第N曜日 / 最終曜日`
- cron / RRULE input
- natural-language recurrence parsing
- future Routine preview on unestablished Day
- retroactive historical materialization/backfill
- recurrence exception-date UI beyond existing skip/suppression behavior
- production migration / deployment
- new external recurrence library / long-lived dependency

## Operation boundary

Within this Approved D-086 work item, normal development standing approval applies through persistent nonprod, including implementation, tests, implementation commit, fast-forward main push, pre-migration backup/recovery validation, Approved APP migration, persistent nonprod deploy, browser/API/DB verification, canonical docs maintenance, docs commit and fast-forward main push.

STOP and return to Product Owner if implementation requires a new Material Decision, destructive/irreversible migration, compatibility break, new long-lived dependency, Security/Cost change, production action, restore/recovery execution, branch/PR/merge/tag/Release, or non-fast-forward/unexpected remote state.
