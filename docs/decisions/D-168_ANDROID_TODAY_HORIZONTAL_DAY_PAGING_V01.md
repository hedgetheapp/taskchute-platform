# D-168 — Android Today Horizontal Day Paging v0.1

Status: **Approved / Not implemented**

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

Until implemented and tested, this remains **Approved / Not implemented / Not verified**.
