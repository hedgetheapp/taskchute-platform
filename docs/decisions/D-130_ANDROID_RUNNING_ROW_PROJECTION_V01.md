# D-130 — Android Running Row projection v0.1

Status: **Approved**

Date: 2026-09-21

## Context

Android Today Task Rowの左48dpは開始見込み / 終了見込みを表示する。Planned EntryはWeb Start Forecast相当のderived projectionを使うが、Runningへ遷移すると現行Android実装はforecast対象外として両値を`--:--`へ戻していた。

Product Ownerは、Taskが開始された時点ではcanonical actual startが確定しているため、Running rowではそのactual startを開始側へ表示し、終了見込みはactual start + Entry見積で表示する方針を承認した。

## Decision

current logical DayのRunning Entryについて、Task Row左48dpを次のように表示する。

- 開始見込み: canonical active Executionのactual start。
- 終了見込み: `actual start + Entry estimate`。
- estimateがない場合、開始見込みは表示し、終了見込みは未表示とする。
- Runningへ遷移した直後も開始 / 終了見込みを`--:--`へ戻さない。
- Runningの終了見込みは「現在時刻 + remaining estimate」ではなく、actual startを基準にした固定のestimated endとする。
- actual startの訂正後はcanonical reconcile後のactual startを基準に再導出する。

Planned Entryは既存Web Start Forecast parityを維持する。Completed Entryの左projection behaviorはD-130では変更しない。

D-130はpresentation-onlyのderived behaviorであり、Execution fact、estimate persistence、lifecycle、Start / Complete command、SetExecutionTimes、schema / migration / API contractを変更しない。

## Supersession

D-130はAndroid Task Row projectionについて、D-129実装時に記録した「actual Execution timestampを左projectionへ混在させない」というpresentation ruleをRunning rowに限ってsupersedeする。Planned forecastでは引き続きactual timestampを直接projection値として使わない。
