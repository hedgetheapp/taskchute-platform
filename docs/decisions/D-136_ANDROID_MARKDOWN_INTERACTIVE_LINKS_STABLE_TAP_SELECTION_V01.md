# D-136 Android Markdown Interactive Links + Stable Tap Selection v0.1

Status: **Approved / Implemented / Integrated**

## Decision

The shared Android live-preview Markdown editor treats rendered task checkboxes
and supported links as embedded controls. Activating either control must not move
the current text caret or selection, close the IME, rewrite raw Markdown, or
trigger autosave by itself.

Inactive rendered task-list markers continue to toggle only their exact raw
marker through the existing source update path. The current `TextFieldValue`
selection and composition are carried through that equal-length update.

Plain absolute `http://` and `https://` URLs are linkified presentation-only.
Existing Markdown links with an `http(s)` destination expose their rendered
label as the interactive range. The source remains the exact persisted Markdown
string. URL detection conservatively excludes obvious trailing prose
punctuation and malformed or unsupported schemes.

Link activation uses the platform `LocalUriHandler` path and safely ignores
open failures. Only detected `http` / `https` destinations are dispatched; no
metadata fetch, WebView, custom scheme, or source rewrite is introduced.

The editor exposes understandable accessibility custom actions for the rendered
checkboxes and links. Pointer hit testing uses the existing text layout and
source/display offset mapping. Interactive down events are consumed in the
Initial pointer pass by one parent hit-test layer before `BasicTextField` can
place its caret; non-interactive text gestures continue to the text field.

## Boundaries

- D-135 remains the authority for the single live-preview editor, raw Markdown
  persistence, active-line source visibility, IME, autosave, CAS, conflict,
  ambiguous retry, and safe flush semantics.
- This decision is the narrow follow-up that supersedes only D-135's earlier
  link-navigation exclusion.
- No Worker/API, schema, migration, dependency, Web Notes, or persistence
  authority change is introduced.
- `www.` completion, email/phone linking, custom URI schemes, preview cards,
  metadata fetching, and WebView remain out of scope.
- Galaxy S23 remains `NOT_RUN / PRODUCT_OWNER_MANUAL` until physical-device
  verification. Production remains `NOT_RUN`; Released remains `NO`.
