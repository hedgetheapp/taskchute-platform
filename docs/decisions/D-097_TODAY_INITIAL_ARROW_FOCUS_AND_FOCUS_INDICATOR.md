# D-097 — Today initial Arrow focus and Task focus indicator

Status: **Approved**

## Context

Today Day Table already supports keyboard navigation and placement workflows. Current behavior has two UX problems:

1. When no Task row is focused, `ArrowDown` acquires the first visible Task but `ArrowUp` acquires the last visible Task. For the Today workflow, the desired initial keyboard entry point is always the topmost visible Task regardless of which vertical Arrow key was pressed first.
2. A running Task and a focused Task both use similar blue-tinted row backgrounds. When the running Task receives focus, the keyboard focus position can become visually ambiguous.

This Decision changes only Web Today keyboard/focus presentation. It does not change Task / Entry / Execution / Section Domain semantics, API contracts, persistence, placement authority, or D-096 continuous Shift placement semantics.

## Decision

### 1. Initial Arrow focus acquisition

When the authenticated Web app has the Today view open and no Today Task row currently owns Day keyboard focus:

- pressing unmodified `ArrowDown` focuses the topmost visible Task row;
- pressing unmodified `ArrowUp` also focuses the same topmost visible Task row;
- the target is determined by the current visual/rendered Today Task order;
- collapsed / non-rendered Task rows are not eligible;
- if no visible Task exists, the keypress is a no-op;
- once a Task row is focused, existing `ArrowDown` / `ArrowUp` next/previous navigation semantics remain unchanged.

This initial acquisition must be usable without requiring a Task row to already own focus. It may be implemented at the Today view/root keyboard boundary, but must not hijack Arrow keys from text editing or explicit interactive controls.

The initial acquisition is suppressed when any of the following applies:

- `input`, `textarea`, `select`, or `contenteditable` editing target;
- IME composition;
- an open decision/modal interaction that already owns keyboard handling;
- a menu / popover / other explicit control where Arrow keys have local semantics;
- modifier keys that belong to another defined shortcut, including `Shift + Arrow` placement.

When acquisition succeeds, default page scrolling for that Arrow key is prevented.

This Decision changes the initial **Arrow-key** acquisition only. Existing `J / K` semantics remain unchanged unless a later Decision changes them.

### 2. Task state and keyboard focus use different visual channels

Task lifecycle state and keyboard focus must not compete for the same background treatment.

Use these roles:

- Task state, including `running`, remains represented by the row background / existing state styling.
- Keyboard focus is represented by a distinct accent-blue outline around the Task row.
- Focus must not replace the running background.
- A running + focused Task therefore shows both the running background and the focus outline simultaneously.

The focus indicator should use the existing Web accent blue (`#2383e2` or the equivalent shared token) and be visually equivalent to a 2px outline around the full Task row.

Implementation must avoid layout shift. Prefer CSS `outline` / equivalent overlay rather than changing row border geometry.

The current focus-only blue background override / left-only focus stripe should not remain the sole focus indicator. Focus should remain distinguishable on:

- planned Tasks;
- running Tasks;
- completed Tasks;
- selected Tasks;
- hover state where applicable.

Focus visibility is a presentation concern only and must not alter lifecycle, selection, placement, or mutation state.

## Relationship to existing Decisions

- D-062 remains authoritative for the broader Day Table keyboard workflow, except that D-097 supersedes its initial no-focus `ArrowUp` behavior for Today.
- D-083 / D-096 placement semantics are unchanged. `Shift + ArrowUp / ArrowDown` remains placement input rather than focus acquisition.
- Existing text-editing / IME / modal shortcut suppression remains in force.

## Acceptance criteria

1. With Today open, at least two visible Tasks, and no Task row focused, `ArrowDown` focuses the first visible Task.
2. Under the same condition, `ArrowUp` focuses that same first visible Task, not the last Task.
3. After focus acquisition, subsequent `ArrowDown` / `ArrowUp` continues normal next/previous Task navigation.
4. `Shift + ArrowUp / ArrowDown` behavior is unchanged and does not trigger initial focus acquisition.
5. Arrow keys in text-editing or local interactive-control contexts are not hijacked.
6. With no visible Task, initial Arrow acquisition performs no focus change and no mutation.
7. No Server/API mutation is performed by focus acquisition.
8. A running Task without focus retains the existing running-state background.
9. A focused planned Task has the dedicated blue outline without requiring a focus background override.
10. A focused running Task simultaneously shows its running-state background and the same dedicated blue outline.
11. Focus treatment causes no measurable row layout shift.
12. Existing D-096 continuous Shift placement and current focus restoration regressions remain PASS.

## Verification boundary

Required verification should include:

- focused Web automated tests for both initial Arrow directions;
- suppression tests for editing / modifiers;
- regression for focused-row Arrow navigation;
- focused CSS/source review for planned and running focused states;
- full Web regression;
- typecheck / build;
- authenticated persistent nonprod browser verification for initial Arrow acquisition and running + focus visual distinction;
- fresh/reload verification only if implementation state persistence or focus restoration changes materially.

Worker, API, schema, migration, dependency, AUTH, and production changes are **not required** for this Decision.

## Non-goals

- changing Task lifecycle colors beyond what is necessary to keep focus distinguishable;
- changing running semantics;
- changing selection semantics;
- changing `J / K` initial acquisition;
- changing Section focus behavior;
- adding a new persistent focus preference;
- changing mobile/native keyboard behavior outside Web Today;
- production deployment / release.
