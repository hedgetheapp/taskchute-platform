export type ApiErrorCode =
  | "malformed_request"
  | "unauthenticated"
  | "forbidden"
  | "resource_not_found"
  | "resource_conflict"
  | "revision_conflict"
  | "operation_id_misuse"
  | "operation_persistence_incompatible"
  | "infrastructure_ambiguous";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    reconcile: boolean;
  };
}

export interface ProjectSummary {
  id: string;
  title: string;
}

export interface TaskSummary {
  id: string;
  title: string;
  project: ProjectSummary | null;
}

export interface EntryProjection {
  id: string;
  task: TaskSummary;
  section_id: string;
  position: number;
  lifecycle_state: "planned" | "running" | "completed";
}

export interface SectionProjection {
  id: string;
  title: string;
  sort_order: number;
  entries: EntryProjection[];
}

export interface CurrentTaskChuteDayProjection {
  taskchute_day: {
    id: string;
    logical_date: string;
    start_instant: string;
    end_instant: string;
    establishment_timezone: string;
    establishment_boundary_minutes: number;
  };
  placement_revision: number;
  sections: SectionProjection[];
  active_execution: null;
  next_entry: EntryProjection | null;
}

export interface CreateProjectRequest {
  operation_id: string;
  project_id: string;
  title: string;
}

export interface CreateProjectResult {
  project: ProjectSummary;
}

export interface AddTaskToDayRequest {
  operation_id: string;
  task_id: string;
  entry_id: string;
  project_id: string | null;
  title: string;
  taskchute_day_id: string;
  section_id: string;
  expected_placement_revision: number;
}

export interface AddTaskToDayResult {
  task_id: string;
  entry_id: string;
  taskchute_day_id: string;
  section_id: string;
  position: number;
  placement_revision: number;
}
