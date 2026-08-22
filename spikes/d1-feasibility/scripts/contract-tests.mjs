import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const args = new Map(process.argv.slice(2).map((value, index, all) => value.startsWith("--") ? [value.slice(2), all[index + 1]] : ["", ""]));
const baseUrl = String(args.get("base-url") || "http://127.0.0.1:8791").replace(/\/$/, "");
const environment = String(args.get("environment") || "local");
const only = args.has("only") ? String(args.get("only")) : null;

function positiveIntegerArgument(name, fallback) {
  if (!args.has(name)) return fallback;
  const value = Number(args.get(name));
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`--${name} must be a positive integer`);
  return value;
}

const concurrencyRequests = positiveIntegerArgument("concurrency-requests", 20);
const concurrencyIterations = positiveIntegerArgument("concurrency-iterations", 20);

async function request(pathname, body, expectedStatuses = [200]) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  if (expectedStatuses !== null) {
    assert(expectedStatuses.includes(response.status), `${pathname} returned ${response.status}: ${JSON.stringify(payload)}`);
  }
  return { status: response.status, payload };
}

async function requestRaw(pathname, rawBody, expectedStatuses = [200]) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody
  });
  const payload = await response.json();
  assert(expectedStatuses.includes(response.status), `${pathname} returned ${response.status}: ${JSON.stringify(payload)}`);
  return { status: response.status, payload };
}

const reset = () => request("/fixture/reset", {});
const state = async () => (await request("/state")).payload;
const start = (body, statuses = [200]) => request("/commands/start", body, statuses);
const complete = (body, statuses = [200]) => request("/commands/complete", body, statuses);
const reorder = (body, statuses = [200]) => request("/commands/reorder", body, statuses);

const results = {};

async function spike01() {
  await reset();
  const before = await state();
  const failed = await start({ operation_id: "op-rollback", entry_id: "entry-a", execution_id: "exec-rollback", force_failure: true }, [500]);
  assert.equal(failed.payload.code, "forced_failure");
  const after = await state();
  assert.deepEqual(after.entries, before.entries);
  assert.deepEqual(after.executions, []);
  assert.deepEqual(after.operations, []);
  assert.equal(after.foreign_key_violation_count, 0);
  return { status: "PASS", iterations: 1, requests: 1, observed: "forced Start batch rolled back to exact pre-state" };
}

async function spike02() {
  const successCountDistribution = {};
  for (let iteration = 0; iteration < concurrencyIterations; iteration += 1) {
    await reset();
    const attempts = Array.from({ length: concurrencyRequests }, (_, index) => start({
      operation_id: `op-concurrent-${iteration}-${index}`,
      entry_id: index % 2 === 0 ? "entry-a" : "entry-b",
      execution_id: `exec-concurrent-${iteration}-${index}`
    }, null).catch(error => ({ status: null, payload: { code: "client_error", message: error instanceof Error ? error.message : String(error) } })));
    const responses = await Promise.all(attempts);
    const final = await state();
    const successCount = responses.filter(item => item.status === 200).length;
    const classifications = responses.reduce((counts, item) => {
      const key = `${item.status ?? "network"}:${String(item.payload.code ?? "unknown")}`;
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});
    successCountDistribution[successCount] = (successCountDistribution[successCount] ?? 0) + 1;
    const observation = {
      iteration,
      success_count: successCount,
      classifications,
      active_execution_count: final.active_execution_count,
      running_entry_count: final.running_entry_count,
      foreign_key_violation_count: final.foreign_key_violation_count
    };
    const iterationPassed = successCount === 1
      && (classifications["409:active_execution_conflict"] ?? 0) === concurrencyRequests - 1
      && final.active_execution_count === 1
      && final.running_entry_count === 1
      && final.executions.length === 1
      && final.foreign_key_violation_count === 0;
    console.log(`D1_SPIKE_02_ITERATION=${JSON.stringify(iterationPassed ? observation : {
      ...observation,
      executions: final.executions,
      entries: final.entries,
      operations: final.operations
    })}`);
    assert.equal(successCount, 1);
    assert.equal(classifications["409:active_execution_conflict"] ?? 0, concurrencyRequests - 1);
    assert.equal(final.active_execution_count, 1);
    assert.equal(final.running_entry_count, 1);
    assert.equal(final.executions.length, 1);
    assert.equal(final.foreign_key_violation_count, 0);
  }
  return {
    status: "PASS",
    iterations: concurrencyIterations,
    requests: concurrencyIterations * concurrencyRequests,
    success_count_distribution: successCountDistribution,
    observed: "exactly one Start won every clean scenario"
  };
}

async function spike03() {
  for (let iteration = 0; iteration < concurrencyIterations; iteration += 1) {
    await reset();
    const body = { operation_id: `op-retry-${iteration}`, entry_id: "entry-a", execution_id: `exec-retry-${iteration}` };
    const responses = await Promise.all(Array.from({ length: concurrencyRequests }, () => start(body)));
    assert(responses.every(item => item.payload.execution_id === body.execution_id));
    assert.equal(responses.filter(item => item.payload.replayed === false).length, 1);
    const final = await state();
    assert.equal(final.executions.length, 1);
    assert.equal(final.active_execution_count, 1);
    assert.equal(final.operations.length, 1);
  }
  return { status: "PASS", iterations: concurrencyIterations, requests: concurrencyIterations * concurrencyRequests, observed: "same-operation requests converged to one Execution/result" };
}

async function spike04() {
  await reset();
  await start({ operation_id: "op-misuse", entry_id: "entry-a", execution_id: "exec-misuse" });
  const formattingReplay = await requestRaw(
    "/commands/start",
    '{\n  "execution_id": "exec-misuse",\n  "entry_id": "entry-a",\n  "operation_id": "op-misuse"\n}'
  );
  assert.equal(formattingReplay.payload.replayed, true);
  assert.equal(formattingReplay.payload.execution_id, "exec-misuse");
  const misuse = await start({ execution_id: "exec-other", entry_id: "entry-b", operation_id: "op-misuse" }, [409]);
  assert.equal(misuse.payload.code, "operation_id_misuse");
  const final = await state();
  assert.equal(final.executions.length, 1);
  assert.equal(final.executions[0].id, "exec-misuse");
  assert.equal(final.operations.length, 1);
  return { status: "PASS", iterations: 1, requests: 3, observed: "formatting-only replay converged; different semantic reuse rejected" };
}

async function spike05() {
  for (let iteration = 0; iteration < concurrencyIterations; iteration += 1) {
    await reset();
    const executionId = `exec-complete-${iteration}`;
    await start({ operation_id: `op-start-complete-${iteration}`, entry_id: "entry-a", execution_id: executionId });
    const body = { operation_id: `op-complete-${iteration}`, entry_id: "entry-a", execution_id: executionId };
    const responses = await Promise.all(Array.from({ length: concurrencyRequests }, () => complete(body)));
    const endedAtValues = new Set(responses.map(item => item.payload.ended_at));
    assert.equal(endedAtValues.size, 1);
    assert.equal(responses.filter(item => item.payload.replayed === false).length, 1);
    const final = await state();
    assert.equal(final.executions.length, 1);
    assert.equal(final.executions[0].ended_at, [...endedAtValues][0]);
    assert.equal(final.entries.find(item => item.id === "entry-a").lifecycle, "completed");
    assert.equal(final.active_execution_count, 0);
  }
  return { status: "PASS", iterations: concurrencyIterations, requests: concurrencyIterations * concurrencyRequests, observed: "Complete retries preserved the first ended_at/result" };
}

async function spike06() {
  const initialOrder = ["entry-a", "entry-b", "entry-c"];
  const winnerCounts = { a: 0, b: 0 };
  for (let iteration = 0; iteration < concurrencyIterations; iteration += 1) {
    await reset();
    const candidates = [
      { key: "a", operationId: `op-reorder-a-${iteration}`, order: ["entry-b", "entry-a", "entry-c"] },
      { key: "b", operationId: `op-reorder-b-${iteration}`, order: ["entry-c", "entry-a", "entry-b"] }
    ];
    assert(candidates.every(candidate => candidate.order.join(",") !== initialOrder.join(",")));
    const dispatchedCandidates = iteration % 2 === 0 ? candidates : [...candidates].reverse();
    const responses = await Promise.all(dispatchedCandidates.map(candidate => reorder({
      operation_id: candidate.operationId,
      expected_revision: 0,
      entry_ids: candidate.order
    }, [200, 409])));
    assert.equal(responses.filter(item => item.status === 200).length, 1);
    assert.equal(responses.filter(item => item.status === 409 && item.payload.code === "placement_revision_conflict").length, 1);
    const winnerIndex = responses.findIndex(item => item.status === 200);
    const loserIndex = winnerIndex === 0 ? 1 : 0;
    const winner = dispatchedCandidates[winnerIndex];
    const loser = dispatchedCandidates[loserIndex];
    assert(winner);
    assert(loser);
    winnerCounts[winner.key] += 1;
    assert.equal(responses[winnerIndex].payload.operation_id, winner.operationId);
    assert.deepEqual(responses[winnerIndex].payload.entry_ids, winner.order);
    assert.equal(responses[loserIndex].payload.code, "placement_revision_conflict");
    const final = await state();
    assert.equal(final.placement_revision, 1);
    assert.deepEqual(final.entries.map(item => item.id), winner.order);
    assert.notDeepEqual(final.entries.map(item => item.id), initialOrder);
    assert.deepEqual(final.entries.map(item => item.position), [1, 2, 3]);
    assert.equal(new Set(final.entries.map(item => item.position)).size, final.entries.length);
    assert.equal(final.foreign_key_violation_count, 0);

    assert.equal(final.operations.length, 2);
    const winnerOperation = final.operations.find(item => item.operation_id === winner.operationId);
    const loserOperation = final.operations.find(item => item.operation_id === loser.operationId);
    assert(winnerOperation);
    assert(loserOperation);
    assert.equal(winnerOperation.outcome, "success");
    assert.equal(loserOperation.outcome, "rejected");
    const winnerResult = JSON.parse(winnerOperation.result_json);
    const loserResult = JSON.parse(loserOperation.result_json);
    assert.equal(winnerResult.operation_id, winner.operationId);
    assert.deepEqual(winnerResult.entry_ids, winner.order);
    assert.equal(loserResult.code, "placement_revision_conflict");

    console.log(`D1_SPIKE_06_ITERATION=${JSON.stringify({
      iteration,
      winner_operation_id: winner.operationId,
      winner_order: winner.order,
      final_order: final.entries.map(item => item.id),
      placement_revision: final.placement_revision,
      positions: final.entries.map(item => item.position),
      operation_outcomes: Object.fromEntries(final.operations.map(item => [item.operation_id, item.outcome])),
      foreign_key_violation_count: final.foreign_key_violation_count
    })}`);
  }
  return {
    status: "PASS",
    iterations: concurrencyIterations,
    requests: concurrencyIterations * 2,
    initial_order: initialOrder,
    candidate_orders: {
      a: ["entry-b", "entry-a", "entry-c"],
      b: ["entry-c", "entry-a", "entry-b"]
    },
    winner_counts: winnerCounts,
    observed: "HTTP winner identity, stored operation result, and exact final order matched; loser was revision conflict"
  };
}

async function spike07() {
  for (let iteration = 0; iteration < concurrencyIterations; iteration += 1) {
    await reset();
    const before = await state();
    const failed = await reorder({
      operation_id: `op-reorder-fail-${iteration}`,
      expected_revision: 0,
      entry_ids: ["entry-c", "entry-a", "entry-b"],
      force_failure: true
    }, [500]);
    assert.equal(failed.payload.code, "forced_failure");
    const after = await state();
    assert.deepEqual(after.entries, before.entries);
    assert.equal(after.placement_revision, before.placement_revision);
    assert.deepEqual(after.operations, []);
    assert.equal(after.foreign_key_violation_count, 0);
  }
  return { status: "PASS", iterations: concurrencyIterations, requests: concurrencyIterations, observed: "forced mid-command failure never left mixed ordering" };
}

async function spike08() {
  await reset();
  await start({ operation_id: "op-history-start", entry_id: "entry-a", execution_id: "exec-history" });
  await complete({ operation_id: "op-history-complete", entry_id: "entry-a", execution_id: "exec-history" });
  const deletion = await request("/unsafe/delete-task", { task_id: "task-1" }, [409]);
  assert.equal(deletion.payload.code, "foreign_key_restrict");
  const final = await state();
  assert.equal(final.executions.length, 1);
  assert.equal(final.executions[0].id, "exec-history");
  assert.equal(final.foreign_key_violation_count, 0);
  return { status: "PASS", iterations: 1, requests: 3, observed: "FK RESTRICT rejected hard delete; Execution remained queryable" };
}

const tests = [spike01, spike02, spike03, spike04, spike05, spike06, spike07, spike08];
for (let index = 0; index < tests.length; index += 1) {
  const id = `D1-SPIKE-${String(index + 1).padStart(2, "0")}`;
  if (only && only !== id) continue;
  results[id] = await tests[index]();
  console.log(`${id} ${environment}: PASS`);
}
if (only && !(only in results)) throw new Error(`unknown --only contract: ${only}`);

const evidence = {
  environment,
  base_url: baseUrl,
  generated_at: new Date().toISOString(),
  concurrency_requests: concurrencyRequests,
  concurrency_iterations: concurrencyIterations,
  results
};
const evidenceDirectory = path.resolve("evidence");
fs.mkdirSync(evidenceDirectory, { recursive: true });
const evidencePath = path.join(evidenceDirectory, `${environment}.json`);
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(`EVIDENCE=${evidencePath}`);
