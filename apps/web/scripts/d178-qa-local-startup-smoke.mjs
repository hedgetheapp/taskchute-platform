import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  reserveLocalPorts,
  startLocalWorker,
  stopLocalWorker,
  waitForLocalWorker,
} from "./d178-qa-worker-startup.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(SCRIPT_DIR, "..");
const WRANGLER_BIN = path.join(APP_DIR, "node_modules", "wrangler", "bin", "wrangler.js");
const AUTH_DB_ID = "00000000-0000-4000-8000-000000000001";
const APP_DB_ID = "00000000-0000-4000-8000-000000000002";

function createCredentialFreeEnv(homeDirectory, logDirectory) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(?:CLOUDFLARE_|CF_|WRANGLER_)/i.test(key)
      || /(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|API[_-]?KEY)/i.test(key)) {
      delete env[key];
    }
  }
  Object.assign(env, {
    HOME: homeDirectory,
    USERPROFILE: homeDirectory,
    APPDATA: path.join(homeDirectory, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(homeDirectory, "AppData", "Local"),
    XDG_CONFIG_HOME: path.join(homeDirectory, ".config"),
    XDG_DATA_HOME: path.join(homeDirectory, ".local", "share"),
    XDG_CACHE_HOME: path.join(homeDirectory, ".cache"),
    TEMP: homeDirectory,
    TMP: homeDirectory,
    CLOUDFLARE_ENV: "",
    WRANGLER_LOG: "error",
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_PATH: logDirectory,
    WRANGLER_SEND_METRICS: "false",
    NO_COLOR: "1",
  });
  return env;
}

async function removeTemporaryDirectory(directory) {
  try {
    await rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  } catch {
    throw new Error("Temporary local Worker smoke files could not be removed after shutdown.");
  }
}

export async function runLocalStartupSmoke() {
  if (Number(process.versions.node.split(".")[0]) < 22) {
    throw new Error("Use Node.js 22 or newer for the pinned Wrangler version.");
  }

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "d178-qa-worker-startup-"));
  const homeDirectory = path.join(temporaryDirectory, "isolated-home");
  const logsDirectory = path.join(temporaryDirectory, "logs");
  const configPath = path.join(temporaryDirectory, "wrangler.jsonc");
  const devVarsPath = path.join(temporaryDirectory, ".dev.vars");
  const workerMain = path.join(APP_DIR, "worker", "qa-provisioning.ts");
  let worker;

  try {
    await mkdir(homeDirectory, { recursive: true });
    await mkdir(logsDirectory, { recursive: true });
    const localConfig = {
      name: "d178-qa-provision-local-startup-smoke",
      main: workerMain,
      compatibility_date: "2026-08-22",
      compatibility_flags: ["nodejs_compat"],
      vars: {
        RUNTIME_ENV: "nonprod",
        BOOTSTRAP_ENABLED: "false",
        D178_QA_PROVISIONING_ENABLED: "false",
        D178_QA_TARGET_APP_DATABASE: "d178-startup-smoke-app",
        D178_QA_TARGET_AUTH_DATABASE: "d178-startup-smoke-auth",
      },
      d1_databases: [
        { binding: "AUTH_DB", database_name: "d178-startup-smoke-auth", database_id: AUTH_DB_ID },
        { binding: "APP_DB", database_name: "d178-startup-smoke-app", database_id: APP_DB_ID },
      ],
    };
    await writeFile(configPath, JSON.stringify(localConfig, null, 2) + "\n", { flag: "wx" });
    await writeFile(devVarsPath,
      "BETTER_AUTH_SECRET=" + randomBytes(48).toString("base64url")
        + "\nD178_QA_PROVISIONING_TOKEN=" + randomBytes(32).toString("base64url") + "\n",
      { flag: "wx", mode: 0o600 });

    let ports;
    try {
      ports = await reserveLocalPorts(2);
    } catch {
      throw new Error("The local startup smoke could not reserve loopback ports (category=loopback_port_error).");
    }

    worker = startLocalWorker({
      wranglerBin: WRANGLER_BIN,
      configPath,
      port: ports[0],
      inspectorPort: ports[1],
      cwd: temporaryDirectory,
      env: createCredentialFreeEnv(homeDirectory, logsDirectory),
    });
    const probe = await waitForLocalWorker(worker, ports[0], { timeoutMs: 60_000 });
    return {
      status: probe.status,
      mode: "local synthetic D1",
      operatorPostSent: false,
      cloudflareCredentialsPassed: false,
    };
  } finally {
    await stopLocalWorker(worker);
    await removeTemporaryDirectory(temporaryDirectory);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runLocalStartupSmoke().then((result) => {
    process.stdout.write(
      `D-178 QA local Worker startup smoke PASS (HTTP ${result.status}; ${result.mode}; GET only; no operator POST or Cloudflare credentials).\n`,
    );
  }).catch((error) => {
    const message = error instanceof Error ? error.message : "Local Worker startup smoke failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
