# D-126 — Android Future-Day Planning Parity v0.1

Status: **Approved**

## Background

D-109〜D-112のAndroid Todayはcurrent established Dayをplanning mutationの主対象とし、
future Dayをread-onlyとしていた。一方、D-119はその後、ユーザーがfuture logical dateを
明示的に開いた時点でそのDayをestablishし、eligible Routine workをmaterialize / reconcileする
Product semanticsへ更新した。

Product Ownerは、Androidでもfuture DayをTodayと同じplanning surfaceとして使い、
予定を事前に組めることを決定した。

## Decision

### 1. Future Day uses Today-equivalent planning surface

server-resolved current logical dateより後のlogical dateをAndroid Todayで明示的に開いた場合、
D-119に従ってそのselected future Dayをestablish / reconcileし、そのestablished Dayを
**Todayと同じplanning surface**として表示する。

Future Dayでは、同じrow / lifecycle / relationがcurrent Dayでplanning-eligibleであるなら、
current Dayと同等のplanning capabilityを提供する。少なくともordinary planned Taskについて次を含む。

- Quick Add
- Task edit
- Project / Mode / Section / planned start / estimateのcurrent supported planning field
- same-Section reorder / cross-Section moveを含むsingle-Entry placement
- duplicate
- previous / next / date move
- delete
- Selection Mode
- approved bulk day-move / delete
- Task Note

swipe / Task Actions / drag / selectionのvisual interactionはD-123 / D-124等のcurrent-Day patternを
future planning-eligible rowにも適用する。

### 2. Parity does not broaden row-type eligibility beyond Today

`Todayと同じ`はplanning capability parityを意味し、current Dayでmutation対象外のrow typeやfieldを
futureだけ特別に書き換え可能にすることを意味しない。

running / completed / Routine-derived / pending / otherwise protected rowは、current Dayで適用される
同じcanonical eligibilityをfutureでも維持する。future Routine-derived rowにcurrent Dayより広い
scopeを自動付与しない。

### 3. Execution remains current-Day only

Future DayではExecutionを開始・完了・interruptしない。

- Start / Complete / Interrupt affordanceを表示しない。
- RunningTaskPanelを表示しない。
- future planning mutationからExecution factを生成しない。

Execution capabilityはserver-resolved current logical Dayだけに限定する。

### 4. D-119 establishment remains authoritative

Future Dayは**最初のplanning writeまで未確立のままにしない**。
D-119どおり、明示的にDay surfaceとして開いた時点でselected future Dayをestablishし、
eligible Routine workをmaterialize / reconcileする。

date pickerがcalendar choiceを描画するだけではmaterializeせず、selected Dayを実際に開くことがtriggerである。

### 5. Past remains read-only

Past Dayは既存D-042 historical boundaryを維持する。historical Task / lifecycle / Execution factsと
valid Task Noteは参照できるが、planning / execution mutationは提供しない。

## Supersession / compatibility

Android scopeについて、本Decisionは次のfuture read-only restrictionを必要な範囲でsupersedeする。

- D-109: future Entryをplanning read-onlyとしたAndroid planning boundary
- D-110: future ordinary planned rowをdrag対象外としたAndroid direct-manipulation boundary
- D-112: non-current Dayをselection / planning day-operation対象外としたAndroid boundary
- D-121: `future-read-only` representation
- D-123 / D-124: future planning-eligible rowをNote-onlyとして扱う部分

D-119のfuture Day establishment / Routine materialization、D-042のpast boundary、
既存owner / lifecycle / Routine / placement / revision / operation identity / retry / ambiguity /
canonical reconciliation semanticsは維持する。

## Implementation direction

既にestablished future Dayを扱えるcanonical command/pathがある場合はそれを再利用する。
current-Day-only endpoint / guardがAndroid future parityを阻害する場合、本Decisionは
**established future ordinary planned Dayへ既存planning commandのeligibilityを広げること**を
Product behaviorとして承認する。ただし既存のowner、Day identity / logical date、planned lifecycle、
relation、placement revision、CAS、operation identity、retry / ambiguity guardは維持する。

新しいpersisted schema、migration、別のoffline authority、new command family、security posture変更、
長期dependencyは本Decisionでは承認しない。これらが必要と判明した場合はSTOPしてProduct Ownerへ戻す。

## Visual target

Figma file `UbTJH6ykYNBQJS4Wvwz9jb`, page `Today — Flow & States` のcurrent
`Future / Planning`、`Past / Read-only`、Behavior referenceをvisual targetとする。

## Verification contract

Decision-record時点では実装しない。実装時はAndroid Large Batchとして、影響したshared Worker/APIも含めて
少なくとも次を確認する。

- explicitly opened future DayがD-119どおりestablishedであること。
- Future Quick Add / edit / placement / duplicate / day move / delete / selection / bulk operationが
  current-Day equivalentと同じcanonical outcomeへ収束すること。
- Future DayでStart / Complete / Interrupt / RunningTaskPanelが利用できないこと。
- Routine-derived等のcurrent-Day protected eligibilityがfutureでも勝手に広がらないこと。
- Past Dayがread-onlyのままであること。
- exact retry / ambiguous outcome / realtime invalidation / canonical reloadがfuture planningでも安全であること。
- shared command eligibilityを変更した場合、Web / Worker regressionを再実施すること。

Android automated / AVD / Galaxy S23 / persistent nonprod feature mutation / production / Releaseは
implementationまで `NOT_RUN` とする。
