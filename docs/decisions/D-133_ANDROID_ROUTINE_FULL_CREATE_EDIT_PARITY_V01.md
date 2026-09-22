# D-133 — Android Routine full create / edit parity v0.1

Status: **Approved**
Approved by Product Owner: 2026-09-22

## Decision

Android Settings > Routineは、Create / Editの両方で既存canonical Routine fieldsを編集できる同等のフォームを提供する。

表示項目:

- Task名
- Project
- Mode
- Section
- 開始予定
- 見積
- 繰り返し
- 開始日
- 終了日

CreateとEditは同じ情報構造を使う。Android固有の別Domain modelは作らない。

## Create atomicity

新規作成は `CreateRoutine` の1 logical operationで全項目をatomicに保存する。

`CreateRoutine -> UpdateRoutine` の2段階合成では実装しない。ambiguous outcome / retry時にpartial Routineを作る境界を増やさないためである。

既存Web等の後方互換を維持するため、Create contractは既存title-only / current optional-default payloadを引き続き受理する。新fieldを省略した既存clientでは現在のdefault behaviorを維持する。

Android full-createで指定可能にする追加fieldは、既存Routine persistence authorityに対応する以下である。

- `project_id`
- `default_mode_id`
- `schedule`
- `start_logical_date`
- `end_logical_date`

既存D-114 correctiveの以下も維持する。

- `default_section_id`
- `default_planned_start_minute`
- `default_estimate_seconds`

Create後のenabled stateは既存behaviorを維持し、Routine listの有効/停止controlで変更する。

## Planned start input

Android Routine Create / Editの開始予定は少なくとも以下を受理する。

- `900` -> `09:00`
- `0900` -> `09:00`
- `09:00` -> `09:00`

valid inputはcanonical minuteへparseし、再表示は `HH:mm` に正規化する。

Section / planned-startのcanonical invariantは維持する。Sectionと開始予定を設定する場合は整合したpairとして保存し、開始予定は選択Sectionのlogical interval内でなければならない。invalid / ambiguous inputは送信しない。

## Project / Mode / Section

- Projectなし / Modeなし / Sectionなしを既存Domain semanticsに従って扱う。
- Createではactive Project / Modeのみ新規選択可能。
- Editで既にarchived Project / Modeが割り当て済みの場合は既存値を表示・保持できるが、別のarchived valueを新規選択できない。
- Section optionsはcurrent Routine Boardのcanonical Section projectionを使用する。

## Schedule editor

「繰り返し」は親Routine SheetからSecondary Sheetを開いて編集する。

D-086 / D-087 / D-089で承認済みの14 canonical schedule familyをそのまま扱う。

- 毎日
- N日ごと
- 毎週 + 曜日
- N週間ごと + 曜日
- 毎月○日
- 毎月末日
- 毎月 第N ○曜日
- 毎月 最終○曜日
- Nか月ごと ○日
- Nか月ごと 月末
- 営業日
- 休日
- 祝日
- 月末営業日

種類に応じて必要parameterだけ表示する。invalid / incomplete draftは適用不可とする。

Secondary Sheetの「適用」はAndroid memory draftだけを更新し、server writeを行わない。最終writeは親Sheetの「追加」または「保存」で1回だけ実行する。

## Period

開始日 / 終了日はTaskChuteDay logical dateとして編集する。

- 開始日は必須。
- 終了日はoptionalで、未指定は無期限。
- 終了日を指定する場合は `start_logical_date <= end_logical_date`。
- recurrence authorityをdevice instant / UTC durationへ変更しない。

Android UIはDatePickerを基本入力とする。

## Update

Editは既存 `UpdateRoutine` 1 operationで全fieldを更新する。

既存 `settings_revision` / CAS / operation identity / exact replay / ambiguous retry / authentication / owner scopeを変更しない。

## Boundary

D-133は既存Routine semanticsのAndroid UI parityとCreate commandの後方互換なatomic field expansionを承認する。

以下は変更しない。

- Routine recurrence semantics
- materialization / suppression semantics
- historical Entry / Execution facts
- enabled / delete lifecycle
- authentication / security posture
- offline persistence
- notification
- external dependency
- production behavior

APP / AUTH schema migrationは現時点では承認しない。current schema / existing Routine relationsで実装できないことが判明した場合は実装をSTOPし、Product Ownerへ戻す。

Production migration / deploy / data mutationは対象外。ReleasedはNO。

## UI continuation aid

Figma file `UbTJH6ykYNBQJS4Wvwz9jb` の Android Flow & States page にCreate / Edit / Schedule Editor proposalを置く。Figmaはvisual continuation aidであり、Product / Domain / DecisionのSource of TruthはこのDecisionおよび他のcanonical docsである。

## Verification contract

実装時は少なくとも以下を確認する。

- old title-only Create payload backward compatibility
- full Createのall-field atomic persistence
- invalid payloadでpartial Task / Routine / schedule / default relationを残さない
- exact replayでduplicateを作らない
- Android `900` / `0900` / `09:00` -> minute 540 / display `09:00`
- Section / planned-start consistency
- Project / Mode active selectionとarchived existing-value behavior
- 14 schedule familyのdraft validation / serialization
- Schedule Secondary Sheet cancel / applyがserver writeしない
- start/end logical-date validation
- UpdateRoutine one-operation save
- ambiguous retryで同一request identityを保持
- focused Worker / Android automated tests
- exact-SHA CI
- persistent nonprod verification when Worker/API changes are deployed
- Galaxy S23 Product Owner smoke

Production remains NOT_RUN and Released remains NO unless separately approved.

## References

- D-085 — Routine Mode default / occurrence override
- D-086 — Routine recurrence expansion
- D-087 — Calendar-week anchored N-week Routine recurrence
- D-089 — Routine workday / holiday recurrence
- D-114 — Android Settings Management v0.1
- D-114 Android Routine create defaults corrective
- `docs/SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/TEST_MATRIX.md`
