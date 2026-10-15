import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, open, readFile, rm } from "node:fs/promises";
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
  stableD178QaIdentity,
} from "./d178-qa-credentials.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(SCRIPT_DIR, "..");
const REPO_DIR = path.resolve(APP_DIR, "..", "..");
const WORKER_ORIGIN = "https://taskchute-web-nonprod.taskfulness-sync.workers.dev";
const WORKER_NAME = "taskchute-web-nonprod";
const WORKER_VERSION = "01545a31-dfd9-4f6d-9825-fe56de8e2542";
const CONFIG_PATH = path.join(APP_DIR, "dist", "taskchute_web", "wrangler.json");
const WRANGLER_BIN = path.join(APP_DIR, "node_modules", "wrangler", "bin", "wrangler.js");
const APP_DATABASE = "taskchute-app-nonprod";
const AUTH_DATABASE = "taskchute-auth-nonprod";
const QA = stableD178QaIdentity();
const PRIVATE_ROOT = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, "TaskChutePlatform", "D178")
  : "";
const STATE_PATH = path.resolve(REPO_DIR, "..", "outputs", "d178-qa-provisioning-private-state.json");
const privateStore = createD178PrivateStore({ rootDir: PRIVATE_ROOT, legacyStatePath: STATE_PATH });
const LOCK_PATH = path.join(PRIVATE_ROOT, "gate-d.lock");
let lockHandle;
let localWorker;
let temporaryDirectory;
let localToken = "";
let localWorkerEnv;
let cookieHeader = "";
let credentials;
let state;

function stop(message) {
  throw new Error(message);
}

function sqlLiteral(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function jsonFromWrangler(output, label) {
  const trimmed = output.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const starts = [trimmed.indexOf("["), trimmed.indexOf("{")].filter((index) => index >= 0).sort((a, b) => a - b);
    for (const start of starts) {
      try { return JSON.parse(trimmed.slice(start)); } catch { /* try next JSON boundary */ }
    }
  }
  const firstCode = trimmed.length ? trimmed.codePointAt(0) : 0;
  const lastCode = trimmed.length ? trimmed.codePointAt(trimmed.length - 1) : 0;
  stop("Wrangler returned an unexpected " + label + " response (chars=" + trimmed.length
    + ", boundary_codes=" + firstCode + "/" + lastCode + ").");
}

function resultRows(value) {
  return (Array.isArray(value) ? value : [value]).flatMap((item) => Array.isArray(item?.results) ? item.results : []);
}

function wranglerEnvironment() {
  if (process.env.CLOUDFLARE_ENV) stop("CLOUDFLARE_ENV must be unset for the approved nonprod configuration.");
  return {
    ...process.env,
    WRANGLER_LOG: "log",
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_PATH: path.join(os.tmpdir(), "d178-gate-d-logs"),
    NO_COLOR: "1",
  };
}

async function runWrangler(args) {
  const childEnv = wranglerEnvironment();
  await mkdir(childEnv.WRANGLER_LOG_PATH, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WRANGLER_BIN, ...args], {
      cwd: APP_DIR,
      env: childEnv,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stderr.resume();
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.once("error", () => reject(new Error("Could not start the pinned Wrangler executable.")));
    child.once("close", (code) => {
      if (code !== 0) reject(new Error("A guarded nonprod D1 operation failed; its output was withheld."));
      else resolve(stdout);
    });
  });
}

async function query(databaseName, sql) {
  const output = await runWrangler([
    "d1", "execute", databaseName, "--remote", "--command", sql, "--json", "--config", CONFIG_PATH,
  ]);
  return resultRows(jsonFromWrangler(output, "D1 query"));
}

async function writeSql(databaseName, sql) {
  const output = await runWrangler([
    "d1", "execute", databaseName, "--remote", "--command", sql, "--json", "--config", CONFIG_PATH,
  ]);
  return jsonFromWrangler(output, "D1 write");
}

async function verifyRemoteTargets() {
  const workerConfig = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  if (workerConfig.name !== WORKER_NAME || workerConfig.vars?.RUNTIME_ENV !== "nonprod"
    || workerConfig.vars?.BOOTSTRAP_ENABLED !== "false") {
    stop("Generated Worker config is not the approved nonprod target.");
  }
  const bindings = new Map((workerConfig.d1_databases ?? []).map((entry) => [entry.database_name, entry.database_id]));
  if (bindings.size !== 2
    || bindings.get(AUTH_DATABASE) !== "60085f8d-0c4e-4c15-98e9-3ce178398041"
    || bindings.get(APP_DATABASE) !== "6ad7e35f-5d03-4be3-9b00-46cd713a51c3") {
    stop("Generated D1 bindings do not match both approved nonprod database IDs.");
  }
  await runWrangler(["whoami"]);
  const databases = jsonFromWrangler(
    await runWrangler(["d1", "list", "--json", "--config", CONFIG_PATH]),
    "D1 list",
  );
  for (const [name, id] of [[AUTH_DATABASE, "60085f8d-0c4e-4c15-98e9-3ce178398041"],
    [APP_DATABASE, "6ad7e35f-5d03-4be3-9b00-46cd713a51c3"]]) {
    if (!databases.some((entry) => entry.name === name && (entry.uuid ?? entry.database_id ?? entry.id) === id)) {
      stop("Cloudflare D1 list does not match the approved nonprod databases.");
    }
  }
  const deployment = jsonFromWrangler(await runWrangler([
    "deployments", "status", "--name", WORKER_NAME, "--json", "--config", CONFIG_PATH,
  ]), "deployment status");
  if (deployment.id !== "4684b3a5-d1a1-4290-8a48-3bafb688b882"
    || deployment.versions?.length !== 1
    || deployment.versions[0].version_id !== WORKER_VERSION
    || deployment.versions[0].percentage !== 100) {
    stop("The approved nonprod Worker deployment changed; Gate D stopped before mutation.");
  }
  for (const name of [AUTH_DATABASE, APP_DATABASE]) {
    const migrations = await runWrangler(["d1", "migrations", "list", name, "--remote", "--config", CONFIG_PATH]);
    if (!migrations.toLowerCase().includes("no migrations to apply")) {
      stop("A nonprod D1 migration is pending; Gate D stopped before mutation.");
    }
    const quick = await query(name, "PRAGMA quick_check;");
    const fk = await query(name, "PRAGMA foreign_key_check;");
    if (quick.length !== 1 || quick[0].quick_check !== "ok" || fk.length !== 0) {
      stop("Nonprod D1 integrity checks did not pass; Gate D stopped.");
    }
  }
}

async function saveGateState(gate) {
  state = { ...state, gate_d: gate };
  await privateStore.saveState(state);
}

async function acquireLock() {
  await mkdir(PRIVATE_ROOT, { recursive: true });
  await privateStore.ensureReady();
  try {
    lockHandle = await open(LOCK_PATH, "wx", 0o600);
    await lockHandle.writeFile(JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }) + "\n");
  } catch (error) {
    const code = error?.code;
    if (code === "EEXIST") stop("Another D-178 Gate D process holds the private operator lock.");
    stop("Could not safely acquire the private D-178 Gate D lock.");
  }
}

async function releaseLock() {
  if (!lockHandle) return;
  await lockHandle.close().catch(() => undefined);
  lockHandle = undefined;
  await rm(LOCK_PATH, { force: true }).catch(() => undefined);
}

function logicalDatePlus(date, days) {
  const value = new Date(date + "T00:00:00.000Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function monthAnchor(date, offset) {
  const value = new Date(date + "T00:00:00.000Z");
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + offset);
  return value.toISOString().slice(0, 10);
}

function periodAnchor(date, period) {
  if (period === "daily") return date;
  if (period === "monthly") return date.slice(0, 7) + "-01";
  return date.slice(0, 4) + "-01-01";
}

function periodEndExclusive(date, period) {
  if (period === "daily") return logicalDatePlus(date, 1);
  if (period === "monthly") return monthAnchor(date, 1);
  return (Number(date.slice(0, 4)) + 1) + "-01-01";
}

function expectedCoverageStatus(period, anchor, startedDate) {
  if (periodEndExclusive(anchor, period) <= startedDate) return "UNMEASURED";
  if (anchor >= logicalDatePlus(startedDate, 4)) return "COMPLETE";
  return "PARTIAL";
}

async function api(pathname, { method = "GET", body = undefined, signIn = false } = {}) {
  const url = new URL(pathname, WORKER_ORIGIN);
  if (url.origin !== WORKER_ORIGIN) stop("The authenticated API request escaped the approved nonprod Worker.");
  const headers = new Headers({ accept: "application/json", origin: WORKER_ORIGIN });
  if (cookieHeader) headers.set("cookie", cookieHeader);
  if (body !== undefined) headers.set("content-type", "application/json");
  let bodyText = body === undefined ? undefined : JSON.stringify(body);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: bodyText,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    bodyText = "";
    stop("The approved nonprod API request failed without returning a response.");
  }
  bodyText = "";
  if (signIn) {
    const setCookies = response.headers.getSetCookie?.() ?? [];
    cookieHeader = setCookies.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
  }
  let raw = await response.text();
  if (raw.length > 128_000) stop("The nonprod API returned an unexpectedly large response.");
  let value;
  try { value = JSON.parse(raw); } catch { stop("The nonprod API returned an invalid JSON response."); }
  raw = "";
  if (!response.ok) {
    const candidate = value?.error?.code;
    const code = typeof candidate === "string" && /^[a-z0-9_]{1,48}$/.test(candidate) ? candidate : "unknown";
    stop("The authenticated nonprod API returned status " + response.status + " (" + code + ").");
  }
  return value;
}

async function signIn() {
  let bodyText = JSON.stringify({ email: credentials.email, password: credentials.password });
  const headers = new Headers({ "content-type": "application/json", accept: "application/json", origin: WORKER_ORIGIN });
  let response;
  try {
    response = await fetch(new URL("/api/auth/sign-in/email", WORKER_ORIGIN), {
      method: "POST",
      headers,
      body: bodyText,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    bodyText = "";
    stop("QA password sign-in did not return a response.");
  }
  bodyText = "";
  cookieHeader = (response.headers.getSetCookie?.() ?? [])
    .map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
  let raw = await response.text();
  if (raw.length > 32_000 || !response.ok || !cookieHeader) {
    raw = "";
    stop("QA password sign-in failed; credentials and response details were withheld.");
  }
  let result;
  try { result = JSON.parse(raw); } catch { stop("QA password sign-in returned invalid JSON."); }
  const validIdentity = Boolean(result?.user?.id && typeof result.user.id === "string");
  result = undefined;
  raw = "";
  if (!validIdentity) {
    stop("QA password sign-in did not return a valid authenticated identity.");
  }
}

async function reviewActivity(period, anchor) {
  const params = new URLSearchParams({ period, anchor });
  const response = await api("/api/v1/review/date-metrics?" + params.toString());
  return response.routine_activity;
}

function assertCoverage(actual, status, created, deleted) {
  if (actual?.coverage_status !== status || actual?.created_count !== created || actual?.deleted_count !== deleted) {
    stop("Authenticated Review returned an unexpected Routine coverage state.");
  }
}

function deterministicUuid(label) {
  const digest = createHash("sha256").update(QA.appUserId + "/D178-GateD/" + label, "utf8").digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  let timestamp = BigInt(Date.UTC(2026, 9, 15));
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

async function readRemoteQaIdentity() {
  const authRows = await query(AUTH_DATABASE,
    "SELECT id, email, name FROM user WHERE name = " + sqlLiteral(QA.authDisplayName) + ";");
  if (authRows.length !== 1 || typeof authRows[0].email !== "string"
    || authRows[0].email.trim().toLowerCase() !== credentials.email.trim().toLowerCase()) {
    stop("The nonprod AUTH identity does not match the recoverable D-178 credential vault.");
  }
  const counts = await query(APP_DATABASE, `SELECT
    (SELECT COUNT(*) FROM app_users WHERE id = ${sqlLiteral(QA.appUserId)}) AS app_user_count,
    (SELECT COUNT(*) FROM auth_subject_mappings WHERE auth_provider = 'better-auth' AND app_user_id = ${sqlLiteral(QA.appUserId)}) AS mapping_count,
    (SELECT COUNT(*) FROM auth_subject_mappings WHERE auth_provider = 'better-auth' AND auth_subject_id = ${sqlLiteral(authRows[0].id)} AND app_user_id = ${sqlLiteral(QA.appUserId)}) AS exact_mapping_count,
    (SELECT COUNT(*) FROM user_settings WHERE app_user_id = ${sqlLiteral(QA.appUserId)}) AS settings_count,
    (SELECT COUNT(*) FROM sections WHERE app_user_id = ${sqlLiteral(QA.appUserId)}) AS section_count,
    (SELECT COUNT(*) FROM routine_activity_coverage) AS global_marker_count,
    (SELECT COUNT(*) FROM routine_activity_coverage WHERE app_user_id = ${sqlLiteral(QA.appUserId)}) AS qa_marker_count;`);
  if (counts.length !== 1 || counts[0].app_user_count !== 1 || counts[0].mapping_count !== 1
    || counts[0].exact_mapping_count !== 1 || counts[0].settings_count !== 1
    || counts[0].section_count < 1 || counts[0].global_marker_count > 1
    || counts[0].qa_marker_count > 1 || counts[0].global_marker_count !== counts[0].qa_marker_count) {
    stop("The nonprod AUTH/APP QA identity or owner-scoped coverage marker is ambiguous.");
  }
  const settings = await query(APP_DATABASE,
    "SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = " + sqlLiteral(QA.appUserId) + ";");
  if (settings.length !== 1 || settings[0].timezone !== "Asia/Tokyo" || settings[0].day_boundary_minutes !== 240) {
    stop("The D-178 QA owner settings differ from the approved baseline.");
  }
  return counts[0];
}

async function startGuardWorker() {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "d178-qa-gate-d-"));
  const configPath = path.join(temporaryDirectory, "wrangler.jsonc");
  const logsPath = path.join(temporaryDirectory, "logs");
  const workerConfig = {
    name: "d178-qa-gate-d-local-guard",
    main: path.join(APP_DIR, "worker", "qa-gate-d-d1-guard.ts"),
    compatibility_date: "2026-08-22",
    compatibility_flags: ["nodejs_compat"],
    secrets: { required: ["D178_QA_GATE_D_TOKEN"] },
    vars: {
      RUNTIME_ENV: "nonprod",
      BOOTSTRAP_ENABLED: "false",
      D178_QA_TARGET_APP_DATABASE: APP_DATABASE,
    },
    d1_databases: [{
      binding: "APP_DB",
      database_name: APP_DATABASE,
      database_id: "6ad7e35f-5d03-4be3-9b00-46cd713a51c3",
      remote: true,
    }],
  };
  await mkdir(logsPath, { recursive: true });
  const configHandle = await open(configPath, "wx");
  try {
    await configHandle.writeFile(JSON.stringify(workerConfig, null, 2) + "\n");
  } finally {
    await configHandle.close();
  }
  const [port, inspectorPort] = await reserveLocalPorts(2);
  localToken = randomBytes(32).toString("base64url");
  localWorkerEnv = {
    ...wranglerEnvironment(),
    D178_QA_GATE_D_TOKEN: localToken,
    WRANGLER_LOG_PATH: logsPath,
  };
  localWorker = startLocalWorker({
    wranglerBin: WRANGLER_BIN,
    configPath,
    port,
    inspectorPort,
    cwd: temporaryDirectory,
    env: localWorkerEnv,
  });
  await waitForLocalWorker(localWorker, port, { timeoutMs: 60_000 });
  return { port };
}

async function activateCoverageIfNeeded(logicalDate) {
  let rows = await query(APP_DATABASE, `SELECT started_at, started_logical_date
    FROM routine_activity_coverage WHERE app_user_id = ${sqlLiteral(QA.appUserId)};`);
  const global = await query(APP_DATABASE, "SELECT COUNT(*) AS count FROM routine_activity_coverage;");
  if (rows.length === 1) {
    if (global[0]?.count !== 1 || !rows[0].started_at || !rows[0].started_logical_date) {
      stop("The existing D-178 QA coverage marker is not uniquely recoverable.");
    }
    return rows[0];
  }
  if (rows.length !== 0 || global[0]?.count !== 0) {
    stop("A coverage marker exists outside the approved D-178 QA owner.");
  }
  const intent = state.gate_d?.activationIntent;
  const startedAt = intent?.started_at ?? new Date().toISOString();
  const startedDate = intent?.started_logical_date ?? logicalDate;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(startedAt)
    || !/^\d{4}-\d{2}-\d{2}$/.test(startedDate)) {
    stop("The D-178 activation recovery intent is invalid.");
  }
  await saveGateState({ ...(state.gate_d ?? {}), activationIntent: { started_at: startedAt, started_logical_date: startedDate } });
  const sql = `INSERT INTO routine_activity_coverage (app_user_id, started_at, started_logical_date)
    SELECT ${sqlLiteral(QA.appUserId)}, ${sqlLiteral(startedAt)}, ${sqlLiteral(startedDate)}
    WHERE EXISTS (SELECT 1 FROM app_users WHERE id = ${sqlLiteral(QA.appUserId)})
      AND NOT EXISTS (SELECT 1 FROM routine_activity_coverage);`;
  await writeSql(APP_DATABASE, sql);
  rows = await query(APP_DATABASE, `SELECT started_at, started_logical_date
    FROM routine_activity_coverage WHERE app_user_id = ${sqlLiteral(QA.appUserId)};`);
  if (rows.length !== 1 || rows[0].started_at !== startedAt || rows[0].started_logical_date !== startedDate) {
    stop("The owner-scoped D-178 coverage marker could not be verified after activation.");
  }
  return rows[0];
}

async function ensureCreateRequest(gate, board) {
  if (gate.createRequest) return gate;
  if (board.routines.length !== 0) stop("The QA Routine board contains unrecognized preexisting items.");
  const request = {
    operation_id: deterministicUuid("create-operation"),
    task_id: deterministicUuid("routine-task"),
    routine_definition_id: deterministicUuid("routine-definition"),
    title: "D-178 Gate D Routine activity fixture",
    expected_board_revision: board.board_revision,
    start_logical_date: board.current_logical_date,
    schedule: { kind: "daily" },
  };
  return { ...gate, createRequest: request, createExpectedLogicalDate: board.current_logical_date };
}

async function runGateD() {
  if (!PRIVATE_ROOT) stop("Windows operator-private credential storage is unavailable.");
  const privateRelative = path.relative(REPO_DIR, path.resolve(PRIVATE_ROOT));
  if (privateRelative === "" || (!path.isAbsolute(privateRelative) && privateRelative !== ".."
    && !privateRelative.startsWith(".." + path.sep))) {
    stop("The operator-private credential store must remain outside the repository.");
  }
  await acquireLock();
  const existing = await privateStore.loadExisting();
  if (!existing.credentials || !existing.state || existing.state.status !== "provisioned") {
    stop("The recoverable D-178 QA account is not in provisioned state; run the guarded provisioner first.");
  }
  credentials = existing.credentials;
  state = existing.state;
  await verifyRemoteTargets();
  await readRemoteQaIdentity();
  await signIn();

  let gate = state.gate_d ?? { version: 1 };
  const board = await api("/api/v1/routines");
  if (!Array.isArray(board.routines) || !Array.isArray(board.sections)
    || !Number.isSafeInteger(board.board_revision) || typeof board.current_logical_date !== "string") {
    stop("Authenticated QA Routine board response is incomplete.");
  }
  const currentDate = board.current_logical_date;
  const unmeasuredDaily = await reviewActivity("daily", currentDate);
  const unmeasuredMonthly = await reviewActivity("monthly", periodAnchor(currentDate, "monthly"));
  const unmeasuredYearly = await reviewActivity("yearly", periodAnchor(currentDate, "yearly"));
  const markerBeforeActivation = await readRemoteQaIdentity();
  if (markerBeforeActivation.qa_marker_count === 0) {
    if (board.routines.length !== 0 || gate.createRequest) {
      stop("The unactivated QA owner already contains a Routine fixture; activation stopped for reconciliation.");
    }
    const oldActivity = await query(APP_DATABASE, `SELECT
      (SELECT COUNT(*) FROM routine_definitions WHERE app_user_id = ${sqlLiteral(QA.appUserId)}) AS routines,
      (SELECT COUNT(*) FROM routine_definition_archives WHERE app_user_id = ${sqlLiteral(QA.appUserId)}) AS archives;`);
    if (oldActivity[0]?.routines !== 0 || oldActivity[0]?.archives !== 0) {
      stop("The unactivated QA owner contains preexisting Routine activity; activation stopped.");
    }
    assertCoverage(unmeasuredDaily, "UNMEASURED", null, null);
    assertCoverage(unmeasuredMonthly, "UNMEASURED", null, null);
    assertCoverage(unmeasuredYearly, "UNMEASURED", null, null);
    const previousDay = logicalDatePlus(currentDate, -1);
    const previousMonth = monthAnchor(currentDate, -1);
    const previousYear = (Number(currentDate.slice(0, 4)) - 1) + "-01-01";
    assertCoverage(await reviewActivity("daily", previousDay), "UNMEASURED", null, null);
    assertCoverage(await reviewActivity("monthly", previousMonth), "UNMEASURED", null, null);
    assertCoverage(await reviewActivity("yearly", previousYear), "UNMEASURED", null, null);
    await saveGateState({ ...gate, preActivation: { logical_date: currentDate, status: "UNMEASURED" } });
  }

  const guardWorker = await startGuardWorker();
  const marker = await activateCoverageIfNeeded(currentDate);
  gate = { ...state.gate_d, activation: marker };
  await saveGateState(gate);

  let createBoard = await api("/api/v1/routines");
  gate = await ensureCreateRequest(gate, createBoard);
  await saveGateState(gate);
  const createResult = await api("/api/v1/routines", { method: "POST", body: gate.createRequest });
  if (createResult.routine_definition_id !== gate.createRequest.routine_definition_id
    || createResult.task_id !== gate.createRequest.task_id
    || !Number.isSafeInteger(createResult.board_revision)
    || !Number.isSafeInteger(createResult.settings_revision)) {
    stop("Authenticated QA Routine creation returned an unexpected result.");
  }
  gate = { ...gate, createResult };
  await saveGateState(gate);
  const createReplay = await api("/api/v1/routines", { method: "POST", body: gate.createRequest });
  if (JSON.stringify(createReplay) !== JSON.stringify(createResult)) {
    stop("The authenticated QA Routine create replay did not return the stored result.");
  }
  const createdRows = await query(APP_DATABASE, `SELECT created_logical_date FROM routine_definitions
    WHERE app_user_id = ${sqlLiteral(QA.appUserId)} AND id = ${sqlLiteral(gate.createRequest.routine_definition_id)};`);
  if (createdRows.length !== 1 || createdRows[0].created_logical_date !== gate.createExpectedLogicalDate) {
    stop("The QA Routine creation did not preserve its authoritative TaskChuteDay logical date.");
  }
  const daysAfterCreate = await query(APP_DATABASE,
    "SELECT COUNT(*) AS count FROM taskchute_days WHERE app_user_id = " + sqlLiteral(QA.appUserId) + ";");
  if (daysAfterCreate[0]?.count !== 0) stop("The QA Routine probe unexpectedly materialized a TaskChuteDay.");

  const currentBoard = await api("/api/v1/routines");
  let deleteRequest = gate.deleteRequest;
  if (!deleteRequest) {
    deleteRequest = {
      operation_id: deterministicUuid("delete-operation"),
      routine_definition_id: gate.createRequest.routine_definition_id,
      expected_settings_revision: createResult.settings_revision,
      expected_board_revision: createResult.board_revision,
    };
    gate = { ...gate, deleteRequest, deleteExpectedLogicalDate: currentBoard.current_logical_date };
    await saveGateState(gate);
  }
  const deleteResult = await api("/api/v1/routines/" + gate.deleteRequest.routine_definition_id + "/delete", {
    method: "POST", body: gate.deleteRequest,
  });
  if (deleteResult.routine_definition_id !== gate.deleteRequest.routine_definition_id
    || !Number.isSafeInteger(deleteResult.board_revision)) {
    stop("Authenticated QA Routine deletion returned an unexpected result.");
  }
  gate = { ...gate, deleteResult };
  await saveGateState(gate);
  const deleteReplay = await api("/api/v1/routines/" + gate.deleteRequest.routine_definition_id + "/delete", {
    method: "POST", body: gate.deleteRequest,
  });
  if (JSON.stringify(deleteReplay) !== JSON.stringify(deleteResult)) {
    stop("The authenticated QA Routine delete replay did not return the stored result.");
  }
  const deletedRows = await query(APP_DATABASE, `SELECT deleted_logical_date FROM routine_definition_archives
    WHERE app_user_id = ${sqlLiteral(QA.appUserId)} AND routine_definition_id = ${sqlLiteral(gate.deleteRequest.routine_definition_id)};`);
  if (deletedRows.length !== 1 || deletedRows[0].deleted_logical_date !== gate.deleteExpectedLogicalDate) {
    stop("The QA Routine deletion did not preserve its authoritative TaskChuteDay logical date.");
  }
  const daysAfterDelete = await query(APP_DATABASE,
    "SELECT COUNT(*) AS count FROM taskchute_days WHERE app_user_id = " + sqlLiteral(QA.appUserId) + ";");
  if (daysAfterDelete[0]?.count !== 0) stop("The QA Routine deletion unexpectedly materialized a TaskChuteDay.");

  const createdDate = createdRows[0].created_logical_date;
  const deletedDate = deletedRows[0].deleted_logical_date;
  for (const period of ["daily", "monthly", "yearly"]) {
    const anchors = new Set([
      periodAnchor(marker.started_logical_date, period),
      periodAnchor(createdDate, period),
      periodAnchor(deletedDate, period),
    ]);
    for (const anchor of anchors) {
      const status = expectedCoverageStatus(period, anchor, marker.started_logical_date);
      const end = periodEndExclusive(anchor, period);
      const expectedCreated = createdDate >= marker.started_logical_date && createdDate >= anchor && createdDate < end ? 1 : 0;
      const expectedDeleted = deletedDate >= marker.started_logical_date && deletedDate >= anchor && deletedDate < end ? 1 : 0;
      assertCoverage(await reviewActivity(period, anchor), status,
        status === "UNMEASURED" ? null : expectedCreated,
        status === "UNMEASURED" ? null : expectedDeleted);
    }
  }
  const completeDate = logicalDatePlus(marker.started_logical_date, 4);
  assertCoverage(await reviewActivity("daily", completeDate), "COMPLETE", 0, 0);
  const completeMonth = monthAnchor(completeDate, 1);
  assertCoverage(await reviewActivity("monthly", completeMonth), "COMPLETE", 0, 0);
  let completeYear = completeDate.slice(0, 4) + "-01-01";
  if (completeYear < completeDate) completeYear = (Number(completeYear.slice(0, 4)) + 1) + "-01-01";
  assertCoverage(await reviewActivity("yearly", completeYear), "COMPLETE", 0, 0);

  const guardIds = {
    app_user_id: QA.appUserId,
    task_id: deterministicUuid("old-worker-task"),
    routine_definition_id: deterministicUuid("old-worker-routine"),
    operation_id: deterministicUuid("old-worker-operation"),
    logical_date: marker.started_logical_date,
  };
  const guardResponse = await fetch("http://127.0.0.1:" + guardWorker.port + "/__operator/d178-gate-d/legacy-guard", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1:" + guardWorker.port,
      "x-d178-gate-d-token": localToken,
    },
    body: JSON.stringify(guardIds),
    signal: AbortSignal.timeout(30_000),
  });
  const guardResult = await guardResponse.json().catch(() => ({}));
  if (!guardResponse.ok || guardResult.status !== "pass") {
    stop("The nonprod old-Worker SQL shape was not proven to reject atomically.");
  }

  const markerAfter = await readRemoteQaIdentity();
  const unmeasuredAfter = await reviewActivity("daily", logicalDatePlus(marker.started_logical_date, -1));
  assertCoverage(unmeasuredAfter, "UNMEASURED", null, null);
  if (markerAfter.global_marker_count !== 1 || markerAfter.qa_marker_count !== 1) {
    stop("Coverage activation escaped the single approved QA owner.");
  }
  gate = { ...gate, guard: "pass", status: "PASS" };
  await saveGateState(gate);
  process.stdout.write(
    "D-178 persistent nonprod Gate D owner-scoped cases PASS (authenticated QA create/delete/replay; logical dates; "
      + "UNMEASURED/PARTIAL/COMPLETE; old-SQL guard rollback; marker=QA only). "
      + "Settings-race evidence is focused local integration only; persistent concurrent settings-race NOT_RUN.\n",
  );
}

try {
  await runGateD();
} catch (error) {
  const message = error instanceof Error ? error.message : "D-178 Gate D failed safely.";
  process.stderr.write(message + "\n");
  process.exitCode = 1;
} finally {
  await stopLocalWorker(localWorker).catch(() => undefined);
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }).catch(() => undefined);
  temporaryDirectory = undefined;
  localWorker = undefined;
  if (localWorkerEnv) localWorkerEnv.D178_QA_GATE_D_TOKEN = "";
  localWorkerEnv = undefined;
  localToken = "";
  cookieHeader = "";
  if (credentials) {
    credentials.email = "";
    credentials.password = "";
  }
  credentials = undefined;
  state = undefined;
  await releaseLock();
}
