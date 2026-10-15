import { timingSafeEqual } from "node:crypto";
import { HttpError } from "./application/errors";
import { uuidv7 } from "./domain/uuidv7";
import { readBoundedJson } from "./http/json";
import { createRequestAuth } from "./auth/better-auth";

const QA_ALIAS = "d178-routine-qa";
const QA_SECTION_TITLE = "D-178 QA";
const QA_TIMEZONE = "Asia/Tokyo";
const QA_DAY_BOUNDARY_MINUTES = 240;
const LEASE_DURATION_MS = 10 * 60 * 1000;

type ProvisioningEnv = Env & {
  D178_QA_PROVISIONING_ENABLED?: string;
  D178_QA_PROVISIONING_TOKEN?: string;
  D178_QA_TARGET_APP_DATABASE?: string;
  D178_QA_TARGET_AUTH_DATABASE?: string;
};

interface ProvisioningBody {
  email: string;
  password: string;
}

interface AuthIdentity {
  id: string;
  email: string;
  name: string;
  createdAt: string | number;
}

export interface D178QaIdentity {
  appUserId: string;
  authDisplayName: string;
}

function toUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

async function stableAppUserId(): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("hedgetheapp/taskchute-platform/" + QA_ALIAS + "/app-user/v1"),
  ));
  const bytes = digest.slice(0, 16);
  let timestamp = BigInt(Date.UTC(2026, 9, 14));
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return toUuid(bytes);
}

export async function d178QaIdentity(): Promise<D178QaIdentity> {
  const appUserId = await stableAppUserId();
  const markerDigest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(QA_ALIAS + "/auth-marker/" + appUserId),
  ));
  const marker = Array.from(markerDigest, (value) => value.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
  return { appUserId, authDisplayName: "D-178 QA fixture " + marker };
}

function isProvisioningBody(value: unknown): value is ProvisioningBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 2
    && typeof body.email === "string"
    && body.email.trim().length > 0
    && body.email.length <= 320
    && typeof body.password === "string"
    && body.password.length >= 8
    && body.password.length <= 128;
}

async function secureEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  return timingSafeEqual(new Uint8Array(leftHash), new Uint8Array(rightHash));
}

async function allowedOperatorRequest(request: Request, env: ProvisioningEnv): Promise<boolean> {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== "/__operator/d178-qa/provision"
    || url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port
    || request.headers.get("origin") !== url.origin
    || env.RUNTIME_ENV !== "nonprod" || env.BOOTSTRAP_ENABLED !== "false"
    || env.D178_QA_PROVISIONING_ENABLED !== "true"
    || env.D178_QA_TARGET_APP_DATABASE !== "taskchute-app-nonprod"
    || env.D178_QA_TARGET_AUTH_DATABASE !== "taskchute-auth-nonprod") {
    return false;
  }
  const expected = env.D178_QA_PROVISIONING_TOKEN ?? "";
  const provided = request.headers.get("x-taskchute-qa-provision-token") ?? "";
  return expected.length >= 32 && await secureEqual(provided, expected);
}

function failClosed(): never {
  throw new HttpError(409, "resource_conflict", "The requested QA account could not be safely provisioned");
}

async function loadAuthByEmail(env: ProvisioningEnv, email: string): Promise<AuthIdentity[]> {
  const result = await env.AUTH_DB.prepare(
    "SELECT id, email, name, createdAt FROM user WHERE lower(email) = lower(?) LIMIT 2",
  ).bind(email).all<AuthIdentity>();
  return result.results;
}

async function loadAuthByName(env: ProvisioningEnv, name: string): Promise<AuthIdentity[]> {
  const result = await env.AUTH_DB.prepare(
    "SELECT id, email, name, createdAt FROM user WHERE name = ? LIMIT 2",
  ).bind(name).all<AuthIdentity>();
  return result.results;
}

async function loadAuthById(env: ProvisioningEnv, id: string): Promise<AuthIdentity | null> {
  return env.AUTH_DB.prepare("SELECT id, email, name, createdAt FROM user WHERE id = ?")
    .bind(id).first<AuthIdentity>();
}

async function loadMappingsForAppUser(env: ProvisioningEnv, appUserId: string): Promise<{ auth_subject_id: string }[]> {
  const result = await env.APP_DB.prepare(
    "SELECT auth_subject_id FROM auth_subject_mappings WHERE auth_provider = 'better-auth' AND app_user_id = ? LIMIT 2",
  ).bind(appUserId).all<{ auth_subject_id: string }>();
  return result.results;
}

async function verifySignIn(
  request: Request,
  env: ProvisioningEnv,
  email: string,
  password: string,
  expectedAuthSubjectId: string,
): Promise<void> {
  try {
    const auth = createRequestAuth(request, env, true, true);
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: request.headers,
    });
    if (result.user.id !== expectedAuthSubjectId) failClosed();
  } catch {
    failClosed();
  }
}

async function assertUnmappedReservation(env: ProvisioningEnv, identity: D178QaIdentity): Promise<void> {
  const appUser = await env.APP_DB.prepare(
    "SELECT created_at FROM app_users WHERE id = ?",
  ).bind(identity.appUserId).first<{ created_at: string }>();
  const settings = await env.APP_DB.prepare(
    "SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?",
  ).bind(identity.appUserId).first<{ timezone: string; day_boundary_minutes: number }>();
  const sections = await env.APP_DB.prepare(
    "SELECT title, sort_order, created_at FROM sections WHERE app_user_id = ? ORDER BY sort_order LIMIT 2",
  ).bind(identity.appUserId).all<{ title: string; sort_order: number; created_at: string }>();
  const ownerTables = await env.APP_DB.prepare(
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND sql LIKE '%REFERENCES app_users%'",
  ).all<{ name: string }>();
  const expectedRows = new Map([
    ["user_settings", 1],
    ["sections", 1],
    ["routine_board_heads", 1],
    ["project_board_heads", 1],
    ["mode_board_heads", 1],
  ]);
  if (ownerTables.results.length === 0) failClosed();
  for (const table of ownerTables.results) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table.name)) failClosed();
    const count = await env.APP_DB.prepare(
      "SELECT COUNT(*) AS count FROM \"" + table.name + "\" WHERE app_user_id = ?",
    ).bind(identity.appUserId).first<number>("count");
    if (count === null) failClosed();
    const expectedCount = expectedRows.get(table.name);
    if (expectedCount === undefined) {
      if (count !== 0) failClosed();
    } else {
      if (count !== expectedCount) failClosed();
      expectedRows.delete(table.name);
    }
  }
  if (!appUser || !settings || sections.results[0]?.created_at !== appUser.created_at
    || settings.timezone !== QA_TIMEZONE
    || settings.day_boundary_minutes !== QA_DAY_BOUNDARY_MINUTES
    || sections.results.length !== 1
    || sections.results[0].title !== QA_SECTION_TITLE
    || sections.results[0].sort_order !== 0
    || expectedRows.size !== 0) {
    failClosed();
  }
}
async function reserveAppIdentity(
  env: ProvisioningEnv,
  identity: D178QaIdentity,
  now: string,
): Promise<void> {
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)")
      .bind(identity.appUserId, now),
    env.APP_DB.prepare(
      "INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, ?, ?, ?)",
    ).bind(identity.appUserId, QA_TIMEZONE, QA_DAY_BOUNDARY_MINUTES, now),
    env.APP_DB.prepare(
      "INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, ?, 0, ?)",
    ).bind(uuidv7(), identity.appUserId, QA_SECTION_TITLE, now),
  ]);
}

async function claimExpiredReservation(
  env: ProvisioningEnv,
  identity: D178QaIdentity,
  verifyRecovery?: () => Promise<void>,
): Promise<void> {
  const setting = await env.APP_DB.prepare(
    "SELECT updated_at FROM user_settings WHERE app_user_id = ?",
  ).bind(identity.appUserId).first<{ updated_at: string }>();
  if (!setting || !Number.isFinite(Date.parse(setting.updated_at))) failClosed();
  const age = Date.now() - Date.parse(setting.updated_at);
  if (age < LEASE_DURATION_MS) {
    throw new HttpError(409, "resource_conflict", "A QA provisioning attempt is still active; retry after it settles");
  }
  if (verifyRecovery) await verifyRecovery();
  const now = new Date().toISOString();
  const updated = await env.APP_DB.prepare(
    "UPDATE user_settings SET updated_at = ? WHERE app_user_id = ? AND updated_at = ?",
  ).bind(now, identity.appUserId, setting.updated_at).run();
  if (updated.meta.changes !== 1) failClosed();
}

async function provisionAccount(
  request: Request,
  env: ProvisioningEnv,
  body: ProvisioningBody,
): Promise<{ status: "created" | "recovered" | "already_provisioned" }> {
  const email = body.email.trim().toLowerCase();
  const identity = await d178QaIdentity();
  const markerUsers = await loadAuthByName(env, identity.authDisplayName);
  const emailUsers = await loadAuthByEmail(env, email);
  if (markerUsers.length > 1 || emailUsers.length > 1) failClosed();

  const appUser = await env.APP_DB.prepare("SELECT id FROM app_users WHERE id = ?")
    .bind(identity.appUserId).first<{ id: string }>();
  const mappings = await loadMappingsForAppUser(env, identity.appUserId);
  if (mappings.length > 1) failClosed();

  if (mappings.length === 1) {
    const authUser = await loadAuthById(env, mappings[0].auth_subject_id);
    if (!authUser || authUser.name !== identity.authDisplayName
      || authUser.email.toLowerCase() !== email
      || markerUsers.length !== 1 || markerUsers[0].id !== authUser.id
      || emailUsers.length !== 1 || emailUsers[0].id !== authUser.id) {
      failClosed();
    }
    await verifySignIn(request, env, email, body.password, authUser.id);
    return { status: "already_provisioned" };
  }

  if (!appUser) {
    if (markerUsers.length !== 0 || emailUsers.length !== 0) failClosed();
    await reserveAppIdentity(env, identity, new Date().toISOString());
    await assertUnmappedReservation(env, identity);
  } else {
    await assertUnmappedReservation(env, identity);
    if (markerUsers.length === 0 && emailUsers.length !== 0) failClosed();
    if (markerUsers.length === 1 && markerUsers[0].email.toLowerCase() !== email) failClosed();
    await claimExpiredReservation(env, identity, markerUsers.length === 1
      ? () => verifySignIn(request, env, email, body.password, markerUsers[0].id)
      : undefined);
  }

  let authUser: AuthIdentity | undefined;
  let status: "created" | "recovered" = appUser ? "recovered" : "created";
  if (markerUsers.length === 1) {
    authUser = markerUsers[0];
  } else {
    if (emailUsers.length !== 0) failClosed();
    try {
      const auth = createRequestAuth(request, env, true, true);
      await auth.api.signUpEmail({
        body: { email, password: body.password, name: identity.authDisplayName },
        headers: request.headers,
      });
    } catch {
      throw new HttpError(503, "infrastructure_ambiguous", "QA provisioning did not complete; retry with the same private credentials");
    }
    const createdUsers = await loadAuthByName(env, identity.authDisplayName);
    if (createdUsers.length !== 1 || createdUsers[0].email.toLowerCase() !== email) failClosed();
    authUser = createdUsers[0];
  }

  const existingSubjectMapping = await env.APP_DB.prepare(
    "SELECT app_user_id FROM auth_subject_mappings WHERE auth_provider = 'better-auth' AND auth_subject_id = ?",
  ).bind(authUser.id).first<{ app_user_id: string }>();
  if (existingSubjectMapping) {
    if (existingSubjectMapping.app_user_id !== identity.appUserId) failClosed();
    return { status: "already_provisioned" };
  }

  try {
    await env.APP_DB.batch([
      env.APP_DB.prepare(
        "INSERT INTO auth_subject_mappings (auth_provider, auth_subject_id, app_user_id, created_at) "
          + "VALUES ('better-auth', ?, ?, ?)",
      ).bind(authUser.id, identity.appUserId, new Date().toISOString()),
    ]);
  } catch {
    throw new HttpError(503, "infrastructure_ambiguous", "QA provisioning did not complete; retry with the same private credentials");
  }
  return { status };
}

export default {
  async fetch(request: Request, rawEnv: Env): Promise<Response> {
    const env = rawEnv as ProvisioningEnv;
    try {
      if (!(await allowedOperatorRequest(request, env))) {
        return Response.json({ error: { code: "resource_not_found", message: "Not found" } }, { status: 404 });
      }
      const body = await readBoundedJson(request);
      if (!isProvisioningBody(body)) {
        throw new HttpError(400, "malformed_request", "Invalid QA provisioning request");
      }
      const result = await provisionAccount(request, env, body);
      return Response.json({ alias: QA_ALIAS, status: result.status }, {
        status: result.status === "created" ? 201 : 200,
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      if (error instanceof HttpError) {
        return Response.json({ error: { code: error.code, message: error.message } }, {
          status: error.status,
          headers: { "cache-control": "no-store" },
        });
      }
      return Response.json({
        error: {
          code: "infrastructure_ambiguous",
          message: "QA provisioning did not complete; retry with the same private credentials after the active attempt settles",
        },
      }, { status: 503, headers: { "cache-control": "no-store" } });
    }
  },
};
