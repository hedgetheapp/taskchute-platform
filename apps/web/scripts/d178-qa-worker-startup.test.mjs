import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildWranglerDevArgs,
  classifyWorkerStartupFailure,
  formatWorkerStartupFailure,
} from "./d178-qa-worker-startup.mjs";
import { runLocalStartupSmoke } from "./d178-qa-local-startup-smoke.mjs";

const failureCases = [
  ["Wrangler CLI arguments", { stderr: "Unknown argument: --bad-option" }, "wrangler_cli_argument_error"],
  ["process spawn", { spawnErrorCode: "ENOENT" }, "process_spawn_error"],
  ["workerd spawn", { stderr: "spawn workerd.exe ENOENT" }, "workerd_spawn_error"],
  ["Worker bundle imports", { stderr: "Could not resolve an imported module" }, "bundle_or_import_error"],
  ["remote D1 authorization or target", { stderr: "Remote D1 binding authentication required" }, "d1_auth_or_target_error"],
  ["missing D1 target", { stderr: "D1 database does not exist" }, "d1_auth_or_target_error"],
  ["loopback ports", { stderr: "connect EACCES 127.0.0.1:9229" }, "loopback_port_error"],
  ["invalid port", { stderr: "Invalid value for --inspector-port" }, "loopback_port_error"],
  ["workerd runtime storage", { stderr: "SQLITE_CANTOPEN unable to open database file" }, "workerd_runtime_error"],
  ["ready timeout", { timedOut: true }, "readiness_timeout"],
  ["child exit", { exitCode: 17 }, "worker_child_exit"],
];

for (const [label, diagnostics, expected] of failureCases) {
  test(`classifies ${label} without exposing raw output`, () => {
    assert.equal(classifyWorkerStartupFailure(diagnostics), expected);
  });
}

test("safe failure summary withholds arbitrary child output and credentials", () => {
  const secretMarker = "qa-password-must-not-appear";
  const summary = formatWorkerStartupFailure({
    stderr: `Authentication failed for qa@example.test with ${secretMarker}`,
    exitCode: 1,
  });
  assert.match(summary, /category=d1_auth_or_target_error/);
  assert.match(summary, /child_exit_code=1/);
  assert.doesNotMatch(summary, /qa@example\.test|qa-password-must-not-appear|Authentication failed/);
  assert.match(summary, /output was withheld/i);
});

test("Wrangler dev binds both services to loopback and uses dynamic ports", () => {
  const args = buildWranglerDevArgs({ configPath: "temporary-config.jsonc", port: 8787, inspectorPort: 9230 });
  assert.deepEqual(args, [
    "dev", "--config", "temporary-config.jsonc",
    "--ip", "127.0.0.1", "--port", "8787",
    "--inspector-ip", "127.0.0.1", "--inspector-port", "9230",
    "--show-interactive-dev-session", "false", "--log-level", "error",
  ]);
  assert.equal(args.includes("--remote"), false);
  assert.equal(args.includes("--tunnel"), false);
});

test("QA provisioner imports spawn used by its Wrangler preflight", async () => {
  const source = await readFile(new URL("./provision-d178-qa.mjs", import.meta.url), "utf8");
  assert.match(source, /^import\s+\{\s*spawn\s*\}\s+from\s+["']node:child_process["'];$/m);
  assert.match(source, /spawn\(process\.execPath,\s*\[WRANGLER_BIN,\s*\.\.\.args\]/);
});

test("D-178 QA Worker starts with synthetic local D1 and no operator credentials", { timeout: 75_000 }, async () => {
  const result = await runLocalStartupSmoke();
  assert.equal(result.status, 404);
  assert.equal(result.operatorPostSent, false);
  assert.equal(result.cloudflareCredentialsPassed, false);
});
