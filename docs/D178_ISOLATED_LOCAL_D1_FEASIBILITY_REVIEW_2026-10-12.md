# D-178 — Isolated Wrangler-local D1 feasibility review (2026-10-12)

## Result and scope

- **Run:** [GitHub Actions 38215129082](https://github.com/hedgetheapp/taskchute-platform/actions/runs/38215129082), attempt 1, `workflow_dispatch`, exact tested SHA `68f9e67ef3228c8a46688450d27d9687abbb772b`.
- **Environment:** GitHub-hosted Ubuntu 24.04, Node `22.22.3`, Wrangler `4.125.0`, Workerd `1.20260820.1`; **synthetic Wrangler-local D1 only** with disposable `DB` binding and synthetic Worker, not Cloudflare remote D1 or APP_DB, not real Note mutation path.
- **Workflow conclusion:** `SUCCESS`; **test evidence overall `PARTIAL`** (11 cases `PASS`, 3 cost cases `PARTIAL`). The `PARTIAL` cases had expected rejected-query `D1Result.meta` unavailable. No unexpected test FAIL in the successful run.
- **Artifact:** [run artifact 11731981295](https://github.com/hedgetheapp/taskchute-platform/actions/runs/38215129082/artifacts/11731981295), seven-day retention. It includes `results.json`, `summary.md`, `harness.log`, and the exact four harness sources. Results and counts below were independently read from the artifact.

## Results

| Case group | Evidence |
| --- | --- |
| Same-date convergence, interval overlap/touching, old `OR REPLACE` counterexamples, FK behavior, guarded Day immutability, and D1 `batch()` atomic success / rollback | 6 `PASS` cases on disposable local D1, not production schema |
| Two independently issued HTTP requests with recorded D1-backed preflight/release barrier: same-date, adjacent exact touch, crossing overlap, nested overlap, and `OR REPLACE`/UPDATE immutability | 5 `PASS` cases. They establish preflight-before-release and observed final consistency; they do **not** prove simultaneous SQL instruction execution or the complete production Note-save contract |
| Guard-write cost: indexed synthetic histories of 10, 365 and 7,301 owner Days | 3 `PARTIAL` cases; all successful INSERT metrics and expected rejection/state assertions PASS, but failed statements returned no `D1Result.meta` |
| 730,000 Note Activity write-cost gate | `NOT_RUN / OUT_OF_SCOPE` |

### Synthetic successful INSERT `D1Result.meta`

| Prior owner Days | Unguarded baseline rows read / written | Guarded rows read / written | Guarded duration from meta |
| ---: | ---: | ---: | ---: |
| 10 | 0 / 5 | 11 / 7 | 0 (reported) |
| 365 | 0 / 5 | 366 / 7 | 0 (reported) |
| 7,301 | 0 / 5 | 7,302 / 7 | 1 (reported) |

The baseline and guarded tables have comparable owner/date/interval indexes, but the guarded table additionally runs the synthetic overlap query and fence triggers. A predicate-plan proxy reported indexed search on `(app_user_id, start_instant < ...)`, yet the measured *rows read* for a successful guard insert increased linearly with the owner’s existing Day history in this fixture. The reported duration values are individual D1 metadata, not statistical latency measurements. The 7,301-Day test is **not** a substitute for the separate 730,000-Note-activity gate or for remote D1 quota/plan cost projections.

## Decision and verification boundary

- This result supports feasibility of the **specific synthetic** owner-scoped overlap/immutable-Day candidate and isolated batch atomicity on Wrangler-local D1. It does not approve a guard schema, migration, activation, production deployment, or the Note activity persistence design.
- D-178 current-time Note save when zero persisted Day intervals match remains **Approved Product Option B**, but the atomic implementation algorithm, Day multiple-match behavior, activation/cutover, existing-data treatment, and cost/scale trade-off remain unapproved/open per canonical D-178 docs.
- The linear guard read count is a **measured design risk**. Investigate a bounded/index/alternative guard strategy and verify on a representative fixture before selecting a production persisted schema, including any remote-D1-specific effects.
- Product D-178 state remains **IMPLEMENTED=NO / INTEGRATED=NO / VERIFIED=NO / RELEASED=NO**. The isolated feasibility run is `TESTED / SYNTHETIC LOCAL D1`, not Product Verified.

## Evidence preservation / cleanup

This report and its pointers preserve the approved feasibility conclusion after removing the temporary `.github/workflows/d178-d1-isolated-feasibility.yml` and `scripts/d178-isolated-feasibility/*` harness from `main`. Historical commits and the seven-day run artifact remain the source for the exact executed harness; a local archive was also handed off through ChatGPT. Cleanup does not change persisted APP_DB, migrations, or Product behavior.