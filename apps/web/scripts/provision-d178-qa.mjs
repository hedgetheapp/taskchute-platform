import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { open } from "node:fs/promises";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  reserveLocalPorts,
  startLocalWorker,
  stopLocalWorker,
  waitForLocalWorker,
} from "./d178-qa-worker-startup.mjs";
import {
  createD178PrivateStore,
  hardenWindowsPrivateDirectory,
  stableD178QaIdentity,
} from "./d178-qa-credentials.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(SCRIPT_DIR, "..");
const REPO_DIR = path.resolve(APP_DIR, "..", "..");
const LEGACY_STATE_PATH = path.resolve(REPO_DIR, "..", "outputs", "d178-qa-provisioning-private-state.json");
const OPERATOR_PRIVATE_DIR = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, "TaskChutePlatform", "D178")
  : "";
const BACKUP_ROOT = OPERATOR_PRIVATE_DIR ? path.join(OPERATOR_PRIVATE_DIR, "backups") : "";
const WRANGLER_CONFIG = path.join(APP_DIR, "dist", "taskchute_web", "wrangler.json");
const WRANGLER_BIN = path.join(APP_DIR, "node_modules", "wrangler", "bin", "wrangler.js");
const EXPECTED_WORKER = "taskchute-web-nonprod";
const EXPECTED_DEPLOYMENT = "4684b3a5-d1a1-4290-8a48-3bafb688b882";
const EXPECTED_VERSION = "01545a31-dfd9-4f6d-9825-fe56de8e2542";
const EXPECTED_DATABASES = {
  "taskchute-auth-nonprod": "60085f8d-0c4e-4c15-98e9-3ce178398041",
  "taskchute-app-nonprod": "6ad7e35f-5d03-4be3-9b00-46cd713a51c3",
};
const PREFLIGHT_ONLY = process.argv.includes("--preflight-only");
const privateStore = createD178PrivateStore({
  rootDir: OPERATOR_PRIVATE_DIR,
  legacyStatePath: LEGACY_STATE_PATH,
});

let devProcess;
let temporaryRunDirectory;
let operatorLockHandle;
const OPERATOR_LOCK_PATH = OPERATOR_PRIVATE_DIR
  ? path.join(OPERATOR_PRIVATE_DIR, "operator.lock")
  : "";

function stop(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function timestampLabel() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function sqlLiteral(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function ensureOperatorPrivateRootIsOutsideRepository() {
  if (!OPERATOR_PRIVATE_DIR || !path.isAbsolute(OPERATOR_PRIVATE_DIR)) {
    stop("LOCALAPPDATA is unavailable; no private operator store can be established.");
  }
  const relative = path.relative(REPO_DIR, path.resolve(OPERATOR_PRIVATE_DIR));
  if (relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep))) {
    stop("The operator-private state path must be outside the repository.");
  }
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

async function verifyRemoteD178Identity(existing, legacyState) {
  const identity = stableD178QaIdentity();
  const authRows = await executeReadOnly(
    "taskchute-auth-nonprod",
    "SELECT id, email, name FROM user;",
  );
  if (authRows.some((row) => typeof row.id !== "string"
    || typeof row.email !== "string"
    || typeof row.name !== "string")) {
    stop("The nonprod AUTH identity inventory could not be reconciled safely.");
  }
  const markerUsers = authRows.filter((row) => row.name === identity.authDisplayName);
  const legacyDigest = legacyState?.email_sha256 ?? null;
  const credentialDigest = existing.credentials
    ? sha256(existing.credentials.email.trim().toLowerCase())
    : null;
  const legacyEmailUsers = legacyDigest
    ? authRows.filter((row) => sha256(row.email.trim().toLowerCase()) === legacyDigest)
    : [];
  const credentialEmailUsers = credentialDigest
    ? authRows.filter((row) => sha256(row.email.trim().toLowerCase()) === credentialDigest)
    : [];
  if (markerUsers.length > 1 || legacyEmailUsers.length > 1 || credentialEmailUsers.length > 1) {
    stop("The nonprod AUTH identity inventory contains duplicate D-178 candidates.");
  }

  const appDatabase = "taskchute-app-nonprod";
  const qaUser = sqlLiteral(identity.appUserId);
  const appMetricRows = await executeReadOnly(appDatabase,
    "SELECT "
      + "(SELECT COUNT(*) FROM app_users WHERE id = " + qaUser + ") AS app_user_count, "
      + "(SELECT COUNT(*) FROM auth_subject_mappings WHERE auth_provider = 'better-auth' AND app_user_id = " + qaUser + ") AS mapping_count, "
      + "(SELECT COUNT(*) FROM user_settings WHERE app_user_id = " + qaUser + ") AS settings_count, "
      + "(SELECT COUNT(*) FROM sections WHERE app_user_id = " + qaUser + ") AS section_count, "
      + "(SELECT COUNT(*) FROM routine_activity_coverage WHERE app_user_id = " + qaUser + ") AS coverage_count;");
  if (appMetricRows.length !== 1) stop("The nonprod APP QA identity counts could not be read safely.");
  const appMetrics = appMetricRows[0];
  const metricNames = ["app_user_count", "mapping_count", "settings_count", "section_count", "coverage_count"];
  if (metricNames.some((name) => !Number.isSafeInteger(appMetrics[name]) || appMetrics[name] < 0)) {
    stop("The nonprod APP QA identity counts were malformed.");
  }

  const ownerTables = await executeReadOnly(appDatabase,
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND sql LIKE '%REFERENCES app_users%';");
  if (ownerTables.length === 0 || ownerTables.some((table) => typeof table.name !== "string"
    || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table.name))) {
    stop("The nonprod APP owner table inventory could not be reconciled safely.");
  }
  const ownerRows = await executeReadOnly(appDatabase, "SELECT " + ownerTables.map((table, index) =>
    "(SELECT COUNT(*) FROM \"" + table.name + "\" WHERE app_user_id = " + qaUser + ") AS c" + index,
  ).join(", ") + ";");
  if (ownerRows.length !== 1 || ownerTables.some((_, index) =>
    !Number.isSafeInteger(ownerRows[0]["c" + index]) || ownerRows[0]["c" + index] < 0)) {
    stop("The nonprod APP owner data could not be reconciled safely.");
  }
  const ownerCounts = new Map(ownerTables.map((table, index) => [table.name, ownerRows[0]["c" + index]]));
  const anyAppRows = appMetrics.app_user_count > 0
    || appMetrics.mapping_count > 0
    || appMetrics.settings_count > 0
    || appMetrics.section_count > 0
    || appMetrics.coverage_count > 0
    || [...ownerCounts.values()].some((count) => count > 0);

  const subjectMappings = markerUsers.length === 1
    ? await executeReadOnly(appDatabase,
      "SELECT app_user_id FROM auth_subject_mappings WHERE auth_provider = 'better-auth' AND auth_subject_id = "
        + sqlLiteral(markerUsers[0].id) + " LIMIT 3;")
    : [];
  if (subjectMappings.length > 1 || subjectMappings.some((row) => row.app_user_id !== identity.appUserId)) {
    stop("The D-178 AUTH subject is mapped to an unexpected APP owner.");
  }
  const fingerprint = sha256(JSON.stringify({
    authMarkerIds: markerUsers.map((row) => row.id).sort(),
    legacyMatchIds: legacyEmailUsers.map((row) => row.id).sort(),
    credentialMatchIds: credentialEmailUsers.map((row) => row.id).sort(),
    appMetrics,
    ownerCounts: [...ownerCounts].sort(([left], [right]) => left.localeCompare(right)),
    subjectMappings: subjectMappings.map((row) => row.app_user_id).sort(),
  }));

  const hasStoredCredentials = Boolean(existing.credentials);
  if (markerUsers.length === 1) {
    const authUser = markerUsers[0];
    if (!hasStoredCredentials
      || credentialEmailUsers.length !== 1
      || credentialEmailUsers[0].id !== authUser.id
      || authUser.email.trim().toLowerCase() !== existing.credentials.email.trim().toLowerCase()) {
      stop("A D-178 AUTH identity exists without a matching recoverable operator credential vault.");
    }
    if (legacyEmailUsers.some((row) => row.id !== authUser.id)) {
      stop("The earlier private state conflicts with a different nonprod AUTH user.");
    }
    if (appMetrics.app_user_count !== 1) {
      stop("The existing D-178 AUTH identity has no unambiguous APP owner reservation.");
    }
    if (appMetrics.mapping_count === 1 && subjectMappings.length === 1) {
      return { status: "recoverable", identity, fingerprint };
    }
    if (appMetrics.mapping_count !== 0 || subjectMappings.length !== 0) {
      stop("The D-178 AUTH/APP mapping is only partially or ambiguously present.");
    }
    const expectedReservation = new Map([
      ["user_settings", 1],
      ["sections", 1],
      ["routine_board_heads", 1],
      ["project_board_heads", 1],
      ["mode_board_heads", 1],
    ]);
    if ([...ownerCounts].some(([name, count]) => count !== (expectedReservation.get(name) ?? 0))
      || expectedReservation.size !== [...ownerCounts].filter(([name]) => expectedReservation.has(name)).length
      || appMetrics.coverage_count !== 0) {
      stop("The unmapped D-178 APP reservation is not in its recoverable baseline state.");
    }
    return { status: "recoverable", identity, fingerprint };
  }

  if (legacyEmailUsers.length > 0 || credentialEmailUsers.length > 0) {
    stop("A nonprod AUTH user matches a private D-178 email digest but not the QA identity marker.");
  }
  if (!anyAppRows) return { status: "absent", identity, fingerprint };
  if (!hasStoredCredentials
    || appMetrics.app_user_count !== 1
    || appMetrics.mapping_count !== 0
    || appMetrics.coverage_count !== 0) {
    stop("The nonprod APP contains an unrecognized D-178 QA identity or partial provision.");
  }
  const expectedReservation = new Map([
    ["user_settings", 1],
    ["sections", 1],
    ["routine_board_heads", 1],
    ["project_board_heads", 1],
    ["mode_board_heads", 1],
  ]);
  if ([...ownerCounts].some(([name, count]) => count !== (expectedReservation.get(name) ?? 0))
    || expectedReservation.size !== [...ownerCounts].filter(([name]) => expectedReservation.has(name)).length) {
    stop("The unmapped D-178 APP reservation is not in its recoverable baseline state.");
  }
  return { status: "recoverable", identity, fingerprint };
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
  await mkdir(BACKUP_ROOT, { recursive: true });
  await hardenWindowsPrivateDirectory(BACKUP_ROOT);
  const backupDirectory = path.join(BACKUP_ROOT, "d178-nonprod-preqa-" + timestampLabel());
  await mkdir(backupDirectory, { recursive: true });
  await hardenWindowsPrivateDirectory(backupDirectory);
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

async function stopWorker() {
  await stopLocalWorker(devProcess);
}

async function verifyRemoteReadOnlyPreflight(existing, legacyState, expectedMarkerCount) {
  await verifyCloudflareAuthentication();
  await verifyRemoteD1Targets();
  await verifyActiveDeployment();
  await verifyNoPendingMigrations("taskchute-auth-nonprod");
  await verifyNoPendingMigrations("taskchute-app-nonprod");
  await verifyDatabaseIntegrity("taskchute-auth-nonprod");
  await verifyDatabaseIntegrity("taskchute-app-nonprod");
  const markerCount = await verifyCoverageBaseline();
  if (expectedMarkerCount !== undefined && markerCount !== expectedMarkerCount) {
    stop("The nonprod coverage marker baseline changed during the guarded operation.");
  }
  const qaIdentity = await verifyRemoteD178Identity(existing, legacyState);
  return { markerCount, qaIdentity };
}

async function runProvisioning() {
  if (Number(process.versions.node.split(".")[0]) < 22) {
    stop("Use Node.js 22 or newer for the pinned Wrangler version.");
  }
  ensureOperatorPrivateRootIsOutsideRepository();
  await privateStore.ensureReady();
  await acquireOperatorLock();

  let preparedCredentials;
  let operatorToken = "";
  let authSecret = "";
  let workerEnv;
  let requestBody = "";
  await loadAndVerifyGeneratedConfig();
  try {
    const legacyState = await privateStore.readLegacyState();
    const existing = await privateStore.loadExisting();
    const initialPreflight = await verifyRemoteReadOnlyPreflight(existing, legacyState);
    if (PREFLIGHT_ONLY) {
      process.stdout.write(
        "D-178 nonprod read-only preflight PASS (QA identity=" + initialPreflight.qaIdentity.status
          + "; coverage markers=" + initialPreflight.markerCount + "; no account write performed).\n",
      );
      return { status: "preflight_only", qaIdentity: initialPreflight.qaIdentity.status };
    }
    const backupDirectory = await createFreshBackups(initialPreflight.markerCount);
    preparedCredentials = await privateStore.prepareCredentials({
      remoteReconciled: true,
      remoteState: initialPreflight.qaIdentity.status,
    });

    const finalLegacyState = await privateStore.readLegacyState();
    const finalExisting = await privateStore.loadExisting();
    const finalPreflight = await verifyRemoteReadOnlyPreflight(
      finalExisting,
      finalLegacyState,
      initialPreflight.markerCount,
    );
    if (finalPreflight.qaIdentity.status !== initialPreflight.qaIdentity.status
      || finalPreflight.qaIdentity.fingerprint !== initialPreflight.qaIdentity.fingerprint) {
      stop("The remote D-178 identity changed after the read-only preflight; no operator POST was sent.");
    }

    const generatedConfig = await loadAndVerifyGeneratedConfig();
    const bindingByName = new Map(generatedConfig.d1_databases.map((binding) => [binding.database_name, binding]));
    temporaryRunDirectory = await mkdtemp(path.join(os.tmpdir(), "d178-qa-provision-"));
    const localConfigPath = path.join(temporaryRunDirectory, "wrangler.jsonc");
    const workerLogPath = path.join(temporaryRunDirectory, "logs");
    const localConfig = {
      name: "d178-qa-provision-local",
      main: path.join(APP_DIR, "worker", "qa-provisioning.ts"),
      compatibility_date: "2026-08-22",
      compatibility_flags: ["nodejs_compat"],
      secrets: { required: ["BETTER_AUTH_SECRET", "D178_QA_PROVISIONING_TOKEN"] },
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
    await writeFile(localConfigPath, JSON.stringify(localConfig, null, 2) + "\n", { flag: "wx" });
    await mkdir(workerLogPath, { recursive: true });

    operatorToken = randomBytes(32).toString("base64url");
    authSecret = randomBytes(48).toString("base64url");
    workerEnv = {
      ...makeWranglerEnv(),
      CLOUDFLARE_ENV: "",
      WRANGLER_LOG: "error",
      WRANGLER_LOG_PATH: workerLogPath,
      BETTER_AUTH_SECRET: authSecret,
      D178_QA_PROVISIONING_TOKEN: operatorToken,
    };
    let port;
    let inspectorPort;
    try {
      [port, inspectorPort] = await reserveLocalPorts(2);
    } catch {
      stop("Could not reserve loopback ports for the isolated local Worker (category=loopback_port_error).");
    }
    devProcess = startLocalWorker({
      wranglerBin: WRANGLER_BIN,
      configPath: localConfigPath,
      port,
      inspectorPort,
      cwd: temporaryRunDirectory,
      env: workerEnv,
    });
    await waitForLocalWorker(devProcess, port);

    const beforePostExisting = await privateStore.loadExisting();
    const beforePostLegacy = await privateStore.readLegacyState();
    const beforePost = await verifyRemoteReadOnlyPreflight(
      beforePostExisting,
      beforePostLegacy,
      initialPreflight.markerCount,
    );
    if (beforePost.qaIdentity.status !== initialPreflight.qaIdentity.status
      || beforePost.qaIdentity.fingerprint !== initialPreflight.qaIdentity.fingerprint) {
      stop("The remote D-178 identity changed while the loopback Worker was starting; no operator POST was sent.");
    }

    requestBody = JSON.stringify({
      email: preparedCredentials.credentials.email,
      password: preparedCredentials.credentials.password,
    });
    const response = await fetch("http://127.0.0.1:" + port + "/__operator/d178-qa/provision", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:" + port,
        "x-taskchute-qa-provision-token": operatorToken,
      },
      body: requestBody,
      signal: AbortSignal.timeout(90000),
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok || responseBody.alias !== "d178-routine-qa"
      || !["created", "recovered", "already_provisioned"].includes(responseBody.status)) {
      const candidateCode = responseBody?.error?.code;
      const code = typeof candidateCode === "string" && /^[a-z0-9_]{1,48}$/.test(candidateCode)
        ? candidateCode
        : "unknown";
      stop("QA provisioning stopped with status " + response.status + " (" + code + "). The response contained no credential values.");
    }
    await privateStore.saveState({
      ...preparedCredentials.state,
      status: "provisioned",
      provisioned_at: new Date().toISOString(),
    });
    process.stdout.write("QA alias d178-routine-qa: " + responseBody.status + "\n");
    process.stdout.write("Fresh APP/AUTH preservation backups are stored in the operator-private directory.\n");
    return { status: responseBody.status, backupDirectory };
  } finally {
    let workerStopFailed = false;
    let temporaryCleanupFailed = false;
    try {
      await stopWorker();
    } catch {
      workerStopFailed = true;
    }
    try {
      if (temporaryRunDirectory) {
        await rm(temporaryRunDirectory, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
      }
    } catch {
      temporaryCleanupFailed = true;
    } finally {
      temporaryRunDirectory = undefined;
      devProcess = undefined;
      if (preparedCredentials?.credentials) {
        preparedCredentials.credentials.email = "";
        preparedCredentials.credentials.password = "";
      }
      preparedCredentials = undefined;
      if (workerEnv) {
        workerEnv.BETTER_AUTH_SECRET = "";
        workerEnv.D178_QA_PROVISIONING_TOKEN = "";
      }
      workerEnv = undefined;
      requestBody = "";
      operatorToken = "";
      authSecret = "";
      await releaseOperatorLock();
    }
    if (workerStopFailed || temporaryCleanupFailed) {
      stop("The isolated Worker cleanup was incomplete; in-memory secrets were cleared and the operator lock was released.");
    }
  }
}

runProvisioning().catch(async (error) => {
  await stopWorker().catch(() => undefined);
  if (temporaryRunDirectory) await rm(temporaryRunDirectory, { recursive: true, force: true }).catch(() => undefined);
  await releaseOperatorLock();
  process.stderr.write((error instanceof Error ? error.message : "QA provisioning failed") + "\n");
  process.exitCode = 1;
});
