const baseColumns = `id, app_user_id, logical_date, start_instant, end_instant,
  establishment_timezone, establishment_boundary_minutes, establishment_disambiguation,
  placement_revision, created_at`;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function day(id, owner, logicalDate, start, end) {
  return [id, owner, logicalDate, start, end, "Etc/UTC", 0, "compatible", 0, "2026-10-10T00:00:00.000Z"];
}

function dayInsert(db, table, conflict = "") {
  if (!["before_days", "after_days", "fenced_days"].includes(table)) throw new Error("unknown fixture table");
  return db.prepare(`INSERT ${conflict} INTO ${table} (${baseColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
}

function assertion(list, id, pass, details = {}) {
  list.push({ id, status: pass ? "PASS" : "FAIL", ...details });
}

async function count(db, sql, ...values) {
  return (await db.prepare(sql).bind(...values).first())?.count ?? 0;
}

function aggregateStatus(assertions) {
  if (assertions.some((item) => item.status === "FAIL")) return "FAIL";
  if (assertions.some((item) => item.status === "ENV_BLOCKED")) return "ENV_BLOCKED";
  if (assertions.some((item) => item.status === "NOT_RUN")) return "NOT_RUN";
  if (assertions.some((item) => item.status === "PARTIAL")) return "PARTIAL";
  return "PASS";
}

async function shouldReject(assertions, id, fn, details = {}) {
  try {
    await fn();
    assertion(assertions, id, false, { reason: "statement unexpectedly succeeded", ...details });
  } catch (error) {
    const message = String(error?.message ?? error);
    const expectedError = details.expectedError;
    const expectedObserved = !expectedError || message.toLowerCase().includes(expectedError.toLowerCase());
    assertion(assertions, id, expectedObserved, {
      rejectionObserved: true,
      error: message,
      ...(expectedError ? { expectedError, expectedErrorObserved: expectedObserved } : {}),
      ...details,
    });
  }
}

async function sameDateDoNothing(db, table, owner, suffix, evidence) {
  const assertions = [];
  const date = `2026-02-${suffix}`;
  const initial = day(`same-${table}-${suffix}`, owner, date, "2026-02-01T10:00:00.000Z", "2026-02-01T11:00:00.000Z");
  const insertSql = `INSERT INTO ${table} (${baseColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const initialInsert = await db.prepare(insertSql).bind(...initial).run();
  evidence.push({ label: `seed-${table}-${suffix}`, sql: insertSql, meta: initialInsert.meta ?? null });
  const snapshotSql = `SELECT ${baseColumns} FROM ${table} WHERE app_user_id = ? AND logical_date = ?`;
  const before = await db.prepare(snapshotSql)
    .bind(owner, date).all();
  const conflictSql = `INSERT INTO ${table} (${baseColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(app_user_id, logical_date) DO NOTHING`;
  const result = await db.prepare(conflictSql).bind(
    `ignored-${table}-${suffix}`, owner, date, "2026-02-01T10:15:00.000Z", "2026-02-01T11:15:00.000Z",
    "Etc/UTC", 0, "compatible", 0, "2026-10-10T00:00:00.000Z",
  ).run();
  const after = await db.prepare(snapshotSql)
    .bind(owner, date).all();
  const unchanged = JSON.stringify(before.results) === JSON.stringify(after.results);
  assertion(assertions, `same-date-stable-${table}`, unchanged, {
    changes: result.meta?.changes ?? null,
    rowsRead: result.meta?.rows_read ?? null,
    rowsWritten: result.meta?.rows_written ?? null,
  });
  evidence.push(
    { label: `same-date-before-${table}`, sql: snapshotSql, rows: before.results ?? [], meta: before.meta ?? null },
    { label: `same-date-do-nothing-${table}`, sql: conflictSql, meta: result.meta ?? null },
    { label: `same-date-after-${table}`, sql: snapshotSql, rows: after.results ?? [], meta: after.meta ?? null },
  );
  return assertions;
}

function utcDateAfter(index) {
  const date = new Date(Date.UTC(1990, 0, 1));
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

async function runGuardCostCase(db, sampleSize) {
  const name = `guard-cost-${sampleSize}`;
  const assertions = [];
  const evidence = [];
  const baselineOwner = `cost-baseline-${sampleSize}`;
  const guardedOwner = `cost-guarded-${sampleSize}`;
  const payload = JSON.stringify(Array.from({ length: sampleSize }, (_, index) => index));
  const seedSql = (table) => `INSERT INTO ${table} (${baseColumns})
    SELECT 'cost-' || CAST(value AS TEXT), ?,
      date('1990-01-01', printf('+%d days', CAST(value AS INTEGER))),
      strftime('%Y-%m-%dT%H:%M:%fZ', '1990-01-01', printf('+%d days', CAST(value AS INTEGER))),
      strftime('%Y-%m-%dT%H:%M:%fZ', '1990-01-01', printf('+%d days', CAST(value AS INTEGER)), '+1 hour'),
      'Etc/UTC', 0, 'compatible', 0, ?
    FROM json_each(?)`;
  const createdAt = "2026-10-12T00:00:00.000Z";
  for (const [table, owner, label] of [
    ["baseline_days", baselineOwner, "baseline"],
    ["guard_cost_days", guardedOwner, "guarded"],
  ]) {
    const sql = seedSql(table);
    const result = await db.prepare(sql).bind(owner, createdAt, payload).run();
    evidence.push({
      label: `seed-${label}-${sampleSize}`,
      sql,
      parameters: { owner, createdAt, generatedIndexCount: sampleSize, payloadBytes: payload.length },
      meta: result.meta ?? null,
    });
    const rows = await count(db, `SELECT COUNT(*) AS count FROM ${table} WHERE app_user_id = ?`, owner);
    assertion(assertions, `${label}-${sampleSize}-history-loaded`, rows === sampleSize, {
      rowCount: rows,
      requestedRows: sampleSize,
      rowsWritten: result.meta?.rows_written ?? null,
    });
    const seedMetaComplete = result.meta && result.meta.rows_read !== undefined
      && result.meta.rows_written !== undefined && result.meta.duration !== undefined;
    assertions.push({ id: `${label}-${sampleSize}-seed-meta-coverage`, status: seedMetaComplete ? "PASS" : "PARTIAL",
      reason: seedMetaComplete ? undefined : "D1 seed result did not include every required meta field.",
      rows_read: result.meta?.rows_read ?? null, rows_written: result.meta?.rows_written ?? null,
      duration: result.meta?.duration ?? null });
  }

  const sampleDate = utcDateAfter(sampleSize - 1);
  const sampleStart = `${sampleDate}T00:00:00.000Z`;
  const sampleEnd = `${sampleDate}T01:00:00.000Z`;
  const candidateDate = utcDateAfter(sampleSize);
  const candidate = [
    `cost-success-${sampleSize}`, guardedOwner, candidateDate, `${candidateDate}T00:00:00.000Z`,
    `${candidateDate}T01:00:00.000Z`, "Etc/UTC", 0, "compatible", 0, createdAt,
  ];
  const baselineCandidate = [...candidate];
  baselineCandidate[0] = `control-success-${sampleSize}`;
  baselineCandidate[1] = baselineOwner;
  const controlPredicate = `SELECT 1 FROM baseline_days d
    WHERE d.app_user_id = ? AND ? < d.end_instant AND d.start_instant < ? LIMIT 1`;
  const guardedPredicate = `SELECT 1 FROM guard_cost_days d
    WHERE d.app_user_id = ? AND ? < d.end_instant AND d.start_instant < ? LIMIT 1`;
  for (const [label, sql, owner] of [
    ["control-overlap-predicate-plan", controlPredicate, baselineOwner],
    ["guard-overlap-predicate-plan", guardedPredicate, guardedOwner],
  ]) {
    const explainSql = `EXPLAIN QUERY PLAN ${sql}`;
    const plan = await db.prepare(explainSql).bind(owner, candidate[3], candidate[4]).all();
    evidence.push({ label: `${label}-${sampleSize}`, sql: explainSql,
      parameters: { owner, candidateInterval: { start: candidate[3], end: candidate[4] } },
      rows: plan.results ?? [], meta: plan.meta ?? null,
      interpretation: "predicate-plan proxy; not a direct trigger-body plan" });
  }
  const insertSql = (table) => `INSERT INTO ${table} (${baseColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  for (const [label, table, values] of [
    ["control-direct-insert-plan", "baseline_days", baselineCandidate],
    ["guard-direct-insert-plan", "guard_cost_days", candidate],
  ]) {
    const sql = insertSql(table);
    const explainSql = `EXPLAIN QUERY PLAN ${sql}`;
    try {
      const plan = await db.prepare(explainSql).bind(...values).all();
      evidence.push({ label: `${label}-${sampleSize}`, sql: explainSql, parameters: values,
        rows: plan.results ?? [], meta: plan.meta ?? null, planStatus: "available" });
    } catch (error) {
      evidence.push({ label: `${label}-${sampleSize}`, sql: explainSql, parameters: values,
        planStatus: "unsupported", error: String(error?.message ?? error) });
    }
  }

  const overlapSql = `INSERT INTO guard_cost_days (${baseColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const overlapValues = [
    `cost-overlap-${sampleSize}`, guardedOwner, utcDateAfter(sampleSize + 1), sampleStart,
    `${sampleDate}T00:30:00.000Z`, "Etc/UTC", 0, "compatible", 0, createdAt,
  ];
  const immutableSql = "UPDATE guard_cost_days SET start_instant = ?, end_instant = ? WHERE app_user_id = ? AND id = ?";
  const immutableValues = [`${sampleDate}T02:00:00.000Z`, `${sampleDate}T03:00:00.000Z`, guardedOwner, `cost-${sampleSize - 1}`];
  const replaceSql = `INSERT OR REPLACE INTO guard_cost_days (${baseColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const replaceValues = [
    `cost-replacement-${sampleSize}`, guardedOwner, sampleDate, `${sampleDate}T02:00:00.000Z`,
    `${sampleDate}T03:00:00.000Z`, "Etc/UTC", 0, "compatible", 0, createdAt,
  ];

  async function checkRejectedAttempt(label, sql, values, expectedError, inspectSql, inspectValues) {
    const before = await db.prepare(inspectSql).bind(...inspectValues).all();
    const started = performance.now();
    let error = null;
    let unexpectedMeta = null;
    try {
      const result = await db.prepare(sql).bind(...values).run();
      unexpectedMeta = result.meta ?? null;
    } catch (caught) { error = String(caught?.message ?? caught); }
    const elapsedMs = performance.now() - started;
    const after = await db.prepare(inspectSql).bind(...inspectValues).all();
    const unchanged = JSON.stringify(before.results) === JSON.stringify(after.results);
    const expectedRejected = Boolean(error) && error.toLowerCase().includes(expectedError.toLowerCase());
    assertion(assertions, `${label}-${sampleSize}-rejected-without-state-change`, expectedRejected && unchanged, {
      expectedError, error, stateUnchanged: unchanged,
    });
    evidence.push({
      label: `${label}-${sampleSize}`,
      sql,
      parameters: values,
      outcome: error ? "rejected" : "unexpectedly-succeeded",
      error,
      elapsedMs,
      d1Meta: unexpectedMeta,
      d1MetaAvailability: error ? "unavailable: rejected .run() returned an error rather than D1Result.meta" : "available only on unexpected success",
      preState: before.results ?? [],
      postState: after.results ?? [],
    });
    assertions.push({ id: `${label}-${sampleSize}-d1-meta-coverage`, status: "PARTIAL",
      reason: "D1 does not return per-statement meta when the rejected .run() throws; elapsed time and unchanged state are recorded." });
  }

  const stateSql = `SELECT
    (SELECT COUNT(*) FROM guard_cost_days WHERE app_user_id = ?) AS day_count,
    (SELECT COUNT(*) FROM guard_cost_fences WHERE app_user_id = ?) AS fence_count,
    (SELECT COUNT(*) FROM guard_cost_days WHERE app_user_id = ? AND id = ?) AS attempted_day_count,
    (SELECT COUNT(*) FROM guard_cost_fences WHERE app_user_id = ? AND day_id = ?) AS attempted_fence_count,
    (SELECT start_instant FROM guard_cost_days WHERE app_user_id = ? AND id = ?) AS original_start,
    (SELECT end_instant FROM guard_cost_days WHERE app_user_id = ? AND id = ?) AS original_end`;
  const stateValues = (attemptedId) => [guardedOwner, guardedOwner, guardedOwner, attemptedId,
    guardedOwner, attemptedId, guardedOwner, `cost-${sampleSize - 1}`, guardedOwner, `cost-${sampleSize - 1}`];
  await checkRejectedAttempt("guarded-overlap-rejection", overlapSql, overlapValues,
    "synthetic day interval overlap", stateSql, stateValues(`cost-overlap-${sampleSize}`));
  await checkRejectedAttempt("guarded-immutability-rejection", immutableSql, immutableValues,
    "synthetic established day identity is immutable", stateSql, stateValues(`cost-${sampleSize - 1}`));
  const fenceSql = `SELECT d.id, d.logical_date, d.start_instant, d.end_instant, f.day_id,
    (SELECT COUNT(*) FROM guard_cost_days WHERE app_user_id = ?) AS day_count,
    (SELECT COUNT(*) FROM guard_cost_fences WHERE app_user_id = ?) AS fence_count
    FROM guard_cost_days d LEFT JOIN guard_cost_fences f
      ON f.app_user_id = d.app_user_id AND f.day_id = d.id
    WHERE d.app_user_id = ? AND d.logical_date = ? ORDER BY d.id`;
  await checkRejectedAttempt("guarded-nonoverlap-replace-rejection", replaceSql, replaceValues,
    "foreign key", fenceSql, [guardedOwner, guardedOwner, guardedOwner, sampleDate]);

  const costMetrics = {};
  for (const [label, table, values] of [
    ["control-successful-insert", "baseline_days", baselineCandidate],
    ["guard-successful-insert-with-overlap-and-fence-triggers", "guard_cost_days", candidate],
  ]) {
    const sql = insertSql(table);
    const result = await db.prepare(sql).bind(...values).run();
    const meta = result.meta ?? null;
    costMetrics[label] = meta ? { rows_read: meta.rows_read ?? null, rows_written: meta.rows_written ?? null, duration: meta.duration ?? null } : null;
    evidence.push({ label: `${label}-${sampleSize}`, sql, parameters: values, meta,
      metaMetrics: meta ? { rows_read: meta.rows_read ?? null, rows_written: meta.rows_written ?? null, duration: meta.duration ?? null } : null,
      historyRowsBeforeWrite: sampleSize });
    const hasMetrics = meta && meta.rows_read !== undefined && meta.rows_written !== undefined && meta.duration !== undefined;
    assertions.push({ id: `${label}-${sampleSize}-result-meta`,
      status: hasMetrics ? "PASS" : "PARTIAL",
      reason: hasMetrics ? undefined : "D1 result meta did not include every required metric." ,
      rows_read: meta?.rows_read ?? null, rows_written: meta?.rows_written ?? null, duration: meta?.duration ?? null });
  }

  evidence.push({ label: `same-history-write-cost-comparison-${sampleSize}`,
    control: costMetrics["control-successful-insert"],
    guarded: costMetrics["guard-successful-insert-with-overlap-and-fence-triggers"],
    historyRowsBeforeEachWrite: sampleSize,
    interpretation: "matched indexed history sizes and insert shape; the guarded table additionally runs its overlap, fence, and immutability mechanisms" });

  return { name, status: aggregateStatus(assertions), assertions, evidence };
}

async function runCase(db, name) {
  const assertions = [];
  const evidence = [];
  const capture = async (label, sql, values = []) => {
    try {
      const result = await db.prepare(sql).bind(...values).run();
      evidence.push({ label, sql, meta: result.meta ?? null });
      return result;
    } catch (error) {
      evidence.push({ label, sql, error: String(error?.message ?? error) });
      throw error;
    }
  };
  const reject = (label, sql, values = [], expectedError = "synthetic day interval overlap") => shouldReject(assertions, label,
    () => capture(`expected-rejection:${label}`, sql, values), { expectedError });

  if (name === "same-date") {
    for (const [table, owner, suffix] of [
      ["before_days", "same-before", "11"],
      ["after_days", "same-after", "12"],
      ["fenced_days", "same-fenced", "13"],
    ]) assertions.push(...await sameDateDoNothing(db, table, owner, suffix, evidence));
  } else if (name === "overlap-boundaries") {
    await dayInsert(db, "after_days").bind(...day("overlap-base", "overlap-owner", "2026-03-01",
      "2026-03-01T10:00:00.000Z", "2026-03-01T11:00:00.000Z")).run();
    await reject("crossing-overlap-rejected", `INSERT INTO after_days (${baseColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      day("overlap-cross", "overlap-owner", "2026-03-02", "2026-03-01T10:30:00.000Z", "2026-03-01T11:30:00.000Z"));
    await reject("nested-overlap-rejected", `INSERT INTO after_days (${baseColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      day("overlap-nested", "overlap-owner", "2026-03-03", "2026-03-01T10:10:00.000Z", "2026-03-01T10:20:00.000Z"));
    try {
      await dayInsert(db, "after_days").bind(...day("overlap-touch", "overlap-owner", "2026-03-04",
        "2026-03-01T11:00:00.000Z", "2026-03-01T11:30:00.000Z")).run();
      assertion(assertions, "touching-interval-allowed", true);
    } catch (error) { assertion(assertions, "touching-interval-allowed", false, { error: String(error?.message ?? error) }); }
    try {
      await dayInsert(db, "after_days").bind(...day("overlap-other-owner", "other-owner", "2026-03-05",
        "2026-03-01T10:15:00.000Z", "2026-03-01T10:45:00.000Z")).run();
      assertion(assertions, "owner-isolation-allows-overlap", true);
    } catch (error) { assertion(assertions, "owner-isolation-allows-overlap", false, { error: String(error?.message ?? error) }); }
  } else if (name === "replace") {
    await dayInsert(db, "before_days").bind(...day("before-replace-old", "replace-before", "2026-04-01",
      "2026-04-01T10:00:00.000Z", "2026-04-01T11:00:00.000Z")).run();
    await dayInsert(db, "before_days", "OR REPLACE").bind(...day("before-replace-new", "replace-before", "2026-04-01",
      "2026-04-01T13:00:00.000Z", "2026-04-01T14:00:00.000Z")).run();
    const beforeRows = await db.prepare("SELECT id, start_instant, end_instant FROM before_days WHERE app_user_id = ? AND logical_date = ?")
      .bind("replace-before", "2026-04-01").all();
    assertion(assertions, "before-guard-nonoverlap-replace-bypass-observed",
      beforeRows.results?.length === 1 && beforeRows.results[0].id === "before-replace-new", {
        interpretation: "PASS confirms the old same-date exemption permits replacement; this is a demonstrated gap, not an accepted invariant.",
      });

    await dayInsert(db, "after_days").bind(...day("after-overlap-base", "replace-after", "2026-04-02",
      "2026-04-02T10:00:00.000Z", "2026-04-02T11:00:00.000Z")).run();
    await reject("after-guard-rejects-overlapping-insert", `INSERT OR REPLACE INTO after_days (${baseColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      day("after-overlap-new", "replace-after", "2026-04-03", "2026-04-02T10:30:00.000Z", "2026-04-02T10:45:00.000Z"));

    await dayInsert(db, "after_days").bind(...day("after-replace-old", "replace-after-nonoverlap", "2026-04-04",
      "2026-04-04T10:00:00.000Z", "2026-04-04T11:00:00.000Z")).run();
    await dayInsert(db, "after_days", "OR REPLACE").bind(...day("after-replace-new", "replace-after-nonoverlap", "2026-04-04",
      "2026-04-04T13:00:00.000Z", "2026-04-04T14:00:00.000Z")).run();
    const afterRows = await db.prepare("SELECT id, start_instant, end_instant FROM after_days WHERE app_user_id = ? AND logical_date = ?")
      .bind("replace-after-nonoverlap", "2026-04-04").all();
    assertion(assertions, "after-guard-nonoverlap-replace-bypass-observed",
      afterRows.results?.length === 1 && afterRows.results[0].id === "after-replace-new", {
        interpretation: "PASS confirms overlap-only AFTER guards do not enforce established-Day immutability.",
      });
  } else if (name === "foreign-keys") {
    await dayInsert(db, "after_days").bind(...day("fk-zero-old", "fk-zero", "2026-05-01",
      "2026-05-01T10:00:00.000Z", "2026-05-01T11:00:00.000Z")).run();
    await dayInsert(db, "after_days", "OR REPLACE").bind(...day("fk-zero-new", "fk-zero", "2026-05-01",
      "2026-05-01T13:00:00.000Z", "2026-05-01T14:00:00.000Z")).run();
    const zeroDependentChanged = await count(db,
      "SELECT COUNT(*) AS count FROM after_days WHERE app_user_id = ? AND id = ?", "fk-zero", "fk-zero-new");
    assertion(assertions, "zero-dependent-does-not-protect-day", zeroDependentChanged === 1);

    await dayInsert(db, "after_days").bind(...day("fk-one-old", "fk-one", "2026-05-02",
      "2026-05-02T10:00:00.000Z", "2026-05-02T11:00:00.000Z")).run();
    await db.prepare("INSERT INTO after_day_dependents(app_user_id, id, day_id) VALUES (?, ?, ?)")
      .bind("fk-one", "dependent-1", "fk-one-old").run();
    await reject("one-restrict-dependent-blocks-replace",
      `INSERT OR REPLACE INTO after_days (${baseColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      day("fk-one-new", "fk-one", "2026-05-02", "2026-05-02T13:00:00.000Z", "2026-05-02T14:00:00.000Z"), "foreign key");
    const originalRetained = await count(db,
      "SELECT COUNT(*) AS count FROM after_days WHERE app_user_id = ? AND id = ?", "fk-one", "fk-one-old");
    assertion(assertions, "one-dependent-leaves-original-day", originalRetained === 1);
  } else if (name === "candidate-fence") {
    const owner = "fence-candidate";
    const original = day("fence-day", owner, "2026-06-01", "2026-06-01T10:00:00.000Z", "2026-06-01T11:00:00.000Z");
    await dayInsert(db, "fenced_days").bind(...original).run();
    const replacement = day("fence-replacement", owner, "2026-06-01", "2026-06-01T13:00:00.000Z", "2026-06-01T14:00:00.000Z");
    await reject("candidate-fence-zero-dependent-replace-blocked",
      `INSERT OR REPLACE INTO fenced_days (${baseColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, replacement, "foreign key");

    const immutableUpdates = [
      ["id", "UPDATE fenced_days SET id = ? WHERE app_user_id = ? AND id = ?", ["mutated-id", owner, original[0]]],
      ["logical_date", "UPDATE fenced_days SET logical_date = ? WHERE app_user_id = ? AND id = ?", ["2026-06-02", owner, original[0]]],
      ["interval-start", "UPDATE fenced_days SET start_instant = ? WHERE app_user_id = ? AND id = ?", ["2026-06-01T09:00:00.000Z", owner, original[0]]],
      ["interval-end", "UPDATE fenced_days SET end_instant = ? WHERE app_user_id = ? AND id = ?", ["2026-06-01T12:00:00.000Z", owner, original[0]]],
      ["timezone", "UPDATE fenced_days SET establishment_timezone = ? WHERE app_user_id = ? AND id = ?", ["Asia/Tokyo", owner, original[0]]],
      ["boundary", "UPDATE fenced_days SET establishment_boundary_minutes = ? WHERE app_user_id = ? AND id = ?", [60, owner, original[0]]],
      ["disambiguation", "UPDATE fenced_days SET establishment_disambiguation = ? WHERE app_user_id = ? AND id = ?", ["earlier", owner, original[0]]],
      ["created_at", "UPDATE fenced_days SET created_at = ? WHERE app_user_id = ? AND id = ?", ["2026-06-01T01:00:00.000Z", owner, original[0]]],
    ];
    for (const [field, sql, values] of immutableUpdates) await reject(`candidate-immutable-${field}`, sql, values, "immutable");
    const revision = await db.prepare("UPDATE fenced_days SET placement_revision = placement_revision + 1 WHERE app_user_id = ? AND id = ?")
      .bind(owner, original[0]).run();
    evidence.push({ label: "candidate-placement-revision-update", sql: "UPDATE fenced_days SET placement_revision = placement_revision + 1 WHERE app_user_id = ? AND id = ?", meta: revision.meta ?? null });
    const updated = await db.prepare("SELECT id, logical_date, start_instant, end_instant, establishment_timezone, establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at FROM fenced_days WHERE app_user_id = ? AND id = ?")
      .bind(owner, original[0]).first();
    assertion(assertions, "placement-revision-remains-editable", updated?.placement_revision === 1 && updated?.id === original[0]);
    const fences = await count(db, "SELECT COUNT(*) AS count FROM day_fences WHERE app_user_id = ? AND day_id = ?", owner, original[0]);
    assertion(assertions, "one-fence-created-for-established-day", fences === 1);
    evidence.push({ label: "fence-candidate-result", row: updated, fenceCount: fences });
  } else if (name === "batch-rollback") {
    const owner = "batch-rollback-owner";
    const rollbackDay = day("rollback-day", owner, "2026-07-01", "2026-07-01T10:00:00.000Z", "2026-07-01T11:00:00.000Z");
    const statements = [
      dayInsert(db, "fenced_days").bind(...rollbackDay),
      db.prepare("INSERT INTO section_sentinels(app_user_id, id) VALUES (?, ?)").bind(owner, "rollback-section"),
      db.prepare("INSERT INTO section_context_sentinels(app_user_id, day_id, section_id) SELECT ?, id, ? FROM fenced_days WHERE app_user_id = ? AND logical_date = ?")
        .bind(owner, "rollback-section", owner, rollbackDay[2]),
      db.prepare("INSERT INTO operation_sentinels(app_user_id, operation_id, day_id) SELECT ?, ?, id FROM fenced_days WHERE app_user_id = ? AND logical_date = ?")
        .bind(owner, "rollback-operation", owner, rollbackDay[2]),
      db.prepare("INSERT INTO synthetic_batch_failures(id, accepted) VALUES (?, 0)").bind("force-batch-rollback"),
    ];
    try {
      const meta = await db.batch(statements);
      assertion(assertions, "failing-d1-batch-rejected", false, { reason: "D1.batch unexpectedly succeeded" });
      evidence.push({ label: "unexpected-successful-batch", meta });
    } catch (error) {
      const message = String(error?.message ?? error);
      const expectedCheckFailure = message.toLowerCase().includes("check constraint");
      assertion(assertions, "failing-d1-batch-rejected", expectedCheckFailure, {
        rejectionObserved: true,
        error: message,
        expectedCheckFailure,
      });
    }
    const residual = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM fenced_days WHERE app_user_id = ? AND id = ?) AS day_count,
      (SELECT COUNT(*) FROM day_fences WHERE app_user_id = ? AND day_id = ?) AS fence_count,
      (SELECT COUNT(*) FROM section_sentinels WHERE app_user_id = ? AND id = ?) AS section_count,
      (SELECT COUNT(*) FROM section_context_sentinels WHERE app_user_id = ? AND day_id = ?) AS context_count,
      (SELECT COUNT(*) FROM operation_sentinels WHERE app_user_id = ? AND operation_id = ?) AS operation_count`)
      .bind(owner, rollbackDay[0], owner, rollbackDay[0], owner, "rollback-section", owner, rollbackDay[0], owner, "rollback-operation").first();
    assertion(assertions, "d1-batch-rolls-back-day-fence-section-context-operation",
      Object.values(residual ?? {}).every((value) => value === 0), { residual });

    const successDay = day("commit-day", owner, "2026-07-02", "2026-07-02T10:00:00.000Z", "2026-07-02T11:00:00.000Z");
    const successMeta = await db.batch([
      dayInsert(db, "fenced_days").bind(...successDay),
      db.prepare("INSERT INTO section_sentinels(app_user_id, id) VALUES (?, ?)").bind(owner, "commit-section"),
      db.prepare("INSERT INTO section_context_sentinels(app_user_id, day_id, section_id) SELECT ?, id, ? FROM fenced_days WHERE app_user_id = ? AND logical_date = ?")
        .bind(owner, "commit-section", owner, successDay[2]),
      db.prepare("INSERT INTO operation_sentinels(app_user_id, operation_id, day_id) SELECT ?, ?, id FROM fenced_days WHERE app_user_id = ? AND logical_date = ?")
        .bind(owner, "commit-operation", owner, successDay[2]),
    ]);
    evidence.push({ label: "successful-d1-batch", sql: "INSERT day; insert section; insert section context; insert operation sentinel", meta: successMeta });
    const committed = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM fenced_days WHERE app_user_id = ? AND id = ?) AS day_count,
      (SELECT COUNT(*) FROM day_fences WHERE app_user_id = ? AND day_id = ?) AS fence_count,
      (SELECT COUNT(*) FROM section_context_sentinels WHERE app_user_id = ? AND day_id = ?) AS context_count,
      (SELECT COUNT(*) FROM operation_sentinels WHERE app_user_id = ? AND operation_id = ?) AS operation_count`)
      .bind(owner, successDay[0], owner, successDay[0], owner, successDay[0], owner, "commit-operation").first();
    assertion(assertions, "successful-d1-batch-persists-related-sentinels",
      Object.values(committed ?? {}).every((value) => value === 1), { committed });
  } else if (name === "guard-cost-10" || name === "guard-cost-365" || name === "guard-cost-7301") {
    const sampleSize = Number(name.slice("guard-cost-".length));
    return await runGuardCostCase(db, sampleSize);
  } else {
    throw new Error(`unknown case: ${name}`);
  }

  return { name, status: aggregateStatus(assertions), assertions, evidence };
}

async function recordRaceEvent(db, raceKey, requestId, phase, detail = {}) {
  await db.prepare("INSERT INTO race_events(race_key, request_id, phase, recorded_at_ms, detail_json) VALUES (?, ?, ?, ?, ?)")
    .bind(raceKey, requestId, phase, Date.now(), JSON.stringify(detail)).run();
}

async function setupRace(db, body) {
  const { raceKey, kind, logicalDate, startInstant, endInstant } = body;
  if (![raceKey, logicalDate, startInstant, endInstant].every((value) => typeof value === "string" && value.length > 0 && value.length <= 128)
    || !/^\d{4}-\d{2}-\d{2}$/.test(logicalDate)
    || !["other-owner-day", "immutability-day"].includes(kind)) {
    return json({ status: "FAIL", error: "invalid bounded race setup" }, 400);
  }
  const owner = kind === "other-owner-day" ? `race-other-${raceKey}` : `race-${raceKey}`;
  const fixtureId = kind === "other-owner-day" ? `other-owner-${raceKey}` : `existing-${raceKey}`;
  const sql = `INSERT INTO fenced_days (${baseColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const result = await db.prepare(sql).bind(...day(fixtureId, owner, logicalDate, startInstant, endInstant)).run();
  return json({ status: "PASS", raceKey, kind, owner, sql, meta: result.meta ?? null });
}

async function runRace(db, request) {
  const { raceKey, requestId, logicalDate, startInstant, endInstant, action = "create" } = request;
  if (![raceKey, requestId, logicalDate, startInstant, endInstant].every((value) => typeof value === "string" && value.length > 0 && value.length <= 128)
    || !/^\d{4}-\d{2}-\d{2}$/.test(logicalDate)
    || !["create", "replace", "update"].includes(action)) {
    return json({ status: "FAIL", error: "invalid bounded race input" }, 400);
  }
  const owner = `race-${raceKey}`;
  const sectionId = `section-${requestId}`;
  const operationId = `operation-${requestId}`;

  // Each HTTP handler completes both owner-scoped D1 reads before publishing its preflight.
  const sameDateSql = `SELECT ${baseColumns} FROM fenced_days WHERE app_user_id = ? AND logical_date = ? ORDER BY id`;
  const overlapSql = `SELECT ${baseColumns} FROM fenced_days
    WHERE app_user_id = ? AND ? < end_instant AND start_instant < ? ORDER BY start_instant, id`;
  const sameDateResult = await db.prepare(sameDateSql).bind(owner, logicalDate).all();
  const overlapResult = await db.prepare(overlapSql).bind(owner, startInstant, endInstant).all();
  const snapshot = {
    sameDateRows: sameDateResult.results ?? [],
    overlappingOwnerRows: overlapResult.results ?? [],
    readQueries: [
      { sql: sameDateSql, parameters: [owner, logicalDate], meta: sameDateResult.meta ?? null },
      { sql: overlapSql, parameters: [owner, startInstant, endInstant], meta: overlapResult.meta ?? null },
    ],
    candidate: { logicalDate, startInstant, endInstant, action },
    fixedConfig: { timezone: "Etc/UTC", boundaryMinutes: 0, disambiguation: "compatible" },
  };
  await db.prepare(`INSERT INTO race_preflights(race_key, request_id, app_user_id, logical_date,
    snapshot_json, read_meta_json, observed_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(raceKey, requestId, owner, logicalDate, JSON.stringify(snapshot),
      JSON.stringify({ sameDate: sameDateResult.meta ?? null, overlap: overlapResult.meta ?? null }), Date.now()).run();
  await db.prepare("INSERT INTO race_arrivals(race_key, request_id, arrived_at_ms) VALUES (?, ?, ?)")
    .bind(raceKey, requestId, Date.now()).run();
  await recordRaceEvent(db, raceKey, requestId, "preflight_complete", { sameDateRows: snapshot.sameDateRows.length,
    overlappingOwnerRows: snapshot.overlappingOwnerRows.length });

  const deadline = Date.now() + 10000;
  let preflightCount = 0;
  while (Date.now() < deadline) {
    preflightCount = await count(db, "SELECT COUNT(*) AS count FROM race_preflights WHERE race_key = ?", raceKey);
    if (preflightCount === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  if (preflightCount !== 2) return json({ status: "NOT_RUN", reason: "two distinct D1-backed Day preflights did not reach the bounded barrier", preflightCount }, 504);

  await recordRaceEvent(db, raceKey, requestId, "barrier_observed", { distinctPreflightCount: preflightCount });
  await db.prepare("INSERT OR IGNORE INTO race_releases(race_key, released_at_ms, participant_count) VALUES (?, ?, 2)")
    .bind(raceKey, Date.now()).run();
  let releaseCount = 0;
  while (Date.now() < deadline) {
    releaseCount = await count(db, "SELECT COUNT(*) AS count FROM race_releases WHERE race_key = ? AND participant_count = 2", raceKey);
    if (releaseCount === 1) break;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  if (releaseCount !== 1) return json({ status: "NOT_RUN", reason: "D1-backed release row was not observed before timeout", preflightCount }, 504);
  await db.prepare("INSERT INTO race_release_observations(race_key, request_id, observed_at_ms) VALUES (?, ?, ?)")
    .bind(raceKey, requestId, Date.now()).run();
  await recordRaceEvent(db, raceKey, requestId, "release_observed", { releaseCount, participantCount: 2 });
  await recordRaceEvent(db, raceKey, requestId, "write_start", { action });

  if (action === "replace") {
    const sql = `INSERT OR REPLACE INTO fenced_days (${baseColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const values = day(`replacement-${requestId}`, owner, logicalDate, startInstant, endInstant);
    try {
      const result = await db.prepare(sql).bind(...values).run();
      await recordRaceEvent(db, raceKey, requestId, "write_result", { status: "PASS", meta: result.meta ?? null });
      return json({ status: "PASS", requestId, raceKey, action, preflightCount, released: true, meta: result.meta ?? null });
    } catch (error) {
      const message = String(error?.message ?? error);
      await recordRaceEvent(db, raceKey, requestId, "write_result", { status: "REJECTED", error: message });
      return json({ status: "REJECTED", requestId, raceKey, action, preflightCount, released: true, error: message }, 409);
    }
  }
  if (action === "update") {
    const sql = "UPDATE fenced_days SET start_instant = ?, end_instant = ? WHERE app_user_id = ? AND id = ?";
    try {
      const result = await db.prepare(sql).bind(startInstant, endInstant, owner, `existing-${raceKey}`).run();
      await recordRaceEvent(db, raceKey, requestId, "write_result", { status: "PASS", meta: result.meta ?? null });
      return json({ status: "PASS", requestId, raceKey, action, preflightCount, released: true, meta: result.meta ?? null });
    } catch (error) {
      const message = String(error?.message ?? error);
      await recordRaceEvent(db, raceKey, requestId, "write_result", { status: "REJECTED", error: message });
      return json({ status: "REJECTED", requestId, raceKey, action, preflightCount, released: true, error: message }, 409);
    }
  }

  const insert = db.prepare(`INSERT INTO fenced_days (${baseColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(app_user_id, logical_date) DO NOTHING`).bind(...day(
    `day-${requestId}`, owner, logicalDate, startInstant, endInstant,
  ));
  const statements = [
    insert,
    db.prepare("INSERT INTO section_sentinels(app_user_id, id) VALUES (?, ?)").bind(owner, sectionId),
    db.prepare("INSERT INTO section_context_sentinels(app_user_id, day_id, section_id) SELECT ?, id, ? FROM fenced_days WHERE app_user_id = ? AND logical_date = ?")
      .bind(owner, sectionId, owner, logicalDate),
    db.prepare("INSERT INTO operation_sentinels(app_user_id, operation_id, day_id) SELECT ?, ?, id FROM fenced_days WHERE app_user_id = ? AND logical_date = ?")
      .bind(owner, operationId, owner, logicalDate),
  ];
  try {
    const meta = await db.batch(statements);
    await recordRaceEvent(db, raceKey, requestId, "write_result", { status: "PASS", batchMeta: meta });
    return json({ status: "PASS", requestId, raceKey, action, preflightCount, released: true, batchMeta: meta });
  } catch (error) {
    const message = String(error?.message ?? error);
    await recordRaceEvent(db, raceKey, requestId, "write_result", { status: "REJECTED", error: message });
    return json({ status: "REJECTED", requestId, raceKey, action, preflightCount, released: true, error: message }, 409);
  }
}

async function inspectRace(db, raceKey) {
  const owner = `race-${raceKey}`;
  const otherOwner = `race-other-${raceKey}`;
  const countsSql = `SELECT
    (SELECT COUNT(*) FROM race_arrivals WHERE race_key = ?) AS arrivals,
    (SELECT COUNT(*) FROM race_preflights WHERE race_key = ?) AS preflights,
    (SELECT COUNT(*) FROM race_releases WHERE race_key = ?) AS releases,
    (SELECT COUNT(*) FROM race_release_observations WHERE race_key = ?) AS release_observations,
    (SELECT COUNT(*) FROM fenced_days WHERE app_user_id = ?) AS days,
    (SELECT COUNT(*) FROM day_fences WHERE app_user_id = ?) AS fences,
    (SELECT COUNT(*) FROM section_sentinels WHERE app_user_id = ? AND id LIKE 'section-%') AS sections,
    (SELECT COUNT(*) FROM section_context_sentinels WHERE app_user_id = ?) AS contexts,
    (SELECT COUNT(*) FROM operation_sentinels WHERE app_user_id = ? AND operation_id LIKE 'operation-%') AS operations,
    (SELECT COUNT(*) FROM fenced_days WHERE app_user_id = ?) AS other_owner_days,
    (SELECT COUNT(*) FROM section_context_sentinels c
      LEFT JOIN fenced_days d ON d.app_user_id = c.app_user_id AND d.id = c.day_id
      LEFT JOIN section_sentinels s ON s.app_user_id = c.app_user_id AND s.id = c.section_id
      WHERE c.app_user_id = ? AND (d.id IS NULL OR s.id IS NULL)) AS context_orphans,
    (SELECT COUNT(*) FROM operation_sentinels o
      LEFT JOIN fenced_days d ON d.app_user_id = o.app_user_id AND d.id = o.day_id
      WHERE o.app_user_id = ? AND d.id IS NULL) AS operation_orphans,
    (SELECT COUNT(*) FROM fenced_days d LEFT JOIN day_fences f
      ON f.app_user_id = d.app_user_id AND f.day_id = d.id
      WHERE d.app_user_id = ? AND f.day_id IS NULL) AS missing_fences,
    (SELECT COUNT(*) FROM fenced_days a JOIN fenced_days b
      ON b.app_user_id = a.app_user_id AND b.id > a.id
      AND a.start_instant < b.end_instant AND b.start_instant < a.end_instant
      WHERE a.app_user_id = ?) AS overlapping_pairs`;
  const countsResult = await db.prepare(countsSql).bind(raceKey, raceKey, raceKey, raceKey,
    owner, owner, owner, owner, owner, otherOwner, owner, owner, owner, owner).first();
  const arrivals = await db.prepare("SELECT request_id, arrived_at_ms FROM race_arrivals WHERE race_key = ? ORDER BY request_id")
    .bind(raceKey).all();
  const preflightRows = await db.prepare(`SELECT request_id, app_user_id, logical_date, snapshot_json, read_meta_json, observed_at_ms
    FROM race_preflights WHERE race_key = ? ORDER BY request_id`).bind(raceKey).all();
  const preflights = (preflightRows.results ?? []).map((row) => {
    let snapshot = null;
    let readMeta = null;
    try { snapshot = JSON.parse(row.snapshot_json); } catch {}
    try { readMeta = JSON.parse(row.read_meta_json); } catch {}
    return { ...row, snapshot, readMeta };
  });
  const releases = await db.prepare("SELECT race_key, released_at_ms, participant_count FROM race_releases WHERE race_key = ?")
    .bind(raceKey).all();
  const releaseObservations = await db.prepare("SELECT request_id, observed_at_ms FROM race_release_observations WHERE race_key = ? ORDER BY request_id")
    .bind(raceKey).all();
  const events = await db.prepare("SELECT event_id, request_id, phase, recorded_at_ms, detail_json FROM race_events WHERE race_key = ? ORDER BY event_id")
    .bind(raceKey).all();
  const days = await db.prepare(`SELECT ${baseColumns} FROM fenced_days WHERE app_user_id = ? ORDER BY logical_date, id`)
    .bind(owner).all();
  const otherOwnerRows = await db.prepare(`SELECT ${baseColumns} FROM fenced_days WHERE app_user_id = ? ORDER BY logical_date, id`)
    .bind(otherOwner).all();
  const fences = await db.prepare("SELECT app_user_id, day_id FROM day_fences WHERE app_user_id = ? ORDER BY day_id").bind(owner).all();
  const contexts = await db.prepare("SELECT day_id, section_id FROM section_context_sentinels WHERE app_user_id = ? ORDER BY day_id, section_id")
    .bind(owner).all();
  const operations = await db.prepare("SELECT operation_id, day_id FROM operation_sentinels WHERE app_user_id = ? ORDER BY operation_id")
    .bind(owner).all();
  return {
    counts: countsResult,
    arrivals: arrivals.results ?? [],
    preflights,
    releases: releases.results ?? [],
    releaseObservations: releaseObservations.results ?? [],
    events: (events.results ?? []).map((row) => ({ ...row, detail: JSON.parse(row.detail_json) })),
    days: days.results ?? [],
    otherOwnerRows: otherOwnerRows.results ?? [],
    fences: fences.results ?? [],
    contexts: contexts.results ?? [],
    operations: operations.results ?? [],
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        const version = await env.DB.prepare("SELECT sqlite_version() AS sqlite_version").first();
        return json({ status: "PASS", sqliteVersion: version?.sqlite_version ?? null });
      }
      if (request.method === "POST" && url.pathname === "/case") {
        const body = await request.json();
        return json(await runCase(env.DB, body.name));
      }
      if (request.method === "POST" && url.pathname === "/race") {
        return runRace(env.DB, await request.json());
      }
      if (request.method === "POST" && url.pathname === "/race-setup") {
        return setupRace(env.DB, await request.json());
      }
      if (request.method === "GET" && url.pathname === "/race-inspect") {
        const raceKey = url.searchParams.get("key") ?? "";
        return json(await inspectRace(env.DB, raceKey));
      }
      return json({ status: "NOT_RUN", reason: "unknown local harness route" }, 404);
    } catch (error) {
      return json({ status: "FAIL", error: String(error?.message ?? error) }, 500);
    }
  },
};