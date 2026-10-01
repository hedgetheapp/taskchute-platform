# D-154 — Wear OS / Pixel Watch v0.1

Status: **Approved**

Date: 2026-09-30

## Decision

TaskChute Platform adds the first Wear OS / Pixel Watch vertical slice as an execution-oriented
companion client. Initial sign-in is assisted by the signed-in Android companion, while normal
Today reads and Start / Complete operations run directly from the Watch to the existing TaskChute
Server over HTTPS. The phone is not a proxy for normal TaskChute data.

The initial implementation target is an Android-paired Pixel Watch / Wear OS device. Public Release
requirements, iOS-paired watches, and a standalone fallback authentication method are outside this
v0.1 and remain blocked until a later Approved Decision.

Canonical Figma reference:

- file: `UbTJH6ykYNBQJS4Wvwz9jb`
- page: `559:2` — Wear OS — Pixel Watch v0.1
- concept board: `559:3`
- 01 Today / Idle: `561:33`
- 02 Running: `561:52`
- 03 Complete / Next: `561:87`
- 04 Network error: `561:101`
- 05 Sign in: `561:110`

## Wear module / platform boundary

A dedicated `:wear` Android application module is added under `apps/android`. The phone and Wear
apps use the same application id `com.hedgetheapp.taskchute` and the same signing identity so that
Google Play services can enforce the Wearable Data Layer same-package / same-signature boundary.

Wear UI uses Compose for Wear OS Material 3. Material Symbols Rounded remains the first-choice icon
family under the cross-platform icon rule. The v0.1 implementation may add the official Wear Compose
Material 3 / Foundation / Navigation artifacts and Google Play services Wearable Data Layer artifact
required by this decision. Horologist or another additional abstraction library is not part of this
decision.

The existing Android phone application remains a first-class client. A broad refactor of Android
Today / Notes / Settings is not part of the Wear slice.

## Phone-assisted authentication

The Watch does not normally ask the user to type TaskChute email/password. The sign-in screen shows
only:

- heading: `ログイン`
- action: `アプリで接続`

The approved first-connect flow is:

1. Watch creates a cryptographically random pairing request id and nonce and publishes the request
   through the Wearable Data Layer.
2. The signed-in Android companion discovers the pending request and presents an explicit user
   confirmation before connecting that Watch.
3. After confirmation, the Android client uses its existing authenticated TaskChute session to ask
   the Server for a short-lived Watch pairing grant bound to the Watch nonce.
4. Android transfers only that short-lived grant back to the Watch through the Wearable Data Layer.
5. Watch exchanges the grant + original nonce with the TaskChute Server and receives a **new,
   Watch-specific Better Auth session**.
6. Watch stores only its own opaque cookie jar and validates it on startup in the same
   server-authoritative style as D-106.

The Android phone's current long-lived session cookie must **never** be copied to the Watch.

The pairing grant is a bearer secret and must be:

- cryptographically random,
- single-use,
- valid for no more than 120 seconds,
- bound to the Watch-generated nonce,
- stored server-side only as a non-reversible digest / lookup identifier plus the minimum subject
  data needed for exchange,
- atomically consumed so concurrent exchanges cannot both succeed,
- excluded from logs, analytics, error text, and canonical docs.

The implementation should reuse the existing Better Auth 1.7.1 AUTH foundation, including the
existing verification/session persistence where safe. **No new AUTH or APP migration is approved
by D-154.** No new pairing secret is required or approved. If the exact installed Better Auth
surface cannot create a distinct session and set its cookie safely, or atomic single-use exchange
cannot be guaranteed without a new migration / unsupported security shortcut, implementation must
STOP and report the constraint instead of weakening this boundary.

Canonical auth endpoint semantics for this slice are:

- authenticated Android: `POST /api/auth/wear/pairing-grant`
- unauthenticated exchange with the one-time grant: `POST /api/auth/wear/pairing-exchange`

The first endpoint requires the existing valid phone session. The exchange endpoint does not accept
a client-provided TaskChute app-user id as authority. A successful exchange creates a separate Better
Auth session for the same authenticated physical user; normal TaskChute ownership continues to be
resolved server-side through the existing principal mapping.

The Watch stores its opaque session cookie jar under app-private no-backup storage encrypted by a
non-exportable Android Keystore AES-GCM key, following D-106. An authoritative `401` clears the
invalid Watch session. Network / 5xx ambiguity retains it for retry rather than falsely claiming
logout.

Wearable Data Layer is used for the phone/Watch pairing bridge only. Today content and lifecycle
state are fetched from the TaskChute Server directly. This preserves the Server as canonical
authority and lets an already-connected Watch use Wi-Fi / LTE without requiring an active phone
transport.

Current Google Wear OS guidance requires another authentication method for cases where mobile token
sharing is unavailable. That fallback is **not** silently invented in D-154; it is a Release-blocking
Open Question for a later Approved Decision.

## Today / execution scope

The v0.1 Watch surface is the current logical Day only. It does not add date navigation, bottom
navigation, Task edit, D&D, Notes, Daily, Routine settings, Project / Mode settings, offline mutation,
background realtime, Tile, Complication, Location capture, or Quick Start favorites.

### 01 Today / Idle

- Date label uses `YYYY-MM-DD(a)`, for example `2026-09-30(水)`, centered and compact.
- The list is grouped by existing canonical Sections.
- Section header is centered as `HH:MM - HH:MM  SectionName`; time uses secondary emphasis and the
  Section name uses primary emphasis.
- All Today tasks are vertically scrollable by Digital Crown / touch swipe rather than being limited
  to two rows.
- Planned Task row keeps the current Figma two-line information density:
  - left: projected start / connector / projected end,
  - main line: Task title,
  - second line: Material `hourglass_top` + estimate + Material `repeat` when Routine-derived,
  - right: Material `play_arrow` Start action.
- Section name is not duplicated inside the planned Task metadata.
- Completed history-row visual treatment is not defined by the approved v0.1 Figma target. D-154
  must not invent a new Completed row; completed history may be omitted from 01 until separately
  designed. The immediate completion transition is represented by 03 Complete / Next.

### Start

A Start tap transitions presentation to 02 Running immediately. The Watch does not show a separate
"Starting" screen. The mutation still uses the existing server-authoritative Start contract and then
silently reconciles to the canonical Day. Deterministic failure / network ambiguity exits the
optimistic Running presentation through the approved error/reconcile path.

### 02 Running

- Dedicated Running screen dominates the Watch while the current Day has an active Execution.
- `実行中` appears without a leading status dot.
- Task title has Material `fiber_manual_record` at the left, sized for visibility and using the same
  color as the Task title.
- elapsed uses Material `schedule`; remaining uses Material `hourglass_top`.
- elapsed and remaining use `HH:MM:SS` presentation and the current Figma uses 20sp time text.
- progress is estimate-based and follows D-134 semantics: clamp within estimate; missing/invalid
  estimate hides remaining/progress; overrun uses the existing overrun semantics.
- right-side time is **remaining**, not total estimate.
- Complete action uses Material `stop`.

### 03 Complete / Next

After successful completion, show the approved completion state:

- Material `check_circle`,
- `完了しました`,
- completed Task summary / actual duration,
- `次のTask`,
- next planned Task row with Start action when available.

### 04 Network error

Use the approved error state and retry action:

- Material `error`,
- `接続できません`,
- `Taskは変更されていません。\n通信を確認して再試行してください。`,
- `再試行`.

Do not claim that a mutation was not applied when its result is ambiguous. Ambiguous lifecycle
results must reconcile canonically before selecting safe copy/state.

## Visual semantics

Use Material 3 semantic color roles rather than hard-coded brand-like action colors:

- Start / connect: Primary Container + On Primary Container family.
- Complete / destructive execution action: Error Container + On Error Container family.
- Symbols use official Material Symbols rather than redrawn primitive shapes.

Exact tonal values may follow the active Wear Material 3 scheme; semantic role is the authority.

## Server / Domain boundary

D-154 adds no new TaskChute Domain identity, persisted Task semantics, ordering authority, or
lifecycle command. Current Day, Section, Entry, Execution, Routine-derived status, forecast,
estimate, Start, Complete, placement revision, and principal mapping remain existing Server
authorities.

The only new server capability is the bounded Wear pairing auth bridge described above. It must not
mutate APP_DB domain data and must not alter Web or Android session semantics.

## Verification boundary

Required evidence is impact-based and must distinguish:

- Wear module compile / unit tests,
- phone Data Layer bridge tests,
- Worker pairing grant / single-use / expiry / nonce-binding / session exchange tests,
- existing Android auth/session regression,
- current-Day parse / Section / forecast / Routine marker tests,
- Start optimistic transition / canonical reconcile / failure tests,
- Running elapsed / remaining / progress tests,
- Complete / next transition tests,
- Wear emulator runtime smoke when available,
- Pixel Watch physical-device verification by the Product Owner when available.

A phone-only Android emulator or compile PASS is not Pixel Watch verification. Production migration /
deploy, Release, fallback authentication, restore, destructive cleanup, branch creation, PR, merge,
tag, and Release are outside this work item.

## D-154C responsive Today / Running visual corrective — 2026-10-01

This implementation follow-up applies the approved Figma visual direction to the existing Wear
client without changing D-154 product, lifecycle, authentication, or server semantics:

- Translate the 454-unit Figma references (`561:33` Today/Idle, `561:52` Running,
  `561:87` Complete/Next, and `561:21` Planned row) using the measured Compose available width and
  height, capped at the reference scale. Planned rows retain the approximate `350 / 454` width
  ratio on normal displays, a flexible one-line Task title, projection/estimate/Routine context, and
  a 48dp accessible Start hit target whose visual control scales with the display.
- Keep `TransformingLazyColumn` and existing scrolling/Crown behavior. Date and Section labels,
  projection, metadata, and row geometry scale with the available round-screen size rather than
  treating Figma frame pixels as fixed Compose dp.
- Running uses the Figma horizontal 8-unit progress track and elapsed/remaining values aligned at
  opposite ends, without visible elapsed/remaining labels; the completion control is a circular
  icon-only Stop action with an accessible semantic label, followed by the Next Task card when
  present. D-134 estimate/progress/missing-estimate/overrun calculations and existing lifecycle
  command authority remain unchanged.
- Start and Stop retain Material 3 semantic action-color roles. No new dependency or server/API,
  shared-contract, schema, migration, authentication, realtime, or persistence behavior is added.

Source review, Wear JVM, Kotlin compile, instrumentation compile, assemble, and exact-SHA CI passed.
No Wear AVD profile or connected adb target was available, so this evidence does not claim runtime
or Figma screenshot verification. The Product Owner-reported D-154B paired Phone/Pixel Watch
functional smoke is functional-only and does not verify D-154C visual fidelity; D-154C physical
visual smoke remains `NOT_RUN / PRODUCT_OWNER_MANUAL`.
