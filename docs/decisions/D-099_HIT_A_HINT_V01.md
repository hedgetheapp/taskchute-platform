# D-099 — Hit-a-Hint v0.1

Status: **Approved**

## Decision

Signed-in application surfaces provide a transient Hit-a-Hint mode. Plain `F` / `f` on a neutral surface collects the currently visible, enabled, actionable controls in deterministic document order and assigns keyboard-friendly labels. The mode is not persisted and applies only to the current viewport.

- The alphabet is `ASDFGHJKLQWERTYUIOPZXCVBNM`. Up to 26 targets receive one-character labels; larger supported snapshots receive two-character labels, so the active label set is prefix-free and bounded at 676 targets.
- Buttons, links, action roles, and ordinary controls keep their existing activation semantics. Inputs, selects, textareas, contenteditable surfaces, generic focusable controls, and Task rows are focus-only targets. Existing confirmation and safety UI remains authoritative.
- Hidden, disabled, inert, collapsed, zero-size, off-viewport, overlay, and Logout targets are excluded. Modal, menu, popover, calendar, editor, IME, and other local keyboard owners retain precedence and do not activate Hint mode.
- While active, the Hint mode capture listener owns ordinary unmodified keyboard input, including keys that overlap existing shortcuts. Escape cancels, Backspace removes one prefix, invalid characters are ignored, and a complete label resolves immediately. Modifier chords cancel the mode and remain available to browser/system behavior.
- Badges render in a portal with viewport coordinates, `aria-hidden`, `pointer-events: none`, and no layout participation. Pointer interaction, scroll, resize, and significant view changes cancel the snapshot rather than leaving labels detached from targets.
- Hint focus/action is a user intent and reuses the existing D-098 focus authority; it must not be superseded by stale pending Add focus restoration.

This is a Web-only interaction layer. Worker/API/domain commands, existing shortcut semantics outside Hint mode, lifecycle and placement semantics, schema, migration, dependency, security posture, and persistent/offline state are unchanged.

## Verification boundary

Implementation, focused keyboard/target/focus regression, full Web/Worker regression, static gates, and persistent nonprod evidence are recorded in `docs/CURRENT.md` and `docs/TEST_MATRIX.md`. Production, restore, destructive cleanup, branch/PR/merge/tag/release are excluded; Released remains `NO`.
