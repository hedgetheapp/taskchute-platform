# D-115 — Web Today / Notes UI Refinement v0.1

Status: **Approved**

## Decision

D-115 refines the existing Desktop Web Today and Notes presentation without
changing TaskChute domain or persistence semantics.

- Delayed Shift+Arrow reorder completion must respect newer user focus intent.
- The resizable Task column has a 180px minimum, retains its current default,
  and remains capped at 640px; stored preferences are normalized safely.
- Today Project and Mode null values render blank. Their values and selectors
  remain single-line and truncate in narrow columns.
- A running row has a subtle non-warning background that remains distinct from
  the independent keyboard-focus treatment.
- Routine affordance is muted when absent and accented when present; accessible
  names continue to communicate state independently of color.
- A completed row's Start Forecast displays `--:--` without changing forecast
  computation.
- The Today Task Note action toggles only that Task's floating Note. Closing
  continues through the existing safe flush and unresolved-operation barriers.
- Floating Note controls use an icon-only accessible copy-link action and omit
  the new-window action and explanatory title-authority copy. Markdown body
  editors omit the visible `Markdown本文` label and heavy body frame.
- Notes-page editors omit the normal visible Save action while retaining
  autosave, explicit keyboard flush, and exact ambiguous retry. A compact Retry
  is shown only while the save outcome is unresolved.
- A newly-created standalone Note focuses its title only after its canonical
  Create has resolved and the intended editor is ready, and only if the user
  has not moved focus since the Create began.
- A supported Project Primary Note can move from the Notes inline editor to the
  existing floating editor after a safe flush. One document never has two
  independent editable draft authorities. Standalone Notes do not gain a new
  floating Document type.
- Project Primary Note removes the explanatory title-authority sentence; the
  Project remains the title authority.

## Boundaries

D-098 user-focus authority and D-091 autosave / exact-retry semantics remain
canonical. Existing Document, Task, Project, and operation contracts are reused.
This Decision adds no API or Worker semantics, schema or migration, dependency,
storage model, Note type, or production behavior. D-116 completed metadata and
future-Routine semantics are outside this Decision.

## Evidence

Implementation and verification status are recorded in `docs/CURRENT.md` and
`docs/TEST_MATRIX.md`. Browser and persistent-nonprod evidence must remain
distinct from local automated test evidence.
