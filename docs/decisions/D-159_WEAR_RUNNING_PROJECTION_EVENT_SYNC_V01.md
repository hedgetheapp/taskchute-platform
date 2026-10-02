# D-159 — Wear Running Projection event-driven sync requirement v0.1

Status: **Approved / Transport architecture pending feasibility**

## Context

D-158 implemented a Wear OS complication that reads the server-canonical current Running Task and can update local elapsed/progress without minute-by-minute network polling. Its current background convergence for changes made outside the Watch app relies on the Wear OS complication refresh cadence, currently 300 seconds.

The Product Owner wants the complication to react promptly when the canonical Running projection changes, including changes made from Android Phone or Web, rather than normally waiting for the periodic fallback.

## Decision

### 1. Product behavior

Whenever a canonical mutation changes the current Wear complication Running projection, the Watch should receive an event-driven invalidation independent of which client originated that mutation.

After receiving the invalidation:

1. the Watch does not trust mutation details carried by the invalidation as canonical Domain state;
2. the Watch re-fetches the canonical current Day from TaskChute Server using its existing authenticated session;
3. the complication requests an update from the canonical result.

The invalidation is a freshness accelerator, not a second state authority.

### 2. Projection-changing events

The requirement includes at least:

- Planned → Running Start from Web / Android Phone / Wear;
- Running → Completed via Complete;
- Running → Completed via manual actual-end entry where supported;
- Running estimate change;
- Running actual-start correction;
- Completed → Running by clearing actual end (D-156);
- Running → Planned rollback (D-156);
- eligible Completed → Planned direct rollback (D-157);
- Task title or other canonical metadata change when it affects complication title/content description;
- any future canonical mutation that changes the current Running identity, lifecycle, started_at, estimate, or other complication projection input.

This list describes projection semantics rather than binding D-159 to a fixed set of command names.

### 3. No-running state

If a change removes the current Running Task, the complication converges to D-158's no-running / idle representation.

D-159 does not require displaying the next Planned Task.

If a subsequent Task is started, the same event-driven path switches the complication to that new Running Task.

### 4. Local elapsed progression

Elapsed/progress ticking remains local/time-dependent on the Watch using canonical started_at and estimate.

Do not add second-by-second or minute-by-minute server polling merely to advance the displayed timer.

### 5. Fallback

D-158's 300-second complication refresh remains as a fallback for missed/delayed invalidations.

The desired normal path is event-driven invalidation; the periodic refresh is not the target latency mechanism.

### 6. Delivery semantics

“Promptly” means the system should emit an event-driven invalidation after the canonical mutation commits and use a platform-supported background delivery path.

This is not a hard realtime SLA. OS scheduling, Doze, radio/network state, and push-provider behavior can delay delivery.

No UI may claim a guaranteed fixed delivery time unless later evidence supports such a contract.

### 7. Privacy / authority

Prefer invalidation-only payloads. Do not send Task title, notes, cookies, session credentials, or other unnecessary user content through a third-party push transport when a generic invalidation signal followed by an authenticated canonical fetch is sufficient.

The Watch remains responsible for reading canonical state through the TaskChute API.

### 8. Architecture pending

D-159 does **not** select the transport.

A feasibility investigation must compare at least:

- direct cloud push to the Wear app, including Firebase Cloud Messaging if appropriate;
- Android Phone-assisted invalidation using the Wear Data Layer;
- any other current Wear OS-supported background mechanism that satisfies the Product requirement.

The comparison must cover:

- behavior when the Watch app is closed;
- Doze/background delivery and realistic latency;
- whether a visible notification is required or high-priority silent use would violate/reduce delivery guarantees;
- battery/network impact;
- device registration / FID / token lifecycle and stale cleanup;
- server-side credential/secret handling;
- owner/device binding and revocation;
- persisted-data/schema/migration implications;
- retry/idempotency/failure behavior;
- Cloudflare Worker compatibility;
- dependency and operational burden;
- current pricing/cost;
- Pixel Watch physical verification strategy.

### 9. Approval boundary

This Decision approves the Product behavior requirement and feasibility investigation only.

It does **not** approve:

- Firebase/FCM adoption;
- a Firebase/Google Cloud project;
- service-account credentials;
- registration-token/FID persistence;
- APP schema/migration;
- new Worker secret;
- background service / foreground service;
- new long-term dependency;
- new ongoing cost;
- production deployment.

If the selected design requires any of these Material changes, return to the Product Owner with findings and options before implementation.

## Relation to D-158

D-159 supersedes D-158 only in the desired cross-client freshness target: waiting for the next periodic refresh is now fallback behavior, not the desired normal path.

Until D-159 transport is selected and implemented, the current D-158 300-second behavior remains the implementation fact.

## Follow-up

D-160 (`docs/decisions/D-160_WEAR_RUNNING_PROJECTION_FCM_TRANSPORT_V01.md`) resolves the transport architecture that remained pending in this Decision. D-159 remains the Product behavior authority; D-160 supplies the approved v0.1 direct-FCM transport, registration persistence/API, sender credential boundary, and post-commit fanout architecture.
