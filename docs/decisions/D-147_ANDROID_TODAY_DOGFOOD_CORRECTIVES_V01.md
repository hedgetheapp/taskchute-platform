# D-147 — Android Today Dogfood Correctives v0.1

Status: **Approved — A/C/D/E/F/G/H/I implemented; B deferred by Product Owner**

Date: 2026-09-26

## Context

Galaxy S23 dogfooding after D-138 identified a set of Android Today gaps and presentation mismatches. Most are narrow parity/corrective work on top of D-081, D-112, D-120, D-124, D-126, D-127, D-129, D-132, and D-138.

This Decision collects the Product Owner-approved Today changes so they can be implemented as one Android Large Batch while preserving server authority and existing historical/lifecycle semantics.

## Decision

### 1. Routine metadata icon accent

On Android Today, a Routine-derived Task row uses the existing repeat icon but renders that repeat icon with the canonical blue/accent treatment for Planned, Running, and Completed states.

- ordinary Task repeat/metadata visuals remain unchanged;
- Project / Mode text and other metadata icons remain unchanged;
- icon asset, geometry, and row layout are unchanged.

This is presentation-only.

### 2. Manual minute-granularity actual-start adjacency

Android actual-time input is minute-granularity (`HH:mm`), while canonical Execution instants may contain seconds.

When a user enters manual actual start minute `M`, and the only reason the requested minute-start instant overlaps an earlier finished Execution is that the earlier Execution ends later within the same displayed minute `M`, the system may use the exact latest blocking `ended_at` instant as the effective canonical start.

Example:

- prior canonical end: `18:16:01`
- manual Android start input: `18:16`
- effective persisted start may be `18:16:01`

Safety rules:

- the snap may only remain inside the same displayed minute entered by the user;
- an active/open prior Execution still rejects;
- any remaining overlap with any Execution still rejects;
- if an entered end exists and the snapped start would exceed that end, reject;
- Day interval membership must remain valid;
- no existing Execution is shifted, truncated, or otherwise mutated;
- automatic Start timestamps are unchanged;
- exact-instant callers must not be silently reinterpreted as minute-granularity input.

Implementation may add an explicit backward-compatible precision/source marker to the existing request if required. It must not use an unsafe heuristic that changes arbitrary exact-instant callers. If the existing boundary cannot distinguish minute UI input safely without a compatibility-significant API change, STOP and report.

### 3. Routine occurrence delete and actual-time parity

For a **planned Routine-derived occurrence** shown on Android Today:

- `その他 → 削除` deletes/suppresses that occurrence for that Day only;
- the RoutineDefinition is not deleted or disabled;
- future/other occurrences are unchanged;
- reload/ensure must not regenerate the suppressed occurrence.

Use the existing occurrence suppression/skip semantics rather than physical RoutineDefinition deletion.

For current-Day Routine-derived occurrence actual-time editing, Android provides the same supported lifecycle correction surface as the equivalent ordinary row where canonical commands already allow it:

- Planned + actual start only -> Running;
- Planned + actual start + end -> Completed;
- Running start correction and end input -> Completed;
- Completed start/end correction remains available.

D-147 does **not** approve a new meaning for deleting Running or Completed Routine-derived history. If current canonical behavior does not already define that exact deletion safely, leave that action unavailable and do not invent semantics.

### 4. Routine occurrence D&D parity

A planning-eligible Planned Routine-derived occurrence on Android Today can be reordered/moved with the same Today D&D interaction as other planning-eligible rows.

- same-Section reorder is allowed;
- cross-Section move is allowed;
- the change is occurrence-only for that logical Day;
- RoutineDefinition defaults, recurrence, and unrelated future occurrences do not change;
- Running / Completed Routine-derived rows are not draggable;
- Past remains non-placement-editable except for the narrow forward day move in section 8;
- D-129 ended-Section destination restrictions remain;
- use the existing occurrence-aware canonical placement command/path; do not weaken ordinary `MoveEntry` guards.

### 5. Quick Add immediate canonical-position presentation

D-127 optimistic presentation is corrected so a newly-created provisional Task appears immediately at the position that the current canonical Day ordering rules predict, rather than flashing at the Section tail and moving after reconciliation.

The optimistic projection must respect the current display-order contract, including:

- execution/history rows before planned rows where applicable;
- planned ordering by the canonical planned-start/manual-order rules;
- stable provisional identity;
- server response remains authority;
- canonical reconcile must not create a second visible reorder when the optimistic prediction was correct;
- failure/conflict/ambiguity follows existing D-125/D-127 rollback/reconcile rules.

### 6. Start immediate actual-Section / execution-first presentation

When the user starts a Task, Android applies D-127 optimistic presentation immediately:

- the row becomes Running immediately;
- Android resolves the presentation actual Section from the actual-start instant using the selected Day's canonical frozen context;
- the row moves to that presentation Section immediately when required;
- execution-first ordering is applied immediately;
- successful canonical reconcile should not cause a second visible jump;
- rejection/ambiguity safely clears or reconciles the optimistic overlay.

Worker/API authority from D-081 remains canonical. Android does not persist its local Section guess as independent authority.

### 7. Routine planned-start crossing Section boundary

When editing a Routine-derived occurrence's planned start, Android keeps the Section/planned-start pair synchronized to that Day's frozen Section context.

Changing only the time across a Section boundary, for example `11:00` in 午前 to `13:00` in 午後, must submit/produce the corresponding target Section instead of sending the stale prior Section with the new time.

- change is occurrence-only;
- RoutineDefinition/future defaults are unchanged;
- D-129 ended-Section restrictions remain;
- existing server atomic validation remains authoritative.

This is a D-138 corrective, not a new Section model.

### 8. Past Planned Task forward day move

Android Past Day remains historical/read-only by default, with one narrow exception:

An **established past Day's eligible Planned Task** may be moved forward to the server-resolved current logical Day or a future logical Day.

Purpose: recover work that was planned yesterday/earlier but not executed.

Rules:

- source must already exist on an established past Day;
- source Entry must be Planned and satisfy the existing canonical `BulkMoveEntriesToDay` safety guards, including no Execution history;
- target may be current or future, never another past date;
- Android exposes at least `今日へ移動` and `日付を移動` for an eligible past row;
- moving forward removes the Entry from the past Day and places it through the existing canonical target-Day placement semantics;
- past Task edit, Start/Complete, Section/estimate/planned-start edit, reorder/D&D, duplicate, and delete remain read-only unless separately approved;
- no past Day is backfilled or created to support this action;
- Execution/historical facts are never moved or rewritten.

Initial Android eligibility is **ordinary Planned Entry**. D-147 does not broaden past Routine-derived occurrence day-move eligibility. Routine carry-forward can be decided separately if needed.

This narrowly supersedes D-126 section "Past remains read-only" and D-042 only for forward day movement of an existing eligible Planned Entry. Historical context/facts otherwise remain frozen.

### 9. Today Add FAB temporary movement

Implement the Today portion of D-146 section 10 now.

The existing Today Add FAB keeps its current add eligibility and visual semantics, but can be dragged temporarily within safe content bounds to uncover underlying Task controls.

- normal tap opens existing Quick Add;
- drag does not trigger Quick Add;
- offset is memory-only and not persisted/synced;
- leaving/recreating the Today surface restores the default bottom-right position;
- FAB stays outside bottom navigation/system inset areas;
- Selection Mode visibility rules remain unchanged.

Notes-side D-146 implementation remains deferred.

## Compatibility / supersession

Preserve all unchanged semantics from:

- D-056 Day Operations;
- D-081 actual-Section Start / execution-first projection;
- D-112 Android day operations;
- D-120 occurrence-aware placement;
- D-124 Selection/Swipe;
- D-126 Future planning;
- D-127 optimistic presentation;
- D-129 ended-Section placement guard;
- D-132 SetExecutionTimes actual-Section parity;
- D-138 Android Today Planning/Lifecycle refinements.

D-147 narrowly supersedes:

- D-126/D-042 Android Past read-only boundary only for section 8 forward day movement;
- D-127 presentation behavior where Quick Add/Start currently causes a second visible canonical jump;
- D-138 Android occurrence editor behavior where a planned-start change can retain a stale Section;
- current Android Routine-derived drag/delete UI restrictions only to the exact Planned occurrence cases described above.

## Non-goals

This Decision does not approve:

- schema/migration;
- new persistence authority;
- new lifecycle state;
- offline queue/sync;
- automatic mutation of prior Execution facts;
- Running/Completed Routine-derived delete semantics not already canonical;
- past Routine-derived carry-forward;
- production operation or Release;
- D-145 fixed-start/reminder implementation;
- D-146 Notes implementation.

## Verification contract

Implementation must include focused coverage for at least:

- Routine accent icon presentation;
- same-minute manual actual-start adjacency and all rejection guards;
- planned Routine occurrence delete/suppression and no regeneration;
- Routine actual-time lifecycle parity;
- Routine same/cross-Section D&D occurrence-only behavior and D-129 rejection;
- Quick Add immediate predicted ordering without tail flash;
- Start immediate Running/actual-Section/execution-first optimistic presentation plus rollback;
- Routine planned-start crossing Section boundary;
- established Past ordinary Planned -> current and -> future forward move, plus rejection for execution history/running/completed/past target;
- movable Today Add FAB tap-vs-drag, safe bounds, reset, and Selection Mode visibility.

Because section 2 may affect the shared Worker/API boundary, run focused Worker tests plus affected Android JVM tests and Android Today runtime verification. Use cross-surface verification if shared contracts/Worker behavior change. Persistent nonprod feature verification is required for any Worker/API behavior change within the approved scope. Galaxy S23 remains Product Owner manual evidence until performed.

Production and Release remain NOT_RUN / NO.

## D-147A implementation checkpoint — 2026-09-26

D-147Aの独立項目A/C/D/E/F/G/H/Iを実装した。Routine repeat icon accent、Routine occurrence-only delete、既存occurrence endpointを使うplanned Routine D&D、Quick Addのcanonical ordering、Startのactual-Section / execution-first optimistic projection、Routine planned-start Section同期、established past planned ordinary Taskのcurrent/future forward move、Today Add FABのmemory-only temporary dragを対象とする。D-147(B)のmanual minute-granularity actual-start adjacency correctionはProduct Owner承認により完全保留であり、実装しない。

Implementation commit: b8a84a99a69a0a90f9791217abe1d5fbf145e260
Focused Android JVM: PASS
:app:compileDebugAndroidTestKotlin: PASS
:app:assembleDebug: PASS
D-147A representative Today AVD cases: 5 / 5 PASS（collapsed Section drop、swipe / Selection、long-press D&D、future planning、Quick Add FAB）
Today full surface: 35 / 44 PASS、既存fixture由来の9件を含むPARTIAL。MainActivity起動、APK install、crash bufferはPASS。
Exact-SHA CI: run 36248977313 PASS。APK artifact taskchute-android-debug-b8a84a99a69a0a90f9791217abe1d5fbf145e260 / ID 10908412479。
Worker/API/shared contract、input_precision、schema、migration、dependency、nonprod、production、Releaseは変更・実施していない。Galaxy S23はNOT_RUN / PRODUCT_OWNER_MANUAL。
