# D1 Feasibility Spike Evidence

Date: 2026-08-22 JST (machine evidence timestamps are UTC)

Repository baseline:

- branch: `docs/core-domain-foundations`
- HEAD: `a1efecaa92836f350bf5a30f376bc7f3c80745c1`
- canonical docs were not modified

## Environments

### Local

- Wrangler local D1 / workerd
- Worker: local `wrangler dev --local`
- D1 binding: local simulation with the same D1 implementation used by Wrangler
- command: `npm run test:local`
- final process exit code: `0`

### Remote

- temporary APAC D1 database dedicated to this spike
- Worker: Wrangler temporary remote-development preview (`wrangler dev --remote`)
- no permanent Worker deployment
- command: `npm run test:remote`
- final process exit code: `0`
- temporary D1 database deleted after the evidence run; deletion and absence were verified
- no existing database was modified

An earlier diagnostic run with a locally executing Worker and a `remote: true` D1 proxy returned one infrastructure `500` during high-concurrency Complete retry. The database remained in a valid pre-Complete state with no Complete operation row and no FK violation. Running both Worker and D1 remotely through Wrangler's temporary preview removed the proxy path and passed the full contract. The proxy run is not counted as the final remote evidence.

## Pre-publication local regression investigation

The initial evidence above was contradicted by a later mandatory publication rerun on 2026-08-22 JST. That rerun stopped in `D1-SPIKE-02`: the expected Start success count was `1`, the observed count was `0`, and the process exited `1`. No Git write followed the failure. The old test asserted before reading or printing the final state, so the original failing database snapshot was not preserved.

Before source changes, the investigation recorded:

- one exact standalone `npm run test:local`: PASS for D1-SPIKE-01 through D1-SPIKE-08;
- two exact `npm run test:local` processes deliberately overlapped against the old fixed port and shared local persistence: one process passed, while the other failed because its fixture changed from `planned` to `running` during D1-SPIKE-01;
- together with the publication failure, the pre-change observations were one isolated PASS, one recorded zero-success D1-SPIKE-02 FAIL, and one controlled overlapping-suite FAIL.

Root cause: **test harness / local environment isolation**, not the Start transaction algorithm. The old runner used fixed port `8791`, shared `.wrangler/state`, and accepted any successful `/health` response without proving that its own `wrangler dev` child was still running. A previous or overlapping runner could therefore serve the HTTP test while another suite reset and mutated the same D1 fixture.

A controlled reproduction of the zero-success causal state started one Execution as another runner, then sent the 20 target Start attempts. The observed state was:

- target success count: `0`;
- response classifications: `409:active_execution_conflict = 20`;
- active Execution count: `1`;
- running Entry count: `1`;
- committed Execution / Start operation: the other runner's IDs;
- operation outcomes: `1 success`, `20 rejected`;
- foreign-key violations: `0`.

This distinguishes “no Start exists” from the actual failure mode: a valid Start from another suite already existed, so all requests belonging to the observed suite were correctly rejected.

The minimal harness fix:

- allocates an available HTTP port per run;
- gives every local run a dedicated `--persist-to` directory under ignored `.wrangler/runs/`;
- detects `wrangler dev` early exit instead of accepting a stale server;
- records machine-readable D1-SPIKE-02 response classifications and database counts before assertions;
- includes complete Entry, Execution, and operation state automatically when an iteration is invalid;
- supports focused iteration/request counts without changing the default 20-by-20 contract.

No SQL, Worker command semantics, unique constraint, or canonical invariant changed.

Post-fix verification:

| Verification | Result | Evidence |
|---|---|---|
| D1-SPIKE-02 stability | PASS | 20 clean iterations × 20 concurrent Start attempts; success-count distribution `{ "1": 20 }` |
| Concurrent runner isolation | PASS | two simultaneous isolated runners, each 5 iterations × 20 attempts; both exited `0` |
| D1-SPIKE-02 larger stress | PASS | 20 clean iterations × 50 attempts; 1,000 requests; success-count distribution `{ "1": 20 }` |
| Full local regression run 1 | PASS | D1-SPIKE-01 through D1-SPIKE-08 |
| Full local regression run 2 | PASS | D1-SPIKE-01 through D1-SPIKE-08 |
| Syntax / types | PASS | `node --check` for both scripts and `npm run check` |

Every fixed D1-SPIKE-02 iteration observed exactly one `200:started`, all remaining responses as `409:active_execution_conflict`, one active Execution, one running Entry, and zero FK violations. No post-fix flakiness was observed.

The previous remote PASS remains relevant because its final evidence used one temporary remote database and one remote Worker preview, not overlapping local persistence. The root cause does not invalidate D1 remote transaction behavior. A new remote run is nevertheless recommended before a final gate decision so local and remote evidence are produced by the same revised harness; it was not performed because this investigation did not authorize remote resource writes.

## Current-harness D1-SPIKE-06 strengthening and remote rerun

On 2026-08-22 JST, the D1-SPIKE-06 assertion and current-harness evidence were strengthened from branch `spike/d1-feasibility`, starting at commit `612a635c26a35bf4a08b615633bfebb8218aa3d6`.

The previous test proved that one same-revision reorder succeeded and the other conflicted, but it did not prove that the successful HTTP response identified the exact order committed to D1. Its candidate A order also matched the initial order, allowing a false-positive final state if A won.

The strengthened contract now:

- uses initial order `entry-a, entry-b, entry-c`;
- uses candidate A `entry-b, entry-a, entry-c` and candidate B `entry-c, entry-a, entry-b`, both different from the initial order;
- derives the winner from the actual HTTP responses;
- requires exactly one `200` winner and one `409 revision_conflict` loser;
- requires the winning response, stored operation result, and exact final D1 order to identify the same candidate;
- requires final positions `[1, 2, 3]`, revision `1`, one successful operation row, one rejected operation row, two operation rows total, and zero foreign-key violations.

The dispatch order alternates by iteration while the two requests remain concurrent. This exercises both candidate identities without weakening the concurrency contract.

| Verification | Result | Evidence |
|---|---|---|
| Focused local D1-SPIKE-06 | PASS | 20 iterations × 2 concurrent reorders; candidate A won 10 and candidate B won 10 |
| Full local regression run 1 | PASS | D1-SPIKE-01 through D1-SPIKE-08 |
| Full local regression run 2 | PASS | D1-SPIKE-01 through D1-SPIKE-08 |
| Current-harness remote regression | PASS | D1-SPIKE-01 through D1-SPIKE-08; process exit code `0` |
| Remote D1-SPIKE-06 | PASS | 20 iterations × 2 concurrent reorders; candidate A won 7 and candidate B won 13 |
| Syntax / types | PASS | `node --check` for the contract and runner scripts; `npm run check` |

Every local and remote D1-SPIKE-06 iteration matched the HTTP winner to the stored operation result and exact final order. Every iteration also observed revision `1`, positions `[1, 2, 3]`, one successful and one rejected operation, and zero FK violations. No local or remote flakiness was observed. The earlier local-to-remote D1 proxy `500` was not reproduced by the current remote Worker preview path.

The remote rerun used exactly one newly created APAC temporary D1 database named `taskchute-d1-spike-20260822-100522`. A fresh list verified its exact name and UUID before testing and again before deletion. The database count changed from 1 to 2 for the run, then returned to 1 after deletion; a fresh list verified absence by both name and UUID. No existing D1 database was modified, and no permanent Worker was deployed. The generated remote Wrangler config was removed after the run.

Current evidence status: **CURRENT_HARNESS_LOCAL_REMOTE_PASS**. This means the strengthened current harness passed locally and through the temporary remote preview. It is not a new unqualified overall feasibility-gate or canonical Product decision.

## Tool versions

- Node.js `22.22.3`
- npm `10.9.8`
- Wrangler `4.125.0`
- TypeScript `7.0.2`
- `@types/node` `26.2.0`

## Strategy tested

- `D1Database.batch()` for one atomic command mutation plus operation result
- prepared statements with ordered bound parameters
- partial unique index: active Execution per user `<= 1`
- partial unique index: running Entry per user `<= 1`
- `(user_id, operation_id)` primary key for logical idempotency
- server-computed SHA-256 over recursively key-sorted semantic input
- exact replay for same operation/fingerprint and explicit misuse rejection for a different fingerprint
- TaskChuteDay revision guard row acquired inside the reorder batch
- two-phase temporary positions plus final positions inside one batch
- CHECK-backed transaction assertion that intentionally aborts a batch when a precondition or injected failure is false
- `FOREIGN KEY ... ON DELETE RESTRICT` for Task / Entry / Execution history safety

## Results

| Contract | Local | Remote | Relevant iterations | Relevant requests per environment | Machine assertion |
|---|---|---|---:|---:|---|
| D1-SPIKE-01 | PASS | PASS | 1 | 1 | injected Start failure leaves exact pre-state, no Execution or operation result |
| D1-SPIKE-02 | PASS | PASS | 20 | 400 | every 20-way race has one success, one active Execution, one running Entry |
| D1-SPIKE-03 | PASS | PASS | 20 | 400 | every 20-way same-operation race converges to one Execution and one stored result |
| D1-SPIKE-04 | PASS | PASS | 1 | 3 | property-order/whitespace replay succeeds; different semantic reuse is rejected |
| D1-SPIKE-05 | PASS | PASS | 20 | 400 | every 20-way Complete retry preserves one Execution and the first `ended_at` |
| D1-SPIKE-06 | PASS | PASS | 20 | 40 | one of two same-revision reorders wins; revision increments once; loser conflicts |
| D1-SPIKE-07 | PASS | PASS | 20 | 20 | injected multi-row reorder failure leaves exact original order and revision |
| D1-SPIKE-08 | PASS | PASS | 1 | 3 | FK rejects unsafe hard delete and historical Execution stays queryable |

Every final state assertion also checks `PRAGMA foreign_key_check` returns zero rows. The test process uses `node:assert/strict` and exits non-zero on the first invariant violation.

Ignored raw machine evidence is produced at:

- `evidence/local.json`
- `evidence/remote.json`

## Exact setup and verification

```powershell
npm install
npm run check
npm run test:local
```

Remote setup used an unmistakably temporary database, an ignored generated config, and a temporary remote Worker preview:

```powershell
npx wrangler whoami
npx wrangler d1 create taskchute-d1-spike-<timestamp> --location apac
node ./scripts/render-remote-config.mjs <database-name> <database-uuid>
npm run test:remote
npx wrangler d1 delete <database-name> --skip-confirmation
```

Before deletion, the target name prefix and UUID were matched against `wrangler d1 list --json`. After deletion, absence was verified from a fresh list.

## Historical gate conclusion and current review status

The initial run recorded the D1 feasibility gate as PASS because both local and remote D1 passed D1-SPIKE-01 through D1-SPIKE-08. The later publication failure superseded treating that statement as an unqualified current conclusion. The subsequent current-harness run above supersedes the interim `LOCAL_STABLE_PASS` evidence status with **CURRENT_HARNESS_LOCAL_REMOTE_PASS**; it does not make a new overall gate decision.

This does not finalize the Product schema or unexpected infrastructure failure reconciliation policy. It does not test authentication, multi-user authorization, production migration, read replication, overload thresholds, retention/cleanup of operation results, or a deployed production Worker. The spike demonstrates that the approved invariants are feasible with atomic D1 batches and database constraints; Product runtime design remains separate work.

Canonical docs impact for separate review:

- `docs/CURRENT.md`: D1 spike is now implemented and locally/remotely tested.
- `docs/TEST_MATRIX.md`: D1-SPIKE-01 through D1-SPIKE-08 have PASS evidence on this working tree.
- `docs/ARCHITECTURE.md` / `docs/DECISIONS.md`: the tested batch + constraint strategy can be considered for adoption, but exact Product schema and transaction algorithm remain a separate Decision.
- `docs/RISKS.md` / `docs/OPEN_QUESTIONS.md`: retain infrastructure retry/reconciliation, operation result retention, exact schema, and overload behavior as open follow-up work.
