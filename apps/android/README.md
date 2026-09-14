# TaskChute Android native auth foundation

This module is the D-106 v0.1 native authentication foundation. It uses the
existing TaskChute Server Better Auth email/password session endpoints and
shows a signed-in shell only. Today, domain screens, offline sync, realtime,
widgets, and notifications are not included.

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

JVM tests cover the state machine, cookie handling, request JSON escaping, URL
validation, and encrypted-session envelope. The Android instrumentation test
requires an available Android device or emulator and verifies the Keystore /
`noBackupFilesDir` round trip. No credentials are included in this repository.
