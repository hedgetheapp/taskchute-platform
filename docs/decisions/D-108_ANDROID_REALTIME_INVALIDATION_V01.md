# D-108 — Android Realtime Invalidation v0.1

Status: **Approved**

Date: 2026-09-14

## Decision

D-108 extends the existing D-105 invalidate-only realtime model to the
foreground Android Today surface. D1 and the existing HTTP Query remain the
canonical authority. Realtime notification is a freshness accelerator, never
canonical authority.

While the Android app is signed in and the Today surface is foregrounded, one
connection manager may maintain one authenticated WebSocket connection for the
current app session. A received `day` invalidation causes the mounted logical
Day to refetch through the existing HTTP API. Android Start / Complete remains
an HTTP command and uses the existing Worker publish mapping for other clients.

## Authentication and routing

Android reuses the D-106 server-issued dynamic cookie session. The cookie name
is not hard-coded, no second token representation is persisted, and the Worker
continues to derive the authenticated app-user identity server-side. The
RealtimeHub is the existing one-user-scoped Durable Object from D-105; D-108
does not create a new namespace or store TaskChute domain state in the object.

Browser WebSocket requests retain same-origin protection. A non-empty Origin
must equal the application origin. A native Android request may omit Origin only
when it carries the explicit Android realtime client marker and still passes the
normal session authentication. The marker is not an identity or authentication
authority. Unauthenticated and wrong-origin requests remain rejected.

The Android client uses the approved OkHttp WebSocket implementation. A socket
401 or an authenticated HTTP probe 401 enters the existing D-106 auth handling;
transient socket, network, and non-auth probe failures do not sign the user out.

## Lifecycle and safety

The connection is foreground-only: it starts for a signed-in Today surface,
stops on logout and lifecycle end, and does not use a foreground service,
background always-on connection, FCM, polling, or offline synchronization.
Reconnect uses bounded exponential backoff with jitter and prevents duplicate
active sockets. App foreground/resume and successful connection establish a
canonical Today refetch.

The versioned invalidate-only protocol is strictly parsed. Android ignores
malformed or unsupported messages and never accepts domain commands or
canonical Task/Entry/Document bodies over WebSocket.

If a day invalidation arrives while Start / Complete or another canonical
reload is pending, Android coalesces and defers the refresh until the existing
safe boundary. Local pending state and retry semantics are not discarded.

## Boundary

D-105 and D-107 history remain unchanged: D-105 originally defines the Web
realtime slice and D-107 originally excludes realtime from Android Today. D-108
only extends the approved invalidate-only model to Android Today. No APP/AUTH
schema or migration, new API command, new auth token, background sync, or
production rollout is included.
