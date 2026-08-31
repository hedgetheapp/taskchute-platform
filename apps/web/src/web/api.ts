import type {
  AddTaskToDayRequest,
  ApiErrorCode,
  ApiErrorBody,
  CreateProjectRequest,
  CreateProjectResult,
  ProjectListProjection,
  CurrentTaskChuteDayProjection,
  CompleteEntryRequest,
  CompleteEntryResult,
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
  reorderEntries(body: ReorderEntriesRequest): Promise<ReorderEntriesResult> {
    return requestJson("/api/v1/taskchute-days/current/entries/reorder", jsonPost("", body));
  },
  startEntry(body: StartEntryRequest): Promise<StartEntryResult> {
    return requestJson(`/api/v1/entries/${body.entry_id}/start`, jsonPost("", body));
  },
  completeEntry(body: CompleteEntryRequest): Promise<CompleteEntryResult> {
    return requestJson(`/api/v1/entries/${body.entry_id}/complete`, jsonPost("", body));
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
};
