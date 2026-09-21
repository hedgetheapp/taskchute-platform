# D-129 — Current-Day ended Section manual placement guard v0.1

Status: **Approved**

Date: 2026-09-21

## Context

TaskChuteDayのcurrent logical Dayでは、現在時刻がすでに通過したSectionへ未実行Taskを新たに手動移動する操作は、実際の時間軸と矛盾しやすい。例えば現在が19:00のとき、12:00台で終了したSectionへTaskをdrag / Section変更することは通常のplanning intentとして扱わない。

既存のoverdue Entryやhistorical factを自動で書き換えることは別問題であり、D-082 Auto-carry等の既存capabilityへ委譲する。

## Decision

server-authoritative current TaskChuteDayでは、manual placementが**別Sectionへの新しいdestination change**を伴う場合、effective current instant時点ですでに終了したconfigured Sectionをtargetにできない。

- ended Section: frozen Day Section contextの終了境界がeffective current instant以下。
- current Section: current instantを含むSection。target可能。
- future Section: current Sectionより後でまだ終了していないSection。target可能。
- `Sectionなし`: target可能。
- existing overdue Entry: そのまま保持する。D-129だけを理由に自動移動しない。
- existing overdue Entryの同一Section内reorderや、Section membershipを変えない操作をD-129だけで禁止しない。
- past / future logical Dayのplanning semanticsはD-129では変更しない。
- Running / Completedは既存execution-first / read-only placement authorityを維持し、manual planned placementのanchor / destinationへ昇格させない。

## Surfaces

同じProduct ruleをmanual Section destinationを選ぶsurfaceへ適用する。

- pointer / touch D&D
- Task EditorのSection変更
- Bulk Section change
- その他、Entryを別configured Sectionへ明示的にmoveするmanual placement surface

UIはended Sectionをdrop targetとして強調せず、selectorではdisabled / unavailableとして扱う。invalid領域へdragしても仮drop slotやreflow previewを表示しない。

## Authority / enforcement

client UIだけの制約にはしない。current-Day manual placement commandはserver側でもfrozen Section contextとeffective current instantを用いて同じdestination eligibilityを検証する。

既存owner scope、placement revision、CAS、operation identity、exact retry、ambiguous reconciliation、D-081 execution-first、D-043 Section / planned-start synchronizationを維持する。

## Non-goals

- overdue Entryの自動carryを常時強制すること
- past / future Day planningの変更
- same-Section reorderの全面禁止
- existing overdue planned startの自動補正
- Section definition / boundaryの変更
- schema / migration / dependency追加
