import fs from "node:fs";

const [databaseName, databaseId] = process.argv.slice(2);
if (!databaseName || !/^[a-z0-9-]+$/.test(databaseName)) throw new Error("database name must use lowercase letters, digits, and dashes");
if (!databaseId || !/^[0-9a-f-]{36}$/i.test(databaseId)) throw new Error("database ID must be a UUID");

const config = {
  $schema: "./node_modules/wrangler/config-schema.json",
  name: "taskchute-d1-feasibility-spike-remote-dev",
  main: "./src/index.ts",
  compatibility_date: "2026-08-21",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: [{
    binding: "DB",
    database_name: databaseName,
    database_id: databaseId,
    remote: true
  }]
};
fs.writeFileSync(".wrangler.remote.generated.jsonc", `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log("remote config rendered without account or credential data");
