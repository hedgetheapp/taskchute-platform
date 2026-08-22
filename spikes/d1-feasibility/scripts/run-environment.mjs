import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const modeIndex = process.argv.indexOf("--mode");
const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : "local";
if (mode !== "local" && mode !== "remote") throw new Error("--mode must be local or remote");

function optionalArgument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

const cwd = process.cwd();
const runId = `${mode}-${process.pid}-${Date.now()}`;
const persistenceDirectory = mode === "local" ? path.resolve(".wrangler", "runs", runId) : null;
const port = await findAvailablePort();
const baseUrl = `http://127.0.0.1:${port}`;
const config = mode === "local" ? "wrangler.jsonc" : ".wrangler.remote.generated.jsonc";
const wranglerCli = path.resolve("node_modules", "wrangler", "bin", "wrangler.js");
if (!fs.existsSync(path.join(cwd, config))) {
  throw new Error(`${config} is missing; render the isolated remote config first`);
}

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("failed to allocate a local test port"));
        return;
      }
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

const wranglerArgs = [wranglerCli, "d1", "execute", "DB", mode === "local" ? "--local" : "--remote", "--file", "./schema.sql", "--config", config];
if (persistenceDirectory) wranglerArgs.push("--persist-to", persistenceDirectory);
await run(process.execPath, wranglerArgs);

const devArgs = [wranglerCli, "dev", "--ip", "127.0.0.1", "--port", String(port), "--log-level", "error", "--config", config, ...(mode === "local" ? ["--local"] : ["--remote"])];
if (persistenceDirectory) devArgs.push("--persist-to", persistenceDirectory);
const dev = spawn(process.execPath, devArgs, {
  cwd,
  stdio: ["ignore", "pipe", "pipe"]
});
dev.stdout.on("data", chunk => process.stdout.write(chunk));
dev.stderr.on("data", chunk => process.stderr.write(chunk));
const devExited = new Promise(resolve => dev.once("exit", (code, signal) => resolve({ code, signal })));

async function waitForHealth() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (dev.exitCode !== null || dev.signalCode !== null) {
      throw new Error(`wrangler dev exited before health check (code=${dev.exitCode}, signal=${dev.signalCode})`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("wrangler dev did not become healthy within 60 seconds");
}

try {
  await waitForHealth();
  const contractArgs = ["./scripts/contract-tests.mjs", "--base-url", baseUrl, "--environment", mode];
  for (const name of ["only", "concurrency-requests", "concurrency-iterations"]) {
    const value = optionalArgument(name);
    if (value !== null) contractArgs.push(`--${name}`, value);
  }
  await run(process.execPath, contractArgs);
} finally {
  if (dev.exitCode === null && dev.signalCode === null) dev.kill("SIGTERM");
  await Promise.race([
    devExited,
    new Promise(resolve => setTimeout(resolve, 5_000))
  ]);
}
