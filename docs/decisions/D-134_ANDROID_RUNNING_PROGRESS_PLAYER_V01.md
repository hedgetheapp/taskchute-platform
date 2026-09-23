# D-134 — Android Running Progress Player v0.1

Status: **Approved**

## Decision

On the current logical Day only, replace the Android `RunningTaskPanel` with a
104dp progress player that presents the active task, elapsed time, remaining
time, estimate progress, and the existing Complete command in one compact
surface. The panel is display-only apart from the existing Complete action;
its once-per-second ticker never writes or changes execution semantics.

The panel uses the active execution start (`activeStartedAt`, falling back to
`firstStartedAt`) for elapsed display. Progress is clamped to the estimate;
when elapsed time exceeds a positive estimate, the track and knob use the
approved overrun accent and show the overrun duration. Missing or invalid
start time shows `--:--:--`. Missing, zero, or invalid estimate keeps elapsed
display available but hides remaining time and progress.

The current-day panel remains the only surface changed by this decision.
Future Day continues to hide execution controls and `RunningTaskPanel`, Past
Day remains read-only, and the existing Complete command, execution facts,
Worker/API contracts, persistence, schema, migration, realtime protocol, and
dependencies are unchanged.

## Visual contract

- full-width panel within the existing 12dp horizontal margins
- height 104dp, `RunningSurface` background, 22dp corner radius
- no visible `実行中` label
- one-line 16sp Medium task title
- 40dp light circular stop-style Complete action using the existing command
- 6dp progress track with 10dp knob and `AccentBlue` fill
- overrun fill/knob `#EBA44E`
- elapsed and remaining values use total `HH:MM:SS` formatting without a
  24-hour wrap

Figma visual reference: `UbTJH6ykYNBQJS4Wvwz9jb`, page `Running Progress`
(`481:2`), section (`485:2`), example (`502:17`). Figma remains visual
reference; Product / Domain authority remains the canonical repository docs.

## Boundary

This is Android presentation-only. No Worker/API, shared contract, domain,
schema, migration, persistence authority, realtime protocol, or dependency
change is approved by D-134. Galaxy S23 requires Product Owner manual smoke;
Production remains `NOT_RUN` and Released remains `NO`.
