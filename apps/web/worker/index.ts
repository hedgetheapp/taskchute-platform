import type { ApiErrorBody } from "../src/shared/contracts";
import { addTaskToDay, isAddTaskToDayRequest } from "./application/add-task-to-day";
import { duplicateEntry, isDuplicateEntryRequest } from "./application/duplicate-entry";
import { bulkDeleteEntries, isBulkDeleteEntriesRequest } from "./application/bulk-delete-entries";
import { bulkMoveEntriesToDay, isBulkMoveEntriesToDayRequest } from "./application/bulk-move-entries-to-day";
import { bulkMoveEntriesToSection, isBulkMoveEntriesToSectionRequest } from "./application/bulk-move-entries-to-section";
import { bulkMoveEntriesToSectionOccurrence, isBulkMoveEntriesToSectionOccurrenceRequest } from "./application/bulk-move-entries-to-section-occurrence";
import { bulkMoveEntriesToSectionScoped, isBulkMoveEntriesToSectionScopedRequest } from "./application/bulk-move-entries-to-section-scoped";
import { bulkSetEntriesEstimateScoped, isBulkSetEntriesEstimateScopedRequest } from "./application/bulk-set-entries-estimate-scoped";
import { createProject, isCreateProjectRequest } from "./application/create-project";
import { loadProjects } from "./application/load-projects";
import { HttpError } from "./application/errors";
import { loadCurrentTaskChuteDay, loadTaskChuteDayByLogicalDate } from "./application/load-current-day";
import { isLogicalDate } from "./domain/taskchute-day";
import { completeEntry, isCompleteEntryRequest, isStartEntryRequest, startEntry } from "./application/entry-lifecycle";
import {
  isRevertEntryStartRequest,
  isSetExecutionTimesRequest,
  revertEntryStart,
  setExecutionTimes,
} from "./application/execution-correction";
import { isMoveEntryRequest, isSetEntryEstimateRequest, moveEntry, setEntryEstimate } from "./application/entry-planning";
import { isReorderEntriesRequest, reorderEntries } from "./application/reorder-entries";
import { isSetEntryPlannedStartRequest, setEntryPlannedStart } from "./application/planned-start";
import { convertEntryToRoutine, endRoutine, isConvertEntryToRoutineRequest, isEndRoutineRequest } from "./application/routine";
import {
  isSetRoutineEstimateRequest,
  isSetRoutineSectionPlanRequest,
  setRoutineEstimate,
  setRoutineSectionPlan,
} from "./application/routine-planning";
import {
  createRoutine,
  isCreateRoutineRequest,
  isReorderRoutinesRequest,
  isSetRoutineEnabledRequest,
  isUpdateRoutineRequest,
  loadRoutineBoard,
  reorderRoutines,
  setRoutineEnabled,
  updateRoutine,
} from "./application/routine-board";
import {
  establishInitialSectionConfiguration,
  isEstablishInitialSectionConfigurationRequest,
  isUpdateSectionConfigurationRequest,
  loadSectionConfiguration,
  updateSectionConfiguration,
} from "./application/section-configuration";
import { createRequestAuth } from "./auth/better-auth";
import { bootstrapInitialUser, isBootstrapModeEnabled } from "./auth/bootstrap";
import { resolvePrincipal } from "./auth/principal";
import { readBoundedJson } from "./http/json";

const SECURITY_HEADERS: Record<string, string> = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
};

function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) secured.headers.set(name, value);
  return secured;
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/auth/")) {
    return createRequestAuth(request, env).handler(request);
  }
  if (request.method === "POST" && url.pathname === "/api/internal/bootstrap") {
    if (!isBootstrapModeEnabled(env.BOOTSTRAP_ENABLED)) {
      throw new HttpError(404, "resource_not_found", "Not found");
    }
    return bootstrapInitialUser(request, env);
  }
  if (!url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });

  const principal = await resolvePrincipal(request, env);
  if (request.method === "GET" && url.pathname === "/api/v1/taskchute-days/current") {
    return Response.json(await loadCurrentTaskChuteDay(env.APP_DB, principal.appUserId));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/taskchute-days/by-logical-date") {
    const logicalDate = url.searchParams.get("logical_date");
    if (!logicalDate || !isLogicalDate(logicalDate)) {
      throw new HttpError(400, "malformed_request", "Invalid logical date");
    }
    return Response.json(await loadTaskChuteDayByLogicalDate(env.APP_DB, principal.appUserId, logicalDate));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/projects") {
    return Response.json(await loadProjects(env.APP_DB, principal.appUserId));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/routines") {
    return Response.json(await loadRoutineBoard(env.APP_DB, principal.appUserId));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/routines") {
    const body = await readBoundedJson(request);
    if (!isCreateRoutineRequest(body)) throw new HttpError(400, "malformed_request", "Invalid CreateRoutine request");
    return Response.json(await createRoutine(env.APP_DB, principal.appUserId, body));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/routines/reorder") {
    const body = await readBoundedJson(request);
    if (!isReorderRoutinesRequest(body)) throw new HttpError(400, "malformed_request", "Invalid ReorderRoutines request");
    return Response.json(await reorderRoutines(env.APP_DB, principal.appUserId, body));
  }
  const routineEnabledMatch = url.pathname.match(/^\/api\/v1\/routines\/([^/]+)\/enabled$/);
  if (request.method === "POST" && routineEnabledMatch) {
    const body = await readBoundedJson(request);
    if (routineEnabledMatch[1] !== (body as { routine_definition_id?: unknown })?.routine_definition_id
      || !isSetRoutineEnabledRequest(body)) {
      throw new HttpError(400, "malformed_request", "Invalid SetRoutineEnabled request");
    }
    return Response.json(await setRoutineEnabled(env.APP_DB, principal.appUserId, body));
  }
  const routineUpdateMatch = url.pathname.match(/^\/api\/v1\/routines\/([^/]+)$/);
  if (request.method === "POST" && routineUpdateMatch) {
    const body = await readBoundedJson(request);
    if (routineUpdateMatch[1] !== (body as { routine_definition_id?: unknown })?.routine_definition_id
      || !isUpdateRoutineRequest(body)) {
      throw new HttpError(400, "malformed_request", "Invalid UpdateRoutine request");
    }
    return Response.json(await updateRoutine(env.APP_DB, principal.appUserId, body));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/projects") {
    const body = await readBoundedJson(request);
    if (!isCreateProjectRequest(body)) throw new HttpError(400, "malformed_request", "Invalid CreateProject request");
    return Response.json(await createProject(env.APP_DB, principal.appUserId, body));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/taskchute-days/current/entries") {
    const body = await readBoundedJson(request);
    if (!isAddTaskToDayRequest(body) || body.logical_date !== undefined) {
      throw new HttpError(400, "malformed_request", "Invalid current-Day AddTaskToDay request");
    }
    return Response.json(await addTaskToDay(env.APP_DB, principal.appUserId, body));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/taskchute-days/by-logical-date/entries") {
    const body = await readBoundedJson(request);
    if (!isAddTaskToDayRequest(body) || body.logical_date === undefined) {
      throw new HttpError(400, "malformed_request", "Invalid logical-date AddTaskToDay request");
    }
    return Response.json(await addTaskToDay(env.APP_DB, principal.appUserId, body));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/taskchute-days/current/entries/reorder") {
    const body = await readBoundedJson(request);
    if (!isReorderEntriesRequest(body)) throw new HttpError(400, "malformed_request", "Invalid ReorderEntries request");
    return Response.json(await reorderEntries(env.APP_DB, principal.appUserId, body));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/taskchute-days/current/entries/bulk-delete") {
    const body = await readBoundedJson(request);
    if (!isBulkDeleteEntriesRequest(body)) throw new HttpError(400, "malformed_request", "Invalid BulkDeleteEntries request");
    return Response.json(await bulkDeleteEntries(env.APP_DB, principal.appUserId, body));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/taskchute-days/entries/bulk-move-to-day") {
    const body = await readBoundedJson(request);
    if (!isBulkMoveEntriesToDayRequest(body)) throw new HttpError(400, "malformed_request", "Invalid BulkMoveEntriesToDay request");
    return Response.json(await bulkMoveEntriesToDay(env.APP_DB, principal.appUserId, body));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/taskchute-days/current/entries/bulk-section") {
    const body = await readBoundedJson(request);
    if (!isBulkMoveEntriesToSectionRequest(body)) throw new HttpError(400, "malformed_request", "Invalid BulkMoveEntriesToSection request");
    return Response.json(await bulkMoveEntriesToSection(env.APP_DB, principal.appUserId, body));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/taskchute-days/current/entries/bulk-section-occurrence") {
    const body = await readBoundedJson(request);
    if (!isBulkMoveEntriesToSectionOccurrenceRequest(body)) throw new HttpError(400, "malformed_request", "Invalid BulkMoveEntriesToSectionOccurrence request");
    return Response.json(await bulkMoveEntriesToSectionOccurrence(env.APP_DB, principal.appUserId, body));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/taskchute-days/current/entries/bulk-section-scoped") {
    const body = await readBoundedJson(request);
    if (!isBulkMoveEntriesToSectionScopedRequest(body)) throw new HttpError(400, "malformed_request", "Invalid BulkMoveEntriesToSectionScoped request");
    return Response.json(await bulkMoveEntriesToSectionScoped(env.APP_DB, principal.appUserId, body));
  }
  if (request.method === "POST" && (url.pathname === "/api/v1/taskchute-days/current/entries/bulk-estimate"
    || url.pathname === "/api/v1/taskchute-days/by-logical-date/entries/bulk-estimate")) {
    const body = await readBoundedJson(request);
    if (!isBulkSetEntriesEstimateScopedRequest(body)) throw new HttpError(400, "malformed_request", "Invalid BulkSetEntriesEstimateScoped request");
    return Response.json(await bulkSetEntriesEstimateScoped(env.APP_DB, principal.appUserId, body));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/section-configurations/initial") {
    const body = await readBoundedJson(request);
    if (!isEstablishInitialSectionConfigurationRequest(body)) throw new HttpError(400, "malformed_request", "Invalid initial Section configuration request");
    return Response.json(await establishInitialSectionConfiguration(env.APP_DB, principal.appUserId, body));
  }
  if (request.method === "GET" && url.pathname === "/api/v1/section-configuration") {
    return Response.json(await loadSectionConfiguration(env.APP_DB, principal.appUserId));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/section-configuration") {
    const body = await readBoundedJson(request);
    if (!isUpdateSectionConfigurationRequest(body)) {
      throw new HttpError(400, "malformed_request", "Invalid UpdateSectionConfiguration request");
    }
    return Response.json(await updateSectionConfiguration(env.APP_DB, principal.appUserId, body));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/taskchute-days/current/entries/move") {
    const body = await readBoundedJson(request);
    if (!isMoveEntryRequest(body)) throw new HttpError(400, "malformed_request", "Invalid MoveEntry request");
    return Response.json(await moveEntry(env.APP_DB, principal.appUserId, body));
  }
  const duplicateMatch = url.pathname.match(/^\/api\/v1\/entries\/([^/]+)\/duplicate$/);
  if (request.method === "POST" && duplicateMatch) {
    const body = await readBoundedJson(request);
    if (duplicateMatch[1] !== (body as { source_entry_id?: unknown })?.source_entry_id || !isDuplicateEntryRequest(body)) {
      throw new HttpError(400, "malformed_request", "Invalid DuplicateEntry request");
    }
    return Response.json(await duplicateEntry(env.APP_DB, principal.appUserId, body));
  }
  const estimateMatch = url.pathname.match(/^\/api\/v1\/entries\/([^/]+)\/estimate$/);
  if (request.method === "POST" && estimateMatch) {
    const body = await readBoundedJson(request);
    if (estimateMatch[1] !== (body as { entry_id?: unknown })?.entry_id || !isSetEntryEstimateRequest(body)) {
      throw new HttpError(400, "malformed_request", "Invalid SetEntryEstimate request");
    }
    return Response.json(await setEntryEstimate(env.APP_DB, principal.appUserId, body));
  }
  const plannedStartMatch = url.pathname.match(/^\/api\/v1\/entries\/([^/]+)\/planned-start$/);
  if (request.method === "POST" && plannedStartMatch) {
    const body = await readBoundedJson(request);
    if (plannedStartMatch[1] !== (body as { entry_id?: unknown })?.entry_id || !isSetEntryPlannedStartRequest(body)) {
      throw new HttpError(400, "malformed_request", "Invalid SetEntryPlannedStart request");
    }
    return Response.json(await setEntryPlannedStart(env.APP_DB, principal.appUserId, body));
  }
  const routineConvertMatch = url.pathname.match(/^\/api\/v1\/entries\/([^/]+)\/routine$/);
  if (request.method === "POST" && routineConvertMatch) {
    const body = await readBoundedJson(request);
    if (routineConvertMatch[1] !== (body as { entry_id?: unknown })?.entry_id
      || !isConvertEntryToRoutineRequest(body)) {
      throw new HttpError(400, "malformed_request", "Invalid ConvertEntryToRoutine request");
    }
    return Response.json(await convertEntryToRoutine(env.APP_DB, principal.appUserId, body));
  }
  const routineEndMatch = url.pathname.match(/^\/api\/v1\/routines\/([^/]+)\/end$/);
  if (request.method === "POST" && routineEndMatch) {
    const body = await readBoundedJson(request);
    if (routineEndMatch[1] !== (body as { routine_definition_id?: unknown })?.routine_definition_id
      || !isEndRoutineRequest(body)) {
      throw new HttpError(400, "malformed_request", "Invalid EndRoutine request");
    }
    return Response.json(await endRoutine(env.APP_DB, principal.appUserId, body));
  }
  const routineEstimateMatch = url.pathname.match(/^\/api\/v1\/entries\/([^/]+)\/routine-estimate$/);
  if (request.method === "POST" && routineEstimateMatch) {
    const body = await readBoundedJson(request);
    if (routineEstimateMatch[1] !== (body as { entry_id?: unknown })?.entry_id
      || !isSetRoutineEstimateRequest(body)) {
      throw new HttpError(400, "malformed_request", "Invalid SetRoutineEstimate request");
    }
    return Response.json(await setRoutineEstimate(env.APP_DB, principal.appUserId, body));
  }
  const routineSectionPlanMatch = url.pathname.match(/^\/api\/v1\/entries\/([^/]+)\/routine-section-plan$/);
  if (request.method === "POST" && routineSectionPlanMatch) {
    const body = await readBoundedJson(request);
    if (routineSectionPlanMatch[1] !== (body as { entry_id?: unknown })?.entry_id
      || !isSetRoutineSectionPlanRequest(body)) {
      throw new HttpError(400, "malformed_request", "Invalid SetRoutineSectionPlan request");
    }
    return Response.json(await setRoutineSectionPlan(env.APP_DB, principal.appUserId, body));
  }
  const lifecycleMatch = url.pathname.match(/^\/api\/v1\/entries\/([^/]+)\/(start|complete|revert-start|execution-times)$/);
  if (request.method === "POST" && lifecycleMatch) {
    const body = await readBoundedJson(request);
    if (lifecycleMatch[1] !== (body as { entry_id?: unknown })?.entry_id) {
      throw new HttpError(400, "malformed_request", "Path Entry and request Entry must match");
    }
    if (lifecycleMatch[2] === "start") {
      if (!isStartEntryRequest(body)) throw new HttpError(400, "malformed_request", "Invalid StartEntry request");
      return Response.json(await startEntry(env.APP_DB, principal.appUserId, body));
    }
    if (lifecycleMatch[2] === "complete") {
      if (!isCompleteEntryRequest(body)) throw new HttpError(400, "malformed_request", "Invalid CompleteEntry request");
      return Response.json(await completeEntry(env.APP_DB, principal.appUserId, body));
    }
    if (lifecycleMatch[2] === "revert-start") {
      if (!isRevertEntryStartRequest(body)) throw new HttpError(400, "malformed_request", "Invalid RevertEntryStart request");
      return Response.json(await revertEntryStart(env.APP_DB, principal.appUserId, body));
    }
    if (!isSetExecutionTimesRequest(body)) throw new HttpError(400, "malformed_request", "Invalid SetExecutionTimes request");
    return Response.json(await setExecutionTimes(env.APP_DB, principal.appUserId, body));
  }
  return Response.json({ error: { code: "resource_not_found", message: "Not found", reconcile: false } }, { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return withSecurityHeaders(await route(request, env));
    } catch (error) {
      if (error instanceof HttpError) {
        const body: ApiErrorBody = {
          error: { code: error.code, message: error.message, reconcile: error.reconcile },
        };
        return withSecurityHeaders(Response.json(body, { status: error.status }));
      }
      console.error(
        JSON.stringify({
          message: "unhandled request failure",
          method: request.method,
          path: new URL(request.url).pathname,
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
      const body: ApiErrorBody = {
        error: {
          code: "infrastructure_ambiguous",
          message: "The server could not determine a safe outcome; reload canonical state before retrying",
          reconcile: true,
        },
      };
      return withSecurityHeaders(Response.json(body, { status: 503 }));
    }
  },
} satisfies ExportedHandler<Env>;
