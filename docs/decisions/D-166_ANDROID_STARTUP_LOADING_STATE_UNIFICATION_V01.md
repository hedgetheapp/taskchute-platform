# D-166 — Android Startup Loading State Unification v0.1

Status: **Approved / Implemented / Integrated / Automated verification PASS / Galaxy S23 NOT_RUN**

Date: 2026-10-04

## Context

The Product Owner reported that Android startup currently exposes two internal phases:

1. an authentication-restore message such as `認証状態を確認しています…`;
2. then Today `読み込み中`.

The first phase uses a separate app-level loading UI, so its position/styling differs from the Today loading state. This causes a visible jump and exposes an implementation detail that is not useful to the user.

Current source confirms:

- `AuthUiState.Restoring` renders a separate `Centered("認証状態を確認しています…", true)` path in `MainActivity`;
- after session restore succeeds, Today renders `LoadingToday()`;
- `TodayLoadStatus.AUTH_REQUIRED` also exposes `認証状態を確認しています…`.

## Decision

### 1. Startup presents one generic loading state

While Android is performing non-interactive startup work required to reach the user's destination, including restoring the existing session and loading Today, the user sees only the standard centered loading presentation:

- spinner centered using the same geometry/style as Today `LoadingToday()`;
- label: `読み込み中`.

Do not expose `認証状態を確認しています…` during ordinary startup.

### 2. No visible auth-phase transition

Successful startup should visually behave as one continuous loading state:

`読み込み中 → Today content`

not:

`認証状態を確認しています → 読み込み中 → Today content`.

The auth restore and Today load remain separate internal operations; D-166 changes only their user-visible presentation.

### 3. Auth-required reconciliation uses the same generic loading presentation

When an already-running Android session temporarily enters the existing non-interactive `AUTH_REQUIRED` reconciliation path and the app is automatically rechecking/restoring authentication, use the same generic centered `読み込み中` presentation rather than exposing auth-internal wording.

### 4. Real user-action states remain explicit

D-166 does not hide states that require user action.

Keep explicit UI for:

- Signed out → login form
- Sign-in submission → existing sign-in UI/progress
- Sign-out → sign-out progress if still needed
- authentication/network failure that requires retry → error/retry UI
- expired/invalid session that resolves to SignedOut → login form

The generic loading state must not mask an actionable failure indefinitely.

### 5. Prefer one shared loading composable

Implementation should avoid two visually separate loading implementations for app-level auth restore and Today initial loading.

Prefer a shared Android full-screen loading presentation or an equivalent reuse that guarantees matching:

- position
- spinner size/style
- spacing
- text
- color

Exact internal component organization is delegated.

## Scope boundary

D-166 changes presentation only.

It does not change:

- Better Auth/session authority
- authentication request ordering
- Today API loading order
- retry behavior
- realtime behavior
- persisted state
- schema/migrations
- backend API
- production/release state

## Verification target

Verification target (the items below are implementation checks; unrun device/session evidence remains explicitly pending):

1. cold start with valid saved session shows centered `読み込み中` immediately;
2. no `認証状態を確認しています…` text is rendered during successful startup;
3. transition from auth restore to Today load does not visibly jump between layouts;
4. Today content appears after successful load;
5. expired/invalid session still reaches login UI;
6. transient auth/network failure still reaches the existing retry/error behavior;
7. existing Today loading-state tests are updated without weakening auth-state coverage.

## Implementation evidence — 2026-10-04

Implementation `16f7ae45eeb4cdbde7ca277b9d48aa3c698f944e` introduces one shared full-screen loading presentation for app-level `AuthUiState.Restoring` and Today `LOADING` / non-interactive `AUTH_REQUIRED`. Focused JVM coverage: `LoadingPresentationTest` `3 / 3 PASS`; focused `TaskChute_API33` instrumentation: `LoadingPresentationInstrumentedTest` `1 / 1 PASS`. `:app:compileDebugKotlin`, `:app:compileDebugAndroidTestKotlin`, and `:app:assembleDebug` PASS. Exact-SHA CI run [`37204798119`](https://github.com/hedgetheapp/taskchute-platform/actions/runs/37204798119), attempt 3, PASS; the first two attempts failed only the unchanged `TodayDirectManipulationTest.deterministicFailureDismissalIsGenerationSafe`, which passed in isolated local execution (`1 / 1`). Phone APK artifact `11304062667` was generated.

AVD MainActivity smoke launched successfully and reached the explicit unauthenticated/configuration screen because no base URL or authentication fixture was configured; no credentials were obtained. The target app remained alive and no TaskChute crash was present. A valid-saved-session cold-start transition and Galaxy S23 verification remain `NOT_RUN`. Production `NOT_RUN`; Released `NO`. No authentication/session/request-ordering, backend/API, persistence, schema/migration, dependency, or production behavior changed.
