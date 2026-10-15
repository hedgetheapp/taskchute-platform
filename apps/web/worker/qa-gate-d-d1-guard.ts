const QA_APP_USER_ID = "01a137b5-7000-7591-a74f-3a8465ec77e5";
const MAX_BODY_BYTES = 2048;
const D178_GATE_D_ROLLBACK_SENTINEL_TABLE = "d178_gate_d_rollback_sentinel_20261015";

type GateEnv = Env & {
  D178_QA_GATE_D_TOKEN?: string;
  D178_QA_TARGET_APP_DATABASE?: string;
};

interface ProbeRequest {
  app_user_id: string;
  task_id: string;
  routine_definition_id: string;
  operation_id: string;
  logical_date: string;
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isLogicalDate(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + "T00:00:00.000Z"))
    && new Date(value + "T00:00:00.000Z").toISOString().slice(0, 10) === value;
}

function isProbeRequest(value: unknown): value is ProbeRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return hasExactKeys(body, ["app_user_id", "task_id", "routine_definition_id", "operation_id", "logical_date"])
    && body.app_user_id === QA_APP_USER_ID
    && isUuid(body.task_id)
    && isUuid(body.routine_definition_id)
    && isUuid(body.operation_id)
    && isLogicalDate(body.logical_date);
}

async function secretMatches(provided: string, expected: string): Promise<boolean> {
  if (provided.length < 32 || expected.length < 32) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

async function allowedRequest(request: Request, env: GateEnv): Promise<boolean> {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== "/__operator/d178-gate-d/legacy-guard"
    || url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port
    || request.headers.get("origin") !== url.origin
    || env.RUNTIME_ENV !== "nonprod" || env.BOOTSTRAP_ENABLED !== "false"
    || env.D178_QA_TARGET_APP_DATABASE !== "taskchute-app-nonprod") return false;
  return secretMatches(
    request.headers.get("x-d178-gate-d-token") ?? "",
    env.D178_QA_GATE_D_TOKEN ?? "",
  );
}

async function readSmallJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw new Error("invalid_body");
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) throw new Error("invalid_body");
  return JSON.parse(body) as unknown;
}

async function runLegacyGuardProbe(db: D1Database, body: ProbeRequest): Promise<boolean> {
  const [marker, owner, head, trigger, taskCollision, routineCollision, operationCollision, sentinelCollision] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS value FROM routine_activity_coverage WHERE app_user_id = ?")
      .bind(QA_APP_USER_ID).first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM app_users WHERE id = ?")
      .bind(QA_APP_USER_ID).first<{ value: number }>(),
    db.prepare("SELECT board_revision FROM routine_board_heads WHERE app_user_id = ?")
      .bind(QA_APP_USER_ID).first<{ board_revision: number }>(),
    db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = 'routine_definition_activity_date_guard'")
      .first<{ sql: string }>(),
    db.prepare("SELECT COUNT(*) AS value FROM tasks WHERE id = ?")
      .bind(body.task_id).first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM routine_definitions WHERE id = ?")
      .bind(body.routine_definition_id).first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(QA_APP_USER_ID, body.operation_id).first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM sqlite_schema WHERE type = 'table' AND name = ?")
      .bind(D178_GATE_D_ROLLBACK_SENTINEL_TABLE).first<{ value: number }>(),
  ]);
  if (marker?.value !== 1 || owner?.value !== 1 || !head
    || !trigger?.sql.includes("routine_activity_date_required")
    || taskCollision?.value !== 0 || routineCollision?.value !== 0 || operationCollision?.value !== 0
    || sentinelCollision?.value !== 0) return false;

  let blockedByExpectedGuard = false;
  try {
    await db.batch([
      db.prepare("INSERT INTO tasks (id, app_user_id, project_id, title, created_at) VALUES (?, ?, NULL, ?, ?)")
        .bind(body.task_id, QA_APP_USER_ID, "D-178 Gate D old Worker rollback probe", new Date().toISOString()),
      // Mirrors the pre-D-178 Worker INSERT and deliberately omits created_logical_date.
      db.prepare(`INSERT INTO routine_definitions
        (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
         default_section_id, default_estimate_seconds, default_planned_start_minute,
         materialization_order, created_at)
        VALUES (?, ?, ?, 'daily', ?, NULL, NULL, NULL, NULL,
          (SELECT COALESCE(MAX(materialization_order), 0) + 1 FROM routine_definitions WHERE app_user_id = ?), ?)`)
        .bind(body.routine_definition_id, QA_APP_USER_ID, body.task_id, body.logical_date,
          QA_APP_USER_ID, new Date().toISOString()),
      db.prepare("UPDATE routine_board_heads SET board_revision = board_revision + 1 WHERE app_user_id = ?")
        .bind(QA_APP_USER_ID),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version,
         request_fingerprint, outcome_kind, result_json, created_at)
        VALUES (?, ?, 'CreateRoutine', 1, 'd178-old-worker-probe', 'success', '{}', ?)`)
        .bind(QA_APP_USER_ID, body.operation_id, new Date().toISOString()),
      // If the guard is missing or ineffective, force this diagnostic batch to fail and roll back.
      db.prepare("INSERT INTO " + D178_GATE_D_ROLLBACK_SENTINEL_TABLE + " (id) VALUES (1)"),
    ]);
  } catch (error) {
    blockedByExpectedGuard = error instanceof Error && error.message.includes("routine_activity_date_required");
  }
  const [taskAfter, routineAfter, headAfter, operationAfter] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS value FROM tasks WHERE app_user_id = ? AND id = ?")
      .bind(QA_APP_USER_ID, body.task_id).first<{ value: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM routine_definitions WHERE app_user_id = ? AND id = ?")
      .bind(QA_APP_USER_ID, body.routine_definition_id).first<{ value: number }>(),
    db.prepare("SELECT board_revision FROM routine_board_heads WHERE app_user_id = ?")
      .bind(QA_APP_USER_ID).first<{ board_revision: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(QA_APP_USER_ID, body.operation_id).first<{ value: number }>(),
  ]);
  const rolledBack = taskAfter?.value === 0 && routineAfter?.value === 0
    && headAfter?.board_revision === head.board_revision && operationAfter?.value === 0;
  return blockedByExpectedGuard && rolledBack;
}

export default {
  async fetch(request: Request, rawEnv: Env): Promise<Response> {
    const env = rawEnv as GateEnv;
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/__operator/health") {
      return Response.json({ error: { code: "resource_not_found" } }, {
        status: 404,
        headers: { "cache-control": "no-store" },
      });
    }
    try {
      if (!(await allowedRequest(request, env))) return new Response(null, { status: 404 });
      const body = await readSmallJson(request);
      if (!isProbeRequest(body)) return Response.json({ status: "invalid" }, { status: 400 });
      const passed = await runLegacyGuardProbe(env.APP_DB, body);
      return Response.json({ status: passed ? "pass" : "fail" }, {
        status: passed ? 200 : 409,
        headers: { "cache-control": "no-store" },
      });
    } catch {
      return Response.json({ status: "inconclusive" }, {
        status: 503,
        headers: { "cache-control": "no-store" },
      });
    }
  },
} satisfies ExportedHandler<Env>;
