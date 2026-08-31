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

export interface ProjectListProjection {
  projects: ProjectSummary[];
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
  routine: RoutineEntryProjection | null;
}

export interface RoutineEntryProjection {
  routine_definition_id: string;
  routine_occurrence_id: string;
  end_logical_date: string | null;
  can_end: boolean;
  default_section_id: string | null;
  default_planned_start_minute: number | null;
  section_plan_override_present: boolean;
  default_estimate_seconds: number | null;
  estimate_override_present: boolean;
  defaults_revision: number;
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

interface TaskChuteDayProjectionBase {
  is_current: boolean;
  planning_enabled: boolean;
  placement_revision: number;
  section_configuration_required: boolean;
  sections: SectionProjection[];
  unsectioned_entries: EntryProjection[];
  active_execution: ExecutionProjection | null;
  next_entry: EntryProjection | null;
}

export interface EstablishedTaskChuteDayProjection extends TaskChuteDayProjectionBase {
  establishment_state: "established";
  taskchute_day: {
    id: string;
    logical_date: string;
    start_instant: string;
    end_instant: string;
    establishment_timezone: string;
    establishment_boundary_minutes: number;
  };
}

export interface VirtualTaskChuteDayProjection extends TaskChuteDayProjectionBase {
  establishment_state: "future_preview" | "past_record_none";
  taskchute_day: {
    id: null;
    logical_date: string;
    start_instant: string | null;
    end_instant: string | null;
    establishment_timezone: string | null;
    establishment_boundary_minutes: number | null;
  };
}

export type CurrentTaskChuteDayProjection = EstablishedTaskChuteDayProjection | VirtualTaskChuteDayProjection;

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
  logical_date?: string;
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

export interface SectionConfigurationItemProjection {
  section_id: string;
  title: string;
  logical_start_minute: number;
  logical_end_minute: number;
}

export interface SectionConfigurationProjection {
  configuration_version_id: string;
  day_boundary_minutes: number;
  items: SectionConfigurationItemProjection[];
}

export interface UpdateSectionConfigurationRequest {
  operation_id: string;
  configuration_version_id: string;
  expected_configuration_version_id: string;
  items: SectionConfigurationItemProjection[];
}

export interface UpdateSectionConfigurationResult {
  configuration_version_id: string;
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

interface RoutineEntryMutationBase {
  operation_id: string;
  entry_id: string;
  taskchute_day_id: string;
}

export type SetRoutineEstimateRequest = RoutineEntryMutationBase & (
  | { action: "occurrence"; estimate_seconds: number | null }
  | { action: "definition"; estimate_seconds: number | null; expected_defaults_revision: number }
  | { action: "reset" }
);

export interface SetRoutineEstimateResult {
  entry_id: string;
  estimate_seconds: number | null;
  estimate_override_present: boolean;
  defaults_revision: number;
}

export type SetRoutineSectionPlanRequest = RoutineEntryMutationBase & { expected_placement_revision: number } & (
  | { action: "occurrence"; section_id: string | null; planned_start_minute: number | null }
  | { action: "definition"; section_id: string | null; planned_start_minute: number | null; expected_defaults_revision: number }
  | { action: "reset" }
);

export interface SetRoutineSectionPlanResult {
  entry_id: string;
  section_id: string | null;
  planned_start_minute: number | null;
  position: number;
  placement_revision: number;
  section_plan_override_present: boolean;
  defaults_revision: number;
}

export interface ConvertEntryToRoutineRequest {
  operation_id: string;
  routine_definition_id: string;
  routine_occurrence_id: string;
  entry_id: string;
  taskchute_day_id: string;
  end_logical_date: string | null;
}

export interface ConvertEntryToRoutineResult {
  routine_definition_id: string;
  routine_occurrence_id: string;
  entry_id: string;
  task_id: string;
  taskchute_day_id: string;
  end_logical_date: string | null;
}

export interface EndRoutineRequest {
  operation_id: string;
  routine_definition_id: string;
  taskchute_day_id: string;
}

export interface EndRoutineResult {
  routine_definition_id: string;
  end_logical_date: string;
}
