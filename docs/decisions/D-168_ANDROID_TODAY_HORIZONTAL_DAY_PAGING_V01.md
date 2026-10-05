# D-168 — Android Today Horizontal Day Paging v0.1

Status: **Approved / Implemented / Integrated / Verification partial**

Date: 2026-10-04

## Context

D-162 removed the visible previous-day / next-day arrow controls from Android Today and kept the centered full-date DatePicker affordance.

The Product Owner approved restoring convenient adjacent-day navigation through direct horizontal paging on the Today content surface, while preserving the existing Task-row swipe interactions approved by D-123 / D-124.

The intended UX separation is:

- adjacent one-day navigation → horizontal page swipe;
- arbitrary date navigation → existing DatePicker;
- Task-row horizontal swipe → existing Task actions / Selection Mode.

## Decision

### 1. Direction

Android Today uses conventional horizontal paging:

- swipe **left** → next logical Day;
- swipe **right** → previous logical Day.

The target is exactly one adjacent logical date per committed swipe.

### 2. Gesture ownership is determined by where the gesture begins

A horizontal gesture that begins on a Task row remains owned by the Task row and preserves existing behavior.

Task-row gestures remain authoritative:

- Right → Left / conventional left swipe → existing Task action surface under D-123 / D-124;
- Left → Right / conventional right swipe → existing Selection Mode entry where eligible under D-124;
- long-press / drag behavior remains unchanged.

A horizontal gesture that begins on the non-Task Today content surface is eligible for day paging.

Eligible paging start regions include:

- Section Header;
- blank vertical space between / around Task rows inside the Today content surface;
- empty Section body / empty Today body;
- other non-interactive background area of the Today scrollable content.

### 3. Interactive controls do not become paging surfaces

Do not steal horizontal gestures that begin on an explicit control or overlay.

At minimum, paging does not begin from:

- Task rows or their revealed action surfaces;
- Today header date / Display controls;
- footer navigation;
- FAB;
- Running Progress Player and its Complete control;
- modal / sheet / menu / picker surfaces;
- Selection Mode action controls;
- active drag session.

Section Header itself is intentionally a paging-enabled start region; its tap behavior for expand/collapse remains available.

### 4. Horizontal vs vertical arbitration

Today remains vertically scrollable.

A gesture should commit to horizontal paging only after normal touch-slop / directional arbitration establishes horizontal intent.

If vertical movement wins, preserve ordinary Today vertical scrolling and do not initiate page navigation.

Threshold, velocity, spring and damping constants are reversible implementation details and may be tuned without a new Product Decision as long as the approved gesture ownership and direction remain unchanged.

### 5. Direct-manipulation page animation

Paging should feel like moving between adjacent pages rather than triggering an abrupt date reload.

Approved presentation:

- current Today page follows the finger horizontally;
- the adjacent Day page / loading surface is revealed from the corresponding side;
- release past a reasonable distance/velocity threshold commits the date change and settles to the adjacent page;
- release below threshold returns the current page to its original position;
- committed swipe settles with a short horizontal slide/snap animation.

A literal 3D paper-curl effect is not required. A responsive horizontal pager / page-slide interaction satisfies the approved “page-turning” intent.

### 6. Date loading and authority

A committed page swipe uses the existing Day navigation/load authority and requests the adjacent logical date.

Do not create client-derived Day contents as canonical data.

While the adjacent Day is not yet available, the incoming page may use the existing loading presentation. Once loaded, canonical Day data replaces it.

Implementation may prefetch an adjacent Day if it is safe and bounded, but prefetch is not required by D-168 and must not alter canonical state or trigger writes.

### 7. Relationship to D-162

D-168 complements D-162.

Android Today keeps:

- no visible previous/next arrow buttons;
- full-date center control;
- DatePicker for arbitrary-date navigation;
- Display control.

D-168 does not restore the removed header arrows.

Daily is unchanged and retains its existing header navigation behavior.

### 8. Open Task swipe state

If a Task-row action surface is already open and the user begins a paging gesture from an eligible non-Task region:

- the Task-row swipe surface may close as part of returning Today to a neutral interaction state;
- the same gesture may continue into day paging only if gesture arbitration can do so without triggering the Task row action.

Do not let an open row surface cause a Task action to fire from a paging gesture.

Exact dismissal mechanics are delegated, but accidental action execution is prohibited.

### 9. Selection Mode

While Selection Mode is active, preserve existing selection semantics and action controls.

A page swipe must not silently carry a bulk selection to another Day.

Preferred behavior is to disable day paging while Selection Mode is active unless the implementation can first exit Selection Mode safely without committing any selection action.

Do not persist or transfer selected Entry identities across Day navigation.

### 10. Scope

D-168 is Android Today presentation/navigation only.

It does not change:

- Day domain semantics;
- Task/Entry lifecycle;
- Task-row swipe commands;
- selection eligibility;
- D&D semantics;
- Worker/API contracts;
- schema/migrations;
- Web Today;
- Daily navigation;
- production/release state.

## Verification target

Future implementation should verify at minimum:

1. blank Today content left swipe → next Day;
2. blank Today content right swipe → previous Day;
3. Section Header left/right swipe pages the Day while tap still expands/collapses;
4. Task-row left swipe still opens existing Task actions and does not change Day;
5. Task-row right swipe still enters Selection Mode where eligible and does not change Day;
6. Task-row long-press D&D remains intact;
7. vertical scroll from Section Header/blank content does not accidentally page;
8. below-threshold horizontal drag springs back without date change;
9. committed drag animates current/adjacent page horizontally;
10. DatePicker still jumps to arbitrary date;
11. header arrows remain absent;
12. footer/FAB/Running Player interactions do not trigger paging;
13. Selection Mode does not carry selection identities into another Day;
14. empty Day can still page in both directions;
15. navigation uses canonical adjacent-Day load and creates no mutation.

## Implementation and verification closeout — 2026-10-05

Implementation `844bd1982420a6cae93b031d8bec070aa593f7d7` is integrated on `main`. Android Today now arbitrates horizontal intent after touch slop, keeps vertical intent passive, excludes Task-row surfaces (including their translated revealed-action surface), follows the finger, snaps back below threshold, and settles a committed swipe before using the existing `loadLogicalDate(...)` authority for exactly one adjacent date. Selection Mode, active D&D, header controls, bottom overlays, and non-content load states block paging. The existing D-148 parent pointer observer and Task-row command semantics remain in place.

Focused gesture JVM tests pass `3 / 3`; the full Android app JVM suite passes `373 / 373`. Focused `TaskChute_API33` AVD cases passed for Section Header left/right and tap collapse, vertical and below-threshold gestures, empty Day left/right, Selection Mode, Running Player/FAB/footer protection, row left/right swipe regression, paging while row actions are open, and long-press D&D. The one-time full Today surface run is **PARTIAL**: 62 of 85 tests started, 58 passed and 4 failed; the emulator package manager/transport then became unavailable and 23 tests did not run. The open-row-action paging case passed in isolation but its full-suite Activity teardown timed out. See `docs/TEST_MATRIX.md` for the failure names and evidence boundary. Do not treat the full Today surface as passing.

App Kotlin compile, AndroidTest Kotlin compile, `packageDebug`, `packageDebugAndroidTest`, `git diff --check`, and exact-SHA CI pass. CI verifies Android JVM, signed Phone/Wear builds, instrumentation APK compilation and signing, and uploads a fresh signed Phone APK; Web/Worker verification is skipped under the Android-only impact classification. No Worker/API/shared contract, schema/migration, dependency, Web Today, Wear, Daily, production, or release change was made. Galaxy S23 remains `NOT_RUN / PRODUCT_OWNER_MANUAL`; Production `NOT_RUN`; Released `NO`.

## Corrective closeout — D-168A fixed header and fast adjacent-Day paging — 2026-10-05

Implementation `c59ae87` keeps the Today header, centered date picker, and `表示` control fixed while only the content below the header follows the swipe. The committed target date is reflected in the fixed header; cold loading and retry stay below it. The old layout translated the header with the page, and target loading began only after the settle animation. The corrective starts a bounded read when horizontal intent is established, caches up to three canonical Days in controller-local memory, displays a warm target immediately while revalidating, and protects selected Day state with request/session generations. Sign-out/session change and controller close clear the cache. No persistent cache or write path was added.

The full Android app JVM suite passes `379 / 379`; app Kotlin compile, AndroidTest Kotlin compile, debug APK assembly, and `git diff --check` pass. UI instrumentation compiles, but UI runtime and numerical before/after cold/warm timing are **NOT_RUN**: there is no connected ADB device and the only configured AVD is `D173B_Wear_API37`, which is not a compatible Phone Today test target. The instrumentation includes local timing hooks for a future compatible Phone AVD/device run; no timing result is claimed here. Exact-SHA CI [`37322578898`](https://github.com/hedgetheapp/taskchute-platform/actions/runs/37322578898) passes; signed Phone artifact `taskchute-android-debug-c59ae871ab7c1610517881f5ae760c7071b492af` (ID `11351285351`) expires `2026-10-12T14:13:19Z`. Galaxy S23 remains `NOT_RUN / PRODUCT_OWNER_MANUAL`. D-170 is only partially implemented by this Today paging slice; Notes/Daily remain untouched. Production `NOT_RUN`; Released `NO`.
