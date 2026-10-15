import { spawn } from "node:child_process";
import { createServer } from "node:net";

const OUTPUT_LIMIT = 12_000;
const SAFE_SIGNALS = new Set(["SIGINT", "SIGTERM", "SIGKILL", "SIGBREAK"]);

function appendTail(current, chunk) {
  return (current + chunk).slice(-OUTPUT_LIMIT);
}

function safeCode(value) {
  return typeof value === "string" && /^[A-Z0-9_]{1,48}$/.test(value) ? value : "UNKNOWN";
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

export async function reserveLocalPorts(count = 2) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 8) {
    throw new Error("The local Worker port count is invalid.");
  }

  const servers = Array.from({ length: count }, () => createServer());
  try {
    await Promise.all(servers.map((server) => new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(0, "127.0.0.1");
    })));

    const ports = servers.map((server) => {
      const address = server.address();
      return typeof address === "object" && address ? address.port : 0;
    });
    if (ports.some((port) => !Number.isSafeInteger(port) || port < 1)
      || new Set(ports).size !== ports.length) {
      throw new Error("The operating system did not reserve distinct local Worker ports.");
    }
    await Promise.all(servers.map(closeServer));
    return ports;
  } catch {
    await Promise.all(servers.map((server) => closeServer(server).catch(() => undefined)));
    throw new Error("Could not reserve loopback ports for the isolated local Worker.");
  }
}

export function buildWranglerDevArgs({ configPath, port, inspectorPort }) {
  return [
    "dev", "--config", configPath,
    "--ip", "127.0.0.1", "--port", String(port),
    "--inspector-ip", "127.0.0.1", "--inspector-port", String(inspectorPort),
    "--show-interactive-dev-session", "false", "--log-level", "error",
  ];
}

export function startLocalWorker({ wranglerBin, configPath, port, inspectorPort, cwd, env }) {
  let child;
  let stdout = "";
  let stderr = "";
  let spawnErrorCode;

  try {
    child = spawn(process.execPath, [
      wranglerBin,
      ...buildWranglerDevArgs({ configPath, port, inspectorPort }),
    ], {
      cwd,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    spawnErrorCode = safeCode(error?.code);
  }

  if (child) {
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => { stdout = appendTail(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { stderr = appendTail(stderr, chunk); });
    child.once("error", (error) => { spawnErrorCode = safeCode(error?.code); });
  }

  return {
    child,
    getDiagnostics: () => ({
      stdout,
      stderr,
      spawnErrorCode,
      exitCode: child?.exitCode ?? null,
      signal: child?.signalCode ?? null,
    }),
  };
}

export function classifyWorkerStartupFailure({
  stdout = "",
  stderr = "",
  spawnErrorCode,
  exitCode = null,
  signal = null,
  timedOut = false,
  probeStatus = null,
} = {}) {
  const output = `${stdout}\n${stderr}`.toLowerCase();
  if (spawnErrorCode) return "process_spawn_error";
  if (/unknown (?:argument|option)|unrecognized option|too many non-option arguments|missing required argument/.test(output)) {
    return "wrangler_cli_argument_error";
  }
  if (/not authenticated|not logged in|authentication (?:failed|required)|unauthorized|api token.*(?:invalid|required)|remote (?:d1|binding).*(?:auth|target|database)/.test(output)
    || (/\bd1\b/.test(output) && /database.*(?:not found|does not exist|invalid|unauthorized)|(?:invalid|unknown).*database|account.*(?:not found|unauthorized)/.test(output))) {
    return "d1_auth_or_target_error";
  }
  if (/eaddrinuse|address already in use|eacces.{0,40}(?:127\.0\.0\.1|localhost):\d{1,5}|(?:127\.0\.0\.1|localhost):\d{1,5}.{0,40}eacces|invalid.{0,40}--?(?:inspector-)?port|(?:inspector-)?port.{0,40}(?:invalid|must be|expected|unavailable)/.test(output)) {
    return "loopback_port_error";
  }
  if (/could not resolve|failed to bundle|error while bundling|cannot find module|err_module_not_found|failed to import|unable to resolve/.test(output)) {
    return "bundle_or_import_error";
  }
  if (/spawn.{0,80}workerd|workerd(?:\.exe)?.{0,80}(?:not found|failed to start|spawn error)/.test(output)) {
    return "workerd_spawn_error";
  }
  if (/workers runtime failed to start|fatal uncaught|workerd\/|sqlite_cantopen|sqlite.*failed|unable to open database file/.test(output)) {
    return "workerd_runtime_error";
  }
  if (probeStatus !== null) return "readiness_probe_mismatch";
  if (timedOut) return "readiness_timeout";
  if (exitCode !== null || signal) return "worker_child_exit";
  return "worker_startup_error";
}

export function formatWorkerStartupFailure(diagnostics = {}) {
  const category = classifyWorkerStartupFailure(diagnostics);
  const details = [];
  if (diagnostics.spawnErrorCode) details.push(`spawn_error_code=${safeCode(diagnostics.spawnErrorCode)}`);
  if (Number.isSafeInteger(diagnostics.exitCode)) details.push(`child_exit_code=${diagnostics.exitCode}`);
  if (SAFE_SIGNALS.has(diagnostics.signal)) details.push(`child_signal=${diagnostics.signal}`);
  const suffix = details.length ? `; ${details.join("; ")}` : "";
  return `The isolated local Worker failed to start (category=${category}${suffix}). Wrangler output was withheld.`;
}

export async function waitForLocalWorker(server, port, { timeoutMs = 45_000, fetchImpl = fetch } = {}) {
  const deadline = Date.now() + timeoutMs;
  let probeStatus = null;

  while (Date.now() < deadline) {
    const diagnostics = server.getDiagnostics();
    if (diagnostics.spawnErrorCode || diagnostics.exitCode !== null) {
      throw new Error(formatWorkerStartupFailure(diagnostics));
    }

    try {
      const response = await fetchImpl(`http://127.0.0.1:${port}/__operator/health`, {
        method: "GET",
        signal: AbortSignal.timeout(750),
      });
      probeStatus = response.status;
      const body = await response.json().catch(() => null);
      if (response.status === 404 && body?.error?.code === "resource_not_found") {
        return { status: response.status };
      }
      throw new Error(formatWorkerStartupFailure({ ...diagnostics, probeStatus }));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("The isolated local Worker failed to start")) {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const diagnostics = server.getDiagnostics();
  throw new Error(formatWorkerStartupFailure({ ...diagnostics, probeStatus, timedOut: probeStatus === null }));
}

function waitForClose(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return Promise.race([
    new Promise((resolve) => child.once("close", () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

export async function stopLocalWorker(server) {
  const child = server?.child;
  if (!child || server.getDiagnostics().spawnErrorCode || child.exitCode !== null || child.signalCode !== null) return;

  child.kill("SIGINT");
  if (await waitForClose(child, 5_000)) return;
  child.kill("SIGTERM");
  if (await waitForClose(child, 2_000)) return;
  child.kill("SIGKILL");
  if (!await waitForClose(child, 2_000)) {
    throw new Error("The isolated local Worker process did not stop after termination was requested.");
  }
}
