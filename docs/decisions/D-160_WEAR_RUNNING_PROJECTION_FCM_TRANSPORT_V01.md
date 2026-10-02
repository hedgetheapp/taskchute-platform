# D-160 — Wear Running Projection FCM Transport v0.1

Status: **Approved**

## Context

D-159 approved the Product requirement that the Pixel Watch complication should be invalidated promptly whenever the server-canonical Running projection changes, regardless of whether the mutation originated from Web, Android Phone, or Wear.

A feasibility investigation compared direct cloud push to Wear, Phone + Wear Data Layer, the existing 300-second complication refresh, and a background Wear WebSocket.

Findings:

- direct FCM to Wear is the only first-slice candidate that covers Web / Phone / Wear source changes while the Wear Activity is closed without requiring the Phone app to remain foregrounded;
- Phone + Data Layer alone cannot satisfy Web-originated or Phone-background cases without another background mechanism;
- a background Watch WebSocket conflicts with the current battery/background boundary;
- normal-priority FCM can be delayed in Doze, while silent high-priority use is not a reliable contract because high priority is intended for time-sensitive user-visible notifications and may be deprioritized;
- the current Worker realtime publish gate cannot safely use HTTP `response.ok` as a canonical-commit test because some domain rejections may be represented by HTTP 200 responses.

The Product Owner approved the direct-FCM design, including the required Firebase dependency, owner-bound registration persistence/migration, authenticated registration API, and a least-privilege FCM sender service-account private key held only as a Worker secret.

## Decision

### 1. Transport

Use Firebase Cloud Messaging (FCM) directly from TaskChute Server to the Wear app for D-159 event-driven Running-projection invalidation.

The Watch does not depend on the Phone as a proxy for this path.

D-158's 300-second system complication refresh remains a fallback.

### 2. Message priority and delivery contract

Use **normal-priority** Android data messages for v0.1.

Rationale:

- the message is a background freshness invalidation, not a user-visible urgent notification;
- high-priority silent messages are not treated as a stable immediate-delivery mechanism;
- Doze/network/OS scheduling may delay normal-priority delivery.

D-160 makes no hard realtime or fixed-second SLA claim.

Normal connected conditions should normally converge through the event-driven path without intentionally waiting for the 300-second fallback, but the fallback remains authoritative for eventual freshness if push is delayed, dropped, or disabled.

### 3. Payload

FCM payload is invalidation-only.

The logical payload is equivalent to:

```text
type = running_projection_invalidated
```

An opaque revision/event identifier may be added if useful for coalescing/debugging, but it must not become a second Domain authority.

Do not include:

- Task title
- estimate
- started_at / ended_at
- Project / Mode name
- Notes/Documents
- location
- cookies/session
- personal content not required to trigger a canonical refetch

### 4. Watch receive path

When the Wear app receives the invalidation while the Activity is closed:

1. `FirebaseMessagingService` validates that the message is the supported TaskChute invalidation;
2. it schedules bounded background work through AndroidX WorkManager;
3. the worker uses the existing encrypted Watch session to fetch canonical current Day from TaskChute Server;
4. after a successful canonical fetch, it requests a D-158 complication refresh through `ComplicationDataSourceUpdateRequester`.

The push payload itself is never rendered as canonical Task state.

Do not add a foreground service or persistent background WebSocket.

### 5. Local elapsed behavior

D-158 local/time-dependent elapsed and goal-progress rendering remains unchanged.

No periodic network call is added to advance the timer.

FCM exists only to invalidate inputs such as:

- Running identity
- lifecycle
- started_at
- estimate
- title/presentation metadata

### 6. APP persistence

Add an owner-scoped Wear push registration relation to APP DB.

v0.1 registration responsibility:

- stable registration `id` as UUIDv7
- `app_user_id`
- Watch-local stable `installation_id` as UUIDv7
- current opaque `fcm_token`
- `created_at`
- `updated_at`
- `last_seen_at`

Allow multiple Wear installations per user.

Enforce one current registration per `(app_user_id, installation_id)` and prevent a current FCM token from being ambiguously bound to multiple registrations.

The raw FCM token is required as a delivery address and may be stored in APP DB, but it is treated as sensitive operational data:

- do not log it;
- do not expose it in normal UI;
- do not place it in analytics;
- do not treat it as a user authentication credential.

D-160 approves the required APP migration.

### 7. Registration API / lifecycle

Provide authenticated Wear registration and unregister capability.

Registration:

- owner identity comes only from the current authenticated Watch session;
- client does not submit or choose `app_user_id`;
- request supplies local `installation_id` + current FCM token;
- token refresh / re-pair converges the installation to the latest token;
- account switch may atomically rebind the local installation/token to the newly authenticated owner.

Unregister:

- Watch logout should best-effort unregister before/around local session removal;
- unregister failure must not expose canonical Task data because later pushes remain invalidation-only;
- permanent invalid-token responses from FCM may delete the invalid server registration.

Time-based stale-age cleanup beyond these mechanisms is not required in v0.1.

### 8. Canonical commit boundary

Push notification fanout must occur **only after a canonical mutation actually commits**.

HTTP status / `Response.ok` is not a sufficient success signal.

Implement an explicit internal committed-mutation outcome boundary so a domain rejection represented by HTTP 200 does not emit a false invalidation.

The existing D-105 realtime invalidation mapping may be reused as the command-to-invalidation coverage map, but both existing realtime fanout and new FCM fanout must respect the actual committed outcome.

This is an internal correctness refactor, not a change to approved client-visible mutation semantics.

### 9. Push failure semantics

FCM is a freshness side effect and is not part of the Task mutation transaction.

If FCM send fails after canonical commit:

- do not roll back the Task mutation;
- do not convert the successful mutation response into failure;
- keep the 300-second complication refresh as fallback;
- clean up permanently invalid registrations when the provider explicitly reports them.

Duplicate/stale invalidations are safe because the Watch re-fetches the latest canonical state.

### 10. Server authentication

For v0.1 nonproduction FCM sending:

- create a dedicated Google service account for TaskChute FCM sending;
- grant only the minimum role/permission required to send FCM messages for the target Firebase project;
- use its user-managed private key only because no practical current keyless Worker identity path was established in the feasibility investigation;
- store the private key only as a Cloudflare Worker secret;
- never commit it to this public repository;
- never store it in D1;
- never log it;
- mint short-lived OAuth 2.0 access tokens for FCM HTTP v1 sends;
- rotate/revoke the key if exposed and keep rotation operationally possible.

The service-account private key is a long-lived credential and is accepted as a v0.1 security tradeoff. If a practical keyless federation path becomes available for Cloudflare Workers, replacing the key should be reconsidered.

### 11. Firebase / dependency adoption

D-160 approves:

- a Firebase / Google Cloud **nonproduction** project/app configuration required for the Wear client;
- official Firebase Cloud Messaging SDK in the Wear module;
- AndroidX WorkManager in the Wear module;
- FCM HTTP v1 integration in the Worker;
- nonproduction Firebase sender service account and Worker secret;
- the APP registration migration/API.

FCM itself was no-cost at approval time, but pricing/platform constraints must be rechecked before production adoption.

No third-party push framework is added.

### 12. Nonproduction / production boundary

Implementation may proceed through the normal Approved work-item flow to persistent nonproduction, including:

- migration implementation and nonprod application;
- Firebase nonprod configuration if authenticated tooling/access is available;
- nonprod Worker secret provisioning without exposing the value;
- nonprod Worker deploy;
- integration verification;
- fresh Wear/Phone APK artifacts;
- canonical docs closeout.

If Firebase/Google Cloud administrative access is unavailable, STOP only at the external setup boundary and report `MANUAL_EXTERNAL_SETUP_REQUIRED` with the exact minimal steps.

Do not create or configure production Firebase resources, production service-account credentials, production Worker secrets, production migration/deploy, tag, Release, branch, PR, or merge without separate approval.

## Verification intent

Automated coverage must include:

- register current owner / installation / token;
- token rotation;
- multi-Watch registrations;
- unregister;
- cross-owner isolation;
- invalid-token cleanup;
- rejected HTTP-200 domain outcome emits no realtime/FCM invalidation;
- committed projection-changing mutation emits the invalidation;
- non-projection mutation does not spuriously emit when mapping says it should not;
- FCM payload contains invalidation only;
- FCM send failure preserves successful mutation outcome;
- duplicate invalidations are harmless;
- Wear receiver schedules work without requiring Activity foreground;
- WorkManager canonical fetch uses existing encrypted Watch session;
- successful canonical fetch requests complication refresh;
- signed-out/unauthorized worker path does not fabricate state;
- no foreground service/background socket is introduced.

Persistent nonprod / Pixel Watch verification should cover representative Web and Phone Start, Complete, estimate edit, actual-time edit, Completed→Running reopen, and rollback flows where feasible, observing convergence without intentionally waiting for the 300-second fallback under normal connected conditions.

Production remains NOT_RUN; Released NO.
