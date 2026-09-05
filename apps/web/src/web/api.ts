import type {
  AddTaskToDayRequest,
  DuplicateEntryRequest,
  DuplicateEntryResult,
  BulkDeleteEntriesRequest,
  BulkDeleteEntriesResult,
  BulkMoveEntriesToDayRequest,
  BulkMoveEntriesToDayResult,
  BulkMoveEntriesToSectionRequest,
  BulkMoveEntriesToSectionResult,
  BulkMoveEntriesToSectionOccurrenceRequest,
  BulkMoveEntriesToSectionOccurrenceResult,
  BulkMoveEntriesToSectionScopedRequest,
  BulkMoveEntriesToSectionScopedResult,
  BulkSetEntriesEstimateScopedRequest,
  BulkSetEntriesEstimateScopedResult,
  ApiErrorCode,
  ApiErrorBody,
  CreateProjectRequest,
  CreateProjectResult,
  ProjectListProjection,
  CurrentTaskChuteDayProjection,
  CompleteEntryRequest,
  CompleteEntryResult,
  SetExecutionTimesRequest,
  SetExecutionTimesResult,
  UpdateTaskMetadataRequest,
  UpdateTaskMetadataResult,
  EstablishInitialSectionConfigurationRequest,
  EstablishInitialSectionConfigurationResult,
  SectionConfigurationProjection,
  UpdateSectionConfigurationRequest,
  UpdateSectionConfigurationResult,
  MoveEntryRequest,
  MoveEntryResult,
  ReorderEntriesRequest,
  ReorderEntriesResult,
  StartEntryRequest,
  StartEntryResult,
  SetEntryEstimateRequest,
  SetEntryEstimateResult,
  SetEntryPlannedStartRequest,
  SetEntryPlannedStartResult,
  ConvertEntryToRoutineRequest,
  ConvertEntryToRoutineResult,
  EndRoutineRequest,
  EndRoutineResult,
  SetRoutineEstimateRequest,
  SetRoutineEstimateResult,
  SetRoutineSectionPlanRequest,
  SetRoutineSectionPlanResult,
  RoutineBoardProjection,
  CreateRoutineRequest,
  CreateRoutineResult,
  SetRoutineEnabledRequest,
  SetRoutineEnabledResult,
  UpdateRoutineRequest,
  UpdateRoutineResult,
  ReorderRoutinesRequest,
  ReorderRoutinesResult,
  DeleteRoutineRequest,
  DeleteRoutineResult,
} from "../shared/contracts";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reconcile: boolean,
    readonly code: ApiErrorCode,
  ) {
    super(message);
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...init });
  const value = (await response.json()) as T | ApiErrorBody;
  if (!response.ok) {
    const error = value as ApiErrorBody;
    throw new ApiClientError(
      error.error?.message ?? "Request failed",
      response.status,
      error.error?.reconcile ?? true,
      error.error?.code ?? "infrastructure_ambiguous",
    );
  }
  return value as T;
}

function jsonPost(path: string, body: object): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export const api = {
  login(email: string, password: string): Promise<unknown> {
    return requestJson("/api/auth/sign-in/email", jsonPost("", { email, password }));
  },
  logout(): Promise<unknown> {
    return requestJson("/api/auth/sign-out", jsonPost("", {}));
  },
  loadDay(logicalDate?: string): Promise<CurrentTaskChuteDayProjection> {
    return requestJson(logicalDate
      ? `/api/v1/taskchute-days/by-logical-date?logical_date=${encodeURIComponent(logicalDate)}`
      : "/api/v1/taskchute-days/current");
  },
  loadProjects(): Promise<ProjectListProjection> {
    return requestJson("/api/v1/projects");
  },
  createProject(body: CreateProjectRequest): Promise<CreateProjectResult> {
    return requestJson("/api/v1/projects", jsonPost("", body));
  },
  addTask(body: AddTaskToDayRequest): Promise<unknown> {
    return requestJson(body.logical_date
      ? "/api/v1/taskchute-days/by-logical-date/entries"
      : "/api/v1/taskchute-days/current/entries", jsonPost("", body));
  },
  duplicateEntry(body: DuplicateEntryRequest): Promise<DuplicateEntryResult> {
    return requestJson(`/api/v1/entries/${body.source_entry_id}/duplicate`, jsonPost("", body));
  },
  bulkDeleteEntries(body: BulkDeleteEntriesRequest): Promise<BulkDeleteEntriesResult> {
    return requestJson("/api/v1/taskchute-days/current/entries/bulk-delete", jsonPost("", body));
  },
  bulkMoveEntriesToDay(body: BulkMoveEntriesToDayRequest): Promise<BulkMoveEntriesToDayResult> {
    return requestJson("/api/v1/taskchute-days/entries/bulk-move-to-day", jsonPost("", body));
  },
  bulkMoveEntriesToSection(body: BulkMoveEntriesToSectionRequest): Promise<BulkMoveEntriesToSectionResult> {
    return requestJson("/api/v1/taskchute-days/current/entries/bulk-section", jsonPost("", body));
  },
  bulkMoveEntriesToSectionOccurrence(body: BulkMoveEntriesToSectionOccurrenceRequest): Promise<BulkMoveEntriesToSectionOccurrenceResult> {
    return requestJson("/api/v1/taskchute-days/current/entries/bulk-section-occurrence", jsonPost("", body));
  },
  bulkMoveEntriesToSectionScoped(body: BulkMoveEntriesToSectionScopedRequest): Promise<BulkMoveEntriesToSectionScopedResult> {
    return requestJson("/api/v1/taskchute-days/current/entries/bulk-section-scoped", jsonPost("", body));
  },
  bulkSetEntriesEstimateScoped(body: BulkSetEntriesEstimateScopedRequest, logicalDate?: string): Promise<BulkSetEntriesEstimateScopedResult> {
    const path = logicalDate
      ? `/api/v1/taskchute-days/by-logical-date/entries/bulk-estimate?logical_date=${encodeURIComponent(logicalDate)}`
      : "/api/v1/taskchute-days/current/entries/bulk-estimate";
    return requestJson(path, jsonPost("", body));
  },
  reorderEntries(body: ReorderEntriesRequest): Promise<ReorderEntriesResult> {
    return requestJson("/api/v1/taskchute-days/current/entries/reorder", jsonPost("", body));
  },
  startEntry(body: StartEntryRequest): Promise<StartEntryResult> {
    return requestJson(`/api/v1/entries/${body.entry_id}/start`, jsonPost("", body));
  },
  completeEntry(body: CompleteEntryRequest): Promise<CompleteEntryResult> {
    return requestJson(`/api/v1/entries/${body.entry_id}/complete`, jsonPost("", body));
  },
  setExecutionTimes(body: SetExecutionTimesRequest): Promise<SetExecutionTimesResult> {
    return requestJson(`/api/v1/entries/${body.entry_id}/execution-times`, jsonPost("", body));
  },
  updateTaskMetadata(body: UpdateTaskMetadataRequest): Promise<UpdateTaskMetadataResult> {
    return requestJson(`/api/v1/entries/${body.entry_id}/task-metadata`, jsonPost("", body));
  },
  establishInitialSectionConfiguration(body: EstablishInitialSectionConfigurationRequest): Promise<EstablishInitialSectionConfigurationResult> {
    return requestJson("/api/v1/section-configurations/initial", jsonPost("", body));
  },
  loadSectionConfiguration(): Promise<SectionConfigurationProjection> {
    return requestJson("/api/v1/section-configuration");
  },
  updateSectionConfiguration(body: UpdateSectionConfigurationRequest): Promise<UpdateSectionConfigurationResult> {
    return requestJson("/api/v1/section-configuration", jsonPost("", body));
  },
  moveEntry(body: MoveEntryRequest): Promise<MoveEntryResult> {
    return requestJson("/api/v1/taskchute-days/current/entries/move", jsonPost("", body));
  },
  setEntryEstimate(body: SetEntryEstimateRequest): Promise<SetEntryEstimateResult> {
    return requestJson(`/api/v1/entries/${body.entry_id}/estimate`, jsonPost("", body));
  },
  setEntryPlannedStart(body: SetEntryPlannedStartRequest): Promise<SetEntryPlannedStartResult> {
    return requestJson(`/api/v1/entries/${body.entry_id}/planned-start`, jsonPost("", body));
  },
  convertEntryToRoutine(body: ConvertEntryToRoutineRequest): Promise<ConvertEntryToRoutineResult> {
    return requestJson(`/api/v1/entries/${body.entry_id}/routine`, jsonPost("", body));
  },
  endRoutine(body: EndRoutineRequest): Promise<EndRoutineResult> {
    return requestJson(`/api/v1/routines/${body.routine_definition_id}/end`, jsonPost("", body));
  },
  setRoutineEstimate(body: SetRoutineEstimateRequest): Promise<SetRoutineEstimateResult> {
    return requestJson(`/api/v1/entries/${body.entry_id}/routine-estimate`, jsonPost("", body));
  },
  setRoutineSectionPlan(body: SetRoutineSectionPlanRequest): Promise<SetRoutineSectionPlanResult> {
    return requestJson(`/api/v1/entries/${body.entry_id}/routine-section-plan`, jsonPost("", body));
  },
  loadRoutines(): Promise<RoutineBoardProjection> {
    return requestJson("/api/v1/routines");
  },
  createRoutine(body: CreateRoutineRequest): Promise<CreateRoutineResult> {
    return requestJson("/api/v1/routines", jsonPost("", body));
  },
  setRoutineEnabled(body: SetRoutineEnabledRequest): Promise<SetRoutineEnabledResult> {
    return requestJson(`/api/v1/routines/${body.routine_definition_id}/enabled`, jsonPost("", body));
  },
  updateRoutine(body: UpdateRoutineRequest): Promise<UpdateRoutineResult> {
    return requestJson(`/api/v1/routines/${body.routine_definition_id}`, jsonPost("", body));
  },
  reorderRoutines(body: ReorderRoutinesRequest): Promise<ReorderRoutinesResult> {
    return requestJson("/api/v1/routines/reorder", jsonPost("", body));
  },
  deleteRoutine(body: DeleteRoutineRequest): Promise<DeleteRoutineResult> {
    return requestJson(`/api/v1/routines/${body.routine_definition_id}/delete`, jsonPost("", body));
  },
};
