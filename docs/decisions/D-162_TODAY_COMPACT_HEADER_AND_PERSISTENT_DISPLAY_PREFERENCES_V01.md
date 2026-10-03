# D-162 — Today Compact Header and Persistent Display Preferences v0.1

Status: **Approved**

Date: 2026-10-03

## Decision

This is a presentation-only refinement for Today. Android Today removes its previous-day and next-day arrow controls. The centered date control remains the date-navigation affordance and opens the existing Material 3 DatePicker. It continues to show the full logical date, including year and weekday. Reserve the left header geometry for future use without rendering a non-functional menu button; place the `表示` control at the right.

This header change is Android Today-only. Daily retains its existing previous/next controls and date header behavior.

Android Today adds a `表示` menu containing `完了タスクを表示`. Completed visibility defaults to shown and is stored locally on the device. Turning it off filters only Completed rows from the rendered projection; Planned and Running rows, Section headers, collapse state, canonical Day data, forecasts, and warnings remain unchanged.

Android Section collapse state is stored locally by logical date and stable Section identity, including a stable identity for the unsectioned group. Dates without a saved preference default to expanded. Once canonical Day data is available, stale Section identities are pruned only for that loaded logical date.

Web persists its existing Completed visibility preference locally in browser storage. It defaults to shown when no valid preference exists or storage is unavailable/malformed. Existing Web Section-collapse persistence remains unchanged.

These preferences are independent, device/browser-local presentation state. They are not synchronized across Android and Web and do not change Task, Entry, Execution, forecast, or server state. Clearing app/browser storage resets the corresponding preferences.

## Boundaries

- No Worker/API/DB/schema/migration change.
- No new dependency or server-side preference authority.
- No change to Daily navigation, Today date-picker behavior, canonical Day ordering, forecast derivation, warnings, or task lifecycle.
- Figma file `UbTJH6ykYNBQJS4Wvwz9jb`, node `685:2`, is a visual reference only; this Decision is the behavior authority.
