type JsonRecord = Record<string, unknown>;

type OperationRow = {
  command_type: string;
  request_fingerprint: string;
  outcome: "success" | "rejected";
  result_json: string;
};

type EntryRow = {
  id: string;
  lifecycle: "planned" | "running" | "completed";
  position: number;
};

type ExecutionRow = {
  id: string;
  entry_id: string;
  started_at: string;
  ended_at: string | null;
  start_operation_id: string;
  complete_operation_id: string | null;
};

const TEST_USER_ID = "user-spike";
const TEST_DAY_ID = "day-spike";
const TEST_SECTION_ID = "section-spike";
const ENTRY_IDS = ["entry-a", "entry-b", "entry-c"] as const;

function json(body: JsonRecord, status = 200): Response {
  return Response.json(body, { status });
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function requiredString(body: JsonRecord, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${key} must be a non-empty string`);
  }
  return value.trim();
}

function requiredInteger(body: JsonRecord, key: string): number {
  const value = body[key];
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new TypeError(`${key} must be a non-negative safe integer`);
  }
  return Number(value);
}

function optionalBoolean(body: JsonRecord, key: string): boolean {
  const value = body[key];
  if (value === undefined) return false;
  if (typeof value !== "boolean") throw new TypeError(`${key} must be boolean`);
  return value;
}

function requiredStringArray(body: JsonRecord, key: string): string[] {
  const value = body[key];
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || item.trim() === "")) {
    throw new TypeError(`${key} must be an array of non-empty strings`);
  }
  return value.map(item => String(item).trim());
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const record = value as JsonRecord;
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, canonicalize(record[key])]));
  }
  return value;
}

async function fingerprint(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function parseStoredResult(row: OperationRow): JsonRecord {
  const parsed: unknown = JSON.parse(row.result_json);
  const result = asRecord(parsed);
  if (!result) throw new Error("stored operation result is not an object");
  return result;
}

async function loadOperation(db: D1Database, operationId: string): Promise<OperationRow | null> {
  return db.prepare(
    "SELECT command_type, request_fingerprint, outcome, result_json FROM operations WHERE user_id = ?1 AND operation_id = ?2 LIMIT 1"
  ).bind(TEST_USER_ID, operationId).first<OperationRow>();
}

function replayOrMisuse(row: OperationRow, expectedFingerprint: string): Response {
  if (row.request_fingerprint !== expectedFingerprint) {
    return json({ ok: false, code: "operation_id_misuse" }, 409);
  }
  const result = parseStoredResult(row);
  return json({ ...result, replayed: true }, row.outcome === "success" ? 200 : 409);
}

async function persistRejection(
  db: D1Database,
  operationId: string,
  commandType: string,
  requestFingerprint: string,
  result: JsonRecord
): Promise<Response> {
  try {
    await db.prepare(
      "INSERT INTO operations (user_id, operation_id, command_type, request_fingerprint, outcome, result_json, created_at) VALUES (?1, ?2, ?3, ?4, 'rejected', ?5, ?6)"
    ).bind(TEST_USER_ID, operationId, commandType, requestFingerprint, JSON.stringify(result), new Date().toISOString()).run();
    return json(result, 409);
  } catch {
    const existing = await loadOperation(db, operationId);
    if (existing) return replayOrMisuse(existing, requestFingerprint);
    throw new Error("failed to persist deterministic rejection");
  }
}

async function handleStart(body: JsonRecord, env: Env): Promise<Response> {
  const operationId = requiredString(body, "operation_id");
  const entryId = requiredString(body, "entry_id");
  const executionId = requiredString(body, "execution_id");
  const forceFailure = optionalBoolean(body, "force_failure");
  const requestFingerprint = await fingerprint({ command: "start", entryId, executionId, forceFailure });
  const existing = await loadOperation(env.DB, operationId);
  if (existing) return replayOrMisuse(existing, requestFingerprint);

  const startedAt = new Date().toISOString();
  const successResult: JsonRecord = {
    ok: true,
    code: "started",
    operation_id: operationId,
    entry_id: entryId,
    execution_id: executionId,
    started_at: startedAt,
    replayed: false
  };
  const assertionId = `start:${operationId}`;
  const statements = [
    env.DB.prepare(
      "INSERT INTO executions (id, user_id, entry_id, started_at, start_operation_id) SELECT ?1, user_id, id, ?2, ?3 FROM entries WHERE id = ?4 AND user_id = ?5 AND lifecycle = 'planned'"
    ).bind(executionId, startedAt, operationId, entryId, TEST_USER_ID),
    env.DB.prepare(
      "UPDATE entries SET lifecycle = 'running' WHERE id = ?1 AND user_id = ?2 AND lifecycle = 'planned' AND EXISTS (SELECT 1 FROM executions WHERE id = ?3 AND entry_id = entries.id AND ended_at IS NULL)"
    ).bind(entryId, TEST_USER_ID, executionId),
    env.DB.prepare(
      "INSERT INTO operations (user_id, operation_id, command_type, request_fingerprint, outcome, result_json, created_at) VALUES (?1, ?2, 'start', ?3, 'success', ?4, ?5)"
    ).bind(TEST_USER_ID, operationId, requestFingerprint, JSON.stringify(successResult), startedAt),
    env.DB.prepare(
      "INSERT INTO transaction_assertions (id, ok) VALUES (?1, CASE WHEN EXISTS (SELECT 1 FROM executions WHERE id = ?2 AND user_id = ?3 AND entry_id = ?4 AND ended_at IS NULL) AND EXISTS (SELECT 1 FROM entries WHERE id = ?4 AND user_id = ?3 AND lifecycle = 'running') THEN 1 ELSE 0 END)"
    ).bind(assertionId, executionId, TEST_USER_ID, entryId)
  ];
  if (forceFailure) {
    statements.push(env.DB.prepare("INSERT INTO transaction_assertions (id, ok) VALUES (?1, 0)").bind(`${assertionId}:forced`));
  }
  statements.push(env.DB.prepare("DELETE FROM transaction_assertions WHERE id = ?1").bind(assertionId));

  try {
    await env.DB.batch(statements);
    return json(successResult);
  } catch {
    const concurrent = await loadOperation(env.DB, operationId);
    if (concurrent) return replayOrMisuse(concurrent, requestFingerprint);
    if (forceFailure) return json({ ok: false, code: "forced_failure" }, 500);
    const active = await env.DB.prepare(
      "SELECT id, entry_id FROM executions WHERE user_id = ?1 AND ended_at IS NULL LIMIT 1"
    ).bind(TEST_USER_ID).first<{ id: string; entry_id: string }>();
    if (active) {
      return persistRejection(env.DB, operationId, "start", requestFingerprint, {
        ok: false,
        code: "active_execution_conflict",
        active_execution_id: active.id,
        active_entry_id: active.entry_id,
        replayed: false
      });
    }
    return persistRejection(env.DB, operationId, "start", requestFingerprint, {
      ok: false,
      code: "entry_not_startable",
      replayed: false
    });
  }
}

async function handleComplete(body: JsonRecord, env: Env): Promise<Response> {
  const operationId = requiredString(body, "operation_id");
  const entryId = requiredString(body, "entry_id");
  const executionId = requiredString(body, "execution_id");
  const forceFailure = optionalBoolean(body, "force_failure");
  const requestFingerprint = await fingerprint({ command: "complete", entryId, executionId, forceFailure });
  const existing = await loadOperation(env.DB, operationId);
  if (existing) return replayOrMisuse(existing, requestFingerprint);

  const endedAt = new Date().toISOString();
  const successResult: JsonRecord = {
    ok: true,
    code: "completed",
    operation_id: operationId,
    entry_id: entryId,
    execution_id: executionId,
    ended_at: endedAt,
    replayed: false
  };
  const assertionId = `complete:${operationId}`;
  const statements = [
    env.DB.prepare(
      "UPDATE executions SET ended_at = ?1, complete_operation_id = ?2 WHERE id = ?3 AND user_id = ?4 AND entry_id = ?5 AND ended_at IS NULL"
    ).bind(endedAt, operationId, executionId, TEST_USER_ID, entryId),
    env.DB.prepare(
      "UPDATE entries SET lifecycle = 'completed' WHERE id = ?1 AND user_id = ?2 AND lifecycle = 'running' AND EXISTS (SELECT 1 FROM executions WHERE id = ?3 AND entry_id = entries.id AND ended_at = ?4 AND complete_operation_id = ?5)"
    ).bind(entryId, TEST_USER_ID, executionId, endedAt, operationId),
    env.DB.prepare(
      "INSERT INTO operations (user_id, operation_id, command_type, request_fingerprint, outcome, result_json, created_at) VALUES (?1, ?2, 'complete', ?3, 'success', ?4, ?5)"
    ).bind(TEST_USER_ID, operationId, requestFingerprint, JSON.stringify(successResult), endedAt),
    env.DB.prepare(
      "INSERT INTO transaction_assertions (id, ok) VALUES (?1, CASE WHEN EXISTS (SELECT 1 FROM executions WHERE id = ?2 AND user_id = ?3 AND entry_id = ?4 AND ended_at = ?5 AND complete_operation_id = ?6) AND EXISTS (SELECT 1 FROM entries WHERE id = ?4 AND lifecycle = 'completed') THEN 1 ELSE 0 END)"
    ).bind(assertionId, executionId, TEST_USER_ID, entryId, endedAt, operationId)
  ];
  if (forceFailure) {
    statements.push(env.DB.prepare("INSERT INTO transaction_assertions (id, ok) VALUES (?1, 0)").bind(`${assertionId}:forced`));
  }
  statements.push(env.DB.prepare("DELETE FROM transaction_assertions WHERE id = ?1").bind(assertionId));

  try {
    await env.DB.batch(statements);
    return json(successResult);
  } catch {
    const concurrent = await loadOperation(env.DB, operationId);
    if (concurrent) return replayOrMisuse(concurrent, requestFingerprint);
    if (forceFailure) return json({ ok: false, code: "forced_failure" }, 500);
    return persistRejection(env.DB, operationId, "complete", requestFingerprint, {
      ok: false,
      code: "execution_not_completable",
      replayed: false
    });
  }
}

async function handleReorder(body: JsonRecord, env: Env): Promise<Response> {
  const operationId = requiredString(body, "operation_id");
  const expectedRevision = requiredInteger(body, "expected_revision");
  const entryIds = requiredStringArray(body, "entry_ids");
  const forceFailure = optionalBoolean(body, "force_failure");
  if (entryIds.length !== ENTRY_IDS.length || new Set(entryIds).size !== entryIds.length
    || entryIds.some(id => !ENTRY_IDS.includes(id as typeof ENTRY_IDS[number]))) {
    return json({ ok: false, code: "invalid_entry_set" }, 400);
  }
  const requestFingerprint = await fingerprint({ command: "reorder", expectedRevision, entryIds, forceFailure });
  const existing = await loadOperation(env.DB, operationId);
  if (existing) return replayOrMisuse(existing, requestFingerprint);

  const createdAt = new Date().toISOString();
  const successResult: JsonRecord = {
    ok: true,
    code: "reordered",
    operation_id: operationId,
    entry_ids: entryIds,
    placement_revision: expectedRevision + 1,
    replayed: false
  };
  const assertionId = `reorder:${operationId}`;
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      "INSERT INTO operations (user_id, operation_id, command_type, request_fingerprint, outcome, result_json, created_at) VALUES (?1, ?2, 'reorder', ?3, 'success', ?4, ?5)"
    ).bind(TEST_USER_ID, operationId, requestFingerprint, JSON.stringify(successResult), createdAt),
    env.DB.prepare(
      "INSERT INTO reorder_guards (operation_id, taskchute_day_id, expected_revision) SELECT ?1, id, ?2 FROM taskchute_days WHERE id = ?3 AND user_id = ?4 AND placement_revision = ?2"
    ).bind(operationId, expectedRevision, TEST_DAY_ID, TEST_USER_ID),
    env.DB.prepare(
      "UPDATE taskchute_days SET placement_revision = placement_revision + 1 WHERE id = ?1 AND user_id = ?2 AND EXISTS (SELECT 1 FROM reorder_guards WHERE operation_id = ?3 AND taskchute_day_id = taskchute_days.id AND expected_revision = ?4)"
    ).bind(TEST_DAY_ID, TEST_USER_ID, operationId, expectedRevision)
  ];
  entryIds.forEach((entryId, index) => {
    statements.push(env.DB.prepare(
      "UPDATE entries SET position = ?1 WHERE id = ?2 AND section_id = ?3 AND EXISTS (SELECT 1 FROM reorder_guards WHERE operation_id = ?4)"
    ).bind(-1000 - index, entryId, TEST_SECTION_ID, operationId));
  });
  entryIds.forEach((entryId, index) => {
    statements.push(env.DB.prepare(
      "UPDATE entries SET position = ?1 WHERE id = ?2 AND section_id = ?3 AND EXISTS (SELECT 1 FROM reorder_guards WHERE operation_id = ?4)"
    ).bind(index + 1, entryId, TEST_SECTION_ID, operationId));
  });
  statements.push(env.DB.prepare(
    "INSERT INTO transaction_assertions (id, ok) VALUES (?1, CASE WHEN EXISTS (SELECT 1 FROM reorder_guards WHERE operation_id = ?2 AND expected_revision = ?3) AND EXISTS (SELECT 1 FROM taskchute_days WHERE id = ?4 AND placement_revision = ?5) AND (SELECT COUNT(*) FROM entries WHERE section_id = ?6 AND position BETWEEN 1 AND ?7) = ?7 THEN 1 ELSE 0 END)"
  ).bind(assertionId, operationId, expectedRevision, TEST_DAY_ID, expectedRevision + 1, TEST_SECTION_ID, entryIds.length));
  if (forceFailure) {
    statements.push(env.DB.prepare("INSERT INTO transaction_assertions (id, ok) VALUES (?1, 0)").bind(`${assertionId}:forced`));
  }
  statements.push(
    env.DB.prepare("DELETE FROM transaction_assertions WHERE id = ?1").bind(assertionId),
    env.DB.prepare("DELETE FROM reorder_guards WHERE operation_id = ?1").bind(operationId)
  );

  try {
    await env.DB.batch(statements);
    return json(successResult);
  } catch {
    const concurrent = await loadOperation(env.DB, operationId);
    if (concurrent) return replayOrMisuse(concurrent, requestFingerprint);
    if (forceFailure) return json({ ok: false, code: "forced_failure" }, 500);
    const day = await env.DB.prepare(
      "SELECT placement_revision FROM taskchute_days WHERE id = ?1 AND user_id = ?2 LIMIT 1"
    ).bind(TEST_DAY_ID, TEST_USER_ID).first<{ placement_revision: number }>();
    return persistRejection(env.DB, operationId, "reorder", requestFingerprint, {
      ok: false,
      code: "placement_revision_conflict",
      expected_revision: expectedRevision,
      actual_revision: day?.placement_revision ?? null,
      replayed: false
    });
  }
}

async function resetFixture(db: D1Database): Promise<Response> {
  await db.batch([
    db.prepare("DELETE FROM transaction_assertions"),
    db.prepare("DELETE FROM reorder_guards"),
    db.prepare("DELETE FROM operations"),
    db.prepare("DELETE FROM executions"),
    db.prepare("DELETE FROM entries"),
    db.prepare("DELETE FROM sections"),
    db.prepare("DELETE FROM tasks"),
    db.prepare("DELETE FROM taskchute_days"),
    db.prepare("DELETE FROM app_users"),
    db.prepare("INSERT INTO app_users (id) VALUES (?1)").bind(TEST_USER_ID),
    db.prepare("INSERT INTO taskchute_days (id, user_id, placement_revision) VALUES (?1, ?2, 0)").bind(TEST_DAY_ID, TEST_USER_ID),
    db.prepare("INSERT INTO sections (id, user_id, taskchute_day_id) VALUES (?1, ?2, ?3)").bind(TEST_SECTION_ID, TEST_USER_ID, TEST_DAY_ID),
    ...ENTRY_IDS.map((_, index) => db.prepare("INSERT INTO tasks (id, user_id, title) VALUES (?1, ?2, ?3)").bind(`task-${index + 1}`, TEST_USER_ID, `Task ${index + 1}`)),
    ...ENTRY_IDS.map((entryId, index) => db.prepare(
      "INSERT INTO entries (id, user_id, task_id, taskchute_day_id, section_id, lifecycle, position) VALUES (?1, ?2, ?3, ?4, ?5, 'planned', ?6)"
    ).bind(entryId, TEST_USER_ID, `task-${index + 1}`, TEST_DAY_ID, TEST_SECTION_ID, index + 1))
  ]);
  return json({ ok: true, code: "fixture_reset" });
}

async function loadState(db: D1Database): Promise<Response> {
  const results = await db.batch([
    db.prepare("SELECT id, lifecycle, position FROM entries ORDER BY position, id"),
    db.prepare("SELECT id, entry_id, started_at, ended_at, start_operation_id, complete_operation_id FROM executions ORDER BY id"),
    db.prepare("SELECT operation_id, command_type, request_fingerprint, outcome, result_json FROM operations ORDER BY operation_id"),
    db.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?1").bind(TEST_DAY_ID),
    db.prepare("PRAGMA foreign_key_check")
  ]);
  if (results.length !== 5) throw new Error("state batch returned an unexpected result count");
  const entriesResult = results[0]!;
  const executionsResult = results[1]!;
  const operationsResult = results[2]!;
  const dayResult = results[3]!;
  const fkResult = results[4]!;
  const entries = entriesResult.results as EntryRow[];
  const executions = executionsResult.results as ExecutionRow[];
  const dayRows = dayResult.results as Array<{ placement_revision: number }>;
  const activeExecutions = executions.filter(item => item.ended_at === null);
  return json({
    ok: true,
    entries,
    executions,
    operations: operationsResult.results,
    placement_revision: Number(dayRows[0]?.placement_revision ?? -1),
    active_execution_count: activeExecutions.length,
    running_entry_count: entries.filter(item => item.lifecycle === "running").length,
    foreign_key_violation_count: fkResult.results.length
  });
}

async function handleUnsafeDelete(body: JsonRecord, env: Env): Promise<Response> {
  const taskId = requiredString(body, "task_id");
  try {
    await env.DB.prepare("DELETE FROM tasks WHERE id = ?1 AND user_id = ?2").bind(taskId, TEST_USER_ID).run();
    return json({ ok: true, code: "deleted" });
  } catch {
    return json({ ok: false, code: "foreign_key_restrict" }, 409);
  }
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") return json({ ok: true });
  if (request.method === "GET" && url.pathname === "/state") return loadState(env.DB);
  if (request.method !== "POST") return json({ ok: false, code: "not_found" }, 404);
  const parsed: unknown = await request.json();
  const body = asRecord(parsed);
  if (!body) return json({ ok: false, code: "invalid_json_body" }, 400);
  if (url.pathname === "/fixture/reset") return resetFixture(env.DB);
  if (url.pathname === "/commands/start") return handleStart(body, env);
  if (url.pathname === "/commands/complete") return handleComplete(body, env);
  if (url.pathname === "/commands/reorder") return handleReorder(body, env);
  if (url.pathname === "/unsafe/delete-task") return handleUnsafeDelete(body, env);
  return json({ ok: false, code: "not_found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      if (error instanceof TypeError) return json({ ok: false, code: "invalid_request", message: error.message }, 400);
      console.error(JSON.stringify({ message: "d1 spike request failed", error: error instanceof Error ? error.message : String(error) }));
      return json({ ok: false, code: "internal_error" }, 500);
    }
  }
} satisfies ExportedHandler<Env>;
