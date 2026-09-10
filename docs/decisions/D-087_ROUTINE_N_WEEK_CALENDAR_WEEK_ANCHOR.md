# D-087 — Calendar-week anchored N-week Routine recurrence

Status: **Approved**

Approved by Product Owner on 2026-09-11.

## Goal

`N週間ごと + 曜日指定`の意味を、ユーザーが自然に理解できるcalendar-week基準へ統一する。

D-087はD-086でApproved / Implementedされた10種類のRoutine recurrenceのうち、`every_n_weeks`の**week phase anchorだけ**を変更する。その他のrecurrence pattern、typed schedule shape、Routine identity、Occurrence identity、schedule edit / suppression / retry / CAS semanticsは変更しない。

## Product semantics

`N週間ごと + 曜日指定`は次のように扱う。

- 1週間はcivil calendar上の**月曜日〜日曜日**とする。
- `start_logical_date`を含む月〜日の週を**第1実行週（week phase 0）**とする。
- candidateが`start_logical_date`より前なら発生させない。
- 第1実行週のうち、開始日以降に来る選択曜日だけをeligibleとする。
- 以後は`N`週間おきの実行週だけをactiveとし、そのactive week内の選択曜日をeligibleとする。
- 間の週は選択曜日であっても発生させない。
- `N >= 2`とする。upper boundは既存input-safety conventionに従う実装詳細とする。

### Example

開始日が`2026-10-01`（木曜日）、scheduleが`2週間ごと / 月・水・金`の場合:

- 開始日を含む週は`2026-09-28(月)〜2026-10-04(日)`で、ここがweek phase 0の実行週。
- `2026-09-28(月)`と`2026-09-30(水)`は開始日前なので発生しない。
- `2026-10-02(金)`は開始日以降かつ選択曜日なので発生する。
- 次の`2026-10-05(月)〜2026-10-11(日)`は休み週。
- その次の`2026-10-12(月)〜2026-10-18(日)`は実行週なので、`10/12(月)・10/14(水)・10/16(金)`が発生する。

つまり、`start_logical_date`は「Routineが有効になる最初の日」であり、選択曜日は「実行週のどの曜日に発生するか」を表す。

## Canonical calculation

Recurrence authorityは引き続きTaskChuteDayのlogical `YYYY-MM-DD`とする。

`startWeekMonday`を`start_logical_date`が属するcalendar weekの月曜日、`candidateWeekMonday`をcandidateが属するcalendar weekの月曜日とする。

概念上:

```text
candidate < start_logical_date => ineligible

week_index = civil_days_between(startWeekMonday, candidateWeekMonday) / 7
active_week = week_index >= 0 && week_index % N == 0
weekday_match = candidate weekday is selected

eligible = active_week && weekday_match
```

開始日より前のcandidateはperiod boundaryで必ず除外する。

このweek anchorはlocale / device設定 / browser timezoneから導出せず、Product ruleとして**Monday-start calendar week**を固定する。

## Supersession / compatibility

D-087は以下だけをSupersedeする。

- D-086 `Every N weeks`の「`start_logical_date`から連続する7日blockをweek indexとする」定義。

D-036 `週ごと`に記載された「開始日を含む月曜始まりのweekをanchor」と整合する。

D-086の以下は変更しない。

- `daily`
- `every_n_days`
- simple `weekly`
- monthly day
- monthly last day
- monthly nth weekday
- monthly last weekday
- every-N-months day
- every-N-months last day
- inclusive start/end period
- one shared recurrence evaluator
- pause / resume / archive boundaries
- schedule suppression / unsuppression
- moved Routine occurrence protection
- Section / Estimate / Mode occurrence overrides
- operation replay / CAS / race protection
- exactly-once materialization

Simple `weekly`は引き続き選択曜日だけで毎週eligibleとなり、N-week phaseを持たない。

## Existing persisted schedules

Persisted `every_n_weeks` shape自体は変更しない。

- `schedule_kind = every_n_weeks`
- `interval_weeks`
- `weekdays_mask`

したがってschema migrationは原則不要であり、既存stored fieldsを別shapeへ変換しない。

ただしD-087は`every_n_weeks`の**意味を変更するApproved compatibility change**である。実装後は新しいMonday-start week semanticsをrecurrence authorityとする。

Implementation開始時にcurrent persistent nonprodで既存`every_n_weeks` Routineと、future/current unstarted materialized Occurrenceの有無をread-only確認する。

- productionにはD-086自体が未deployのため、D-087でproduction data migrationを行わない。
- persistent nonprodに旧D-086意味でmaterializedされたaffected planned Occurrenceが存在し、新semanticsへ整合するためpersistent data migration / one-off mutationが必要な場合は、Task Contract開始時点で未承認のmigration / data mutationとしてSTOPし、Product Ownerへ戻す。
- running / completed / interrupted / historical Occurrenceはretroactiveにrewriteしない。
- explicitly moved OccurrenceはD-034 / D-086の保護semanticsを維持する。

## Implementation boundary

Current shared pure recurrence evaluatorの`every_n_weeks` branchだけをcanonical Monday-start week phaseへ変更する。

同じcalendar algorithmをWorker / SQL / Webへ複製しない。

Routine Board UIの表示文言`N週間ごと + 曜日`とpersisted DTO shapeは原則変更不要。

Schedule edit / current-Day materialization / suppression reconciliationは、既存D-086 integrationを通じて変更後の同じshared evaluatorを利用する。

## Verification contract

最低限以下をautomated testで固定する。

### Calendar week phase

- start Monday
- start Tuesday〜Sunday
- start midweek + selected weekday before start => no occurrence before start
- start midweek + selected weekday after start => occurrence in first active week
- 2-week active / skipped / active sequence
- 3-week sequence
- month boundary
- year boundary
- leap-year boundary where relevant
- multiple selected weekdays
- inclusive start/end period

### Required example

`start=2026-10-01 (Thu), N=2, weekdays=Mon/Wed/Fri`:

- `2026-09-28` false
- `2026-09-30` false
- `2026-10-02` true
- `2026-10-05` false
- `2026-10-07` false
- `2026-10-09` false
- `2026-10-12` true
- `2026-10-14` true
- `2026-10-16` true

### Regression

- all nine unaffected recurrence families remain unchanged
- existing D-086 daily / N-day / weekly compatibility oracle remains PASS
- D-086 Race 1 / Race 2 / CAS completeness remain PASS
- schedule update suppression / restore remains correct under new N-week evaluator
- current-Day exactly-once materialization remains correct
- moved occurrence remains protected
- historical facts remain unchanged

## Non-goals

D-087 does not add or change:

- business-day / holiday recurrence
- holiday provider / calendar storage
- locale-configurable week start
- Sunday-start week option
- ISO week-number display
- N-month semantics
- monthly patterns
- yearly recurrence
- future Routine preview
- production deployment

## Operation boundary

Within Approved D-087, standing approval applies to implementation, automated tests, implementation commit, fast-forward `main` push, persistent nonprod deploy, browser/API/read-only DB verification, canonical docs maintenance, docs commit, and fast-forward push, provided no additional migration / persistent data reconciliation operation is required.

STOP and return to Product Owner if implementation requires persisted schema/data migration, destructive/irreversible operation, production action, restore/recovery execution, branch/PR/merge/tag/Release, new dependency, Security/Cost change, or a new Material Decision.
