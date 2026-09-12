import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildPlan,
  classifyRisks,
  formatEvidenceSummary,
  hasRealDeploy,
  heavyRemainingEvidence,
  parseAheadBehind,
  parseArgs,
  runVerification,
  validateEvidenceState,
} from "./dev-workflow.mjs";

test("verify argument parsing requires an explicit affected surface", () => {
  assert.throws(() => parseArgs([], { requireSurface: true }), /explicit --surface/);
  assert.equal(parseArgs(["--surface", "cross", "--nonprod-static"], { requireSurface: true }).surface, "cross");
  assert.throws(() => parseArgs(["--surface", "unknown"], { requireSurface: true }), /Invalid surface/);
});

test("ahead/behind output is parsed without shell-dependent assumptions", () => {
  assert.deepEqual(parseAheadBehind("3\t1\n"), { ahead: 3, behind: 1 });
  assert.throws(() => parseAheadBehind("not-a-count"), /Cannot parse/);
});

test("risk signals are review candidates derived from paths", () => {
  assert.deepEqual(classifyRisks([
    "apps/web/migrations/app/0029_documents_v01.sql",
    "apps/web/src/shared/contracts.ts",
    "apps/web/worker/index.ts",
    "apps/web/package-lock.json",
    "apps/web/wrangler.jsonc",
    "docs/CURRENT.md",
  ]).sort(), [
    "Worker/API area changes",
    "deployment/config changes",
    "dependency / lockfile changes",
    "migration changes",
    "shared-contract area changes",
  ].sort());
});

test("plans cover each explicit surface and never contain a real deploy", () => {
  const web = buildPlan("standard", "web");
  const worker = buildPlan("standard", "worker");
  const cross = buildPlan("standard", "cross", { nonprodStatic: true });
  const migrations = buildPlan("heavy", "migrations");
  const docs = buildPlan("fast", "docs");
  assert(web.some((item) => item.args.includes("test:web")));
  assert(!web.some((item) => item.args.includes("test")));
  assert(worker.some((item) => item.args.includes("test")));
  assert(cross.some((item) => item.args.includes("test:web")) && cross.some((item) => item.args.includes("test")));
  assert(migrations.some((item) => item.args.includes("test:migrations")));
  assert.equal(docs.some((item) => item.args.includes("test:web") || item.args.includes("test")), false);
  assert(cross.some((item) => item.args.includes("--dry-run")));
  assert.equal(hasRealDeploy(cross), false);
});

test("HEAVY reports remaining evidence categories", () => {
  const message = heavyRemainingEvidence().join(" ");
  assert.match(message, /migration\/recovery/);
  assert.match(message, /persistent nonprod/);
  assert.match(message, /browser/);
  assert.match(message, /DB/);
});

test("evidence summary defaults manual categories to NOT_RUN", () => {
  const summary = formatEvidenceSummary({
    profile: "standard",
    surface: "docs",
    result: "PASS",
    total_duration_ms: 12,
    git_head: "abc",
    steps: [{ name: "git diff --check", status: "PASS", duration_ms: 12 }],
    manual_evidence: {},
  }, { head: "abc", dirty_paths: [] });
  assert.match(summary, /Persistent nonprod deployment: NOT_RUN/);
  assert.match(summary, /Browser: NOT_RUN/);
  assert.match(summary, /API: NOT_RUN/);
  assert.match(summary, /DB: NOT_RUN/);
  assert.doesNotMatch(summary, /Persistent nonprod deployment: PASS/);
});

test("invalid evidence state is rejected", () => {
  assert.equal(validateEvidenceState("not_run"), "NOT_RUN");
  assert.throws(() => validateEvidenceState("GUESS"), /Invalid evidence state/);
});

test("a failed child step stops the plan and fails verification", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "taskchute-dev-workflow-test-"));
  const calls = [];
  try {
    assert.throws(() => runVerification({
      profile: "standard",
      surface: "docs",
      artifactPath: join(tempRoot, "latest.json"),
      head: "test-head",
      output: { log() {} },
      runner(executable, args) {
        calls.push([executable, ...args]);
        return { status: 1 };
      },
    }), /git diff --check failed/);
    assert.equal(calls.length, 1);
    const artifact = JSON.parse(readFileSync(join(tempRoot, "latest.json"), "utf8"));
    assert.equal(artifact.result, "FAIL");
    assert.equal(artifact.steps.length, 1);
    assert.equal(artifact.steps[0].status, "FAIL");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
