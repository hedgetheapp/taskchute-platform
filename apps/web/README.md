# TaskChute Web runtime bootstrap slice

This package is the first production-shaped React SPA + Cloudflare Worker slice. It uses two local D1 bindings:

- `AUTH_DB`: Better Auth 1.7.1 physical auth/session schema
- `APP_DB`: stable TaskChute identity, settings, Projects, Sections, TaskChuteDays, Tasks, Entries, and operation outcomes

## Local setup

1. Run `npm install`.
2. Copy `.dev.vars.example` to `.dev.vars`. Generate independent high-entropy values for `BETTER_AUTH_SECRET` (at least 32 characters) and `BOOTSTRAP_TOKEN`. Do not commit or print them.
3. Run `npm run migrate:auth:local` and `npm run migrate:app:local`.
4. Run `npm run dev`.
5. In another terminal run `npm run bootstrap:local`. Password and bootstrap token are read from hidden TTY input, not command-line arguments.
6. Open the local URL and log in.

Public email signup remains disabled in the request-facing Better Auth instance. The internal bootstrap endpoint is indistinguishable from a missing route unless `BOOTSTRAP_TOKEN` is configured and presented. Do not expose a locally configured bootstrap endpoint to an untrusted network.

Before any remote or production deployment, review the bootstrap route's exposure and lifecycle explicitly. Require an intentional bootstrap mode or remove the bootstrap secret after initialization; this local-only slice does not define that deployment policy.

## Partial-failure recovery

`AUTH_DB` and `APP_DB` are deliberately not treated as one transaction. If the Better Auth user is created but APP initialization fails, correct the APP migration/configuration issue and rerun the same bootstrap input. The flow recovers the existing Better Auth subject by email and retries the atomic APP batch. If APP initialization already committed and the response was lost, rerun returns the existing stable `app_user_id` without duplicating Sections or settings.

If a different auth user already exists, bootstrap rejects instead of guessing or taking ownership. Recovery never requires public signup to be enabled.

## Local verification

```text
npm run types
npm run typecheck
npm run test:all
npm run build
```

No remote database, deployment, or production migration is part of this slice.

The current local workerd runtime does not expose native `Temporal`. Timezone and DST resolution therefore uses `@js-temporal/polyfill` only behind the narrow `worker/domain/taskchute-day.ts` adapter; Domain identity and persistence remain plain strings/numbers.
