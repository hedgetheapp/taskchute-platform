# TaskChute Web runtime bootstrap slice

This package is the first production-shaped React SPA + Cloudflare Worker slice. It uses two local D1 bindings:

- `AUTH_DB`: Better Auth 1.7.1 physical auth/session schema
- `APP_DB`: stable TaskChute identity, settings, Projects, Sections, TaskChuteDays, Tasks, Entries, and operation outcomes

## Local setup

1. Run `npm install`.
2. Copy `.dev.vars.example` to `.dev.vars`. Generate independent high-entropy values for `BETTER_AUTH_SECRET` (at least 32 characters) and `BOOTSTRAP_TOKEN`. Do not commit or print them. Keep `BOOTSTRAP_ENABLED=false` during ordinary runtime.
3. Run `npm run migrate:auth:local` and `npm run migrate:app:local`.
4. Run `npm run dev`.
5. Temporarily set `BOOTSTRAP_ENABLED=true` (exact lowercase value), restart the local Worker, and in another terminal run `npm run bootstrap:local`. Password and bootstrap token are read from hidden TTY input, not command-line arguments.
6. After bootstrap succeeds, set `BOOTSTRAP_ENABLED=false`, remove or rotate `BOOTSTRAP_TOKEN`, and restart the Worker before ordinary use.
7. Open the local URL and log in.

Public email signup remains disabled in the request-facing Better Auth instance. The internal bootstrap endpoint has the same 404 posture as an unavailable route unless `BOOTSTRAP_ENABLED` is exactly `true`; when enabled, a configured and correctly presented `BOOTSTRAP_TOKEN` remains mandatory. Missing, empty, `false`, and malformed mode values are disabled. Do not expose an enabled bootstrap endpoint to an untrusted network.

Cloudflare Access is optional and is not required by this initial posture. The persistent non-production deployment, initial bootstrap, and pre-B1 runtime verification were performed on 2026-08-22. B1-specific persistent non-production verification is still `NOT_RUN`. Production deployment and production verification remain separately unverified and unauthorized unless explicitly approved.

## Persistent non-production configuration

`wrangler.jsonc` contains a named `nonprod` environment. Selecting it produces the Worker name `taskchute-web-nonprod`, binds `AUTH_DB` and `APP_DB` to the non-production logical names, sets `RUNTIME_ENV=nonprod`, and keeps `BOOTSTRAP_ENABLED=false`.

The tracked `env.nonprod` bindings are the current persistent non-production D1 resources established under D-024:

- `AUTH_DB`: `taskchute-auth-nonprod` / `60085f8d-0c4e-4c15-98e9-3ce178398041`
- `APP_DB`: `taskchute-app-nonprod` / `6ad7e35f-5d03-4be3-9b00-46cd713a51c3`

These IDs are not sentinels and must not be guessed, casually replaced, or pointed at local or production resources. Replacing or recreating either D1 resource requires explicit authorization and a corresponding canonical-state update. Production resources must remain separate. Never commit a secret or private data.

Cloudflare environment selection happens at Vite build time. In PowerShell, build and inspect the non-production output with:

```powershell
$env:CLOUDFLARE_ENV = "nonprod"
npm run build
Remove-Item Env:CLOUDFLARE_ENV
Get-Content -Raw dist/taskchute_web/wrangler.json
```

The generated `dist/taskchute_web/wrangler.json` is the deployment input. Do not try to change the environment later with `wrangler deploy --env nonprod`; rebuild with `CLOUDFLARE_ENV=nonprod` instead. A credential-free local dry run can be performed with:

```text
npx wrangler deploy --config dist/taskchute_web/wrangler.json --dry-run --outdir .wrangler/nonprod-dry-run
```

Environment-specific binding types can be checked without replacing the tracked local types:

```text
npx wrangler types --env nonprod .wrangler/nonprod-worker-configuration.d.ts
```

The persistent non-production initial user is already provisioned. Normal verification, including B1 verification, must keep `BOOTSTRAP_ENABLED=false`; do not repeat bootstrap or recreate, replace, or rotate a bootstrap token merely to run verification. If a future recovery or reprovisioning task explicitly authorizes bootstrap, follow D-023 in order: deploy nonprod with bootstrap disabled; configure the authorized remote secrets; temporarily change only the nonprod `BOOTSTRAP_ENABLED` value to exact `true` and rebuild/deploy; run `npm run bootstrap:local` and enter the deployed HTTPS base URL; immediately restore `false`, rebuild/deploy, and remove or rotate the bootstrap token. Do not commit the temporary enabled state. Remote operations require explicit user approval for the specific scope being executed. Multiple operations may be approved together only when explicitly included in the same approved scope.

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

These local verification commands do not perform remote database, deployment, or production migration operations. Persistent non-production remote operations are a separate procedure and require explicit approval for the specific write scope; running the local commands does not authorize remote writes.

The current local workerd runtime does not expose native `Temporal`. Timezone and DST resolution therefore uses `@js-temporal/polyfill` only behind the narrow `worker/domain/taskchute-day.ts` adapter; Domain identity and persistence remain plain strings/numbers.
