# Test Matrix

Runtimeはまだ未実装。

この文書はverification requirementとcurrent evidenceの正本とする。

`Contract`は、対象behavior自体のDecision状態を示す。

- `Approved`: canonical specification / Decisionとして確定済み
- `Proposed`: candidateであり、Approved implementation contractではない

`Evidence`は実装・検証状態を示す。Contractが`Approved`でも、実装やverificationが未実施ならPASS扱いしない。

| ID | Area | Requirement | Contract | Evidence |
|---|---|---|---|---|
| CORE-ID-01 | Identity | TaskとEntryを曖昧にcollapseしない | Approved (D-010) | NOT_IMPLEMENTED |
| CORE-ORDER-01 | Ordering | explicit orderをpreserveする | Proposed (D-013) | NOT_IMPLEMENTED |
| CORE-LIFE-01 | Lifecycle | Startは同一operationのretryで二重実行・不整合を起こさない | Approved (D-012) | NOT_IMPLEMENTED |
| CORE-LIFE-02 | Lifecycle | Completeは同一operationのretryで二重実行・不整合を起こさない | Approved (D-012) | NOT_IMPLEMENTED |
| ANDROID-OFFLINE-01 | Android | temporary network unavailableを考慮したoffline-capable behaviorを持つ | Approved (D-011) | NOT_IMPLEMENTED |
| ANDROID-01 | Android | Today boardを表示する | Proposed (D-013) | NOT_IMPLEMENTED |
| ANDROID-02 | Android | running stateを表示する | Proposed (D-013) | NOT_IMPLEMENTED |
| WIDGET-01 | Widget | running / nextを表示する | Proposed (D-013) | NOT_IMPLEMENTED |
| DOC-01 | Documents | Markdown save/read round-tripでcontent semanticsを保持する | Approved (D-006) | NOT_IMPLEMENTED |
| ATTACH-01 | Attachment | Noteでimage attachmentを扱える | Approved (D-007) | NOT_IMPLEMENTED |
| ATTACH-02 | Attachment | Commentでimage attachmentを扱える | Approved (D-007) | NOT_IMPLEMENTED |
| MIG-01 | Migration | dry-runでsource / target dataを破壊しない | Proposed | NOT_IMPLEMENTED |

legacy ObsidianでのPASS結果を新PlatformのPASSへ自動継承しない。

一方、legacy regression scenarioは新Architecture向けTest contractを設計する際のreferenceとして利用する。

変更後の再verification範囲は`DEVELOPMENT_WORKFLOW.md`のimpact analysis原則に従う。
