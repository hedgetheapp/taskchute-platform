# TaskChute Android native auth foundation

This module is the D-106 v0.1 native authentication foundation plus the D-107
Today surface and D-108 foreground invalidate-only realtime. It uses the
existing TaskChute Server Better Auth email/password session endpoints, the
canonical Today HTTP projection, and the existing D-105 RealtimeHub. Realtime
only accelerates canonical HTTP refetch while the app is signed in and in the
foreground. Offline sync, background sockets, FCM, widgets, and notifications
are not included.

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
