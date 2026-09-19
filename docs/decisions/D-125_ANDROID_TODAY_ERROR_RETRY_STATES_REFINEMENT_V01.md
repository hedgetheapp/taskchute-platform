# D-125 — Android Today Error / Retry States Refinement v0.1

Status: **Approved**

## Decision

Android Todayのerror / retry presentationを次の3系統に分ける。

### 1. Today acquisition failure

Initial LoadまたはRefresh / canonical reloadが失敗し、表示中Dayをcanonical current responseとして
信頼できない場合は、既存Today本文を残さず全画面Errorへ遷移する。

- title: `予定を読み込めませんでした`
- supporting text: `通信状態を確認して、再試行してください`
- action: `再試行`
- Today本文、DateNavigator、Quick Add、RunningTaskPanelは表示しない。
- shared bottom navigationは維持してよい。
- `再試行`は標準Loadingへ戻し、白spinner + `読み込み中`を表示してcanonical Today reloadを行う。
- retryが再び失敗した場合は全画面Errorに留まり、成功した場合だけfresh canonical Todayへ復帰する。

Refresh前に表示していた古いTodayを、refresh failure後に操作可能なsurfaceとして残さない。

### 2. Direct manipulation result unresolved

Taskのplanning操作を送信したが、transport failure / ambiguous response等により成否を確認できない場合は、
Today本文を保持する。

- message: `操作結果を確認できませんでした`
- explicit action: `元の操作を再試行`
- retryは別のgeneric refreshではなく、保持した**同一request identity / operation identity**の操作を再送する。
- unresolved operationが解消するまでは、同じdirect-manipulation boundaryと競合する新しい操作を開始しない。
- canonical reconciliationで結果を確定し、成功時だけ通常surfaceへ戻る。

### 3. Deterministic operation failure

Serverが操作失敗を明確に返した場合はToday本文を保持し、軽いerror feedbackを表示する。

```text
操作を完了できませんでした。
もう一度操作してください。
```

このstateではexact-operation retry identityを保持する専用buttonを表示しない。ユーザーは通常surfaceから
必要な操作を改めて行う。

### Auth boundary

401 / auth-requiredは上記retryable errorへ混ぜず、既存の認証handoff stateで扱う。

## Relationship to existing behavior

- D-107のloading / retry / auth-required foundationを維持する。
- D-108のrealtime invalidation safe-boundary semanticsを維持する。
- D-121のdark visual systemとshared bottom navigationを維持する。
- Direct manipulationのoperation identity / ambiguity / canonical reconciliationは既存D-110 / D-112系の
  command contractを維持する。
- 本Decisionはerror-stateのProduct presentationとretry affordanceを明確化するもので、
  Task / Entry / Execution persistence semanticsを変更しない。

## Visual target

Figma file `UbTJH6ykYNBQJS4Wvwz9jb`, page `Today — Flow & States` のcurrent
`Today Error / Retry` statesをvisual referenceとする。Figmaはvisual referenceであり、
Product behaviorのauthorityは本Decision / SPECである。

## Boundary

Worker/API contract、schema、migration、new persistence、realtime protocol、security posture、
third-party dependency、production operation、Releaseは追加しない。

## Verification contract

Decision-record時点ではimplementation batchを実施しない。実装時は少なくとも次を確認する。

- Initial Load failureとRefresh failureが同じfull-screen Errorへ入ること。
- Errorからretryすると標準Loadingへ戻り、success時だけcanonical Todayへ復帰すること。
- Ambiguous direct manipulationがTodayを保持し、同一operation identityのexact retryを行うこと。
- Deterministic operation failureがTodayを保持し、exact retry buttonを表示しないこと。
- 401がgeneric Error / Retryへ混入しないこと。
- D-108 realtime safe-boundary、D-123 / D-124 gesture states、Notes / Settings navigationにregressionがないこと。

Android automated / AVD / Galaxy S23 / production / Releaseはimplementationまで `NOT_RUN` とする。
