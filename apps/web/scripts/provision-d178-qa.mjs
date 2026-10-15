import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { open } from "node:fs/promises";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(SCRIPT_DIR, "..");
const REPO_DIR = path.resolve(APP_DIR, "..", "..");
const OUTPUT_DIR = path.resolve(REPO_DIR, "..", "outputs");
const WRANGLER_CONFIG = path.join(APP_DIR, "dist", "taskchute_web", "wrangler.json");
const WRANGLER_BIN = path.join(APP_DIR, "node_modules", "wrangler", "bin", "wrangler.js");
const EXPECTED_WORKER = "taskchute-web-nonprod";
const EXPECTED_DEPLOYMENT = "4684b3a5-d1a1-4290-8a48-3bafb688b882";
const EXPECTED_VERSION = "01545a31-dfd9-4f6d-9825-fe56de8e2542";
const EXPECTED_DATABASES = {
  "taskchute-auth-nonprod": "60085f8d-0c4e-4c15-98e9-3ce178398041",
  "taskchute-app-nonprod": "6ad7e35f-5d03-4be3-9b00-46cd713a51c3",
};
const STATE_PATH = path.join(OUTPUT_DIR, "d178-qa-provisioning-private-state.json");

let devProcess;
let temporaryRunDirectory;
let operatorLockHandle;
const OPERATOR_LOCK_PATH = STATE_PATH + ".lock";

function stop(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function timestampLabel() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function makeWranglerEnv() {
  if (process.env.CLOUDFLARE_ENV) {
    stop("CLOUDFLARE_ENV must be unset before this exact nonprod configuration can be used.");
  }
  const logDirectory = path.join(APP_DIR, ".wrangler", "d178-operator-logs");
  return {
    ...process.env,
    WRANGLER_LOG: "log",
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_PATH: logDirectory,
  };
}

async function runWrangler(args, { allowFailure = false } = {}) {
  const childEnv = makeWranglerEnv();
  await mkdir(childEnv.WRANGLER_LOG_PATH, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WRANGLER_BIN, ...args], {
      cwd: APP_DIR,
      env: childEnv,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", () => reject(new Error("Could not start the local Wrangler executable.")));
    child.once("close", (code) => {
      const result = { code: code ?? 1, stdout, stderr };
      if (!allowFailure && result.code !== 0) {
        reject(new Error("A guarded Wrangler read operation failed; its output was withheld."));
      } else {
        resolve(result);
      }
    });
  });
}

function parseJsonOutput(output, description) {
  const trimmed = output.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const candidates = [trimmed.indexOf("["), trimmed.indexOf("{")].filter((index) => index >= 0).sort((a, b) => a - b);
    for (const start of candidates) {
      try {
        return JSON.parse(trimmed.slice(start));
      } catch {
        // Continue with the next JSON start candidate.
      }
    }
  }
  stop("Wrangler returned an unexpected " + description + " response.");
}

function resultRows(value) {
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) => Array.isArray(item?.results) ? item.results : []);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) stop(label + " did not match the approved nonprod target.");
}

async function loadAndVerifyGeneratedConfig() {
  let config;
  try {
    config = JSON.parse(await readFile(WRANGLER_CONFIG, "utf8"));
  } catch {
    stop("Build the existing nonprod Worker first; generated nonprod config is unavailable.");
  }
  assertEqual(config.name, EXPECTED_WORKER, "Worker name");
  assertEqual(config.vars?.RUNTIME_ENV, "nonprod", "RUNTIME_ENV");
  assertEqual(config.vars?.BOOTSTRAP_ENABLED, "false", "BOOTSTRAP_ENABLED");
  const bindings = config.d1_databases ?? [];
  if (bindings.length !== 2) stop("Generated config must bind exactly the approved two nonprod D1 databases.");
  const byName = new Map(bindings.map((binding) => [binding.database_name, binding]));
  for (const [name, id] of Object.entries(EXPECTED_DATABASES)) {
    const binding = byName.get(name);
    if (!binding || binding.database_id !== id) stop("Generated D1 binding did not match the approved nonprod target.");
  }
  if (bindings.some((binding) => /production/i.test(binding.database_name ?? ""))) {
    stop("Generated config contains a production D1 binding; no operation was started.");
  }
  return config;
}

async function verifyCloudflareAuthentication() {
  const result = await runWrangler(["whoami"], { allowFailure: true });
  if (result.code !== 0) {
    stop("Wrangler authentication is unavailable or expired in this execution environment; no Cloudflare resource was queried or changed.");
  }
}

async function verifyRemoteD1Targets() {
  const result = await runWrangler(["d1", "list", "--json", "--config", WRANGLER_CONFIG]);
  const databases = parseJsonOutput(result.stdout, "D1 list");
  for (const [name, id] of Object.entries(EXPECTED_DATABASES)) {
    const entry = databases.find((database) => database.name === name);
    if (!entry || (entry.uuid ?? entry.database_id ?? entry.id) !== id) {
      stop("The account's D1 list did not confirm the exact approved nonprod database targets.");
    }
  }
}

async function verifyActiveDeployment() {
  const result = await runWrangler([
    "deployments", "status", "--name", EXPECTED_WORKER, "--config", WRANGLER_CONFIG, "--json",
  ]);
  const deployment = parseJsonOutput(result.stdout, "deployment status");
  assertEqual(deployment.id, EXPECTED_DEPLOYMENT, "Active deployment id");
  const versions = deployment.versions ?? [];
  if (versions.length !== 1) stop("The active nonprod Worker is not a single 100% deployment.");
  assertEqual(versions[0].version_id, EXPECTED_VERSION, "Active Worker version");
  assertEqual(versions[0].percentage, 100, "Active Worker percentage");
}

async function verifyNoPendingMigrations(databaseName) {
  const result = await runWrangler([
    "d1", "migrations", "list", databaseName, "--remote", "--config", WRANGLER_CONFIG,
  ]);
  if (!result.stdout.toLowerCase().includes("no migrations to apply")) {
    stop("A nonprod D1 migration is pending; the provisioning gate stopped before any write.");
  }
}

async function executeReadOnly(databaseName, sql) {
  const result = await runWrangler([
    "d1", "execute", databaseName, "--remote", "--command", sql, "--json", "--config", WRANGLER_CONFIG,
  ]);
  return resultRows(parseJsonOutput(result.stdout, "D1 query"));
}

async function verifyDatabaseIntegrity(databaseName) {
  const quick = await executeReadOnly(databaseName, "PRAGMA quick_check;");
  if (quick.length !== 1 || quick[0].quick_check !== "ok") {
    stop("A nonprod D1 quick_check did not return ok.");
  }
  const foreignKeys = await executeReadOnly(databaseName, "PRAGMA foreign_key_check;");
  if (foreignKeys.length !== 0) stop("A nonprod D1 foreign_key_check returned violations.");
}

async function verifyCoverageBaseline() {
  const rows = await executeReadOnly("taskchute-app-nonprod",
    "SELECT COUNT(*) AS marker_count FROM routine_activity_coverage;");
  if (rows.length !== 1 || !Number.isSafeInteger(rows[0].marker_count)) {
    stop("Could not verify the current nonprod Routine coverage marker count.");
  }
  return rows[0].marker_count;
}

async function exportDatabase(databaseName, filePath) {
  await runWrangler([
    "d1", "export", databaseName, "--remote", "--output", filePath,
    "--skip-confirmation", "--config", WRANGLER_CONFIG,
  ]);
  const info = await stat(filePath);
  if (info.size < 1024) stop("A fresh nonprod D1 export was unexpectedly small.");
  const contents = await readFile(filePath);
  const sql = contents.toString("utf8");
  if (!sql.includes("CREATE TABLE") || !sql.includes("INSERT INTO")) {
    stop("A fresh nonprod D1 export did not contain expected schema and data statements.");
  }
  return { bytes: info.size, sha256: createHash("sha256").update(contents).digest("hex") };
}

async function createFreshBackups(markerCount) {
  const backupDirectory = path.join(OUTPUT_DIR, "d178-nonprod-preqa-" + timestampLabel());
  await mkdir(backupDirectory, { recursive: true });
  const appPath = path.join(backupDirectory, "taskchute-app-nonprod.sql");
  const authPath = path.join(backupDirectory, "taskchute-auth-nonprod.sql");
  const app = await exportDatabase("taskchute-app-nonprod", appPath);
  const auth = await exportDatabase("taskchute-auth-nonprod", authPath);
  const manifest = {
    purpose: "D-178 nonprod QA provisioning pre-write preservation",
    created_at: new Date().toISOString(),
    target_worker: EXPECTED_WORKER,
    target_worker_version: EXPECTED_VERSION,
    target_databases: Object.keys(EXPECTED_DATABASES),
    app_coverage_marker_rows_before_write: markerCount,
    exports: {
      app: { file: path.basename(appPath), ...app },
      auth: { file: path.basename(authPath), ...auth },
    },
    restore_performed: false,
  };
  const manifestPath = path.join(backupDirectory, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  return backupDirectory;
}

function hiddenPrompt(label) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    stop("A private interactive TTY is required for QA email/password input.");
  }
  return new Promise((resolve, reject) => {
    let value = "";
    let finished = false;
    process.stdout.write(label);
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    const finish = (error) => {
      if (finished) return;
      finished = true;
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish(new Error("Private input was cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = Array.from(value).slice(0, -1).join("");
        } else if (character >= " ") {
          value += character;
        }
      }
    };
    process.stdin.on("data", onData);
  });
}

function validEmail(email) {
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function readOrCreatePrivateState(email) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const digest = sha256(email.trim().toLowerCase());
  let existing;
  try {
    existing = JSON.parse(await readFile(STATE_PATH, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") stop("Private operator state is unreadable; no account operation was started.");
  }
  if (existing) {
    if (existing.version !== 1 || existing.alias !== "d178-routine-qa" || existing.email_sha256 !== digest) {
      stop("The private QA state does not match the supplied email; no D1 write was started.");
    }
    return existing;
  }
  const initial = {
    version: 1,
    alias: "d178-routine-qa",
    email_sha256: digest,
    status: "started",
    started_at: new Date().toISOString(),
  };
  const temporaryPath = STATE_PATH + ".tmp-" + randomBytes(6).toString("hex");
  await writeFile(temporaryPath, JSON.stringify(initial, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  try {
    await rename(temporaryPath, STATE_PATH);
  } catch {
    await rm(temporaryPath, { force: true });
    stop("Could not create the private QA recovery state; no D1 write was started.");
  }
  return initial;
}

async function acquireOperatorLock() {
  await mkdir(path.dirname(OPERATOR_LOCK_PATH), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      operatorLockHandle = await open(OPERATOR_LOCK_PATH, "wx", 0o600);
      await operatorLockHandle.writeFile(JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }) + "\n");
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") {
        stop("Could not safely acquire the private QA operator lock.");
      }
      let existing;
      try {
        existing = JSON.parse(await readFile(OPERATOR_LOCK_PATH, "utf8"));
      } catch {
        stop("The private QA operator lock is unreadable; resolve it without changing QA data.");
      }
      if (!Number.isSafeInteger(existing.pid) || existing.pid <= 0) {
        stop("The private QA operator lock has no valid process owner.");
      }
      let processAlive = true;
      try {
        process.kill(existing.pid, 0);
      } catch (probeError) {
        processAlive = probeError?.code !== "ESRCH";
      }
      if (processAlive) {
        stop("Another D-178 QA provisioning process holds the private operator lock.");
      }
      try {
        await rm(OPERATOR_LOCK_PATH);
      } catch {
        stop("The stale private QA operator lock could not be recovered safely.");
      }
    }
  }
  stop("The private QA operator lock changed while it was being recovered.");
}

async function releaseOperatorLock() {
  if (!operatorLockHandle) return;
  await operatorLockHandle.close().catch(() => undefined);
  operatorLockHandle = undefined;
  await rm(OPERATOR_LOCK_PATH, { force: true }).catch(() => undefined);
}

async function savePrivateState(state) {
  const temporaryPath = STATE_PATH + ".tmp-" + randomBytes(6).toString("hex");
  await writeFile(temporaryPath, JSON.stringify(state, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  await rename(temporaryPath, STATE_PATH);
}

async function reserveLocalPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function startWorker(port, configPath, devVarsPath) {
  const child = spawn(process.execPath, [
    WRANGLER_BIN, "dev", "--config", configPath, "--ip", "127.0.0.1", "--port", String(port),
    "--inspector-ip", "127.0.0.1", "--show-interactive-dev-session", "false", "--log-level", "error",
  ], {
    cwd: APP_DIR,
    env: { ...makeWranglerEnv(), CLOUDFLARE_ENV: "", WRANGLER_LOG: "error" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-12000); });
  child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-12000); });
  child.once("error", () => { output += " process-start-error"; });
  return { child, getOutput: () => output, devVarsPath };
}

async function waitForWorker(server, port) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) stop("The isolated local Worker stopped before it became ready.");
    const connected = await new Promise((resolve) => {
      const socket = createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => { socket.destroy(); resolve(true); });
      socket.once("error", () => resolve(false));
    });
    if (connected) {
      const probe = await fetch("http://127.0.0.1:" + port + "/__operator/health", { method: "GET" }).catch(() => null);
      if (probe) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const output = server.getOutput().toLowerCase();
  const reason = output.includes("auth") || output.includes("token")
    ? "Cloudflare remote D1 authorization failed."
    : "The local Worker failed to start with its explicit remote D1 bindings.";
  stop(reason + " No credentials were sent to the Worker.");
}

async function stopWorker() {
  if (!devProcess?.child || devProcess.child.exitCode !== null) return;
  devProcess.child.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => devProcess.child.once("close", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (devProcess.child.exitCode === null) devProcess.child.kill("SIGTERM");
}

async function runProvisioning() {
  if (Number(process.versions.node.split(".")[0]) < 22) {
    stop("Use Node.js 22 or newer for the pinned Wrangler version.");
  }
  await loadAndVerifyGeneratedConfig();
  await verifyCloudflareAuthentication();
  await verifyRemoteD1Targets();
  await verifyActiveDeployment();
  await verifyNoPendingMigrations("taskchute-auth-nonprod");
  await verifyNoPendingMigrations("taskchute-app-nonprod");
  await verifyDatabaseIntegrity("taskchute-auth-nonprod");
  await verifyDatabaseIntegrity("taskchute-app-nonprod");
  const markerCount = await verifyCoverageBaseline();
  const backupDirectory = await createFreshBackups(markerCount);

  process.stdout.write("非本番対象・Worker version・migration・integrity・保全backupを確認しました。\n");
  await acquireOperatorLock();
  const email = (await hiddenPrompt("QA用メールアドレス（非表示入力）: ")).trim();
  if (!validEmail(email)) stop("The private email did not pass local format validation; no credentials were sent.");
  const password = await hiddenPrompt("QA用password（非表示入力）: ");
  if (password.length < 8 || password.length > 128) stop("The private password did not pass length validation; no credentials were sent.");
  const state = await readOrCreatePrivateState(email);

  const generatedConfig = await loadAndVerifyGeneratedConfig();
  const bindingByName = new Map(generatedConfig.d1_databases.map((binding) => [binding.database_name, binding]));
  const runId = randomBytes(8).toString("hex");
  temporaryRunDirectory = path.join(APP_DIR, ".wrangler", "d178-qa-provision-" + runId);
  await mkdir(temporaryRunDirectory, { recursive: false });
  const localConfigPath = path.join(temporaryRunDirectory, "wrangler.jsonc");
  const devVarsPath = path.join(temporaryRunDirectory, ".dev.vars");
  const localConfig = {
    name: "d178-qa-provision-local",
    main: "../../worker/qa-provisioning.ts",
    compatibility_date: "2026-08-22",
    compatibility_flags: ["nodejs_compat"],
    vars: {
      RUNTIME_ENV: "nonprod",
      BOOTSTRAP_ENABLED: "false",
      D178_QA_PROVISIONING_ENABLED: "true",
      D178_QA_TARGET_APP_DATABASE: "taskchute-app-nonprod",
      D178_QA_TARGET_AUTH_DATABASE: "taskchute-auth-nonprod",
    },
    d1_databases: [
      { binding: "AUTH_DB", database_name: "taskchute-auth-nonprod", database_id: bindingByName.get("taskchute-auth-nonprod").database_id, remote: true },
      { binding: "APP_DB", database_name: "taskchute-app-nonprod", database_id: bindingByName.get("taskchute-app-nonprod").database_id, remote: true },
    ],
  };
  const operatorToken = randomBytes(32).toString("base64url");
  const authSecret = randomBytes(48).toString("base64url");
  await writeFile(localConfigPath, JSON.stringify(localConfig, null, 2) + "\n", { flag: "wx" });
  await writeFile(devVarsPath,
    "BETTER_AUTH_SECRET=" + authSecret + "\nD178_QA_PROVISIONING_TOKEN=" + operatorToken + "\n",
    { flag: "wx", mode: 0o600 });

  const port = await reserveLocalPort();
  devProcess = startWorker(port, localConfigPath, devVarsPath);
  try {
    await waitForWorker(devProcess, port);
    const response = await fetch("http://127.0.0.1:" + port + "/__operator/d178-qa/provision", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:" + port,
        "x-taskchute-qa-provision-token": operatorToken,
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(90000),
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok || responseBody.alias !== "d178-routine-qa"
      || !["created", "recovered", "already_provisioned"].includes(responseBody.status)) {
      const code = typeof responseBody?.error?.code === "string" ? responseBody.error.code : "unknown";
      stop("QA provisioning stopped with status " + response.status + " (" + code + "). The response contained no credential values.");
    }
    await savePrivateState({
      ...state,
      status: "provisioned",
      provisioned_at: new Date().toISOString(),
    });
    process.stdout.write("QA alias d178-routine-qa: " + responseBody.status + "\n");
    process.stdout.write("Fresh APP/AUTH preservation backups are stored outside the repository.\n");
    return { status: responseBody.status, backupDirectory };
  } finally {
    await stopWorker();
    if (temporaryRunDirectory) await rm(temporaryRunDirectory, { recursive: true, force: true });
    temporaryRunDirectory = undefined;
    devProcess = undefined;
    await releaseOperatorLock();
  }
}

runProvisioning().catch(async (error) => {
  await stopWorker().catch(() => undefined);
  if (temporaryRunDirectory) await rm(temporaryRunDirectory, { recursive: true, force: true }).catch(() => undefined);
  await releaseOperatorLock();
  process.stderr.write((error instanceof Error ? error.message : "QA provisioning failed") + "\n");
  process.exitCode = 1;
});
