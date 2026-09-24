# D-137 — Daily Note v0.1 (Android / Web)

Status: **Approved / Implemented**

## Scope

TaskChuteDayごとのDaily Noteを、既にestablishされたDayに対して提供する。Daily NoteはDay単位でowner-scopedに一件だけ存在し、日付はDayの`logical_date`をauthorityとする。Daily Noteのタイトル・archive・delete・standalone作成はv0.1の対象外で、本文Markdownだけを編集する。

## Establishment and creation

- Daily Note一覧はestablished `taskchute_days`だけを表示し、一覧取得やGETはDaily Noteを作成しない。
- Daily Noteの作成は、ユーザーがestablished Dayを開いた後の明示的な`EnsureDailyPrimaryDocument` mutationだけで行う。
- Android / Webは既存のDay establishment semanticsを再利用し、未establishのfuture DayをDaily Noteのためだけに作成しない。
- owner、Day、document identityはserverで検証し、同じDayへのensureは同じcanonical documentへ収束する。

## Editing and persistence

- 本文は既存のshared Markdown editorで編集し、保存値はrendered textではなくexact Markdown sourceとする。
- autosaveは既存Notesのidle debounceを再利用する。保存はbody-onlyのCAS (`expected_revision`) mutationで、exact operation replay、revision conflict、ambiguous outcome、safe flushを維持する。
- Daily Noteのmutationで既存Task / Entry / Execution、Section、Routine、Task Primary Noteを変更しない。

## Navigation and surfaces

- Web Notesの種別dropdownにDaily Noteを追加する。Daily Note surfaceにはestablished Dayの`YYYY-MM-DD`日付一覧を左側に表示し、日付の選択・移動はこの一覧から行う。editor見出しには独立した前日・次日ボタンを表示しない。
- Androidのshared footerは`Task / Notes / Daily / Settings`の4 destinationとし、Dailyは選択したlogical dateの本文を編集する。選択中の`YYYY-MM-DD`がDaily Note identityであり、独立した`デイリーノート`ページタイトルは表示しない。Daily date headerはTodayと同じ前後の44dp丸ボタン、中央の44dp date pill、`calendar_month`、`YYYY-MM-DD (曜日)`表示で構成し、既存の前日・次日・calendar date navigationを維持する。calendarはToday headerと同じ共有Material 3 DatePickerDialogと公式Material Symbols Rounded assetsを利用する。
- NotesからDailyへの遷移・離脱でも既存のsafe flush boundaryを守る。

## Boundaries

Worker/APIの新規Daily document endpointsとAPP migration `0034_daily_primary_documents.sql`を追加するが、Daily Note専用のoffline authority、schema以外の既存Document semantics、production、Releaseは追加しない。Galaxy S23はProduct Owner manual smokeまで未確認、Productionは`NOT_RUN`、Releasedは`NO`とする。
