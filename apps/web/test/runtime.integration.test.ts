import { env, exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import worker from "../worker";
import { sessionPolicy } from "../worker/auth/better-auth";
import { uuidv7 } from "../src/shared/uuidv7";
import { addTaskToDay } from "../worker/application/add-task-to-day";
import { createProject } from "../worker/application/create-project";
import { fingerprint } from "../worker/application/fingerprint";
import { persistRejection } from "../worker/persistence/operations";

const origin = "http://taskchute.test";
const fixture = {
  email: "bootstrap.fixture@example.test",
  password: "fixture-password-1234",
  name: "Fixture User",
  timezone: "America/New_York",
  boundary: 240,
  sections: ["Morning", "Afternoon"],
};

class BrowserSession {
  private readonly cookies = new Map<string, string>();

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookies.size > 0) headers.set("cookie", Array.from(this.cookies.entries(), ([name, value]) => `${name}=${value}`).join("; "));
    const response = await exports.default.fetch(new Request(`${origin}${path}`, { ...init, headers }));
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0];
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
    return response;
  }

  post(path: string, body: object, headers: HeadersInit = {}): Promise<Response> {
    return this.fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", origin, ...Object.fromEntries(new Headers(headers)) },
      body: JSON.stringify(body),
    });
  }
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe.sequential("production runtime bootstrap slice", () => {
  const browser = new BrowserSession();
  let appUserId = "";
  let dayId = "";
  let sectionId = "";
  let secondSectionId = "";
  let projectId = "";

  it("documents that this Workers runtime requires the narrow Temporal polyfill adapter", () => {
    expect((globalThis as typeof globalThis & { Temporal?: unknown }).Temporal).toBeUndefined();
  });

  it("rejects unauthenticated protected requests", async () => {
    const response = await exports.default.fetch(`${origin}/api/v1/taskchute-days/current`);
    expect(response.status).toBe(401);
    expect((await exports.default.fetch(`${origin}/api/v1/projects`)).status).toBe(401);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["disabled", "false"],
    ["malformed", "TRUE"],
  ])("keeps bootstrap unavailable when mode is %s", async (_case, mode) => {
    const authUsersBefore = await env.AUTH_DB.prepare("SELECT COUNT(*) AS count FROM user").first<number>("count");
    const appUsersBefore = await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM app_users").first<number>("count");
    const disabledEnv = { ...env, BOOTSTRAP_ENABLED: mode } as unknown as Env;
    const response = await worker.fetch(
      new Request(`${origin}/api/internal/bootstrap`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-taskchute-bootstrap-token": "fixture-only-bootstrap-token" },
        body: "{",
      }),
      disabledEnv,
    );
    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({ error: { code: "resource_not_found", message: "Not found", reconcile: false } });
    expect(await env.AUTH_DB.prepare("SELECT COUNT(*) AS count FROM user").first<number>("count")).toBe(authUsersBefore);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM app_users").first<number>("count")).toBe(appUsersBefore);
  });

  it.each([
    ["missing", undefined],
    ["wrong", "wrong-bootstrap-token"],
  ])("rejects enabled bootstrap with %s token without disclosure", async (_case, token) => {
    const errorLog = vi.spyOn(console, "error");
    const headers = new Headers({ "content-type": "application/json" });
    if (token) headers.set("x-taskchute-bootstrap-token", token);
    const response = await exports.default.fetch(new Request(`${origin}/api/internal/bootstrap`, {
      method: "POST",
      headers,
      body: "{",
    }));
    expect(response.status).toBe(404);
    const responseText = await response.text();
    expect(responseText).toContain("resource_not_found");
    expect(responseText).not.toContain(token ?? "fixture-only-bootstrap-token");
    expect(errorLog).not.toHaveBeenCalled();
    expect(await env.AUTH_DB.prepare("SELECT COUNT(*) AS count FROM user").first<number>("count")).toBe(0);
    errorLog.mockRestore();
  });

  it("keeps public signup disabled", async () => {
    const response = await browser.post("/api/auth/sign-up/email", {
      email: "public@example.test",
      password: "not-allowed-1234",
      name: "Public User",
    });
    expect(response.ok).toBe(false);
    expect(await env.AUTH_DB.prepare("SELECT COUNT(*) AS count FROM user").first<number>("count")).toBe(0);
  });

  it("bootstraps exactly one auth subject and stable app user, then recovers idempotently", async () => {
    const body = {
      email: fixture.email,
      password: fixture.password,
      name: fixture.name,
      timezone: fixture.timezone,
      day_boundary_minutes: fixture.boundary,
      sections: fixture.sections,
    };
    await env.APP_DB.exec("CREATE TRIGGER test_fail_bootstrap BEFORE INSERT ON app_users BEGIN SELECT RAISE(ABORT, 'fixture APP failure'); END");
    const partial = await browser.post("/api/internal/bootstrap", body, {
      "x-taskchute-bootstrap-token": "fixture-only-bootstrap-token",
    });
    expect(partial.status).toBe(503);
    expect(await env.AUTH_DB.prepare("SELECT COUNT(*) AS count FROM user").first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM app_users").first<number>("count")).toBe(0);
    await env.APP_DB.exec("DROP TRIGGER test_fail_bootstrap");

    const first = await browser.post("/api/internal/bootstrap", body, {
      "x-taskchute-bootstrap-token": "fixture-only-bootstrap-token",
    });
    expect(first.status).toBe(200);
    const firstResult = await json<{ app_user_id: string; recovered: boolean }>(first);
    appUserId = firstResult.app_user_id;
    expect(firstResult.recovered).toBe(false);

    const second = await browser.post("/api/internal/bootstrap", body, {
      "x-taskchute-bootstrap-token": "fixture-only-bootstrap-token",
    });
    const secondResult = await json<{ app_user_id: string; recovered: boolean }>(second);
    expect(secondResult).toEqual({ app_user_id: appUserId, recovered: true });
    expect(await env.AUTH_DB.prepare("SELECT COUNT(*) AS count FROM user").first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM app_users").first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM sections").first<number>("count")).toBe(2);
  });

  it("logs in through Better Auth and resolves the stable server-side Principal", async () => {
    const response = await browser.post("/api/auth/sign-in/email", { email: fixture.email, password: fixture.password });
    expect(response.status).toBe(200);
    const mapping = await env.APP_DB.prepare(
      "SELECT app_user_id FROM auth_subject_mappings WHERE auth_provider = 'better-auth'",
    ).first<{ app_user_id: string }>();
    expect(mapping?.app_user_id).toBe(appUserId);
    const expiry = await env.AUTH_DB.prepare("SELECT expiresAt FROM session ORDER BY createdAt DESC LIMIT 1").first<{
      expiresAt: string | number;
    }>();
    const expiryMillis = typeof expiry?.expiresAt === "number" ? expiry.expiresAt : Date.parse(expiry?.expiresAt ?? "");
    expect(expiryMillis - Date.now()).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(expiryMillis - Date.now()).toBeLessThan(7.1 * 24 * 60 * 60 * 1000);
  });

  it("represents the Approved rolling 7-day/1-day session policy", () => {
    expect(sessionPolicy).toEqual({ expiresIn: 604800, updateAge: 86400 });
  });

  it("converges concurrent lazy TaskChuteDay materialization and loads canonical Sections", async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => browser.fetch("/api/v1/taskchute-days/current")));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const projection = await json<{
      taskchute_day: { id: string; start_instant: string; end_instant: string };
      placement_revision: number;
      sections: Array<{ id: string }>;
    }>(responses[0]);
    dayId = projection.taskchute_day.id;
    sectionId = projection.sections[0].id;
    secondSectionId = projection.sections[1].id;
    expect(projection.placement_revision).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM taskchute_days").first<number>("count")).toBe(1);
    const context = await env.APP_DB.prepare(
      "SELECT establishment_timezone, establishment_boundary_minutes, establishment_disambiguation FROM taskchute_days WHERE id = ?",
    ).bind(dayId).first();
    expect(context).toEqual({
      establishment_timezone: fixture.timezone,
      establishment_boundary_minutes: fixture.boundary,
      establishment_disambiguation: "compatible",
    });
    await env.APP_DB.prepare("UPDATE user_settings SET timezone = 'America/Toronto' WHERE app_user_id = ?").bind(appUserId).run();
    const reloadedAfterSettingsChange = await json<{ taskchute_day: { id: string; start_instant: string; end_instant: string } }>(
      await browser.fetch("/api/v1/taskchute-days/current"),
    );
    expect(reloadedAfterSettingsChange.taskchute_day).toEqual(projection.taskchute_day);
    await env.APP_DB.prepare("UPDATE user_settings SET timezone = ? WHERE app_user_id = ?").bind(fixture.timezone, appUserId).run();
  });

  it("creates a Project with exact same-operation replay and misuse rejection", async () => {
    const operationId = uuidv7();
    projectId = uuidv7();
    const request = { operation_id: operationId, project_id: projectId, title: "Runtime foundation" };
    const first = await browser.post("/api/v1/projects", request);
    expect(first.status).toBe(200);
    const firstBody = await json<object>(first);
    const replay = await browser.post("/api/v1/projects", request);
    expect(replay.status).toBe(200);
    expect(await json<object>(replay)).toEqual(firstBody);
    const misuse = await browser.post("/api/v1/projects", { ...request, title: "Different semantic request" });
    expect(misuse.status).toBe(409);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM projects WHERE id = ?").bind(projectId).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT app_user_id FROM projects WHERE id = ?").bind(projectId).first<string>("app_user_id")).toBe(appUserId);
    expect(
      await env.APP_DB.prepare("SELECT request_fingerprint_version FROM operations WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, operationId)
        .first<number>("request_fingerprint_version"),
    ).toBe(1);
  });

  it("lists existing Projects for only the authenticated app user", async () => {
    const otherUser = uuidv7();
    const otherProject = uuidv7();
    const now = new Date().toISOString();
    await env.APP_DB.batch([
      env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(otherUser, now),
      env.APP_DB.prepare("INSERT INTO projects (id, app_user_id, title, created_at) VALUES (?, ?, 'Other owner Project', ?)")
        .bind(otherProject, otherUser, now),
    ]);
    const response = await browser.fetch("/api/v1/projects");
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ projects: [{ id: projectId, title: "Runtime foundation" }] });
  });

  it("treats an unsupported persisted fingerprint version as internal incompatibility, not operation misuse", async () => {
    const operationId = uuidv7();
    const candidateProjectId = uuidv7();
    await env.APP_DB.prepare(
      `INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at)
       VALUES (?, ?, 'CreateProject', 2, 'old-canonicalizer-value', 'success', ?, ?)`,
    ).bind(
      appUserId,
      operationId,
      JSON.stringify({ project: { id: candidateProjectId, title: "Unsupported" } }),
      new Date().toISOString(),
    ).run();
    const response = await browser.post("/api/v1/projects", {
      operation_id: operationId,
      project_id: candidateProjectId,
      title: "Unsupported",
    });
    expect(response.status).toBe(503);
    expect(await json<{ error: { code: string } }>(response)).toMatchObject({
      error: { code: "operation_persistence_incompatible" },
    });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM projects WHERE id = ?").bind(candidateProjectId).first<number>("count")).toBe(0);
  });

  it("atomically adds distinct Task and Entry identities, increments revision, and reloads the same projection", async () => {
    const operationId = uuidv7();
    const taskId = uuidv7(2_000);
    const entryId = uuidv7(1_000);
    const request = {
      operation_id: operationId,
      task_id: taskId,
      entry_id: entryId,
      project_id: projectId,
      title: "First canonical task",
      taskchute_day_id: dayId,
      section_id: sectionId,
      expected_placement_revision: 0,
    };
    const first = await browser.post("/api/v1/taskchute-days/current/entries", request);
    expect(first.status).toBe(200);
    const firstBody = await json<object>(first);
    const replay = await browser.post("/api/v1/taskchute-days/current/entries", request);
    expect(replay.status).toBe(200);
    expect(await json<object>(replay)).toEqual(firstBody);
    const misuse = await browser.post("/api/v1/taskchute-days/current/entries", { ...request, title: "Different" });
    expect(misuse.status).toBe(409);

    const secondTaskId = uuidv7(3_000);
    const secondEntryId = uuidv7(0);
    expect(secondEntryId < entryId).toBe(true);
    const second = await browser.post("/api/v1/taskchute-days/current/entries", {
      operation_id: uuidv7(), task_id: secondTaskId, entry_id: secondEntryId, project_id: projectId,
      title: "Second canonical task", taskchute_day_id: dayId, section_id: sectionId, expected_placement_revision: 1,
    });
    expect(second.status).toBe(200);

    const reload = await browser.fetch("/api/v1/taskchute-days/current");
    const projection = await json<{
      placement_revision: number;
      sections: Array<{ entries: Array<{ id: string; task: { id: string }; position: number }> }>;
      next_entry: { id: string };
    }>(reload);
    expect(projection.placement_revision).toBe(2);
    expect(projection.sections[0].entries[0]).toMatchObject({ id: entryId, task: { id: taskId }, position: 1 });
    expect(projection.sections[0].entries[1]).toMatchObject({ id: secondEntryId, task: { id: secondTaskId }, position: 2 });
    expect(entryId).not.toBe(taskId);
    expect(projection.next_entry.id).toBe(entryId);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE id = ?").bind(taskId).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE id = ?").bind(entryId).first<number>("count")).toBe(1);
    expect(
      await env.APP_DB.prepare("SELECT request_fingerprint_version FROM operations WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, operationId)
        .first<number>("request_fingerprint_version"),
    ).toBe(1);
  });

  it("stores stale revision conflict without partial Task or Entry", async () => {
    const taskId = uuidv7();
    const entryId = uuidv7();
    const response = await browser.post("/api/v1/taskchute-days/current/entries", {
      operation_id: uuidv7(), task_id: taskId, entry_id: entryId, project_id: projectId, title: "Stale",
      taskchute_day_id: dayId, section_id: sectionId, expected_placement_revision: 0,
    });
    expect(response.status).toBe(409);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE id = ?").bind(taskId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE id = ?").bind(entryId).first<number>("count")).toBe(0);
  });

  it("allows exactly one AddTaskToDay from the same revision even across different Sections", async () => {
    const candidates = [
      { operation_id: uuidv7(), task_id: uuidv7(), entry_id: uuidv7(), section_id: sectionId, title: "Concurrent A" },
      { operation_id: uuidv7(), task_id: uuidv7(), entry_id: uuidv7(), section_id: secondSectionId, title: "Concurrent B" },
    ];
    const responses = await Promise.all(candidates.map((candidate) => browser.post("/api/v1/taskchute-days/current/entries", {
      ...candidate, project_id: projectId, taskchute_day_id: dayId, expected_placement_revision: 2,
    })));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(dayId).first<number>("placement_revision")).toBe(3);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE title IN ('Concurrent A', 'Concurrent B')").first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM placement_command_guards").first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM transaction_assertions").first<number>("count")).toBe(0);
  });

  it("rejects cross-owner references and ignores no client-selected owner", async () => {
    const otherUser = uuidv7();
    const otherProject = uuidv7();
    const otherSection = uuidv7();
    const otherDay = uuidv7();
    const now = new Date().toISOString();
    await env.APP_DB.batch([
      env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(otherUser, now),
      env.APP_DB.prepare("INSERT INTO projects (id, app_user_id, title, created_at) VALUES (?, ?, 'Other', ?)").bind(otherProject, otherUser, now),
      env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Other', 0, ?)").bind(otherSection, otherUser, now),
      env.APP_DB.prepare(
        `INSERT INTO taskchute_days
          (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
           establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
         VALUES (?, ?, '2026-08-20', '2026-08-20T04:00:00Z', '2026-08-21T04:00:00Z', 'UTC', 240, 'compatible', 0, ?)`,
      ).bind(otherDay, otherUser, now),
    ]);
    const taskId = uuidv7();
    const entryId = uuidv7();
    const response = await browser.post("/api/v1/taskchute-days/current/entries", {
      operation_id: uuidv7(), task_id: taskId, entry_id: entryId, project_id: otherProject, title: "Cross owner",
      taskchute_day_id: dayId, section_id: sectionId, expected_placement_revision: 3,
    });
    expect(response.status).toBe(404);
    const crossSection = await browser.post("/api/v1/taskchute-days/current/entries", {
      operation_id: uuidv7(), task_id: uuidv7(), entry_id: uuidv7(), project_id: projectId, title: "Cross section",
      taskchute_day_id: dayId, section_id: otherSection, expected_placement_revision: 3,
    });
    expect(crossSection.status).toBe(404);
    const crossDay = await browser.post("/api/v1/taskchute-days/current/entries", {
      operation_id: uuidv7(), task_id: uuidv7(), entry_id: uuidv7(), project_id: projectId, title: "Cross day",
      taskchute_day_id: otherDay, section_id: sectionId, expected_placement_revision: 3,
    });
    expect(crossDay.status).toBe(404);
    const attemptedOwnerOverride = await browser.post("/api/v1/projects", {
      operation_id: uuidv7(), project_id: uuidv7(), title: "Owner override", user_id: otherUser,
    });
    expect(attemptedOwnerOverride.status).toBe(400);

    const sharedOperationId = uuidv7();
    const assertionId = `owner-scope:${sharedOperationId}`;
    await env.APP_DB.batch([
      env.APP_DB.prepare(
        "INSERT INTO placement_command_guards (app_user_id, operation_id, taskchute_day_id, expected_revision) VALUES (?, ?, ?, 3)",
      ).bind(appUserId, sharedOperationId, dayId),
      env.APP_DB.prepare(
        "INSERT INTO placement_command_guards (app_user_id, operation_id, taskchute_day_id, expected_revision) VALUES (?, ?, ?, 0)",
      ).bind(otherUser, sharedOperationId, otherDay),
      env.APP_DB.prepare("INSERT INTO transaction_assertions (app_user_id, id, ok) VALUES (?, ?, 1)")
        .bind(appUserId, assertionId),
      env.APP_DB.prepare("INSERT INTO transaction_assertions (app_user_id, id, ok) VALUES (?, ?, 1)")
        .bind(otherUser, assertionId),
    ]);
    await env.APP_DB.batch([
      env.APP_DB.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, sharedOperationId),
      env.APP_DB.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?")
        .bind(appUserId, assertionId),
    ]);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM placement_command_guards WHERE operation_id = ?")
      .bind(sharedOperationId).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM transaction_assertions WHERE id = ?")
      .bind(assertionId).first<number>("count")).toBe(1);
    await env.APP_DB.batch([
      env.APP_DB.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(otherUser, sharedOperationId),
      env.APP_DB.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?")
        .bind(otherUser, assertionId),
    ]);
  });

  it("does not persist a rejection when CreateProject has an unknown DB failure despite a concurrent collision", async () => {
    const operationId = uuidv7();
    const candidateProjectId = uuidv7();
    let batchCalls = 0;
    const failingDb = new Proxy(env.APP_DB, {
      get(target, property) {
        if (property === "batch") {
          return async (statements: D1PreparedStatement[]) => {
            batchCalls += 1;
            if (batchCalls === 1) {
              await target.prepare("INSERT INTO projects (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
                .bind(candidateProjectId, appUserId, "Concurrent owner", new Date().toISOString())
                .run();
              throw new Error("injected unknown D1 failure");
            }
            return target.batch(statements);
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const request = { operation_id: operationId, project_id: candidateProjectId, title: "Ambiguous project" };
    await expect(createProject(failingDb, appUserId, request)).rejects.toMatchObject({
      status: 503,
      code: "infrastructure_ambiguous",
    });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(appUserId, operationId).first<number>("count")).toBe(0);
    await expect(createProject(env.APP_DB, appUserId, request)).rejects.toMatchObject({
      status: 409,
      code: "resource_conflict",
    });
    expect(await env.APP_DB.prepare("SELECT outcome_kind FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(appUserId, operationId).first<string>("outcome_kind")).toBe("domain_rejection");
  });

  it("rolls back the whole AddTaskToDay batch on a database failure and records no deterministic operation", async () => {
    const operationId = uuidv7();
    const taskId = uuidv7();
    const entryId = uuidv7();
    await env.APP_DB.exec(
      `CREATE TRIGGER test_fail_entry BEFORE INSERT ON entries WHEN NEW.id = '${entryId}' BEGIN SELECT RAISE(ABORT, 'fixture failure'); END`,
    );
    const response = await browser.post("/api/v1/taskchute-days/current/entries", {
      operation_id: operationId, task_id: taskId, entry_id: entryId, project_id: projectId, title: "Will roll back",
      taskchute_day_id: dayId, section_id: sectionId, expected_placement_revision: 3,
    });
    expect(response.status).toBe(503);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(dayId).first<number>("placement_revision")).toBe(3);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE id = ?").bind(taskId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE operation_id = ?").bind(operationId).first<number>("count")).toBe(0);
    await env.APP_DB.exec("DROP TRIGGER test_fail_entry");
    const retry = await browser.post("/api/v1/taskchute-days/current/entries", {
      operation_id: operationId, task_id: taskId, entry_id: entryId, project_id: projectId, title: "Will roll back",
      taskchute_day_id: dayId, section_id: sectionId, expected_placement_revision: 3,
    });
    expect(retry.status).toBe(200);
    expect(await env.APP_DB.prepare("SELECT outcome_kind FROM operations WHERE operation_id = ?").bind(operationId).first<string>("outcome_kind")).toBe("success");
  });

  it("keeps an injected AddTaskToDay infrastructure failure ambiguous despite an unrelated revision change", async () => {
    const currentRevision = await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(dayId).first<number>("placement_revision");
    if (currentRevision === null) throw new Error("Missing TaskChuteDay fixture");
    const operationId = uuidv7();
    const request = {
      operation_id: operationId,
      task_id: uuidv7(),
      entry_id: uuidv7(),
      project_id: projectId,
      title: "Ambiguous then conflict",
      taskchute_day_id: dayId,
      section_id: sectionId,
      expected_placement_revision: currentRevision,
    };
    let batchCalls = 0;
    const failingDb = new Proxy(env.APP_DB, {
      get(target, property) {
        if (property === "batch") {
          return async (statements: D1PreparedStatement[]) => {
            batchCalls += 1;
            if (batchCalls === 2) {
              await target.prepare("UPDATE taskchute_days SET placement_revision = placement_revision + 1 WHERE app_user_id = ? AND id = ?")
                .bind(appUserId, dayId)
                .run();
              throw new Error("injected unknown D1 failure");
            }
            return target.batch(statements);
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(addTaskToDay(failingDb, appUserId, request)).rejects.toMatchObject({
      status: 503,
      code: "infrastructure_ambiguous",
    });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(appUserId, operationId).first<number>("count")).toBe(0);
    await expect(addTaskToDay(env.APP_DB, appUserId, request)).rejects.toMatchObject({
      status: 409,
      code: "revision_conflict",
    });
    expect(await env.APP_DB.prepare("SELECT outcome_kind FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(appUserId, operationId).first<string>("outcome_kind")).toBe("revision_conflict");
  });

  it("converges a synchronized same-operation CreateProject race to the winner's exact success", async () => {
    const request = { operation_id: uuidv7(), project_id: uuidv7(), title: "Synchronized Project" };
    let observedInitialRead!: () => void;
    const initialReadObserved = new Promise<void>((resolve) => { observedInitialRead = resolve; });
    let releaseInitialRead!: () => void;
    const initialReadRelease = new Promise<void>((resolve) => { releaseInitialRead = resolve; });
    let shouldPause = true;

    function wrapOperationRead(statement: D1PreparedStatement): D1PreparedStatement {
      return new Proxy(statement, {
        get(target, property) {
          if (property === "bind") {
            return (...values: unknown[]) => wrapOperationRead(target.bind(...values));
          }
          if (property === "first") {
            return async (columnName?: string) => {
              const result = columnName === undefined ? await target.first() : await target.first(columnName);
              if (shouldPause) {
                shouldPause = false;
                observedInitialRead();
                await initialReadRelease;
              }
              return result;
            };
          }
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    }

    const delayedReaderDb = new Proxy(env.APP_DB, {
      get(target, property) {
        if (property === "prepare") {
          return (query: string) => {
            const statement = target.prepare(query);
            return query.includes("FROM operations WHERE") ? wrapOperationRead(statement) : statement;
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const delayedCaller = createProject(delayedReaderDb, appUserId, request);
    await initialReadObserved;
    let winner;
    try {
      winner = await createProject(env.APP_DB, appUserId, request);
    } finally {
      releaseInitialRead();
    }
    const converged = await delayedCaller;
    expect(converged).toEqual(winner);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM projects WHERE id = ?")
      .bind(request.project_id).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(appUserId, request.operation_id).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT outcome_kind FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(appUserId, request.operation_id).first<string>("outcome_kind")).toBe("success");
  });

  it("converges a synchronized same-operation AddTaskToDay guard race to exactly one success", async () => {
    const initialRevision = await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(dayId).first<number>("placement_revision");
    if (initialRevision === null) throw new Error("Missing TaskChuteDay fixture");
    const request = {
      operation_id: uuidv7(),
      task_id: uuidv7(),
      entry_id: uuidv7(),
      project_id: projectId,
      title: "Synchronized Task",
      taskchute_day_id: dayId,
      section_id: sectionId,
      expected_placement_revision: initialRevision,
    };
    let observedPreconditions!: () => void;
    const preconditionsObserved = new Promise<void>((resolve) => { observedPreconditions = resolve; });
    let releasePreconditions!: () => void;
    const preconditionsRelease = new Promise<void>((resolve) => { releasePreconditions = resolve; });
    let batchCalls = 0;
    const delayedBatchDb = new Proxy(env.APP_DB, {
      get(target, property) {
        if (property === "batch") {
          return async (statements: D1PreparedStatement[]) => {
            const result = await target.batch(statements);
            batchCalls += 1;
            if (batchCalls === 1) {
              observedPreconditions();
              await preconditionsRelease;
            }
            return result;
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const delayedCaller = addTaskToDay(delayedBatchDb, appUserId, request);
    await preconditionsObserved;
    let winner;
    try {
      winner = await addTaskToDay(env.APP_DB, appUserId, request);
    } finally {
      releasePreconditions();
    }
    const converged = await delayedCaller;
    expect(converged).toEqual(winner);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE id = ?")
      .bind(request.task_id).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE id = ?")
      .bind(request.entry_id).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(dayId).first<number>("placement_revision")).toBe(initialRevision + 1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(appUserId, request.operation_id).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM placement_command_guards")
      .first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM transaction_assertions")
      .first<number>("count")).toBe(0);
  });

  it("returns stored CreateProject and AddTaskToDay successes from rejection persistence races", async () => {
    const projectRequest = { operation_id: uuidv7(), project_id: uuidv7(), title: "Helper race Project" };
    const projectSuccess = await createProject(env.APP_DB, appUserId, projectRequest);
    const projectFingerprint = await fingerprint({ project_id: projectRequest.project_id, title: projectRequest.title });
    const projectRowBefore = await env.APP_DB.prepare("SELECT * FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(appUserId, projectRequest.operation_id).first();
    const projectReplay = await persistRejection<typeof projectSuccess>(env.APP_DB, {
      appUserId,
      operationId: projectRequest.operation_id,
      commandType: "CreateProject",
      requestFingerprint: projectFingerprint,
      outcomeKind: "domain_rejection",
      result: { code: "resource_conflict", message: "losing rejection" },
    });
    expect(projectReplay).toEqual(projectSuccess);
    expect(await env.APP_DB.prepare("SELECT * FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(appUserId, projectRequest.operation_id).first()).toEqual(projectRowBefore);

    const initialRevision = await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(dayId).first<number>("placement_revision");
    if (initialRevision === null) throw new Error("Missing TaskChuteDay fixture");
    const taskRequest = {
      operation_id: uuidv7(),
      task_id: uuidv7(),
      entry_id: uuidv7(),
      project_id: projectId,
      title: "Helper race Task",
      taskchute_day_id: dayId,
      section_id: sectionId,
      expected_placement_revision: initialRevision,
    };
    const taskSuccess = await addTaskToDay(env.APP_DB, appUserId, taskRequest);
    const taskFingerprint = await fingerprint(taskRequest);
    const taskRowBefore = await env.APP_DB.prepare("SELECT * FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(appUserId, taskRequest.operation_id).first();
    const taskReplay = await persistRejection<typeof taskSuccess>(env.APP_DB, {
      appUserId,
      operationId: taskRequest.operation_id,
      commandType: "AddTaskToDay",
      requestFingerprint: taskFingerprint,
      outcomeKind: "revision_conflict",
      result: { code: "revision_conflict", message: "losing rejection" },
    });
    expect(taskReplay).toEqual(taskSuccess);
    expect(await env.APP_DB.prepare("SELECT * FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(appUserId, taskRequest.operation_id).first()).toEqual(taskRowBefore);
  });

  it("wires initial Section configuration, MoveEntry, and SetEntryEstimate HTTP routes", async () => {
    const before = await json<{
      placement_revision: number;
      section_configuration_required: boolean;
      taskchute_day: { id: string; establishment_boundary_minutes: number };
      sections: Array<{ id: string; entries: Array<{ id: string; lifecycle_state: string }> }>;
    }>(await browser.fetch("/api/v1/taskchute-days/current"));
    expect(before.section_configuration_required).toBe(true);
    const configurationVersionId = uuidv7();
    const configuration = await browser.post("/api/v1/section-configurations/initial", {
      operation_id: uuidv7(),
      configuration_version_id: configurationVersionId,
      taskchute_day_id: before.taskchute_day.id,
      items: before.sections.map((section, index) => ({
        section_id: section.id,
        logical_start_minute: before.taskchute_day.establishment_boundary_minutes + index * (1440 / before.sections.length),
        logical_end_minute: before.taskchute_day.establishment_boundary_minutes + (index + 1) * (1440 / before.sections.length),
      })),
    });
    expect(configuration.status).toBe(200);
    expect(await json<object>(configuration)).toEqual({
      configuration_version_id: configurationVersionId,
      taskchute_day_id: before.taskchute_day.id,
    });

    const source = before.sections.flatMap((section) => section.entries)
      .find((entry) => entry.lifecycle_state === "planned");
    if (!source) throw new Error("Missing planned HTTP MoveEntry fixture");
    const moved = await browser.post("/api/v1/taskchute-days/current/entries/move", {
      operation_id: uuidv7(), entry_id: source.id, taskchute_day_id: before.taskchute_day.id,
      section_id: null, expected_placement_revision: before.placement_revision,
    });
    expect(moved.status).toBe(200);
    const movedBody = await json<{ placement_revision: number }>(moved);
    expect(movedBody).toMatchObject({ entry_id: source.id, section_id: null,
      placement_revision: before.placement_revision + 1 });

    const estimated = await browser.post(`/api/v1/entries/${source.id}/estimate`, {
      operation_id: uuidv7(), entry_id: source.id, estimate_seconds: 1200,
    });
    expect(estimated.status).toBe(200);
    expect(await json<object>(estimated)).toEqual({ entry_id: source.id, estimate_seconds: 1200 });
    const after = await json<{ section_configuration_required: boolean; unsectioned_entries: Array<{ id: string; estimate_seconds: number | null }> }>(
      await browser.fetch("/api/v1/taskchute-days/current"));
    expect(after.section_configuration_required).toBe(false);
    expect(after.unsectioned_entries.find((entry) => entry.id === source.id)?.estimate_seconds).toBe(1200);
  });

  it("wires authenticated planned-start mutation and rejects path/body mismatch", async () => {
    const before = await json<{
      placement_revision: number;
      taskchute_day: { id: string; establishment_boundary_minutes: number };
      sections: Array<{ id: string; entries: Array<{ id: string; lifecycle_state: string }> }>;
    }>(await browser.fetch("/api/v1/taskchute-days/current"));
    const source = before.sections.flatMap((section) => section.entries)
      .find((entry) => entry.lifecycle_state === "planned");
    if (!source) throw new Error("Missing planned-start HTTP fixture");
    const body = { operation_id: uuidv7(), entry_id: source.id, taskchute_day_id: before.taskchute_day.id,
      planned_start_minute: before.taskchute_day.establishment_boundary_minutes,
      expected_placement_revision: before.placement_revision };
    const mismatch = await browser.post(`/api/v1/entries/${uuidv7()}/planned-start`, body);
    expect(mismatch.status).toBe(400);
    expect((await json<{ error: { code: string } }>(mismatch)).error.code).toBe("malformed_request");
    const set = await browser.post(`/api/v1/entries/${source.id}/planned-start`, body);
    expect(set.status).toBe(200);
    expect(await json<object>(set)).toMatchObject({ entry_id: source.id,
      planned_start_minute: before.taskchute_day.establishment_boundary_minutes,
      placement_revision: before.placement_revision + 1 });
    const cleared = await browser.post(`/api/v1/entries/${source.id}/planned-start`, {
      ...body, operation_id: uuidv7(), planned_start_minute: null,
      expected_placement_revision: before.placement_revision + 1,
    });
    expect(cleared.status).toBe(200);
    expect(await json<object>(cleared)).toMatchObject({ entry_id: source.id, planned_start_minute: null,
      placement_revision: before.placement_revision + 2 });
    const unauthenticated = await exports.default.fetch(new Request(`${origin}/api/v1/entries/${source.id}/planned-start`, {
      method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body),
    }));
    expect(unauthenticated.status).toBe(401);
  });

  it("rejects an authenticated direct planning mutation for a Routine-derived Entry", async () => {
    const before = await json<{
      placement_revision: number;
      taskchute_day: { id: string };
      sections: Array<{ entries: Array<{ id: string; lifecycle_state: string; estimate_seconds: number | null;
        routine: { routine_definition_id: string } | null }> }>;
      unsectioned_entries: Array<{ id: string; lifecycle_state: string; estimate_seconds: number | null;
        routine: { routine_definition_id: string } | null }>;
    }>(await browser.fetch("/api/v1/taskchute-days/current"));
    const source = [...before.sections.flatMap((section) => section.entries), ...before.unsectioned_entries]
      .find((entry) => entry.lifecycle_state === "planned" && entry.routine === null);
    if (!source) throw new Error("Missing planned HTTP Routine conversion fixture");
    const converted = await browser.post(`/api/v1/entries/${source.id}/routine`, {
      operation_id: uuidv7(), routine_definition_id: uuidv7(), routine_occurrence_id: uuidv7(),
      entry_id: source.id, taskchute_day_id: before.taskchute_day.id, end_logical_date: null,
    });
    expect(converted.status).toBe(200);

    const rejected = await browser.post(`/api/v1/entries/${source.id}/estimate`, {
      operation_id: uuidv7(), entry_id: source.id,
      estimate_seconds: source.estimate_seconds === 1200 ? 1800 : 1200,
    });
    expect(rejected.status).toBe(409);
    expect((await json<{ error: { code: string } }>(rejected)).error.code).toBe("resource_conflict");
    const after = await json<{
      placement_revision: number;
      sections: Array<{ entries: Array<{ id: string; estimate_seconds: number | null;
        routine: { routine_definition_id: string } | null }> }>;
      unsectioned_entries: Array<{ id: string; estimate_seconds: number | null;
        routine: { routine_definition_id: string } | null }>;
    }>(await browser.fetch("/api/v1/taskchute-days/current"));
    const unchanged = [...after.sections.flatMap((section) => section.entries), ...after.unsectioned_entries]
      .find((entry) => entry.id === source.id);
    expect(unchanged).toMatchObject({ estimate_seconds: source.estimate_seconds,
      routine: { routine_definition_id: expect.any(String) } });
    expect(after.placement_revision).toBe(before.placement_revision);
  });

  it("wires authenticated Section configuration query and update routes", async () => {
    const queryResponse = await browser.fetch("/api/v1/section-configuration");
    expect(queryResponse.status).toBe(200);
    const current = await json<{
      configuration_version_id: string;
      day_boundary_minutes: number;
      items: Array<{ section_id: string; title: string; logical_start_minute: number; logical_end_minute: number }>;
    }>(queryResponse);
    expect(current.items.length).toBeGreaterThan(0);
    const nextVersion = uuidv7();
    const update = await browser.post("/api/v1/section-configuration", {
      operation_id: uuidv7(), configuration_version_id: nextVersion,
      expected_configuration_version_id: current.configuration_version_id,
      items: current.items.map((item, index) => index === 0 ? { ...item, title: "HTTP Focus" } : item),
    });
    expect(update.status).toBe(200);
    expect(await json<object>(update)).toEqual({ configuration_version_id: nextVersion });
    const updated = await json<{ configuration_version_id: string; items: Array<{ title: string }> }>(
      await browser.fetch("/api/v1/section-configuration"));
    expect(updated.configuration_version_id).toBe(nextVersion);
    expect(updated.items[0]?.title).toBe("HTTP Focus");
    expect((await exports.default.fetch(`${origin}/api/v1/section-configuration`)).status).toBe(401);
  });

  it("wires Reorder, Start, and Complete HTTP routes and rejects path/body Entry mismatch", async () => {
    const before = await json<{
      placement_revision: number;
      taskchute_day: { id: string };
      sections: Array<{ id: string; entries: Array<{ id: string; lifecycle_state: string }> }>;
    }>(await browser.fetch("/api/v1/taskchute-days/current"));
    const targetSection = before.sections.find((section) => section.entries.length >= 2);
    if (!targetSection) throw new Error("Missing HTTP lifecycle fixture Entries");
    const reorderedIds = targetSection.entries.map((entry) => entry.id).reverse();
    const reorderResponse = await browser.post("/api/v1/taskchute-days/current/entries/reorder", {
      operation_id: uuidv7(),
      taskchute_day_id: before.taskchute_day.id,
      section_id: targetSection.id,
      entry_ids: reorderedIds,
      expected_placement_revision: before.placement_revision,
    });
    expect(reorderResponse.status).toBe(200);
    expect(await json<{ entry_ids: string[] }>(reorderResponse)).toMatchObject({ entry_ids: reorderedIds });

    const entryId = reorderedIds[0];
    const executionId = uuidv7();
    const nonCanonical = await browser.post(`/api/v1/entries/${entryId}/start`, {
      operation_id: uuidv7(), entry_id: entryId, execution_id: uuidv7(),
      expected_placement_revision: before.placement_revision + 1,
    });
    expect(nonCanonical.status).toBe(400);
    expect((await json<{ error: { code: string } }>(nonCanonical)).error.code).toBe("malformed_request");
    const mismatch = await browser.post(`/api/v1/entries/${reorderedIds[1]}/start`, {
      operation_id: uuidv7(), entry_id: entryId, execution_id: executionId,
    });
    expect(mismatch.status).toBe(400);
    expect((await json<{ error: { code: string } }>(mismatch)).error.code).toBe("malformed_request");

    const started = await browser.post(`/api/v1/entries/${entryId}/start`, {
      operation_id: uuidv7(), entry_id: entryId, execution_id: executionId,
    });
    expect(started.status).toBe(200);
    expect(await json<object>(started)).toMatchObject({ entry_id: entryId, lifecycle_state: "running",
      execution: { id: executionId, entry_id: entryId, ended_at: null } });

    const completeMismatch = await browser.post(`/api/v1/entries/${reorderedIds[1]}/complete`, {
      operation_id: uuidv7(), entry_id: entryId, execution_id: executionId,
    });
    expect(completeMismatch.status).toBe(400);
    const completed = await browser.post(`/api/v1/entries/${entryId}/complete`, {
      operation_id: uuidv7(), entry_id: entryId, execution_id: executionId,
    });
    expect(completed.status).toBe(200);
    expect(await json<object>(completed)).toMatchObject({ entry_id: entryId, lifecycle_state: "completed",
      execution: { id: executionId, entry_id: entryId } });
  });

  it("invalidates the browser session on logout", async () => {
    expect((await env.APP_DB.prepare("PRAGMA foreign_key_check").all()).results).toHaveLength(0);
    expect((await browser.post("/api/auth/sign-out", {})).status).toBe(200);
    expect((await browser.fetch("/api/v1/taskchute-days/current")).status).toBe(401);
  });
});
