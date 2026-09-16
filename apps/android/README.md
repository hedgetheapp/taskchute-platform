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

D-112 adds selection and day operations to Today. Eligible ordinary planned current-Day rows
have selection controls and a bottom bulk action bar for canonical bulk day move/delete. Their
overflow menu also exposes previous-day, next-day, date-picker, and confirmed delete operations;
unestablished past Days are never created by these actions. Pull-to-Refresh and the existing
single-entry long-press drag remain available. Group D&D is not enabled because the current
canonical API has no atomic multi-entry relative-placement command, so Android does not emulate
it with multiple mutations.

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
native Notes surface uses the existing owner-scoped Document APIs, Markdown source,
revision/CAS, and memory-only drafts. D-111 makes standalone `＋` perform canonical Create
immediately and autosaves standalone title/body and Task Primary body after approximately
one second of idle time. Input remains usable while a request is in flight; successful
canonical convergence schedules one follow-up save when needed. Back, navigation, and
logout flush safely before leaving, while an explicit discard only clears a safe local
draft and never an in-flight or unresolved request. It does not add offline persistence,
preview, attachments, or Project/Routine Note entry points. Standalone editor Back returns
to the Notes list and a Task Primary editor opened from Today returns to Today. D-111 local final evidence is
Android JVM `94 / 94` and Windows `TaskChute_API33` instrumentation `28 / 28` through
`scripts/android-qa.ps1`, including APK install, activity readiness, and crash-buffer inspection. The D-111
Galaxy S23 smoke remains `PENDING_SMOKE` until the fresh artifact is tested.

D-112 local evidence is Android JVM `97 / 97` and `TaskChute_API33` Today instrumentation
`24 / 24` through `scripts/android-qa.ps1`; the run also installed the debug APK, resolved
MainActivity, and found no TaskChute package crash. Galaxy S23 D-112 smoke remains
`PENDING_SMOKE` until the fresh artifact is tested.

D-113 refines the Today visual surface without changing canonical commands: the leading slot is
consistent across lifecycle states, planned start/estimate metadata is icon-led, available execution
times are shown without fabrication, Add/Edit sheets open high, drag feedback is lifted, and Sections
can be collapsed locally (default expanded). Native Notes keeps D-111 autosave and safe flush, removes
the visible Save button, uses a borderless Markdown source editor, returns to the Notes list from the
footer, and exposes D-092 standalone archive/restore/delete actions. The D-113 local gate is Android JVM
`101 / 101` plus `scripts/android-qa.ps1 -Surface Notes` `7 / 7` and `-Surface Today` `25 / 25`; both
include debug APK install, MainActivity resolution, and crash-buffer inspection. D-113 Galaxy S23 smoke
is `PENDING_SMOKE` until the fresh final-main artifact is tested.

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
