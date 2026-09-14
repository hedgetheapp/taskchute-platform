import { readFile } from "node:fs/promises";

const expected = {
  name: "taskchute-web-nonprod",
  runtime: "nonprod",
  bootstrap: "false",
  app: "taskchute-app-nonprod",
  auth: "taskchute-auth-nonprod",
  realtimeBindingCount: 1,
  realtimeBinding: "REALTIME_HUB",
  realtimeClass: "RealtimeHub",
  realtimeStorage: "sqlite",
};
const configPath = process.argv[2] ?? "dist/taskchute_web/wrangler.json";

if (process.env.CLOUDFLARE_ENV) {
  throw new Error("CLOUDFLARE_ENV must be unset before deploying the already environment-specific generated config");
}

let config;
try {
  config = JSON.parse(await readFile(configPath, "utf8"));
} catch (error) {
  throw new Error(`Cannot read generated nonprod config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
}

const bindings = new Map((config.d1_databases ?? []).map((binding) => [binding.binding, binding.database_name]));
const realtimeBindings = config.durable_objects?.bindings ?? [];
const realtimeBinding = realtimeBindings.find((binding) => binding.name === "REALTIME_HUB");
const actual = {
  name: config.name,
  runtime: config.vars?.RUNTIME_ENV,
  bootstrap: config.vars?.BOOTSTRAP_ENABLED,
  app: bindings.get("APP_DB"),
  auth: bindings.get("AUTH_DB"),
  realtimeBindingCount: realtimeBindings.length,
  realtimeBinding: realtimeBinding?.name,
  realtimeClass: realtimeBinding?.class_name,
  realtimeStorage: config.exports?.RealtimeHub?.storage,
};
const mismatches = Object.entries(expected)
  .filter(([key, value]) => actual[key] !== value)
  .map(([key, value]) => `${key}: expected ${value}, got ${actual[key] ?? "<missing>"}`);
if (mismatches.length > 0) {
  throw new Error(`Refusing nonprod deploy: ${mismatches.join("; ")}`);
}

console.log(`Nonprod deploy target verified: ${actual.name}; APP=${actual.app}; AUTH=${actual.auth}; REALTIME=${actual.realtimeBinding}/${actual.realtimeClass}/${actual.realtimeStorage}; RUNTIME_ENV=${actual.runtime}; BOOTSTRAP_ENABLED=${actual.bootstrap}`);
