import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const workerPath = join(scriptDirectory, "worker.mjs");
const schemaPath = join(scriptDirectory, "schema.sql");
const workflowCandidatePath = join(repositoryRoot, "D178_D1_ISOLATED_ACTIONS_CANDIDATE.yml");
const workflowDestinationPath = join(repositoryRoot, ".github", "workflows", "d178-d1-isolated-feasibility.yml");
const plannedCases = [
  "same-date",
  "overlap-boundaries",
  "replace",
  "foreign-keys",
  "candidate-fence",
  "batch-rollback",
  "guard-cost-10",
  "guard-cost-365",
  "guard-cost-7301",
  "race-same-date",
  "race-adjacent-touch",
  "race-crossing",
  "race-nested",
  "race-replace-immutability",
];

const runnerTemp = process.env.RUNNER_TEMP || tmpdir();
const artifactDirectory = join(runnerTemp, "d178-isolated-d1-artifact");
const scratchDirectory = await mkdtemp(join(runnerTemp, "d178-isolated-d1-"));
const persistDirectory = join(scratchDirectory, "persist");
const configPath = join(scratchDirectory, "wrangler.jsonc");
const report = {
  generatedAt: new Date().toISOString(),
  workflow: "D-178 isolated local D1 feasibility",
  run: {
    id: process.env.D178_GITHUB_RUN_ID || "unknown",
    attempt: process.env.D178_GITHUB_RUN_ATTEMPT || "unknown",
    event: process.env.D178_GITHUB_EVENT_NAME || "local",
    sha: process.env.D178_GITHUB_SHA || "unknown",
  },
  mode: "synthetic-only; Wrangler local D1; no application DB binding",
  versions: { node: process.version, sqlite: "NOT_RUN until Wrangler local D1 starts" },
  commands: [],
  worker: { status: "NOT_RUN" },
  results: [],
  separateGates: [{ name: "730000-note-activity", status: "NOT_RUN", scope: "out-of-scope",
    reason: "separate high-volume gate is outside this bounded Day guard feasibility candidate" }],
};
const logLines = [];
let devProcess;
let workerBaseUrl;
let processFailure = false;

function sanitize(value) {
  let text = String(value ?? "");
  for (const [path, label] of [
    [repositoryRoot, "<REPOSITORY>"],
    [scratchDirectory, "<RUNNER_TEMP>/d178-scratch"],
    [runnerTemp, "<RUNNER_TEMP>"],
    [process.env.HOME || "", "<HOME>"],
    [process.env.USERPROFILE || "", "<HOME>"],
  ]) {
    if (path) {
      text = text.split(path).join(label);
      text = text.split(path.replaceAll(sep, "/")).join(label);
    }
  }
  return text
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "<redacted-token>")
    .replace(/(authorization:\s*bearer\s+)\S+/gi, "$1<redacted>");
}

function cleanChildEnvironment() {
  const allowed = [
    "PATH", "HOME", "RUNNER_TEMP", "GITHUB_WORKSPACE", "CI", "NO_COLOR", "FORCE_COLOR",
    "TMPDIR", "TEMP", "TMP", "SystemRoot", "WINDIR", "PATHEXT", "ComSpec",
    "D178_GITHUB_SHA", "D178_GITHUB_RUN_ID", "D178_GITHUB_RUN_ATTEMPT", "D178_GITHUB_EVENT_NAME",
  ];
  const env = {};
  for (const key of allowed) if (process.env[key]) env[key] = process.env[key];
  env.WRANGLER_SEND_METRICS = "false";
  env.NO_UPDATE_NOTIFIER = "1";
  return env;
}

function runCommand(command, args, options = {}) {
  const display = [command, ...args].join(" ");
  report.commands.push(sanitize(display));
  return new Promise((resolveCommand) => {
    const child = spawn(command, args, {
      cwd: options.cwd || repositoryRoot,
      env: cleanChildEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolveCommand({ code: 127, stdout, stderr: `${stderr}\n${error.message}` }));
    child.on("close", (code, signal) => resolveCommand({ code: code ?? 1, signal, stdout, stderr }));
  });
}

function appendToolOutput(label, result) {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  logLines.push(`$ ${label} (exit ${result.code})`);
  if (output) logLines.push(sanitize(output));
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const port = server.address().port;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${workerBaseUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs || 15000),
    headers: { "content-type": "application/json", ...options.headers },
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { status: "FAIL", error: "Worker returned non-JSON response" }; }
  return { httpStatus: response.status, body };
}

async function postCase(name) {
  try {
    const result = await requestJson("/case", { method: "POST", body: JSON.stringify({ name }), timeoutMs: 30000 });
    if (result.httpStatus !== 200 && result.body.status !== "FAIL") {
      return { name, status: "NOT_RUN", reason: `unexpected HTTP ${result.httpStatus}`, response: result.body };
    }
    return result.body;
  } catch (error) {
    return { name, status: "NOT_RUN", reason: sanitize(error?.message ?? error) };
  }
}

async function postRacePair(mode, raceKey, requestRows, setup = null) {
  let setupEvidence = null;
  if (setup) {
    try {
      setupEvidence = await requestJson("/race-setup", {
        method: "POST",
        body: JSON.stringify({ raceKey, ...setup }),
        timeoutMs: 15000,
      });
    } catch (error) {
      return { name: mode, status: "NOT_RUN", reason: `race setup failed: ${sanitize(error?.message ?? error)}` };
    }
    if (setupEvidence.httpStatus !== 200 || setupEvidence.body?.status !== "PASS") {
      return { name: mode, status: "NOT_RUN", reason: "race fixture setup did not complete", evidence: { setup: setupEvidence } };
    }
  }
  const requests = requestRows.map(async (row) => {
    try {
      return await requestJson("/race", {
        method: "POST",
        body: JSON.stringify({ raceKey, scenario: mode, ...row }),
        timeoutMs: 15000,
      });
    } catch (error) {
      return { httpStatus: 0, body: { status: "NOT_RUN", reason: sanitize(error?.message ?? error) } };
    }
  });
  const responses = await Promise.all(requests);
  let inspected;
  try {
    inspected = (await requestJson(`/race-inspect?key=${encodeURIComponent(raceKey)}`)).body;
  } catch (error) {
    inspected = { error: sanitize(error?.message ?? error) };
  }
  const expectedIds = requestRows.map((item) => item.requestId).sort();
  const preflightIds = (inspected?.preflights || []).map((item) => item.request_id).sort();
  const arrivalIds = (inspected?.arrivals || []).map((item) => item.request_id).sort();
  const responseIds = responses.map((item) => item.body?.requestId).filter(Boolean).sort();
  const releaseObservationIds = (inspected?.releaseObservations || []).map((item) => item.request_id).sort();
  const orderedPhases = ["preflight_complete", "barrier_observed", "release_observed", "write_start", "write_result"];
  const eventSequences = expectedIds.map((id) => {
    const events = orderedPhases.map((phase) => inspected?.events?.find((event) => event.request_id === id && event.phase === phase));
    return { requestId: id, eventIds: events.map((event) => event?.event_id ?? null),
      increasing: events.every((event, index) => event && (index === 0 || event.event_id > events[index - 1].event_id)) };
  });
  const eventOrderObserved = eventSequences.every((sequence) => sequence.increasing);
  const preflightsRecorded = inspected?.counts?.preflights === 2
    && inspected?.preflights?.length === 2
    && JSON.stringify(preflightIds) === JSON.stringify(expectedIds)
    && inspected.preflights.every((item) => item.snapshot?.sameDateRows && item.snapshot?.overlappingOwnerRows
      && item.readMeta && item.app_user_id === `race-${raceKey}`);
  const preflightInputsMatch = requestRows.every((input) => {
    const recorded = inspected?.preflights?.find((item) => item.request_id === input.requestId);
    const candidate = recorded?.snapshot?.candidate;
    return candidate?.logicalDate === input.logicalDate
      && candidate?.startInstant === input.startInstant
      && candidate?.endInstant === input.endInstant
      && candidate?.action === (input.action || "create")
      && recorded?.snapshot?.fixedConfig?.timezone === "Etc/UTC"
      && recorded?.snapshot?.fixedConfig?.boundaryMinutes === 0
      && recorded?.snapshot?.fixedConfig?.disambiguation === "compatible";
  });
  const releaseObserved = inspected?.counts?.releases === 1
    && inspected?.releases?.length === 1
    && inspected?.releases?.[0]?.participant_count === 2
    && inspected?.counts?.release_observations === 2
    && inspected?.releaseObservations?.length === 2
    && JSON.stringify(releaseObservationIds) === JSON.stringify(expectedIds);
  const barrierObserved = responses.length === 2
    && inspected?.counts?.arrivals === 2
    && inspected?.arrivals?.length === 2
    && JSON.stringify(arrivalIds) === JSON.stringify(expectedIds)
    && JSON.stringify(responseIds) === JSON.stringify(expectedIds)
    && preflightsRecorded && preflightInputsMatch && releaseObserved
    && responses.every((item) => item.body?.released === true && item.body?.preflightCount === 2)
    && eventOrderObserved;
  const statuses = responses.map((item) => item.body?.status);
  let assertions = [];
  if (!barrierObserved) {
    assertions.push({ id: `${mode}-two-preflights-release-and-post-state`, status: "NOT_RUN",
      reason: "both D1 preflights, distinct IDs, release observations, and completion events were not all observed" });
  } else {
    assertions.push({ id: `${mode}-preflight-read-release-barrier`, status: "PASS",
      preflightIds, requestIds: expectedIds, preflightSnapshots: inspected.preflights.map((item) => item.snapshot),
      release: inspected.releases[0], releaseObservations: inspected.releaseObservations,
      eventSequences, preflightInputsMatch,
      interpretation: "two HTTP handler lifetimes completed their D1 reads before the D1 release; this does not prove simultaneous SQL writes" });
    const emptyPreflights = inspected.preflights.every((item) => item.snapshot.sameDateRows.length === 0
      && item.snapshot.overlappingOwnerRows.length === 0);
    const commonIntegrity = inspected.counts?.context_orphans === 0
      && inspected.counts?.operation_orphans === 0
      && inspected.counts?.missing_fences === 0
      && inspected.counts?.overlapping_pairs === 0;
    assertions.push({ id: `${mode}-preflight-owner-state-and-integrity`,
      status: mode === "race-replace-immutability"
        ? inspected.preflights.every((item) => item.snapshot.sameDateRows.length === 1
          && item.snapshot.sameDateRows[0].id === `existing-${raceKey}`
          && item.snapshot.overlappingOwnerRows.length === 0) && commonIntegrity ? "PASS" : "FAIL"
        : emptyPreflights && commonIntegrity ? "PASS" : "FAIL",
      sameDateRows: inspected.preflights.map((item) => item.snapshot.sameDateRows.length),
      ownerOverlapRows: inspected.preflights.map((item) => item.snapshot.overlappingOwnerRows.length),
      integrityCounts: inspected.counts });
  }

  if (barrierObserved && mode === "race-same-date") {
    const operationIds = (inspected.operations || []).map((item) => item.operation_id).sort();
    const expectedOperationIds = requestRows.map((item) => `operation-${item.requestId}`).sort();
    const expectedSectionIds = requestRows.map((item) => `section-${item.requestId}`).sort();
    const winner = inspected.days?.[0];
    const winnerMatchesInputs = Boolean(winner)
      && requestRows.some((input) => winner.id === `day-${input.requestId}`)
      && requestRows.every((input) => winner.logical_date === input.logicalDate
        && winner.start_instant === input.startInstant && winner.end_instant === input.endInstant
        && winner.establishment_timezone === "Etc/UTC"
        && winner.establishment_boundary_minutes === 0
        && winner.establishment_disambiguation === "compatible");
    const allDependentsUseWinner = inspected.contexts.every((item) => item.day_id === inspected.days?.[0]?.id)
      && inspected.operations.every((item) => item.day_id === inspected.days?.[0]?.id)
      && JSON.stringify(operationIds) === JSON.stringify(expectedOperationIds)
      && JSON.stringify(inspected.contexts.map((item) => item.section_id).sort()) === JSON.stringify(expectedSectionIds);
    assertions.push({ id: "same-date-winner-convergence-two-complete-batches",
      status: inspected.counts?.days === 1 && inspected.counts?.sections === 2
        && inspected.counts?.contexts === 2 && inspected.counts?.operations === 2
        && inspected.counts?.fences === 1 && statuses.every((item) => item === "PASS")
        && allDependentsUseWinner && winnerMatchesInputs ? "PASS" : "FAIL",
      counts: inspected.counts, winner: winner ?? null, winnerMatchesInputs, operationIds,
      sectionIds: (inspected.contexts || []).map((item) => item.section_id).sort(),
      requestStatuses: statuses, allDependentsUseWinner });
  } else if (barrierObserved && mode === "race-adjacent-touch") {
    const orderedDays = [...(inspected.days || [])].sort((left, right) => left.logical_date.localeCompare(right.logical_date));
    const otherOwnerOverlap = inspected.otherOwnerRows?.some((other) =>
      orderedDays.some((target) => target.start_instant < other.end_instant && other.start_instant < target.end_instant));
    const exactTouch = orderedDays.length === 2 && orderedDays[0].end_instant === orderedDays[1].start_instant
      && orderedDays[0].logical_date < orderedDays[1].logical_date;
    const adjacentDependentsMatchDays = requestRows.every((input) => {
      const dayRow = orderedDays.find((item) => item.logical_date === input.logicalDate);
      const section = inspected.contexts?.find((item) => item.section_id === `section-${input.requestId}`);
      const operation = inspected.operations?.find((item) => item.operation_id === `operation-${input.requestId}`);
      return dayRow?.id === `day-${input.requestId}`
        && dayRow.start_instant === input.startInstant && dayRow.end_instant === input.endInstant
        && dayRow.establishment_timezone === "Etc/UTC"
        && dayRow.establishment_boundary_minutes === 0
        && dayRow.establishment_disambiguation === "compatible"
        && section?.day_id === dayRow.id && operation?.day_id === dayRow.id;
    });
    const otherOwnerIsolated = inspected.otherOwnerRows?.length === 1 && otherOwnerOverlap
      && inspected.otherOwnerRows.every((other) => other.app_user_id !== `race-${raceKey}`)
      && inspected.preflights.every((item) => item.snapshot.overlappingOwnerRows.length === 0);
    assertions.push({ id: "adjacent-logical-dates-exact-touch-and-owner-isolation",
      status: inspected.counts?.days === 2 && inspected.counts?.sections === 2
        && inspected.counts?.contexts === 2 && inspected.counts?.operations === 2
        && inspected.counts?.fences === 2 && statuses.every((item) => item === "PASS")
        && exactTouch && adjacentDependentsMatchDays && otherOwnerIsolated ? "PASS" : "FAIL",
      days: orderedDays, exactTouch, adjacentDependentsMatchDays, otherOwnerRows: inspected.otherOwnerRows, otherOwnerOverlap, otherOwnerIsolated,
      requestStatuses: statuses, counts: inspected.counts });
  } else if (barrierObserved && ["race-crossing", "race-nested"].includes(mode)) {
    const operationIds = (inspected.operations || []).map((item) => item.operation_id).sort();
    const requestOperationIds = requestRows.map((item) => `operation-${item.requestId}`).sort();
    const rejectedResponses = responses.filter((item) => item.body?.status === "REJECTED");
    const overlapErrorObserved = rejectedResponses.length === 1
      && String(rejectedResponses[0].body.error ?? "").toLowerCase().includes("synthetic day interval overlap");
    const winnerResponse = responses.find((item) => item.body?.status === "PASS");
    const winnerInput = requestRows.find((item) => item.requestId === winnerResponse?.body?.requestId);
    const winnerDay = inspected.days?.[0];
    const winnerDependentsMatch = Boolean(winnerInput && winnerDay)
      && winnerDay.id === `day-${winnerInput.requestId}`
      && winnerDay.logical_date === winnerInput.logicalDate
      && winnerDay.start_instant === winnerInput.startInstant && winnerDay.end_instant === winnerInput.endInstant
      && winnerDay.establishment_timezone === "Etc/UTC"
      && winnerDay.establishment_boundary_minutes === 0
      && winnerDay.establishment_disambiguation === "compatible"
      && inspected.contexts?.[0]?.day_id === winnerDay.id
      && inspected.contexts?.[0]?.section_id === `section-${winnerInput.requestId}`
      && inspected.operations?.[0]?.day_id === winnerDay.id
      && inspected.operations?.[0]?.operation_id === `operation-${winnerInput.requestId}`;
    assertions = [
      ...assertions,
      { id: `${mode}-one-atomic-winner-no-rejected-request-sentinels`,
        status: inspected.counts?.days === 1 && inspected.counts?.sections === 1
          && inspected.counts?.contexts === 1 && inspected.counts?.operations === 1
          && inspected.counts?.fences === 1
          && statuses.filter((item) => item === "PASS").length === 1
          && statuses.filter((item) => item === "REJECTED").length === 1
          && overlapErrorObserved
          && operationIds.length === 1 && requestOperationIds.includes(operationIds[0])
          && winnerDependentsMatch
          ? "PASS" : "FAIL",
        counts: inspected.counts, operationIds, requestOperationIds, requestStatuses: statuses,
        overlapErrorObserved, winnerDay: winnerDay ?? null, winnerDependentsMatch,
        rejectionError: rejectedResponses[0]?.body?.error ?? null },
    ];
  } else if (barrierObserved && mode === "race-replace-immutability") {
    const replace = responses.find((item) => item.body?.action === "replace");
    const update = responses.find((item) => item.body?.action === "update");
    const old = inspected.days?.[0];
    assertions.push({ id: "nonoverlap-replace-and-immutable-update-are-rejected",
      status: inspected.counts?.days === 1 && inspected.counts?.fences === 1
        && inspected.counts?.sections === 0 && inspected.counts?.contexts === 0 && inspected.counts?.operations === 0
        && replace?.body?.status === "REJECTED" && String(replace.body.error ?? "").toLowerCase().includes("foreign key")
        && update?.body?.status === "REJECTED" && String(update.body.error ?? "").toLowerCase().includes("immutable")
        && old?.id === `existing-${raceKey}` && old?.start_instant === "2026-09-30T00:00:00.000Z"
        && old?.end_instant === "2026-09-30T01:00:00.000Z" ? "PASS" : "FAIL",
      counts: inspected.counts, existingDayAfter: old ?? null,
      requestStatuses: responses.map((item) => ({ requestId: item.body?.requestId, action: item.body?.action,
        status: item.body?.status, error: item.body?.error ?? null })) });
  } else if (barrierObserved) {
    assertions.push({ id: `${mode}-recognized-postcondition`, status: "FAIL",
      reason: "the completed race has no required postcondition handler" });
  }
  const caseStatus = aggregateCaseStatus(assertions);
  return {
    name: mode,
    status: caseStatus,
    assertions,
    evidence: { setup: setupEvidence, requestInputs: requestRows, requests: responses, inspection: inspected, barrierObserved },
  };
}

function aggregateCaseStatus(assertions) {
  if (assertions.some((item) => item.status === "FAIL")) return "FAIL";
  if (assertions.some((item) => item.status === "ENV_BLOCKED")) return "ENV_BLOCKED";
  if (assertions.some((item) => item.status === "NOT_RUN")) return "NOT_RUN";
  if (assertions.some((item) => item.status === "PARTIAL")) return "PARTIAL";
  return "PASS";
}

const expectedRejectedMetaReason = "D1 does not return per-statement meta when the rejected .run() throws; elapsed time and unchanged state are recorded.";
const knownResultStatuses = new Set(["PASS", "FAIL", "NOT_RUN", "PARTIAL", "ENV_BLOCKED"]);

function hasRequiredMetaMetrics(assertion) {
  return ["rows_read", "rows_written", "duration"].every((key) =>
    typeof assertion?.[key] === "number" && Number.isFinite(assertion[key]));
}

function hasRequiredGuardCostMeta(assertions, sampleSize) {
  const requiredMetaIds = [
    `baseline-${sampleSize}-seed-meta-coverage`,
    `guarded-${sampleSize}-seed-meta-coverage`,
    `control-successful-insert-${sampleSize}-result-meta`,
    `guard-successful-insert-with-overlap-and-fence-triggers-${sampleSize}-result-meta`,
  ];
  const exactlyOne = (id) => assertions.filter((item) => item?.id === id).length === 1;
  return requiredMetaIds.every((id) => {
    if (!exactlyOne(id)) return false;
    const assertion = assertions.find((item) => item?.id === id);
    return assertion.status === "PASS" && hasRequiredMetaMetrics(assertion);
  });
}

function hasExpectedGuardCostPartial(result, sampleSize) {
  const assertions = result.assertions;
  if (result.status !== "PARTIAL" || !Array.isArray(assertions) || assertions.length === 0
      || assertions.some((item) => !item || typeof item !== "object")) return false;
  const assertionIds = assertions.map((item) => item?.id);
  if (assertionIds.some((id) => typeof id !== "string" || id.length === 0)
      || new Set(assertionIds).size !== assertionIds.length) return false;

  const partialIds = [
    `guarded-overlap-rejection-${sampleSize}-d1-meta-coverage`,
    `guarded-immutability-rejection-${sampleSize}-d1-meta-coverage`,
    `guarded-nonoverlap-replace-rejection-${sampleSize}-d1-meta-coverage`,
  ];
  const actualPartialIds = assertions.filter((item) => item?.status === "PARTIAL").map((item) => item.id);
  if (actualPartialIds.length !== partialIds.length
      || partialIds.some((id) => actualPartialIds.filter((actual) => actual === id).length !== 1)) return false;

  const rejectedStateIds = [
    `guarded-overlap-rejection-${sampleSize}-rejected-without-state-change`,
    `guarded-immutability-rejection-${sampleSize}-rejected-without-state-change`,
    `guarded-nonoverlap-replace-rejection-${sampleSize}-rejected-without-state-change`,
  ];
  const exactlyOne = (id) => assertions.filter((item) => item?.id === id).length === 1;
  if (![...partialIds, ...rejectedStateIds].every(exactlyOne)
      || !hasRequiredGuardCostMeta(assertions, sampleSize)) return false;

  for (const assertion of assertions) {
    if (partialIds.includes(assertion.id)) {
      if (assertion.status !== "PARTIAL" || assertion.reason !== expectedRejectedMetaReason) return false;
    } else if (assertion.status !== "PASS") {
      return false;
    }
  }
  if (!rejectedStateIds.every((id) => assertions.find((item) => item.id === id)?.status === "PASS")) return false;
  return true;
}

function evaluateResults(results, expectedNames = plannedCases) {
  const failed = (status = "FAIL") => ({ status, successfulExitAllowed: false });
  if (!Array.isArray(results) || !Array.isArray(expectedNames) || expectedNames.length === 0) return failed("NOT_RUN");

  const expectedNameSet = new Set(expectedNames);
  if (expectedNameSet.size !== expectedNames.length) return failed();
  if (results.some((item) => !item || typeof item.name !== "string" || !expectedNameSet.has(item.name))) return failed();

  const counts = new Map();
  for (const item of results) counts.set(item.name, (counts.get(item.name) || 0) + 1);
  if (expectedNames.some((name) => counts.get(name) !== 1)) return failed("NOT_RUN");

  let hasFailure = false;
  let hasEnvironmentBlock = false;
  let hasNotRun = false;
  let hasPartial = false;
  for (const item of results) {
    if (!knownResultStatuses.has(item.status)) hasFailure = true;
    if (item.status === "FAIL") hasFailure = true;
    if (item.status === "ENV_BLOCKED") hasEnvironmentBlock = true;
    if (item.status === "NOT_RUN") hasNotRun = true;
    if (item.status === "PARTIAL") hasPartial = true;

    if (!Array.isArray(item.assertions)) {
      if (item.status === "PASS" || item.status === "PARTIAL") hasFailure = true;
      continue;
    }
    if (item.assertions.some((assertion) => !assertion || typeof assertion !== "object")) hasFailure = true;
    const assertionIds = item.assertions.map((assertion) => assertion?.id);
    if (assertionIds.some((id) => typeof id !== "string" || id.length === 0)
        || new Set(assertionIds).size !== assertionIds.length) hasFailure = true;
    for (const assertion of item.assertions) {
      if (!knownResultStatuses.has(assertion?.status)) hasFailure = true;
      if (assertion?.status === "FAIL") hasFailure = true;
      if (assertion?.status === "ENV_BLOCKED") hasEnvironmentBlock = true;
      if (assertion?.status === "NOT_RUN") hasNotRun = true;
      if (assertion?.status === "PARTIAL") hasPartial = true;
    }

    if ((item.status === "PASS" || item.status === "PARTIAL") && item.assertions.length === 0) hasFailure = true;
    if (item.assertions.length > 0 && !item.assertions.some((assertion) => !assertion || typeof assertion !== "object")
        && aggregateCaseStatus(item.assertions) !== item.status) hasFailure = true;
    if (item.status === "PARTIAL") {
      const match = /^guard-cost-(10|365|7301)$/.exec(item.name);
      if (!match || !hasExpectedGuardCostPartial(item, Number(match[1]))) hasFailure = true;
    }
    const guardCostMatch = /^guard-cost-(10|365|7301)$/.exec(item.name);
    if (guardCostMatch && (item.status === "PASS" || item.status === "PARTIAL")
        && !hasRequiredGuardCostMeta(item.assertions, Number(guardCostMatch[1]))) hasFailure = true;
  }

  if (hasFailure) return failed("FAIL");
  if (hasEnvironmentBlock) return failed("ENV_BLOCKED");
  if (hasNotRun) return failed("NOT_RUN");
  if (hasPartial) return { status: "PARTIAL", successfulExitAllowed: true };
  return { status: "PASS", successfulExitAllowed: true };
}

function resultStatus() {
  return evaluateResults(report.results).status;
}

function shouldSetNonzeroExit({ assessment, metadataOnly, processFailure: hadProcessFailure }) {
  if (hadProcessFailure) return true;
  return !metadataOnly && !assessment.successfulExitAllowed;
}

function sanitizeData(value) {
  if (typeof value === "string") return sanitize(value);
  if (Array.isArray(value)) return value.map(sanitizeData);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [sanitize(key), sanitizeData(entry)]));
  }
  return value;
}

function summaryMarkdown() {
  const lines = [
    "# D-178 isolated local D1 feasibility",
    "",
    `- Overall: **${resultStatus()}**`,
    `- SHA: \`${report.run.sha}\``,
    `- Run: \`${report.run.id}\` attempt \`${report.run.attempt}\` (${report.run.event})`,
    `- Worker: **${report.worker.status}**${report.worker.sqliteVersion ? `; SQLite ${report.worker.sqliteVersion}` : ""}`,
    `- Scope: ${report.mode}`,
    "",
    "## Case results",
    "",
    "| Case | Status | Notes |",
    "| --- | --- | --- |",
  ];
  for (const item of report.results) {
    const notes = (item.assertions || []).map((assertion) => `${assertion.id}: ${assertion.status}${assertion.reason ? ` (${assertion.reason})` : ""}`).join("; ");
    lines.push(`| ${item.name} | ${item.status} | ${sanitize(notes).replaceAll("|", "\\|")} |`);
  }
  for (const gate of report.separateGates || []) {
    lines.push(`| ${gate.name} | ${gate.status} (out-of-scope) | ${sanitize(gate.reason || "").replaceAll("|", "\\|")} |`);
  }
  lines.push(
    "",
    "## Interpretation",
    "",
    "- This synthetic harness demonstrates isolated D1/SQLite behavior only; it does not implement or approve D-178 product/schema changes.",
    "- A PASS on a `*-bypass-observed` assertion means the experiment reproduced a guard gap, not that the behavior is acceptable.",
    "- A two-request preflight/release barrier proves both HTTP handlers observed D1 state before business writes were released; it does not prove simultaneous SQL execution.",
    "- A guard-cost case is PARTIAL only when all assertions otherwise pass and the only missing evidence is per-statement meta from an expected rejected `.run()`; elapsed time and unchanged-state checks are retained.",
    "- D-178's 730,000-row Note activity gate is separate and NOT_RUN.",
    "",
  );
  return lines.join("\n");
}

async function saveArtifacts() {
  await mkdir(artifactDirectory, { recursive: true });
  const copies = [
    [schemaPath, "schema.sql"],
    [workerPath, "worker.mjs"],
    [fileURLToPath(import.meta.url), "run.mjs"],
  ];
  for (const [source, destination] of copies) {
    try { await copyFile(source, join(artifactDirectory, destination)); }
    catch (error) {
      logLines.push(`artifact copy failed: ${destination}: ${sanitize(error?.message ?? error)}`);
      processFailure = true;
    }
  }
  let workflowCopied = false;
  for (const source of [workflowDestinationPath, workflowCandidatePath]) {
    try {
      await copyFile(source, join(artifactDirectory, "workflow-candidate.yml"));
      workflowCopied = true;
      break;
    } catch {}
  }
  if (!workflowCopied) {
    logLines.push("artifact copy failed: workflow-candidate.yml: staged and repository workflow paths were unavailable");
    processFailure = true;
  }
  report.overall = resultStatus();
  await writeFile(join(artifactDirectory, "results.json"), `${JSON.stringify(sanitizeData(report), null, 2)}\n`, "utf8");
  await writeFile(join(artifactDirectory, "summary.md"), summaryMarkdown(), "utf8");
  await writeFile(join(artifactDirectory, "harness.log"), `${logLines.join("\n")}\n`, "utf8");
}

function startWranglerDev(wranglerPath, port) {
  report.commands.push("node <apps/web>/node_modules/wrangler/bin/wrangler.js dev --local --ip 127.0.0.1 --port <ephemeral> --log-level error --config <RUNNER_TEMP>/d178-scratch/wrangler.jsonc --persist-to <RUNNER_TEMP>/d178-scratch/persist");
  const child = spawn(process.execPath, [
    wranglerPath, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port), "--log-level", "error",
    "--config", configPath, "--persist-to", persistDirectory,
  ], {
    cwd: repositoryRoot,
    env: cleanChildEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  child.on("close", (code, signal) => {
    logLines.push(`wrangler dev exited (code=${code ?? "null"}, signal=${signal ?? "none"})`);
    if (stdout.trim()) logLines.push(sanitize(stdout));
    if (stderr.trim()) logLines.push(sanitize(stderr));
  });
  return child;
}

async function waitForWorker(timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (devProcess.exitCode !== null || devProcess.signalCode !== null) return null;
    try {
      const response = await fetch(`${workerBaseUrl}/health`, { signal: AbortSignal.timeout(1500) });
      const body = await response.json();
      if (response.ok && body.status === "PASS") return body;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  return null;
}

async function main() {
  await mkdir(artifactDirectory, { recursive: true });
  const wranglerPath = join(repositoryRoot, "apps", "web", "node_modules", "wrangler", "bin", "wrangler.js");
  const config = {
    name: "d178-isolated-d1-fixture",
    main: workerPath,
    compatibility_date: "2026-10-10",
    workers_dev: false,
    d1_databases: [{
      binding: "DB",
      database_name: "d178-isolated-synthetic-only",
      database_id: "00000000-0000-4000-8000-000000000178",
    }],
  };

  try {
    const packageLock = JSON.parse(await readFile(join(repositoryRoot, "apps", "web", "package-lock.json"), "utf8"));
    report.versions.wranglerLocked = packageLock.packages?.["node_modules/wrangler"]?.version ?? "unavailable";
    const workerdPackage = Object.entries(packageLock.packages || {})
      .find(([path]) => /(^|\/)node_modules\/workerd$/.test(path));
    report.versions.workerdLocked = workerdPackage?.[1]?.version ?? "unavailable";
  } catch (error) {
    report.versions.packageLock = `unavailable: ${sanitize(error?.message ?? error)}`;
  }

  for (const [label, command, args] of [
    ["node version", process.execPath, ["--version"]],
    ["npm version", "npm", ["--version"]],
    ["wrangler version", process.execPath, [wranglerPath, "--version"]],
  ]) {
    const result = await runCommand(command, args);
    appendToolOutput(label, result);
    if (result.code === 0) report.versions[label.split(" ")[0]] = result.stdout.trim();
    else report.versions[label.split(" ")[0]] = `unavailable (exit ${result.code})`;
  }

  if (process.argv.includes("--metadata-only")) {
    report.worker = { status: "NOT_RUN", reason: "metadata-only artifact seed before npm ci; no local D1 was started" };
    report.results = plannedCases.map((name) => ({ name, status: "NOT_RUN", reason: "npm ci and the D1 harness have not run yet" }));
    logLines.push("metadata-only seed: D1/Worker cases were not executed");
    return;
  }

  if (report.versions.wranglerLocked !== "4.125.0") {
    logLines.push(`locked Wrangler version differs from CI-pinned expectation: ${report.versions.wranglerLocked}`);
  }
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await mkdir(persistDirectory, { recursive: true });

  const initArgs = ["d1", "execute", "DB", "--local", "--config", configPath, "--persist-to", persistDirectory,
    "--file", schemaPath, "--yes", "--json"];
  const init = await runCommand(process.execPath, [wranglerPath, ...initArgs]);
  appendToolOutput("initialize disposable D1 schema", init);
  if (init.code !== 0) {
    report.worker = { status: "NOT_RUN", reason: "Wrangler could not initialize the synthetic local D1 schema" };
    report.results = plannedCases.map((name) => ({ name, status: "NOT_RUN", reason: "D1 schema initialization failed" }));
    processFailure = true;
    return;
  }

  const port = await freePort();
  workerBaseUrl = `http://127.0.0.1:${port}`;
  devProcess = startWranglerDev(wranglerPath, port);
  const health = await waitForWorker();
  if (!health) {
    report.worker = { status: "NOT_RUN", reason: "Wrangler local Worker failed to become healthy before timeout or exited early" };
    report.results = plannedCases.map((name) => ({ name, status: "NOT_RUN", reason: "synthetic local Worker did not boot" }));
    processFailure = true;
    return;
  }
  report.worker = { status: "PASS", sqliteVersion: health.sqliteVersion };
  report.versions.sqlite = health.sqliteVersion ?? "unavailable";

  for (const name of plannedCases.filter((item) => !item.startsWith("race-"))) {
    const result = await postCase(name);
    report.results.push(result);
  }

  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const sameRaceKey = `same-${nonce}`;
  report.results.push(await postRacePair("race-same-date", sameRaceKey, [
    { requestId: "request-a", logicalDate: "2026-08-11", startInstant: "2026-08-11T10:00:00.000Z", endInstant: "2026-08-11T11:00:00.000Z", action: "create" },
    { requestId: "request-b", logicalDate: "2026-08-11", startInstant: "2026-08-11T10:00:00.000Z", endInstant: "2026-08-11T11:00:00.000Z", action: "create" },
  ]));
  const adjacentRaceKey = `adjacent-${nonce}`;
  report.results.push(await postRacePair("race-adjacent-touch", adjacentRaceKey, [
    { requestId: "request-a", logicalDate: "2026-09-14", startInstant: "2026-09-14T00:00:00.000Z", endInstant: "2026-09-15T00:00:00.000Z", action: "create" },
    { requestId: "request-b", logicalDate: "2026-09-15", startInstant: "2026-09-15T00:00:00.000Z", endInstant: "2026-09-16T00:00:00.000Z", action: "create" },
  ], { kind: "other-owner-day", logicalDate: "2026-09-14", startInstant: "2026-09-14T12:00:00.000Z", endInstant: "2026-09-14T13:00:00.000Z" }));
  const crossingRaceKey = `crossing-${nonce}`;
  report.results.push(await postRacePair("race-crossing", crossingRaceKey, [
    { requestId: "request-a", logicalDate: "2026-09-20", startInstant: "2026-09-20T00:00:00.000Z", endInstant: "2026-09-22T00:00:00.000Z", action: "create" },
    { requestId: "request-b", logicalDate: "2026-09-21", startInstant: "2026-09-21T00:00:00.000Z", endInstant: "2026-09-23T00:00:00.000Z", action: "create" },
  ]));
  const nestedRaceKey = `nested-${nonce}`;
  report.results.push(await postRacePair("race-nested", nestedRaceKey, [
    { requestId: "request-a", logicalDate: "2026-09-24", startInstant: "2026-09-24T00:00:00.000Z", endInstant: "2026-09-27T00:00:00.000Z", action: "create" },
    { requestId: "request-b", logicalDate: "2026-09-25", startInstant: "2026-09-25T00:00:00.000Z", endInstant: "2026-09-26T00:00:00.000Z", action: "create" },
  ]));
  const immutableRaceKey = `immutable-${nonce}`;
  report.results.push(await postRacePair("race-replace-immutability", immutableRaceKey, [
    { requestId: "request-a", logicalDate: "2026-09-30", startInstant: "2026-09-30T13:00:00.000Z", endInstant: "2026-09-30T14:00:00.000Z", action: "replace" },
    { requestId: "request-b", logicalDate: "2026-09-30", startInstant: "2026-09-30T13:00:00.000Z", endInstant: "2026-09-30T14:00:00.000Z", action: "update" },
  ], { kind: "immutability-day", logicalDate: "2026-09-30", startInstant: "2026-09-30T00:00:00.000Z", endInstant: "2026-09-30T01:00:00.000Z" }));
}

try {
  await main();
} catch (error) {
  const reason = sanitize(error?.stack ?? error?.message ?? error);
  logLines.push(`harness failed: ${reason}`);
  if (report.worker.status !== "PASS") report.worker = { status: "NOT_RUN", reason };
  for (const name of plannedCases) {
    if (!report.results.some((item) => item.name === name)) report.results.push({ name, status: "NOT_RUN", reason: "harness setup failed" });
  }
  processFailure = true;
} finally {
  if (devProcess && devProcess.exitCode === null && devProcess.signalCode === null) {
    devProcess.kill("SIGTERM");
    await new Promise((resolveWait) => {
      const timer = setTimeout(resolveWait, 3000);
      devProcess.once("close", () => { clearTimeout(timer); resolveWait(); });
    });
    if (devProcess.exitCode === null && devProcess.signalCode === null) devProcess.kill("SIGKILL");
  }
  try { await saveArtifacts(); }
  catch (error) {
    logLines.push(`artifact writing failed: ${sanitize(error?.message ?? error)}`);
    processFailure = true;
  }
}

console.log(`D-178 isolated local D1 overall: ${resultStatus()}`);
for (const item of report.results) console.log(`${item.status.padEnd(7)} ${item.name}`);
for (const gate of report.separateGates || []) console.log(`${gate.status.padEnd(7)} ${gate.name} (out-of-scope)`);
if (process.argv.includes("--metadata-only")) console.log("Metadata-only seed: D1 case statuses remain NOT_RUN; no test case PASS was produced.");
if (processFailure) console.error("Harness or artifact writing failed; exiting nonzero.");
console.log(`Sanitized report directory: ${sanitize(artifactDirectory)}`);
const finalAssessment = evaluateResults(report.results);
if (shouldSetNonzeroExit({ assessment: finalAssessment, metadataOnly: process.argv.includes("--metadata-only"), processFailure })) {
  process.exitCode = 1;
}