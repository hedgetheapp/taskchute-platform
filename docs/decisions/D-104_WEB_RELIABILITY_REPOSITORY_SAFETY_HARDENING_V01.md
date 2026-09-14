# D-104 — Web Reliability and Repository Safety Hardening v0.1

Status: **Approved**

Date: 2026-09-14

## Decision

D-104 hardens the existing Web and repository workflow without changing the
Document API, persistence schema, migration chain, or dependency set.

- A transient or non-authenticated bootstrap failure is a recoverable
  bootstrap error, not a signed-out state. The Web exposes an explicit retry
  path and does not clear the authenticated application tree for a Worker,
  network, D1, or parsing failure.
- An authoritative authenticated `401` / unexpected session expiry enters an
  explicit reauthentication-required barrier. Dirty Note content remains in
  browser memory, server mutations are frozen, and the editor tree remains
  mounted until the same app user is verified and canonical state is
  reconciled. A different principal cannot receive the retained draft.
- Reauthentication does not add local draft persistence. This work item does
  not persist Note title/body content to localStorage, IndexedDB, the Cache
  API, a service worker, filesystem, URL/history state, or a remote draft
  endpoint.
- The Worker-side JSON request protection remains `64 * 1024` bytes. The Web
  measures the exact UTF-8 serialized JSON body for Note mutations, warns at
  the shared pre-limit threshold, and prevents a known-unsaveable payload
  from being submitted.
- Direct normal fast-forward push to `main` remains the canonical delivery
  path and a pull request is not required. Force-push and deletion of `main`
  are prohibited. Push-time informational CI runs with read-only repository
  permission; required status checks are intentionally not a push gate in
  v0.1.

## Boundary

The existing explicit logout flow, Document CAS/exact replay/ambiguity
semantics, navigation barriers, and persistent nonprod verification boundary
remain in force. D-104 introduces no schema or migration, no offline Notes
support, no auth-provider replacement, and no production operation.

## Evidence

Implementation and current verification evidence are recorded in
`docs/CURRENT.md` and `docs/TEST_MATRIX.md`. The CI workflow is
`.github/workflows/ci.yml`.
