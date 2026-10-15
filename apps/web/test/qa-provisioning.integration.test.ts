import { env } from "cloudflare:workers";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { uuidv7 } from "../src/shared/uuidv7";
import worker from "../worker";
import { createRequestAuth } from "../worker/auth/better-auth";
import provisionWorker, { d178QaIdentity } from "../worker/qa-provisioning";

const token = "fixture-only-d178-qa-provisioning-token";
const origin = "http://127.0.0.1:8787";
const testEmails = new Set<string>();

function provisioningEnv(overrides: Record<string, unknown> = {}): Env {
  process.env.D178_QA_PROVISIONING_TOKEN = token;
  return {
    ...env,
    RUNTIME_ENV: "nonprod",
    BOOTSTRAP_ENABLED: "false",
    D178_QA_PROVISIONING_ENABLED: "true",
    D178_QA_PROVISIONING_TOKEN: token,
    D178_QA_TARGET_APP_DATABASE: "taskchute-app-nonprod",
    D178_QA_TARGET_AUTH_DATABASE: "taskchute-auth-nonprod",
    ...overrides,
  } as unknown as Env;
}

function request(email: string, password: string, options: {
  host?: string;
  token?: string;
  body?: Record<string, unknown>;
  origin?: string;
} = {}): Request {
  const target = (options.host ?? origin) + "/__operator/d178-qa/provision";
  const headers = new Headers({ "content-type": "application/json", origin: options.origin ?? options.host ?? origin });
  if (options.token !== "") headers.set("x-taskchute-qa-provision-token", options.token ?? token);
  return new Request(target, {
    method: "POST",
    headers,
    body: JSON.stringify(options.body ?? { email, password }),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe.sequential("D-178 isolated QA provisioning entrypoint", () => {
  afterAll(async () => {
    const identity = await d178QaIdentity();
    const appUserTables = await env.APP_DB.prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND sql LIKE '%REFERENCES app_users%'",
    ).all<{ name: string }>();
    const allowedReservationTables = new Set(["auth_subject_mappings", "mode_board_heads", "project_board_heads", "routine_board_heads", "sections", "user_settings"]);
    const unexpectedRows: string[] = [];
    for (const table of appUserTables.results) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table.name)) {
        throw new Error("Local test cleanup refused an unexpected APP table identifier.");
      }
      const count = await env.APP_DB.prepare(
        "SELECT COUNT(*) AS count FROM \"" + table.name + "\" WHERE app_user_id = ?",
      ).bind(identity.appUserId).first<number>("count");
      if (count === null) throw new Error("Local test cleanup could not verify a QA owner table.");
      if (count > 0 && !allowedReservationTables.has(table.name)) unexpectedRows.push(table.name);
    }
    if (unexpectedRows.length > 0) {
      throw new Error("Local test cleanup refused unexpected QA owner rows in: " + unexpectedRows.join(", "));
    }
    await env.APP_DB.batch([
      env.APP_DB.prepare("DELETE FROM routine_board_heads WHERE app_user_id = ?").bind(identity.appUserId),
      env.APP_DB.prepare("DELETE FROM project_board_heads WHERE app_user_id = ?").bind(identity.appUserId),
      env.APP_DB.prepare("DELETE FROM mode_board_heads WHERE app_user_id = ?").bind(identity.appUserId),
      env.APP_DB.prepare("DELETE FROM auth_subject_mappings WHERE app_user_id = ?").bind(identity.appUserId),
      env.APP_DB.prepare("DELETE FROM sections WHERE app_user_id = ?").bind(identity.appUserId),
      env.APP_DB.prepare("DELETE FROM user_settings WHERE app_user_id = ?").bind(identity.appUserId),
      env.APP_DB.prepare("DELETE FROM app_users WHERE id = ?").bind(identity.appUserId),
    ]);
    for (const email of testEmails) {
      await env.AUTH_DB.prepare("DELETE FROM user WHERE email = ?").bind(email).run();
    }
  });

  afterEach(() => vi.restoreAllMocks());

  it("fails closed for a non-loopback host, wrong target, invalid token, and the public Worker", async () => {
    const identity = await d178QaIdentity();
    const body = { email: "d178-gate.fixture@example.test", password: "private-fixture-pass-1234" };
    const before = await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM app_users WHERE id = ?")
      .bind(identity.appUserId).first<number>("count");

    const nonLoopback = await provisionWorker.fetch(request(body.email, body.password, { host: "http://localhost:8787" }),
      provisioningEnv());
    const wrongOrigin = await provisionWorker.fetch(request(body.email, body.password, { origin: "https://attacker.example" }), provisioningEnv());
    const wrongTarget = await provisionWorker.fetch(request(body.email, body.password), provisioningEnv({
      D178_QA_TARGET_APP_DATABASE: "taskchute-app-production",
    }));
    const wrongToken = await provisionWorker.fetch(request(body.email, body.password, { token: "wrong-token" }),
      provisioningEnv());
    const publicPath = await worker.fetch(request(body.email, body.password), provisioningEnv());

    expect(nonLoopback.status).toBe(404);
    expect(wrongOrigin.status).toBe(404);
    expect(wrongTarget.status).toBe(404);
    expect(wrongToken.status).toBe(404);
    expect(publicPath.status).toBe(404);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM app_users WHERE id = ?")
      .bind(identity.appUserId).first<number>("count")).toBe(before);
    expect(await env.AUTH_DB.prepare("SELECT COUNT(*) AS count FROM user WHERE email = ?")
      .bind(body.email).first<number>("count")).toBe(0);
  });

  it("rejects an existing non-QA identity without reusing it or reserving its APP owner", async () => {
    const identity = await d178QaIdentity();
    const email = "d178-collision-" + uuidv7() + "@example.test";
    testEmails.add(email);
    const password = "private-collision-pass-1234";
    const collisionRequest = request(email, password);
    const collisionAuth = createRequestAuth(collisionRequest, env, true, true);
    await collisionAuth.api.signUpEmail({ body: { email, password, name: "Existing unrelated fixture" }, headers: collisionRequest.headers });

    const errorLog = vi.spyOn(console, "error");
    const response = await provisionWorker.fetch(request(email, password), provisioningEnv());
    const responseText = await response.text();
    expect(response.status).toBe(409);
    expect(responseText).not.toContain(email);
    expect(responseText).not.toContain(password);
    expect(responseText).not.toContain(token);
    expect(errorLog).not.toHaveBeenCalled();
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM app_users WHERE id = ?")
      .bind(identity.appUserId).first<number>("count")).toBe(0);
  });

  it("serializes a competing owner, recovers AUTH success after APP failure, and is idempotent", async () => {
    const identity = await d178QaIdentity();
    const email = "d178-routine-qa-" + uuidv7() + "@d178-qa.invalid";
    const password = "private-recovery-pass-1234";
    const otherEmail = "d178-racer-" + uuidv7() + "@example.test";
    const otherPassword = "private-racer-pass-1234";
    testEmails.add(email);
    testEmails.add(otherEmail);
    let notifyReservation: () => void = () => undefined;
    let continueFirst: () => void = () => undefined;
    const reservationCreated = new Promise<void>((resolve) => { notifyReservation = resolve; });
    const releaseFirst = new Promise<void>((resolve) => { continueFirst = resolve; });
    let batches = 0;
    const appDatabase = new Proxy(env.APP_DB, {
      get(target, property) {
        if (property === "batch") {
          return async (statements: D1PreparedStatement[]) => {
            batches += 1;
            if (batches === 2) throw new Error("injected APP mapping failure");
            const result = await target.batch(statements);
            if (batches === 1) {
              notifyReservation();
              await releaseFirst;
            }
            return result;
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const firstEnv = provisioningEnv({ APP_DB: appDatabase });
    const firstRequest = provisionWorker.fetch(request(email, password), firstEnv);
    await reservationCreated;
    const competing = await provisionWorker.fetch(request(otherEmail, otherPassword), provisioningEnv());
    expect(competing.status).toBe(409);
    continueFirst();

    const partial = await firstRequest;
    expect(partial.status).toBe(503);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM auth_subject_mappings WHERE app_user_id = ?")
      .bind(identity.appUserId).first<number>("count")).toBe(0);
    expect(await env.AUTH_DB.prepare("SELECT COUNT(*) AS count FROM user WHERE email = ?")
      .bind(email).first<number>("count")).toBe(1);
    expect(await env.AUTH_DB.prepare("SELECT COUNT(*) AS count FROM user WHERE email = ?")
      .bind(otherEmail).first<number>("count")).toBe(0);

    await env.APP_DB.prepare("UPDATE user_settings SET updated_at = '2000-01-01T00:00:00.000Z' WHERE app_user_id = ?")
      .bind(identity.appUserId).run();
    const recovered = await provisionWorker.fetch(request(email, password), provisioningEnv());
    expect(recovered.status).toBe(200);
    expect(await json(recovered)).toEqual({ alias: "d178-routine-qa", status: "recovered" });

    const repeated = await provisionWorker.fetch(request(email, password), provisioningEnv());
    expect(repeated.status).toBe(200);
    expect(await json(repeated)).toEqual({ alias: "d178-routine-qa", status: "already_provisioned" });
    expect(await env.AUTH_DB.prepare("SELECT COUNT(*) AS count FROM user WHERE name = ?")
      .bind((await d178QaIdentity()).authDisplayName).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM auth_subject_mappings WHERE app_user_id = ?")
      .bind(identity.appUserId).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM sections WHERE app_user_id = ?")
      .bind(identity.appUserId).first<number>("count")).toBe(1);
  });
});
