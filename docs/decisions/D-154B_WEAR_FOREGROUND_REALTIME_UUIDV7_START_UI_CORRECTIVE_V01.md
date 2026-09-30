# D-154B — Wear foreground realtime, lifecycle UUIDv7, and Start UI corrective

Status: **Approved / Implemented / Integrated**

Date: 2026-10-01

Implementation: `88ba74170053711aba4d9c4cbcc0817c3b1b7f5d`

## Decision

The Wear companion consumes the existing version-1 invalidate-only realtime protocol while its
Today UI is foreground. On foreground entry/resume it immediately starts a canonical current-Day
refresh and enables the realtime connection. Day invalidations trigger a canonical HTTP reload;
bursts are coalesced, only one Today load is in flight at a time, and responses from an older
foreground/session generation cannot replace newer state. `onStop` closes the socket and clears
queued invalidations. Transient socket failures retain the Watch session and reconnect only while
foreground; an authoritative realtime `401` clears the Watch-specific session. There is no
background socket, polling, foreground service, or phone data proxy.

Realtime uses the existing `/api/v1/realtime` route and `X-TaskChute-Realtime-Client: android`
header. Authentication comes only from the Wear app's own cookie jar; the Phone cookie is never
copied. Normal Today reads and Start / Complete remain direct server HTTPS requests.

Wear Start `operation_id`, Start `execution_id`, and Complete `operation_id` use UUIDv7, matching
the existing lifecycle API contract. Start continues to send the canonical expected placement
revision, and Complete retains the canonical active execution identity. Worker validation and
domain behavior are unchanged.

The planned Task Start row follows Figma `561:21`: responsive full-width `82dp` card, dark `#202020`
surface, `#383838` 1dp border, 28dp radius, fixed 48dp circular Primary Container action with a
24dp official Material Symbols Rounded filled `play_arrow`, and a fixed 42dp projection slot. The
text region may ellipsize but cannot compress the action. The vector asset is sourced from the
official Google Material Symbols Rounded FILL=1 asset; existing project OkHttp 5.3.0 is reused.

## Verification boundary

Wear JVM, compile, instrumentation-APK compile, and debug assemble results are recorded in
`docs/TEST_MATRIX.md`. The local emulator could not start because its configured legacy HAXM
hypervisor is unsupported by the installed Android Emulator; therefore D-154B AVD execution,
live Watch realtime, and D-154B physical-device verification remain **NOT_RUN**. The earlier
D-154A API37 Espresso compatibility failure and D-154A authenticated grant-to-Today `NOT_RUN`
remain distinct historical evidence and are not promoted by this Decision.

No Worker/API/shared contract, schema, migration, or new networking framework is introduced.
Production remains `NOT_RUN`; Released remains `NO`.
