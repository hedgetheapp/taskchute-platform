# TaskChute Android native auth foundation

This module is the D-106 v0.1 native authentication foundation plus the D-107
Today surface, D-108 foreground invalidate-only realtime, D-109 current-Day
planning form, and D-110 direct manipulation / native Notes. It uses the
existing TaskChute Server Better Auth email/password session endpoints, the
canonical Today HTTP projection, and the existing D-105 RealtimeHub. Realtime
only accelerates canonical HTTP refetch while the app is signed in and in the
foreground. Offline sync, background sockets, FCM, widgets, and notifications
are not included. Planning is limited to ordinary planned Tasks on the current
established Day; future/past, running/completed, and Routine-derived entries
remain read-only.

The D-109 planning controls use a single bottom-right `＋` FAB for Quick Add on
the current planning-enabled Day. Planned ordinary current-Day rows expose an
explicit `…` menu with `編集`; tapping the row body does not open the editor.
The FAB and running-task panel share a bottom overlay relationship so the
controls remain separated while a Task is running.

D-110 enables the native Android `ノート` destination. Ordinary eligible current-Day
planned rows support long-press drag for canonical same-cohort reorder or cross-Section
move. An empty normal Section or empty `Sectionなし` is a Section-level drop target and
uses canonical MoveEntry without relative placement. The overflow menu supports canonical
`複製` and Task Primary `ノート` for every visible row with a valid Task identity, while
planning edit/drag eligibility remains restricted. The
native Notes surface uses the existing owner-scoped Document APIs, explicit Markdown
Save, revision/CAS, memory-only drafts, and explicit dirty Back confirmation. It does
not add autosave, offline persistence, preview, attachments, or Project/Routine Note
entry points. Standalone editor Back returns to the Notes list and a Task Primary editor
opened from Today returns to Today. Runtime verification uses the Windows `TaskChute_API33` AVD through
`scripts/android-qa.ps1`; the D-110 final Product Owner Galaxy S23 smoke remains
`PENDING_SMOKE` until the fresh artifact is tested.

## Local build

Configure the non-production URL without committing it:

```powershell
./gradlew :app:testDebugUnitTest :app:assembleDebug `
  -Ptaskchute.baseUrl=https://taskchute-web-nonprod.taskfulness-sync.workers.dev
```

The default URL is empty, so an unconfigured build fails safely to a clear
configuration message. Only HTTPS URLs are accepted except loopback HTTP for
local development.

The module captures authentication cookies dynamically from the server's
`Set-Cookie` headers. It stores only the opaque cookie jar, encrypted with a
non-exportable Android Keystore AES-GCM key, in `Context.noBackupFilesDir`.
Passwords, app-user IDs, Markdown, and TaskChute data are not stored.

## Verification

JVM tests cover the auth state machine, cookie handling, request JSON escaping,
URL validation, encrypted-session envelope, realtime protocol, connection
lifecycle, and Today invalidation deferral. The Android instrumentation test
requires an available Android device or emulator and verifies the Today UI and
Keystore / `noBackupFilesDir` round trip. `scripts/android-qa.ps1` runs the
repeatable local AVD instrumentation path. No credentials are included in this
repository.
