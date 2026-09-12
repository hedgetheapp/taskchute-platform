# D-094 — Web UI consistency polish v0.1

Status: **Approved**

Approved by Product Owner on 2026-09-12.

## Goal

D-094は、Standalone Notes、Routine Board、Settings配下の営業日 / 休日・Mode・Projectに残るWeb UIの不統一を整理し、既存TaskChute Webのinteraction / visual conventionへ揃える。

このDecisionは主にpresentation / input ergonomics / menu behaviorを改善するものであり、既存のDomain semantics、operation identity、CAS、retry、autosave、Routine recurrence semantics、D-088 calendar authorityを変更しない。

D-094のApproved scopeは以下。

- Notes loading / save-state presentation
- Notes editor line numbers / editor visual polish
- Notes / Routine / Mode / Project overflow menu outside-click behavior
- Routine recurrence-cell interaction polish
- Routine viewport/table sizing
- Routine transient success notice presentation
- Routine planned-start 4-digit input
- Routine start/end date 8-digit + calendar input
- Settings > 営業日 / 休日のtable-first presentation、explicit override delete、date input polish
- destructive action visual parity

No APP/AUTH migration is expected from the approved Product scope. If implementation investigation proves a schema/API/Domain change is required, STOP and return to Product Owner before introducing it.

---

## 1. Shared interaction / visual rules

### 1.1 Outside click closes temporary menus

For the following temporary menus/popovers, clicking outside the open surface closes it without mutation:

- Notes row `…` menu
- Routine row `…` menu
- Routine recurrence dropdown/popover
- Settings > Mode row `…` menu
- Settings > Project row `…` menu
- date-picker popovers introduced by D-094

`Escape` close behavior is retained where already supported.

This rule applies to transient menus/popovers, not to destructive confirmation semantics. Existing modal/backdrop behavior remains governed by the current shared modal convention.

Opening another peer menu may close the previously open menu.

### 1.2 Destructive action styling

Delete / hard-delete controls in D-094 scope use the same destructive visual treatment as the current Day Table:

- pale red background
- red text
- red-toned border / hover / focus state

Existing `.destructive-action` or an equivalent shared class should be reused rather than creating product-area-specific delete colors.

This applies at least to:

- Notes delete
- Routine delete
- Settings > 営業日 / 休日 override delete
- Settings > Mode delete
- Settings > Project delete

This is visual parity only. Existing confirmation / lifecycle semantics remain unchanged.

---

## 2. Standalone Notes polish

D-090 through D-093 remain authoritative for Document semantics, autosave, archive / restore / hard delete, ambiguity barriers, exact retry, title allocation and persistence.

### 2.1 Loading presentation

When the Notes page/list/document is loading, do not insert a normal in-layout `読み込み中…` row that shifts the Notes layout.

Use the same top-center floating transient-status convention already used by the Day page.

Default copy:

`ノートを読み込み中…`

The indicator should be non-blocking presentation and disappear when the relevant load settles.

### 2.2 Save-state presentation

The editor exposes one stable save-status line/slot. Save state changes text in that same slot instead of stacking separate success/status lines.

Normal progression:

- local draft differs from canonical and no save is in flight: `未保存`
- unsaved work exists while one or more logical save requests are pending/in flight: `未保存（保存中 X件）`
- local draft equals canonical and no unresolved save exists: `保存済み`

`X` represents the logical outstanding save count already derivable from D-091 autosave state; it must not be a raw network-call counter that double-counts one logical operation.

A clean idle editor must not show a stale `保存しました。` notice as a second line.

Conflict, infrastructure ambiguity, lifecycle errors, and other actionable warnings remain separate error/alert UI and must never be represented as `保存済み`.

Archive / restore / delete success feedback may continue to use transient notification conventions; they must not corrupt the editor save-state line.

### 2.3 Line numbers

The Markdown source editor supports visible line numbers in a left gutter.

Requirements:

- initial default: **ON**
- user can toggle line numbers ON / OFF
- preference is presentation-only and persisted browser-locally in a versioned envelope
- malformed / incompatible stored preference falls back safely to default ON
- no Server/API/DB persistence for v0.1
- line numbers start at `1`
- line-number count follows the current draft text, including an empty document being line 1
- gutter scroll stays vertically synchronized with the textarea/editor
- line numbers are not part of Markdown content, copy/paste payload, autosave payload, or character selection
- long-line wrapping must not invent additional logical line numbers; numbering follows newline-delimited logical lines

Exact toggle placement is reversible UI detail. A compact editor option/menu/control is acceptable if discoverable.

### 2.4 Editor labeling / surface

Remove the visible `Markdown本文` label from the ordinary Notes editor.

Accessibility labeling must remain through `aria-label`, visually-hidden text, or equivalent accessible name.

The Markdown editor must not use a black/dark content background in the normal TaskChute light UI. Use the same white / off-white surface, border, text color, focus treatment, and general visual language as other TaskChute inputs/editors.

Dark-theme Product semantics are not introduced by D-094.

### 2.5 Notes overflow menu

Notes `…` menu closes on outside click and Escape.

Delete action uses the shared destructive style. D-092 explicit hard-delete confirmation remains mandatory.

---

## 3. Routine Board polish

Existing Routine Decisions, recurrence semantics, owner/CAS/retry behavior and current CRUD/lifecycle remain authoritative.

### 3.1 Recurrence column as dropdown interaction

The `繰り返し` cell is presented as a dropdown/select-like control rather than a generic secondary action button.

The currently selected recurrence remains visible in the cell.

Opening the control exposes recurrence choices supported by the current Routine domain, including current daily / N-day / weekly / N-week / monthly / workday / holiday families.

Recurrence kinds requiring additional parameters may expose those fields in the same anchored dropdown/popover after the kind is selected. D-094 does not change allowed recurrence kinds, validation ranges, calendar-week anchoring, holiday membership, or materialization semantics.

No modal is required for this edit. Exact compact layout inside the dropdown is reversible UI detail.

Outside click / Escape closes an uncommitted recurrence dropdown without silently applying unintended changes.

### 3.2 Routine table viewport sizing

The Routine table area should use the remaining viewport below the Routine header/toolbar in the same general layout philosophy as the Day page.

Requirements:

- Routine page can fill the available desktop viewport height
- the board/table receives the remaining vertical space instead of relying mainly on a small fixed/min-height region
- the table/board owns its scrolling as appropriate
- page chrome / toolbar should remain usable while the table contains many rows
- avoid large unused lower-page whitespace and avoid forcing ordinary users to scroll the whole document merely to reach the table bottom

Exact CSS/flex measurements remain implementation detail and should reuse current Day fixed-surface patterns where practical without copying unrelated Day-only behavior.

### 3.3 Routine success notifications

Routine transient success messages such as:

- `Routineを停止しました`
- `Routineを再開しました`
- create/update success feedback of the same transient class

must not consume a persistent row above the Routine table.

Display them in the top-center floating notification/status convention.

Actionable errors remain visible as alerts and must not be hidden merely to preserve layout.

### 3.4 Planned-start input

Routine `開始予定` accepts both:

- four-digit input such as `0900`, `2530`
- existing colon form such as `09:00`, `25:30`

On successful commit, normalize to the existing canonical minute value and ordinary display format.

Validation preserves current extended-time/domain limits. D-094 does not expand the valid logical-minute range.

Invalid text causes no mutation and produces understandable validation feedback.

### 3.5 Start / end date input

Routine `開始日` and `終了日` support both:

- direct 8-digit input: `YYYYMMDD`
- calendar selection

Existing canonical logical-date payload remains `YYYY-MM-DD` or the current typed representation expected by the API.

For compatibility, canonical dashed input may remain accepted.

Behavior:

- 8-digit valid date normalizes on commit
- invalid Gregorian date does not mutate Server state
- start-date / end-date ordering validation remains current behavior
- end date may remain empty where currently allowed
- calendar selection updates the same logical draft/value; it is not a separate authority

Date picker closes on outside click / Escape.

### 3.6 Routine overflow / delete

Routine row `…` menu closes on outside click / Escape.

Routine delete action uses the shared destructive style. Existing confirmation and soft-delete/archive semantics from the current Routine lifecycle Decision remain unchanged.

---

## 4. Settings > 営業日 / 休日 polish

D-088 and D-089 remain authoritative for calendar authority, official Japanese holiday snapshot, `workday / holiday / unknown`, owner override persistence, recurrence integration, CAS/retry and historical safety.

D-094 changes only management UX.

### 4.1 Table-first override management

The page should present existing user overrides primarily as a table rather than an unordered button/list presentation.

Minimum table columns:

- 日付
- 指定 (`指定休日` / `営業日扱い`)
- 理由
- 操作

Exact additional columns are reversible. Base/effective classification and official holiday label should remain understandable for the currently selected/edited date without forcing an API call per table row.

The table lists user overrides, not the entire official holiday snapshot.

### 4.2 Add / edit input

The date editor supports:

- direct `YYYYMMDD` input
- calendar selection
- existing canonical dashed date compatibility where practical

Use the same date-input parsing / validation convention as Routine dates.

Override kind and optional reason remain D-088 semantics.

### 4.3 Explicit delete

Each existing user override has an explicit delete action.

Delete means:

- delete only the user's explicit `指定休日` / `営業日扱い` override for that owner/date
- restore the date to D-088 base classification
- do **not** delete or modify official holiday facts
- do **not** rewrite historical Task / Entry / Execution / RoutineOccurrence state

Use the already-existing delete override command/API; no new destructive calendar semantics are introduced.

Delete control uses the shared destructive style.

Whether override delete needs an extra confirmation is reversible because the operation only returns to base classification and can be recreated; do not introduce a new trash/retention model.

### 4.4 Official snapshot coverage display

Remove the ordinary always-visible copy such as:

`公式スナップショット対象: <start>〜<end>`

from the normal Settings surface.

Snapshot coverage remains canonical internal/runtime information because D-088 requires `unknown` outside official coverage.

If the user selects/enters a date outside snapshot coverage, show contextual guidance only when relevant, for example:

`この日付は公式祝日データの対象外です。営業日／休日を指定できます。`

Do not hide an effective/base `unknown` classification when it is semantically applicable.

Do not remove coverage metadata from the API/domain merely because the always-visible UI text is removed.

---

## 5. Settings > Mode / Project polish

### 5.1 Outside click

Mode and Project row `…` menus close on outside click and Escape.

No command is dispatched merely because the menu closes.

### 5.2 Delete styling

Mode and Project delete controls use the shared destructive style.

Existing D-065 / D-072 hard-delete confirmation and persistence semantics remain unchanged.

---

## 6. Presentation preference boundary

D-094 introduces one new local presentation preference: Notes line-number visibility.

Preferred characteristics:

- versioned localStorage key/envelope consistent with existing Sidebar / Day / Routine column preferences
- default ON
- browser-local only
- no cross-device guarantee
- no Server sync
- failure to read/write localStorage must not make Notes unusable

Exact key name is implementation detail.

No other D-094 behavior requires a new persisted Product preference.

---

## 7. Accessibility / keyboard boundary

D-094 should preserve existing accessible names, keyboard use, focus restoration, and current modal semantics.

Minimum expectations:

- visually removing `Markdown本文` does not remove the editor accessible name
- dropdown/menu controls expose appropriate expanded/state semantics
- outside-click support does not remove Escape support
- date calendar is keyboard reachable
- destructive actions remain distinguishable by text/accessibility, not color alone
- floating loading/status UI uses an appropriate live-region/status role without repeatedly stealing focus

---

## 8. Verification contract

Minimum automated Web coverage should include:

### Notes

- loading appears in top floating transient status, not as layout row
- `未保存` state
- `未保存（保存中 1件）` and multi-count state
- `保存済み` only when canonical/clean and resolved
- ambiguity/conflict never reports saved
- line numbers default ON
- line number toggle OFF/ON
- preference reload restore
- malformed preference fallback ON
- newline line-count updates
- long wrapped visual line does not increase logical line count
- gutter scroll synchronization
- visible `Markdown本文` absent while textarea remains accessibly named
- editor light surface regression
- Notes overflow outside-click / Escape close
- Notes delete destructive style class/presentation

### Routine

- recurrence cell exposes dropdown/select-like interaction
- current recurrence visible
- conditional parameter kinds remain editable
- outside-click cancel/close behavior
- Routine board fills remaining viewport/scroll-owner class contract
- stop/resume success uses floating notice and does not add table-layout row
- `0900` / `09:00` both commit same minute
- extended `2530` remains valid when current domain permits it
- invalid planned-start does not mutate
- start/end `YYYYMMDD` parsing
- invalid date rejection
- empty end-date behavior
- calendar pick updates same date draft
- Routine overflow outside-click / Escape
- delete destructive style

### Effective day calendar Settings

- override list rendered as table
- add/edit by 8-digit date
- calendar date selection
- explicit delete dispatches existing delete override command
- delete returns selected date to base classification on reconcile
- official fact is preserved
- ordinary coverage-range text absent
- outside-coverage contextual guidance appears
- `unknown` remains visible when applicable
- destructive delete style

### Mode / Project

- menu outside click closes
- Escape remains working
- delete actions use shared destructive style
- existing delete confirmation behavior remains

### Regression

- D-091 autosave exactness / D-092 lifecycle exact retry / no-borrow tests remain PASS
- Routine recurrence D-086 through D-089 tests remain PASS
- Project / Mode lifecycle tests remain PASS
- D-088 calendar classifier/persistence tests remain PASS
- Day page transient status and destructive style remain unchanged

Browser verification should include representative real interaction for outside click, line-number scroll sync, date picker, 4/8-digit entry and viewport sizing.

---

## 9. Non-goals

D-094 does not add:

- Markdown preview / WYSIWYG
- Notes search / backlinks / tags / folders
- Server-synced Notes editor preferences
- Task / Project Primary Documents
- new Routine recurrence kinds
- recurrence semantic changes
- new calendar authority/provider
- official snapshot data deletion/editing
- annual calendar planner
- new Mode / Project lifecycle semantics
- dark theme
- new external dependency
- APP/AUTH migration
- production deploy / migration

---

## 10. Operation boundary

Within this Approved work item, normal standing approval applies through persistent nonprod for reversible implementation details that stay within this Decision and existing Approved Decisions.

Expected implementation path:

- Web implementation / refactoring
- automated tests
- local verification
- implementation commit / fast-forward push to `main`
- persistent nonprod deploy
- authenticated browser verification when session is available under current credential boundaries
- read-only DB/API safety verification as impact requires
- canonical docs / TEST_MATRIX maintenance
- docs commit / fast-forward push to `main`

Migration is expected `NOT_REQUIRED`.

STOP and return to Product Owner if implementation requires:

- new APP/AUTH schema/migration
- new Server/API semantics beyond existing commands/projections
- changed Routine recurrence membership or date/time domain semantics
- changed D-088 `unknown` / official fact semantics
- new external dependency
- Security posture change
- meaningful recurring Cost increase
- destructive data cleanup
- production operation
- restore/recovery execution
- non-fast-forward / unexpected remote state
- branch creation / PR creation-update / merge / tag / Release
