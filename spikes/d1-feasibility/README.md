# D1 Concurrency / Atomicity Feasibility Spike

This directory is an isolated, reversible spike. It is not the Product runtime or a finalized schema.

The Worker exercises real D1 through a binding. Command mutation and the operation result are committed in one `D1Database.batch()` transaction. Database constraints remain the last line of defense:

- partial unique indexes limit each user to one active Execution and one running Entry;
- `(user_id, operation_id)` prevents duplicate logical operations;
- server-computed canonical request fingerprints reject operation ID misuse;
- revision guards prevent stale reorder writes;
- assertion rows deliberately turn failed preconditions into a transaction error and full rollback;
- foreign keys use `RESTRICT` for historical chains.

## Local

```powershell
npm install
npm run check
npm run test:local
```

The test runner applies `schema.sql` to a per-run Wrangler local D1 directory, allocates an available local port, starts a local Worker, sends concurrent HTTP requests, and writes ignored machine-readable evidence to `evidence/local.json`. Separate runner processes do not share fixture state.

For focused D1-SPIKE-02 stability or stress checks:

```powershell
node ./scripts/run-environment.mjs --mode local --only D1-SPIKE-02 --concurrency-iterations 20 --concurrency-requests 20
```

The default full suite remains 20 iterations and 20 concurrent requests for concurrency contracts. D1-SPIKE-02 prints a compact machine-readable observation before each assertion; on an invalid iteration it also prints the complete Entry, Execution, and operation state.

## Isolated remote D1

Never point this spike at an existing database. Create an obviously temporary database, render an ignored config, run the contract, and then delete only that exact spike database after recording the result.

```powershell
npx wrangler whoami
npx wrangler d1 create taskchute-d1-spike-<timestamp>
node ./scripts/render-remote-config.mjs <database-name> <database-uuid>
npm run test:remote
npx wrangler d1 delete <database-name>
```

`test:remote` uploads the Worker to Wrangler's temporary remote-development preview and connects its D1 binding to the isolated remote database. It does not create a permanent Worker deployment. The runner writes ignored evidence to `evidence/remote.json`.

The contract process exits non-zero on the first invariant violation. The D1 feasibility gate is not PASS unless both environments pass.
