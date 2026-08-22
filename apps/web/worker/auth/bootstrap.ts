import { timingSafeEqual } from "node:crypto";
import { HttpError } from "../application/errors";
import { uuidv7 } from "../domain/uuidv7";
import { readBoundedJson } from "../http/json";
import { createRequestAuth } from "./better-auth";

interface BootstrapBody {
  email: string;
  password: string;
  name: string;
  timezone: string;
  day_boundary_minutes: number;
  sections: string[];
}

export function isBootstrapModeEnabled(value: unknown): boolean {
  return value === "true";
}

function isBootstrapBody(value: unknown): value is BootstrapBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.email === "string" &&
    body.email.length <= 320 &&
    typeof body.password === "string" &&
    body.password.length >= 8 &&
    body.password.length <= 128 &&
    typeof body.name === "string" &&
    body.name.trim().length > 0 &&
    body.name.length <= 100 &&
    typeof body.timezone === "string" &&
    Number.isInteger(body.day_boundary_minutes) &&
    Number(body.day_boundary_minutes) >= 0 &&
    Number(body.day_boundary_minutes) <= 1439 &&
    Array.isArray(body.sections) &&
    body.sections.length > 0 &&
    body.sections.length <= 20 &&
    body.sections.every((section) => typeof section === "string" && section.trim().length > 0 && section.length <= 100)
  );
}

async function secureEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  return timingSafeEqual(new Uint8Array(leftHash), new Uint8Array(rightHash));
}

async function requireOperator(request: Request): Promise<void> {
  const configured = process.env.BOOTSTRAP_TOKEN;
  const provided = request.headers.get("x-taskchute-bootstrap-token") ?? "";
  if (!configured || !(await secureEqual(provided, configured))) {
    throw new HttpError(404, "resource_not_found", "Not found");
  }
}

export async function bootstrapInitialUser(request: Request, env: Env): Promise<Response> {
  await requireOperator(request);
  const bodyValue = await readBoundedJson(request);
  if (!isBootstrapBody(bodyValue)) throw new HttpError(400, "malformed_request", "Invalid bootstrap request");
  const body = bodyValue;
  try {
    new Intl.DateTimeFormat("en", { timeZone: body.timezone }).format(new Date());
  } catch {
    throw new HttpError(400, "malformed_request", "timezone must be a valid IANA timezone");
  }

  const existingUsers = await env.AUTH_DB.prepare("SELECT id, email FROM user ORDER BY createdAt LIMIT 2").all<{
    id: string;
    email: string;
  }>();
  if (existingUsers.results.some((user) => user.email !== body.email)) {
    throw new HttpError(409, "resource_conflict", "A different bootstrap user already exists");
  }

  let authSubjectId = existingUsers.results[0]?.id;
  if (!authSubjectId) {
    const bootstrapAuth = createRequestAuth(request, env, true);
    await bootstrapAuth.api.signUpEmail({
      body: { email: body.email, password: body.password, name: body.name },
      headers: request.headers,
    });
    const created = await env.AUTH_DB.prepare("SELECT id FROM user WHERE email = ?").bind(body.email).first<{ id: string }>();
    if (!created) throw new Error("Better Auth user creation did not become visible");
    authSubjectId = created.id;
  }

  const existingMapping = await env.APP_DB.prepare(
    "SELECT app_user_id FROM auth_subject_mappings WHERE auth_provider = 'better-auth' AND auth_subject_id = ?",
  )
    .bind(authSubjectId)
    .first<{ app_user_id: string }>();
  if (existingMapping) {
    return Response.json({ app_user_id: existingMapping.app_user_id, recovered: true });
  }

  const appUserId = uuidv7();
  const now = new Date().toISOString();
  const sectionRows = body.sections.map((title, sortOrder) => ({ id: uuidv7(), title: title.trim(), sortOrder }));
  const statements: D1PreparedStatement[] = [
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(appUserId, now),
    env.APP_DB.prepare(
      "INSERT INTO auth_subject_mappings (auth_provider, auth_subject_id, app_user_id, created_at) VALUES ('better-auth', ?, ?, ?)",
    ).bind(authSubjectId, appUserId, now),
    env.APP_DB.prepare(
      "INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, ?, ?, ?)",
    ).bind(appUserId, body.timezone, body.day_boundary_minutes, now),
    ...sectionRows.map((section) =>
      env.APP_DB.prepare(
        "INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(section.id, appUserId, section.title, section.sortOrder, now),
    ),
  ];
  await env.APP_DB.batch(statements);
  return Response.json({ app_user_id: appUserId, recovered: false });
}
