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
  section_id: string | null;
  position: number;
  lifecycle_state: "planned" | "running" | "completed";
  estimate_seconds: number | null;
  planned_start_minute: number | null;
}

export interface SectionProjection {
  id: string;
  title: string;
  logical_start_minute: number | null;
  logical_end_minute: number | null;
  actual_start_instant: string | null;
  actual_end_instant: string | null;
  estimate_total_seconds: number;
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
  section_configuration_required: boolean;
  sections: SectionProjection[];
  unsectioned_entries: EntryProjection[];
  active_execution: ExecutionProjection | null;
  next_entry: EntryProjection | null;
}

export interface ExecutionProjection {
  id: string;
  entry_id: string;
  started_at: string;
  ended_at: string | null;
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
  section_id: string | null;
  expected_placement_revision: number;
}

export interface AddTaskToDayResult {
  task_id: string;
  entry_id: string;
  taskchute_day_id: string;
  section_id: string | null;
  position: number;
  placement_revision: number;
}

export interface ReorderEntriesRequest {
  operation_id: string;
  taskchute_day_id: string;
  section_id: string | null;
  entry_ids: string[];
  expected_placement_revision: number;
}

export interface ReorderEntriesResult {
  taskchute_day_id: string;
  section_id: string | null;
  entry_ids: string[];
  placement_revision: number;
}

export interface StartEntryRequest {
  operation_id: string;
  entry_id: string;
  execution_id: string;
  expected_placement_revision?: number;
}

export interface StartEntryResult {
  entry_id: string;
  lifecycle_state: "running";
  execution: ExecutionProjection;
  section_id?: string;
  placement_revision?: number | null;
}

export interface CompleteEntryRequest {
  operation_id: string;
  entry_id: string;
  execution_id: string;
}

export interface CompleteEntryResult {
  entry_id: string;
  lifecycle_state: "completed";
  execution: ExecutionProjection;
}

export interface SectionConfigurationItemInput {
  section_id: string;
  logical_start_minute: number;
  logical_end_minute: number;
}

export interface EstablishInitialSectionConfigurationRequest {
  operation_id: string;
  configuration_version_id: string;
  taskchute_day_id: string;
  items: SectionConfigurationItemInput[];
}

export interface EstablishInitialSectionConfigurationResult {
  configuration_version_id: string;
  taskchute_day_id: string;
}

export interface MoveEntryRequest {
  operation_id: string;
  entry_id: string;
  taskchute_day_id: string;
  section_id: string | null;
  expected_placement_revision: number;
}

export interface MoveEntryResult {
  entry_id: string;
  section_id: string | null;
  position: number;
  placement_revision: number;
}

export interface SetEntryEstimateRequest {
  operation_id: string;
  entry_id: string;
  estimate_seconds: number | null;
}

export interface SetEntryEstimateResult {
  entry_id: string;
  estimate_seconds: number | null;
}

export interface SetEntryPlannedStartRequest {
  operation_id: string;
  entry_id: string;
  taskchute_day_id: string;
  planned_start_minute: number | null;
  expected_placement_revision: number;
}

export interface SetEntryPlannedStartResult {
  entry_id: string;
  section_id: string | null;
  planned_start_minute: number | null;
  position: number;
  placement_revision: number;
}
