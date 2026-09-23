# D-135 Android Markdown Live Preview + IME Toolbar v0.1

Status: **Approved / Implemented**

## Decision

Android Notes uses one reusable live-preview Markdown editor for both standalone
Notes and Today Task Primary Notes. There is no separate Edit / Preview mode.
The canonical persisted value remains the exact Markdown source string.

The line containing the caret, or every line touched by a non-collapsed
selection, remains source-visible and editable. Other lines render the v0.1
supported syntax without rewriting the source. The supported presentation
constructs are bold, ATX headings, bulleted lists, task lists, quotes, and
links. Malformed or unsupported Markdown remains editable source.

When the Markdown body owns focus and the Android IME is visible, a compact
toolbar is shown immediately above the IME. It provides, in order, Bold,
Heading, Bulleted list, Checkbox, Quote, and Link. Toolbar commands operate on
the local raw source and selection/caret only; they do not create a new
persistence authority or perform a save directly.

The editor uses existing Compose text APIs and a local `TextFieldValue` to
preserve selection and composition. Source/display offset mapping is monotonic
and local to the visual transformation. NotesController autosave, CAS,
conflict, ambiguous retry, safe flush, discard, archive, restore, and delete
semantics remain authoritative and unchanged.

## Follow-up corrective — task-list marker interaction

The shared editor renders the caret and inactive task-list markers with the light foreground treatment required by the dark Notes surface. An inactive `- [ ]`, `- [x]`, or `- [X]` marker is a local interactive presentation control: a safe source/display offset mapping and text-layout hit test toggle only that exact marker through the existing body update path. Accessibility custom actions expose the current checked / unchecked state and the inverse action. Active source lines, malformed task-list syntax, blocked editor state, IME focus, selection/composition, autosave, CAS, retry, and persistence semantics remain unchanged.

## Boundaries

- No third-party Markdown/editor or icon dependency.
- No Worker/API, schema, migration, offline persistence, or Web change.
- No link navigation, metadata fetch, code blocks, tables, images, or other
  unsupported Markdown feature is added.
- Galaxy S23 verification is separate from AVD verification and remains
  `NOT_RUN / PRODUCT_OWNER_MANUAL` until a physical-device smoke is performed.
- Production remains `NOT_RUN`; Released remains `NO`.
