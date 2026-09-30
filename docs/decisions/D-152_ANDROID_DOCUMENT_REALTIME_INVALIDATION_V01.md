# D-152 — Android Document Realtime Invalidation v0.1

Status: **Approved / Implemented / Integrated / focused PASS / Notes and Daily AVD PASS / Today surface partial**

## Decision

Android Notes and Daily must refresh clean canonical Document projections after a realtime mutation notification, while preserving the existing Document HTTP authority and D-111 autosave/CAS/conflict/retry/safe-flush semantics.

This Decision extends D-108's Android Today invalidation boundary to document-owned surfaces only. It does not introduce realtime document payload authority, client-side document mutation, polling, background sockets, offline persistence, or a new persistence model.

## Protocol and routing

- The existing invalidation envelope may carry `kind: "documents"` with either omitted `document_ids` (wildcard) or a bounded list of safe document IDs.
- Android parses supported document scopes, deduplicates IDs, ignores empty lists, and rejects malformed/unsupported envelopes.
- The connection manager coalesces document invalidations with the existing short timer. Wildcard dominates targeted IDs; the bounded queue falls back to wildcard when its limit is exceeded. Day and document invalidations remain independent callbacks in the same coalescing boundary.
- Worker mutation mapping publishes document invalidation only after a successful response. Daily Ensure is a document wildcard; Daily body update is targeted. Existing standalone, Task Primary, and Project Primary mappings remain unchanged.

## Android safety boundary

- MainActivity forwards connection, foreground, and document invalidation events to Notes and Daily controllers.
- Clean loaded list/editor state may refetch canonical HTTP data. A targeted event refreshes only the relevant open document; unrelated IDs are a no-op.
- Dirty, saving, or blocked editor drafts are never overwritten. Invalidation is deferred and retried at the existing save-success/reconcile boundary.
- Daily invalidation refetches an existing loaded document and never calls Ensure merely because a realtime event arrived. An unopened Daily surface therefore cannot materialize a Day or Document from an event.
- Realtime errors do not become a second persistence or conflict authority.

## Non-goals and boundaries

No Worker/API route redesign, schema or migration change, dependency, Web UI change, polling, offline persistence, production operation, or Galaxy S23 verification is included. Cross-client authenticated realtime verification remains a separate evidence item.

## Evidence

- Implementation: `d9b48e63fd6f4eaa3dc109feba97432db1d6d609`
- Exact-SHA CI: run `36657992841` PASS; Android JVM / signed APK and Web/Worker verification PASS.
- Local Android JVM: `274 / 274` PASS; focused realtime/controller tests PASS.
- Worker focused test and Web typecheck PASS.
- Notes focused AVD: PASS; Daily focused AVD: PASS; MainActivity/UI-tree/crash-buffer smoke PASS.
- Today surface: `PARTIAL / NOT_VERIFIED`; 64 tests, 55 passed and 9 existing Today fixture/UI expectation failures. No target-app crash was observed.
- Persistent nonprod Worker: `taskchute-web-nonprod`, version `bc473455-e9d1-4268-b767-b48b346d9a3d`; guard, dry-run, root `200`, protected API `401`, APP/AUTH `PRAGMA quick_check = ok`, and migration metadata checks PASS.
- APK: `taskchute-android-debug-d9b48e63fd6f4eaa3dc109feba97432db1d6d609`, artifact ID `11073237433`, expires `2026-10-07T02:05:49Z`.
- Cross-client authenticated realtime flow: `NOT_RUN`; Galaxy S23: `NOT_RUN / PRODUCT_OWNER_MANUAL`; Production: `NOT_RUN`; Released: `NO`.
