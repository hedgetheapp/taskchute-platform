import type {
  AddTaskToDayRequest,
  DuplicateEntryRequest,
  DuplicateEntryResult,
  BulkDeleteEntriesRequest,
  BulkDeleteEntriesResult,
  DeleteCompletedEntryRequest,
  DeleteCompletedEntryResult,
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
  ProjectBoardProjection,
  UpdateProjectRequest,
  UpdateProjectResult,
  SetProjectArchivedRequest,
  SetProjectArchivedResult,
  ReorderProjectsRequest,
  ReorderProjectsResult,
  DeleteProjectRequest,
  DeleteProjectResult,
  CurrentTaskChuteDayProjection,
  CompleteEntryRequest,
  CompleteEntryResult,
  InterruptEntryRequest,
  InterruptEntryResult,
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
  SetRoutineModeRequest,
  SetRoutineModeResult,
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
  ModeBoardProjection,
  CreateModeRequest,
  CreateModeResult,
  UpdateModeRequest,
  UpdateModeResult,
  ReorderModesRequest,
  ReorderModesResult,
  SetModeArchivedRequest,
  SetModeArchivedResult,
  DeleteModeRequest,
  DeleteModeResult,
  SetEntryModeRequest,
  SetEntryModeResult,
  AutoCarryOverduePlannedSettingProjection,
  SetAutoCarryOverduePlannedRequest,
  SetAutoCarryOverduePlannedResult,
  EffectiveDayCalendarProjection,
  UpsertEffectiveDayOverrideRequest,
  UpsertEffectiveDayOverrideResult,
  DeleteEffectiveDayOverrideRequest,
  DeleteEffectiveDayOverrideResult,
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
  loadProjectBoard(): Promise<ProjectBoardProjection> {
    return requestJson("/api/v1/project-board");
  },
  loadModeBoard(): Promise<ModeBoardProjection> {
    return requestJson("/api/v1/mode-board");
  },
  createMode(body: CreateModeRequest): Promise<CreateModeResult> {
    return requestJson("/api/v1/modes", jsonPost("", body));
  },
  updateMode(body: UpdateModeRequest): Promise<UpdateModeResult> {
    return requestJson(`/api/v1/modes/${body.mode_id}`, jsonPost("", body));
  },
  reorderModes(body: ReorderModesRequest): Promise<ReorderModesResult> {
    return requestJson("/api/v1/modes/reorder", jsonPost("", body));
  },
  setModeArchived(body: SetModeArchivedRequest): Promise<SetModeArchivedResult> {
    return requestJson(`/api/v1/modes/${body.mode_id}/archive`, jsonPost("", body));
  },
  deleteMode(body: DeleteModeRequest): Promise<DeleteModeResult> {
    return requestJson(`/api/v1/modes/${body.mode_id}/delete`, jsonPost("", body));
  },
  setEntryMode(body: SetEntryModeRequest): Promise<SetEntryModeResult> {
    return requestJson(`/api/v1/entries/${body.entry_id}/mode`, jsonPost("", body));
  },
  createProject(body: CreateProjectRequest): Promise<CreateProjectResult> {
    return requestJson("/api/v1/projects", jsonPost("", body));
  },
  updateProject(body: UpdateProjectRequest): Promise<UpdateProjectResult> {
    return requestJson(`/api/v1/projects/${body.project_id}`, jsonPost("", body));
  },
  setProjectArchived(body: SetProjectArchivedRequest): Promise<SetProjectArchivedResult> {
    return requestJson(`/api/v1/projects/${body.project_id}/archive`, jsonPost("", body));
  },
  reorderProjects(body: ReorderProjectsRequest): Promise<ReorderProjectsResult> {
    return requestJson("/api/v1/projects/reorder", jsonPost("", body));
  },
  deleteProject(body: DeleteProjectRequest): Promise<DeleteProjectResult> {
    return requestJson(`/api/v1/projects/${body.project_id}/delete`, jsonPost("", body));
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
  deleteCompletedEntry(body: DeleteCompletedEntryRequest): Promise<DeleteCompletedEntryResult> {
    return requestJson(`/api/v1/entries/${body.entry_id}/delete-completed`, jsonPost("", body));
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
  interruptEntry(body: InterruptEntryRequest): Promise<InterruptEntryResult> {
    return requestJson(`/api/v1/entries/${body.source_entry_id}/interrupt`, jsonPost("", body));
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
  loadAutoCarryOverduePlannedSetting(): Promise<AutoCarryOverduePlannedSettingProjection> {
    return requestJson("/api/v1/settings/auto-carry-overdue-planned");
  },
  setAutoCarryOverduePlanned(body: SetAutoCarryOverduePlannedRequest): Promise<SetAutoCarryOverduePlannedResult> {
    return requestJson("/api/v1/settings/auto-carry-overdue-planned", jsonPost("", body));
  },
  loadEffectiveDayCalendar(logicalDate: string): Promise<EffectiveDayCalendarProjection> {
    return requestJson(`/api/v1/settings/effective-day-calendar?logical_date=${encodeURIComponent(logicalDate)}`);
  },
  upsertEffectiveDayOverride(body: UpsertEffectiveDayOverrideRequest): Promise<UpsertEffectiveDayOverrideResult> {
    return requestJson("/api/v1/settings/effective-day-overrides", jsonPost("", body));
  },
  deleteEffectiveDayOverride(body: DeleteEffectiveDayOverrideRequest): Promise<DeleteEffectiveDayOverrideResult> {
    return requestJson(`/api/v1/settings/effective-day-overrides/${encodeURIComponent(body.logical_date)}/delete`, jsonPost("", body));
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
  setRoutineMode(body: SetRoutineModeRequest): Promise<SetRoutineModeResult> {
    return requestJson(`/api/v1/entries/${body.entry_id}/routine-mode`, jsonPost("", body));
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
