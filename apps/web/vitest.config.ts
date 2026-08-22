import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_AUTH_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations/auth")),
          TEST_APP_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations/app")),
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/setup-worker.ts"],
    maxWorkers: 1,
    include: ["test/**/*.test.ts"],
  },
});
