# D-088 — Effective workday / holiday calendar foundation

Status: **Approved**

Approved by Product Owner on 2026-09-11.

## Goal

D-035でApproved済みのeffective workday / holiday semanticsを、TaskChute Platformの共有calendar authorityとして実装可能な形へ確定する。

D-088では、次の後続Routine sliceが`営業日 / 休日 / 祝日 / 月末営業日`を同じcalendar authorityから判定できるよう、以下を一つのvertical sliceとして整備する。

- 日本の公式祝日・休日snapshot
- pureなday classification
- user-specific `指定休日 / 営業日扱い` override persistence
- Settingsからのoverride管理
- coverage / unknown semantics
- deterministic update / validation mechanism

D-088自体はRoutine recurrence kindを追加しない。Routineとの接続は後続Decisionで扱う。

## Canonical relationship

D-088はD-035のProduct semanticsを実装へ落とすDecisionであり、D-035を置き換えない。

D-036でApprovedされている`営業日 / 休日 / 祝日 / 月末営業日` recurrence targetも維持するが、D-088ではまだRoutine Boardへ追加しない。

D-087までに確定した既存Routine recurrence semanticsは変更しない。

## Official Japanese calendar source

日本の公式祝日・休日dataのupstream sourceは、**内閣府「国民の祝日について」公式CSV**を使用する。

Canonical upstream:

- page: `https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html`
- CSV: `https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv`

2026-09-11時点で内閣府pageは、CSVが1955年から2027年までを含むこと、2028年分は2027年2月に掲載予定であることを明記している。

春分の日・秋分の日は翌年分が毎年2月に官報公表されるため、未公表年をTaskChute側で推測して公式factとして扱わない。

内閣府contentの利用は内閣府ホームページ利用規約 / 公共データ利用規約に従い、repository内snapshotにはsource attributionを残す。

## Runtime source policy

TaskChute runtimeは、祝日判定のたびに内閣府siteや第三者APIへ通信しない。

開発時に公式CSVを取得し、検証・正規化した**versioned repository snapshot**をbuildへ同梱する。

Benefits / requirements:

- runtime network availabilityに依存しない
- third-party holiday APIをdependencyにしない
- recurring API costを追加しない
- upstream障害でRoutine eligibilityを変化させない
- review可能なGit diffとしてcalendar updateを残す
- source coverage / provenanceを明示できる

build時の自動network fetchも行わない。snapshot更新はexplicit repository maintenance operationとする。

## Snapshot provenance

Normalized snapshotは少なくとも以下のprovenanceを保持する。

- upstream page URL
- upstream CSV URL
- covered calendar range
- source label for each official entry
- snapshot/source version information sufficient for review

raw CSVそのものをruntime authorityとして読む必要はない。generated TypeScript / JSON等のexact tracked representationはimplementation detailとする。

update tool/scriptを追加する場合、新external dependencyを導入せず、explicit developer commandでのみupstream取得・validation・generationを行う。

snapshot更新時は、invalid date、duplicate date、unexpected format、empty dataset、coverage regression等をsilentに受け入れない。

## Official calendar fact

Snapshotに含まれるofficial entryは、user overrideとは独立したcalendar factとして保持する。

内閣府CSVには通常の`国民の祝日`に加えて、祝日法第3条第2項・第3項による`休日`も含まれる。D-088の**base休日判定では、CSVに掲載されたofficial entryをすべて休日として扱う**。

各entryのsource label（例: `元日`, `文化の日`, `休日`）は失わない。

D-088では、将来の`祝日Routine`が`国民の祝日`だけを指すか、CSV上の法定`休日`まで含むかのProduct-visible recurrence semanticsまでは追加確定しない。後続Routine Decisionで、D-035 / D-036との整合を確認して確定する。

## Base classification

logical civil dateについて、user override適用前のbase classificationを以下で判定する。

### Within official snapshot coverage

- Saturday / Sunday → `holiday`
- official CSV entryがある日 → `holiday`
- それ以外のMonday〜Friday → `workday`

祝日が土日に重なってもofficial calendar factは保持する。

### Outside official snapshot coverage

TaskChuteは未公表のofficial holidayを推測しない。

- Saturday / Sunday → `holiday`
- Monday〜Friday → `unknown`

つまり、公式data coverage外の平日を「祝日ではないから営業日」と推測しない。

`unknown`はerrorではなく、公式holiday knowledgeが不足している状態である。

## Effective classification

User-specific override適用後のeffective classificationは以下とする。

1. explicit `営業日扱い` → `workday`
2. explicit `指定休日` → `holiday`
3. overrideなし → base classification

したがって、coverage外のweekdayでもuserが明示overrideすれば`workday`または`holiday`へ確定できる。

User overrideはofficial calendar factを書き換えない。

例:

- 祝日を`営業日扱い` → effective=`workday`だがofficial holiday factは保持
- 通常平日を`指定休日` → effective=`holiday`
- coverage外weekdayでoverrideなし → effective=`unknown`

## User override model

Userは任意のlogical civil dateに対して次のどちらか一つを設定できる。

- `指定休日`
- `営業日扱い`

同一user / dateに両方は保持しない。1 date 1 overrideをcanonicalとする。

Overrideは任意の自由入力`理由`を持てる。

理由は固定categoryに限定しない。

Examples:

- 年末年始休暇
- 有給休暇
- 会社休日
- 休日出勤
- 個人休暇

理由なしも有効とする。

Override削除は、その日をbase classificationへ戻すcurrent-settings operationであり、official source factを削除する意味ではない。

## Persistence

User override persistenceのAPP schema変更はApprovedする。

Requirements:

- owner scoped
- one override per user/date
- logical date validity
- override kindは`holiday | workday`のtyped value
- optional reason
- retry-safe command / operation identity
- stale / concurrent updateでsilent corruptionしない
- AUTH DB変更なし
- existing Task / Entry / Execution / Routine / Day historyを書き換えない

Exact table/column/index/command namesはimplementation detailとする。

Current migration chain上のnext APP migration slotを実装開始時に確認する。D-088 approval時点のexpected next slotは`0027`だが、GitHub current stateを必ず優先する。

## Calendar authority API / application boundary

Workday/holiday判定をUIやRoutineごとに独立実装しない。

Shared pure classifierを一つのapplication/domain authorityとして持つ。

Conceptually:

```ts
classifyEffectiveDay({
  logicalDate,
  officialCalendarSnapshot,
  userOverride,
}) => {
  base: "workday" | "holiday" | "unknown",
  effective: "workday" | "holiday" | "unknown",
  officialEntry: ... | null,
  override: ... | null,
}
```

Exact function signatureはimplementation detail。

`unknown`をboolean falseへ潰して`workday`扱いしない。

## Settings UX

D-088ではSettingsからuser overrideを管理できる最小UIを提供する。

Required capability:

- dateを指定
- `指定休日` / `営業日扱い`を選択
- optional reason入力
- save
- existing overrideの変更
- existing overrideの削除 / baseへ戻す
- relevant dateについてbase/effective classificationを理解できる表示
- official entryがあればsource labelを表示可能
- coverage外weekdayは`不明`であることを隠さない

Exact visual layout、calendar picker implementation、sort/filterはreversible UI detailとしてdelegatedする。

D-088でlarge calendar view、annual planner、drag/drop calendarは追加しない。

## Historical safety

D-088のsnapshot updateやoverride editを理由に、existing TaskChuteDay / Entry / Execution / RoutineOccurrence historyをretroactive rewriteしない。

D-088ではRoutine recurrenceをまだcalendar authorityへ接続しないため、snapshot更新だけでRoutine materialization / suppressionを走らせない。

後続Routine integrationでは、D-034のhistorical protection、D-086/D-087のshared evaluator / suppression / CAS / exactly-once invariantを維持する。

## Snapshot update behavior

Official sourceに翌年dataが追加された場合、repository snapshotを更新して新coverageをdeployできる。

Snapshot updateはProduct schema migrationではない。

ただしupstream data correctionにより既存coverage内の日付factが変更された場合、diffをreviewし、既にmaterialized/persisted user-visible stateへ影響する可能性がある場合は通常maintenanceとして黙って適用せずMaterial impactを評価する。

## Verification contract

Minimum automated coverage:

### Official snapshot

- source snapshot is non-empty
- dates parse as valid Gregorian dates
- dates are unique
- deterministic ordering
- coverage metadata coherent
- representative known holidays
- representative official `休日`
- representative ordinary weekday
- representative weekend

### Base/effective classification

- weekday non-holiday in coverage → workday
- weekend → holiday
- official entry weekday → holiday
- designated holiday override → holiday
- workday override on weekend → workday
- workday override on official holiday → workday while official fact preserved
- designated holiday on normal weekday → holiday
- outside coverage weekday without override → unknown
- outside coverage weekend → holiday
- outside coverage weekday + workday override → workday
- outside coverage weekday + holiday override → holiday

### Persistence / command

- create/update/delete override
- one user/date uniqueness
- owner isolation
- valid logical date
- valid typed override
- optional reason
- operation replay
- operation-id misuse rejection
- stale/concurrent guard
- no unrelated rows changed

### UI

- add override
- edit override
- delete/base reset
- optional reason
- official label display
- unknown display
- reload persistence
- error / retry boundary consistent with existing Settings conventions

### Regression

- existing Section / Project / Mode / Routine Settings unaffected
- D-086/D-087 recurrence tests unchanged
- no Routine materialization behavior changed by D-088

## Nonprod migration / verification

Persistent nonprod APP migration requires current workflow backup/recovery HARD GATE before apply.

After migration/deploy verify:

- APP/AUTH migration state
- environment bindings
- `RUNTIME_ENV=nonprod`
- `BOOTSTRAP_ENABLED=false`
- authenticated Settings override CRUD with disposable dates
- reload / fresh-tab persistence
- base/effective classification
- read-only APP/AUTH quick_check / FK
- owner/constraint integrity
- no active-operation/guard residue

No persistent restore/recovery execution.

## Non-goals

D-088 does not add:

- Routine `営業日 / 休日 / 祝日 / 月末営業日` schedule kinds
- holiday-based Routine materialization
- full Calendar view
- arbitrary country/locale holiday providers
- runtime holiday API calls
- automatic build-time network fetch
- astronomical prediction of unpublished equinox holidays
- automatic company holiday import
- recurring external service cost
- production migration / deploy
- historical Task/Entry/Execution rewrite

## Operation boundary

Within this Approved D-088 work item, normal development standing approval applies through persistent nonprod:

- implementation / tests
- Approved APP migration
- implementation commit / FF main push
- pre-migration persistent nonprod backup + isolated recovery validation
- persistent nonprod APP migration
- persistent nonprod deploy
- authenticated browser / read-only DB verification
- canonical docs maintenance
- docs commit / FF main push

STOP for:

- new Material Product semantics
- destructive/irreversible migration
- inability to preserve existing data
- new long-lived external dependency/service
- meaningful Security/Cost change
- production operation
- restore/recovery execution
- branch / PR / merge / tag / Release
- non-fast-forward/unexpected remote state
- official source format/data anomaly that cannot be safely normalized

## Expected follow-up

After D-088 is verified, a separate Routine integration Decision should connect the calendar authority to the already Approved recurrence targets:

- 営業日
- 休日
- 祝日
- 月末営業日

That follow-up must explicitly decide the Product-visible membership of `祝日` recurrence with respect to CSV entries labeled `休日`, while preserving D-035 effective classification semantics.
