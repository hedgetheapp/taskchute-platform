# D-106 — Android Native Auth Foundation v0.1

Status: **Approved**

Date: 2026-09-14

## Decision

TaskChute adds a minimal native Android authentication foundation as a
first-class client. The module is Kotlin + Jetpack Compose, uses a stable
application id (`com.hedgetheapp.taskchute`), requires Android API 28 or
higher, and presents only a signed-in shell in this slice. Today, offline
sync, realtime, widgets, notifications, and task/domain screens remain
outside this work item.

Android reuses the existing TaskChute Server Better Auth email/password
session contract. It calls the existing same-origin endpoints:

- `POST /api/auth/sign-in/email`
- `GET /api/auth/get-session`
- `POST /api/auth/sign-out`

The Android client does not create accounts. It sends credentials only for the
explicit sign-in request, does not log them, and clears the password from the
UI state after the request. It does not add a new token, JWT, OAuth, passkey,
MFA, or native credential-handoff contract.

## Session and security boundary

The client captures the server's authentication cookies dynamically from
`Set-Cookie` response headers. It does not hard-code a cookie name and does
not use a client-provided app-user id as authority. Requests attach the
in-memory cookie jar; the server remains responsible for authenticating the
session and resolving the stable `app_user_id` through the existing principal
mapping.

At rest, only the opaque cookie jar is stored in an app-private file below
`Context.noBackupFilesDir`, encrypted with a non-exportable AES-GCM key held by
Android Keystore. Passwords, password-derived material, Markdown, TaskChute
data, and user content are never persisted by this foundation. Corrupt or
undecryptable session data is discarded safely and returns the client to the
signed-out state.

Startup restores the encrypted cookie jar and validates it with
`GET /api/auth/get-session`. A valid session enters the signed-in shell, an
authoritative `401` clears the invalid session, and network/5xx failures retain
the encrypted session for an explicit retry without treating the user as
signed out. There is no automatic retry loop.

Explicit logout clears the local cookie jar only after the server logout
completes or has deterministically reported that the session is already gone.
An ambiguous/network logout retains the session and reports that logout did
not complete, so the client does not claim a state it cannot prove.

## API / persistence boundary

This decision adds no Worker route, API command, APP/AUTH table, migration, or
dependency. Existing Web session behavior, Better Auth configuration,
`AUTH_DB` / `APP_DB` separation, operation identity, and stable app-user
mapping remain unchanged. The Android transport uses the existing
authentication endpoints and treats non-auth failures separately from an
invalid session.

The module is prepared for future authenticated domain queries, but does not
implement Today, offline persistence, background sync, realtime invalidation,
or any mutation beyond explicit authentication and logout.

## Verification boundary

Local JVM tests cover state transitions, dynamic cookie handling, encrypted
session envelope validation, and failure classification. Android
instrumentation covers Keystore-backed `noBackupFilesDir` persistence when a
device is available. A Galaxy S23 is the target verification device; absence
of a connected device leaves that verification `NOT_RUN` rather than being
represented as a PASS.

The Android build is verified independently in local/CI configuration. This
slice does not deploy production or change persistent non-production data.
