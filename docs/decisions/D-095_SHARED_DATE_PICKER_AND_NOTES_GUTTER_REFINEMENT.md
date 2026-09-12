# D-095 — Shared date picker and Notes gutter refinement

Status: **Approved**

Approved by Product Owner on 2026-09-12.

## Goal

D-095は、D-094実装後の実ブラウザ確認で見つかった日付入力UIとNotes行番号表示の不整合を補正する。

D-094および既存Domain / API / persistence semanticsは変更しない。対象はWeb presentation / input ergonomicsのみとする。

Approved scope:

- Routine `開始日` / `終了日`の日付入力をToday pageと同系統のcalendar UIへ統一
- Settings > 営業日 / 休日の日付入力も同じshared calendar UIへ統一
- 日付text field自体のclick / focusからcalendarを開けるようにする
- 同じtext fieldで`YYYYMMDD`の8桁直接入力を許可し、既存`YYYY-MM-DD`も受理する
- 日付text field横の独立したcalendar trigger button/iconは表示しない。text field自体をcalendar triggerとする
- Notes行番号ON/OFFでeditor geometryを変化させない
- Notes行番号railの背景差による見た目のズレをなくす
- 行番号OFFでもtextareaの幅・高さ・scroll / resize behaviorを正常に保つ

No APP/AUTH migration, API change, Domain semantic change, new dependency is expected. If any is required, STOP and return to Product Owner.

---

## 1. Shared calendar UI

D-095の日付pickerは、current Today pageのcalendar visual / interaction conventionを正とする。

最低限そろえる要素:

- month heading
- 前年 / 前月 / 次月 / 翌年 navigation
- Monday-first weekday header
- month grid
- selected date state
- today state
- adjacent-month dates
- keyboard reachable controls
- outside click close
- Escape close

Routine / Effective Day専用のnative `<input type="date">` popoverをProduct-visible calendar authorityとして使わない。

ImplementationではToday calendarを安全にshared component/helperへ抽出してよい。Today behaviorを退行させないこと。

Calendar selectionは既存logical dateのdraft / canonical valueを更新するだけで、別のdate authorityを追加しない。

---

## 2. Date text-field interaction

Routine `開始日` / `終了日`およびSettings > 営業日 / 休日の日付fieldは、**text fieldそのものをclick / focusするとcalendarが開く**。

ユーザーは同じfieldへ直接入力できる。

Accepted input:

- `20260912`
- `2026-09-12`

Commit後の通常表示は既存canonical logical-date representation `YYYY-MM-DD`を使用してよい。

Behavior:

- field click / focus -> Today-style calendar opens
- typing remains possible while calendar is open
- partial typingをclickだけでServerへcommitしない
- valid 8-digit / dashed date is normalized on the existing commit boundary
- invalid Gregorian date causes no mutation
- calendar date click commits the selected valid logical date through the same existing callback
- blank end date remains valid where already allowed
- calendar and text input remain one draft/value; they must not diverge
- moving from text field into its own calendar must not trigger an unwanted invalid/partial commit
- outside click closes without unintended mutation
- Escape closes calendar and leaves the current text draft according to existing cancel/edit convention
- text field itself carries the calendar affordance / expanded state needed for accessibility (`aria-haspopup="dialog"`, `aria-expanded`, or equivalent)

**日付text field横の独立したcalendar icon / buttonは表示しない。** calendarを開くためだけの別buttonは冗長であり、text field click / focusを唯一の通常triggerとする。

---

## 3. Notes line-number geometry

Line-number ON/OFF is presentation-only. It must not resize or horizontally shift the Markdown editing surface.

Requirements:

- reserve a stable line-number rail width in both ON and OFF states
- ON: show numbers in the rail
- OFF: hide the number glyphs while preserving the same editor geometry
- the rail must not introduce a visually separate gray block that appears only when ON
- use the same white/off-white editor surface across the full editor; subtle separator/text color is allowed
- textarea left edge, width, total editor width, height, border radius and scroll area remain stable across toggle
- OFF state must not cause textarea to occupy an `auto` grid column or collapse to an incorrect size
- gutter/rail remains excluded from Markdown content, selection, copy/paste and autosave payload
- ON scroll synchronization remains correct
- wrapped visual lines do not add logical line numbers
- browser-local preference from D-094 remains unchanged unless implementation requires only a compatible presentation refactor

The preferred implementation is a stable two-column editor shell whose first column remains a fixed rail in both states, with number content hidden when OFF. Equivalent geometry-stable implementation is acceptable.

---

## 4. Relationship to D-094 corrective

D-094 remains open until its Routine corrective is closed:

- Routine success notice must be top-center floating, not an in-layout `.success` row
- Routine recurrence cell trigger must be dropdown/select-like, not a generic secondary button

D-095 can be implemented in the same corrective work item because all changes are Web-only and share the same UI consistency goal.

D-095 does not supersede D-094; it refines D-094 after browser feedback.

---

## 5. Verification contract

### Shared calendar

- Routine start-date field click opens Today-style calendar
- Routine end-date field click opens Today-style calendar
- Effective Day date field click opens Today-style calendar
- date text fields do not render a separate calendar trigger button/icon
- date text field exposes the calendar popup/expanded state accessibly
- calendar has month/year navigation and Monday-first grid consistent with Today
- selected date / today / adjacent-month state render consistently
- `YYYYMMDD` direct input works
- `YYYY-MM-DD` direct input remains compatible
- invalid date causes no Server mutation
- typing while calendar open remains possible
- moving focus into the calendar does not accidentally commit partial text
- outside click closes
- Escape closes
- calendar selection and text input converge to the same logical date
- Today page calendar regressions remain PASS

### Notes

- line numbers ON and OFF have identical outer editor width/height contract
- textarea occupies the same editing column width in both states
- rail width is stable
- OFF hides glyphs without collapsing/removing editor rail geometry
- no ON-only gray background block causing visual shift
- OFF textarea scroll/resize/input remains normal
- ON scroll sync remains correct
- line-number preference persistence remains PASS
- Markdown payload is unchanged by toggle

### Regression

- D-091/D-092 Notes autosave/lifecycle exactness remains PASS
- D-094 outside-click/destructive styling remains PASS
- Routine 4-digit time/date validation remains PASS
- Effective Day D-088 semantics remain PASS

Authenticated persistent-nonprod browser verification should explicitly toggle line numbers repeatedly and inspect editor geometry, and should compare the new Routine/Effective Day calendar against the Today calendar in the same session.

---

## 6. Non-goals

D-095 does not add:

- a new date domain
- locale-dependent free-form date parsing
- Server-synced editor preference
- Markdown preview/WYSIWYG
- a new calendar provider
- schema/migration
- production operation

---

## 7. Operation boundary

Normal approved development standing authority applies through persistent nonprod.

STOP for:

- API/Worker/schema/migration need
- Domain/date semantics change
- new dependency
- Security/Cost material change
- production
- restore/recovery execution
- non-fast-forward remote state
- branch/PR/merge/tag/Release
