# D-155 — Android Task Reminders v0.1

Status: **Approved**

Date: 2026-10-01

## Context

Android Today can plan and execute Tasks, but it has no per-Entry reminder intent. This Decision adds optional local Android notifications backed by canonical Entry fields. Reminder intent remains server-owned; alarm registration and delivery bookkeeping are device-local implementation state.

## Approved scope

Each ordinary TaskChuteDay Entry may carry two independent reminder settings:

- `start_reminder_offset_minutes`: `null` disables the start reminder; otherwise one of `0`, `5`, `10`, `15`, `30`, or `60` minutes before its planned start.
- `notify_on_estimate_overrun`: boolean, default `false`.

These settings belong to a Day Entry/materialized occurrence. They do not define fixed-start status, do not change Start Forecast, and do not propagate to Routine Definitions or later Routine occurrences. Newly materialized Routine occurrences default to both reminders off unless the user explicitly configures that materialized Entry. Existing Entries remain off after the additive migration.

Start reminder scheduling uses the established Day's logical date, timezone, and `planned_start_minute`. It is not based on forecast. No notification is scheduled when the start reminder is disabled, there is no planned start, the Entry is already Running/Completed, or the scheduled instant is already past on first canonical scheduling. An enabled start reminder requires a planned start.

Estimate-overrun scheduling applies only while the Entry is Running and has a positive estimate. Its trigger is the active Execution's canonical `started_at` plus the effective Entry estimate. If canonical Running state is loaded after the threshold and this device has not already delivered for that Execution, the notification may be delivered once. A later estimate/start change reschedules; Complete, Delete, and Move cancel stale local alarms. Execution rows gain no estimate snapshot.

## Android delivery and permissions

Android uses `SCHEDULE_EXACT_ALARM` (not `USE_EXACT_ALARM`) with `AlarmManager.setExactAndAllowWhileIdle`; it never silently falls back to an inexact alarm. Android 13+ runtime `POST_NOTIFICATIONS` permission is requested contextually. If either permission is unavailable, canonical intent is preserved, old local alarms are not left active, and the UI presents an actionable explanation/settings path. Granting permission and foreground/resume reconciliation restores eligible alarms.

Notifications use the normal Android notification channel and bridge to a paired Wear OS device only through the standard Android notification path. The app does not mark them local-only and adds no Watch-native scheduler, Data Layer notification transport, foreground service, or full-screen intent. Tapping a notification opens the existing Android Today entry point and performs no Task mutation.

Alarm intents and their minimal local registry are keyed to canonical Entry/Execution identity. Device-local state may contain only the alarm registry and per-Execution delivery marker needed for reboot/process-death restoration and duplicate suppression; it is not an offline Task authority and stores no credentials or secrets. Built-in receivers restore after reboot/package replacement and exact-alarm permission changes. Scheduling occurs only from canonical loaded/reconciled Day state, never from optimistic presentation or an ambiguous mutation result.

## Persistence and API

The two Entry fields are added through one additive APP migration. Existing `AddTaskToDay` and `UpdateTaskMetadata` contracts gain optional backwards-compatible fields; omission preserves old-client behavior. No new route or command family is introduced. Create persists estimate and reminder intent atomically with the new Entry. Update validates allowed offset, enabled start reminder's planned-start requirement, and enabled overrun's positive-estimate requirement before writing. Reminder mutation is restricted to eligible current/future planned Entries and current Running Entries according to the existing Today edit boundary; Routine settings are occurrence-only and do not modify Routine Definition defaults. Completed and past Entries cannot be newly configured.

The canonical result is reconciled before local alarm scheduling changes. Exact-operation replay remains governed by the existing operation identity/fingerprint boundary. No Execution mutation, placement-revision change, forecast semantic change, new background framework, or external push service is introduced.

## Relationship to D-145

D-145 fixed-start anchors and plan-conflict semantics remain separate and are not implemented or redefined here. These optional reminders do not make an Entry fixed-start and do not reserve a forecast position. This Decision approves the narrow notification permission, exact-alarm, Entry persistence, and ordinary Android/Wear notification-bridge work required for D-155 only; it does not generally resolve D-145's previously open implementation boundaries.

## Non-goals

- Routine Definition reminder defaults or propagation to future occurrences.
- Fixed-start anchors, forecast barriers, or plan-conflict presentation.
- Inexact fallback, foreground service, full-screen notification, push service, or Watch-native scheduling.
- Web reminder UI, production deployment, Release, schema changes beyond the additive Entry migration, or dependencies.
