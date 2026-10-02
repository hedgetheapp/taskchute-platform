# D-158 — Wear OS Running Complication v0.1

Status: **Approved**

## Context

D-154 established the first Wear OS / Pixel Watch client and explicitly left Tile / Complication outside v0.1. The Product Owner now wants the current TaskChute execution state to be visible from the watch face without opening the TaskChute app.

The target is the Product Owner's current analog Pixel Watch face with a circular complication slot. The concept image used in discussion is a visual intent reference only; a complication data source supplies semantic data, while the selected watch face controls final rendering.

## Decision

### 1. Surface

Add a TaskChute Wear OS complication data source.

The complication is read-only. It does not Start or Complete a Task directly from the watch face.

Tapping the complication opens the existing TaskChute Wear app. Tile is not added in D-158.

### 2. Running state with estimate

When the canonical current Day has one active Execution and the running Entry has a positive estimate, expose goal/progress semantics suitable for a circular progress complication.

Semantic payload:

- current value = elapsed execution time
- goal/target = Entry estimate
- short text prefers a compact elapsed/estimate representation such as `18/30`
- TaskChute monochrome/brand-compatible icon where the requested type allows it
- accessibility description identifies the running Task and progress

The selected watch face remains responsible for final typography, arc geometry, color, and which optional fields are shown.

### 3. Estimate overrun

When elapsed time exceeds the positive estimate:

- the semantic progress value is allowed to exceed the goal
- compact text continues to show elapsed/estimate, for example `36/30`
- accessibility description states the overrun
- if the watch face supports special over-goal rendering it may visually distinguish the excess

The mockup's orange/red ring and alert badge are desired visual intent, not a pixel-exact guarantee. TaskChute must not claim control over colors or badge rendering that belong to the watch face renderer.

Use a complication type designed to represent progress beyond a target when supported by the running platform/watch face. Do not fake overrun by clamping the semantic value to the estimate.

### 4. Running state without estimate

If a Task is Running but has no positive estimate:

- do not invent a target
- expose a compact elapsed-only state when the requested complication type supports it
- otherwise return the safest useful non-goal representation supported by that request

No false 100% ring or synthetic estimate is allowed.

### 5. No running Task / signed-out / error

When signed in and there is no Running Task, expose a compact idle TaskChute state such as `待機` / icon where supported.

When the Watch has no valid TaskChute session, expose a compact signed-out state such as `ログイン`; tapping opens the existing Wear app pairing/sign-in flow.

On transient network failure, do not mutate canonical state and do not fabricate a Running Task. D-158 does not add an offline Day database or general stale-state cache.

### 6. Update model / battery boundary

The complication must work while the TaskChute Activity is closed by using the Wear OS complication data-source service and the existing encrypted Watch session to read the canonical current Day directly from the TaskChute Server when Wear OS requests data.

Battery-safe rules:

- no foreground service
- no per-second or per-minute network polling
- periodic system update interval must respect Wear OS platform minimums
- use time-dependent/dynamic complication values where the platform safely supports them so elapsed display can advance without network polling
- after a successful Start / Complete performed in the Watch app, request a complication refresh through the platform update requester
- D-154B foreground realtime remains foreground-only; D-158 does not add background realtime

Therefore a Task state changed from Web/Phone while the Watch app is closed may not appear instantly; it converges on the next system complication request/allowed refresh. Exact scheduling is OS-controlled.

### 7. Platform / compatibility boundary

Use the official AndroidX Wear watch-face complication data-source API. No third-party complication framework is added.

Support the complication types needed to maximize compatibility with circular Pixel Watch slots, with Goal Progress preferred for over-target progress where supported and compact text/ranged fallback as appropriate. Exact supported-type declarations and API-level fallback are implementation details subject to current official AndroidX contracts.

The service must be protected with the Wear OS complication provider binding permission and must not expose the encrypted session or cookies.

### 8. Scope / non-goals

In scope:

- Wear module only
- complication data source
- current canonical Day / Running state
- estimate progress and overrun semantics
- elapsed-only Running fallback
- idle / signed-out / transient-error safe representation
- tap to existing Wear app
- local refresh request after Watch Start / Complete
- official AndroidX complication dependency required for this feature

Out of scope:

- custom watch face
- pixel-exact color/arc/badge control on third-party/system watch faces
- Tile
- watch-face Start / Complete buttons
- background realtime
- foreground service
- offline Day DB / durable canonical cache
- Phone proxy
- Worker/API/schema/migration changes
- production / Release

## Supersession

D-158 supersedes only the D-154 statement that Complication is outside the implemented Wear scope. Tile and background realtime remain outside scope.

## Verification intent

Automated verification must cover:

- Running + estimate normal progress
- Running + estimate overrun with semantic value beyond target
- Running without estimate does not invent a target
- no Running Task idle state
- signed-out state
- transient load failure does not fabricate state
- tap action targets the existing Wear activity
- legacy / unsupported requested complication types fail safely or use approved fallback
- successful Watch Start / Complete requests a complication refresh
- no background realtime / foreground service is introduced
- session/cookie material is never rendered or logged

Build verification must include Wear JVM tests, Wear Kotlin compile, AndroidTest compile if affected, Wear debug APK build, manifest/service inspection, and exact-SHA CI.

Physical Pixel Watch verification remains PRODUCT_OWNER_MANUAL. Production remains NOT_RUN; Released NO.
