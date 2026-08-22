import type {
  AddTaskToDayRequest,
  ApiErrorCode,
  ApiErrorBody,
  CreateProjectRequest,
  CreateProjectResult,
  CurrentTaskChuteDayProjection,
  CompleteEntryRequest,
  CompleteEntryResult,
  ReorderEntriesRequest,
  ReorderEntriesResult,
  StartEntryRequest,
  StartEntryResult,
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
  loadDay(): Promise<CurrentTaskChuteDayProjection> {
    return requestJson("/api/v1/taskchute-days/current");
  },
  createProject(body: CreateProjectRequest): Promise<CreateProjectResult> {
    return requestJson("/api/v1/projects", jsonPost("", body));
  },
  addTask(body: AddTaskToDayRequest): Promise<unknown> {
    return requestJson("/api/v1/taskchute-days/current/entries", jsonPost("", body));
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
};
