import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";

interface TestBindings {
  TEST_AUTH_MIGRATIONS: D1Migration[];
  TEST_APP_MIGRATIONS: D1Migration[];
}

const testEnv = env as Env & TestBindings;
process.env.BETTER_AUTH_SECRET = "fixture-only-secret-that-is-longer-than-thirty-two-characters";
process.env.BOOTSTRAP_TOKEN = "fixture-only-bootstrap-token";
await applyD1Migrations(testEnv.AUTH_DB, testEnv.TEST_AUTH_MIGRATIONS, "auth_test_migrations");
await applyD1Migrations(testEnv.APP_DB, testEnv.TEST_APP_MIGRATIONS, "app_test_migrations");

