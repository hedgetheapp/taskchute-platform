# D-107 Android Today v0.1

Status: **Approved**

## Decision

Android native clientの最初のDomain surfaceとして、既存のTaskChute HTTP APIを
canonical authorityにするMaterial 3 Today画面を実装する。認証済みshellから
current Dayを取得し、Section単位でEntryを表示し、planned EntryのStartとrunning
EntryのCompleteを既存のretry-safe commandへ送る。mutation成功後は同じlogical Dayを
再取得してserver canonical projectionへ戻す。

画面はcurrent Dayの日付表示、前日・翌日・今日・refresh操作、Section名とtime range、
Task title、Project / Mode / estimate / planned start、lifecycle state、右側の
icon-only actionを持つ。active Executionがあるcurrent Dayでは、bottom navigationの
上にrunning Taskのfloating panelを表示し、右側のComplete actionを提供する。

未establishのfuture / past Dayは既存のD-041 / D-042 semanticsに従うread-only
projectionとして扱い、AndroidからStart / Completeを送らない。Todayのデータ、Entry
identity、placement revision、Execution identity、401 / network error semanticsは
既存Web / Worker contractを再利用し、Android固有のdomain stateを追加しない。

## Scope boundary

このsliceはTaskChuteDayのread、Start、Complete、refresh、date navigationと、その
loading / empty / retry / auth-required / pending状態だけを対象とする。Task creation・
editing、Section / Project / Mode / Routine editing、reorder、Notes、realtime、offline
database / queue / sync、widget、notification、search、archive、productionは対象外で
ある。APP/AUTH schema、migration、Worker API、external dependencyは変更しない。

## Verification boundary

Android JVM state/parser tests、Debug APK、instrumentation APK compileをlocal gateと
する。実機でのsign-in、Today操作、Keystore、画面usable性は端末が利用可能な場合だけ
別途検証し、未実施をPASSへ昇格しない。既存D-106 auth semanticsとWeb/Workerの既存
regression evidenceは維持する。
