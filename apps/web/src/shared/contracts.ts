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

export interface ExecutionSummaryProjection {
  first_started_at: string | null;
  last_ended_at: string | null;
  completed_duration_seconds: number;
  active_started_at: string | null;
  /** Present when the Entry has exactly one editable Execution. */
  single_execution_id?: string | null;
  /** The current active Execution id, when one exists. */
  active_execution_id?: string | null;
  /** Existing Execution facts for explicit correction selection; never inferred by the client. */
  executions?: ExecutionProjection[];
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
  /** Read-only projection of current-valid Execution facts; absent is tolerated by older clients/fixtures. */
  execution_summary?: ExecutionSummaryProjection;
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
  projection_generated_at: string;
  is_current: boolean;
  planning_enabled: boolean;
  placement_revision: number;
  section_configuration_required: boolean;
  sections: SectionProjection[];
  unsectioned_entries: EntryProjection[];
  active_execution: ActiveExecutionProjection | null;
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

export interface ActiveExecutionProjection extends ExecutionProjection {
  entry_estimate_seconds: number | null;
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

export interface DuplicateEntryRequest {
  operation_id: string;
  source_entry_id: string;
  new_task_id: string;
  new_entry_id: string;
  taskchute_day_id: string;
  expected_placement_revision: number;
}

export interface DuplicateEntryResult {
  task_id: string;
  entry_id: string;
  taskchute_day_id: string;
  section_id: string | null;
  position: number;
  placement_revision: number;
}

export interface BulkDeleteEntriesRequest {
  operation_id: string;
  taskchute_day_id: string;
  entry_ids: string[];
  expected_placement_revision: number;
}

export interface BulkDeleteEntriesResult {
  taskchute_day_id: string;
  deleted_entry_ids: string[];
  skipped_routine_entry_ids: string[];
  placement_revision: number;
}

export interface BulkMoveEntriesToDayRequest {
  operation_id: string;
  source_taskchute_day_id: string;
  entry_ids: string[];
  target_logical_date: string;
  expected_source_placement_revision: number;
  allow_section_fallback: boolean;
}

export interface BulkMoveEntriesToDayResult {
  source_taskchute_day_id: string;
  target_taskchute_day_id: string;
  target_logical_date: string;
  moved_entry_ids: string[];
  fallback_entry_ids: string[];
  source_placement_revision: number;
  target_placement_revision: number;
}

export interface BulkMoveEntriesToSectionRequest {
  operation_id: string;
  taskchute_day_id: string;
  entry_ids: string[];
  section_id: string | null;
  expected_placement_revision: number;
}

export interface BulkMoveEntriesToSectionResult {
  taskchute_day_id: string;
  entry_ids: string[];
  changed_entry_ids: string[];
  section_id: string | null;
  planned_start_minute: number | null;
  placement_revision: number;
}

export interface BulkMoveEntriesToSectionOccurrenceRequest {
  operation_id: string;
  taskchute_day_id: string;
  entry_ids: string[];
  section_id: string | null;
  expected_placement_revision: number;
}

export interface BulkMoveEntriesToSectionOccurrenceResult {
  taskchute_day_id: string;
  entry_ids: string[];
  changed_entry_ids: string[];
  routine_override_changed_entry_ids: string[];
  section_id: string | null;
  planned_start_minute: number | null;
  placement_revision: number;
}

export type BulkRoutineSectionScopeInput =
  | { entry_id: string; scope: "occurrence" }
  | { entry_id: string; scope: "definition"; expected_defaults_revision: number };

export interface BulkMoveEntriesToSectionScopedRequest {
  operation_id: string;
  taskchute_day_id: string;
  entry_ids: string[];
  section_id: string | null;
  routine_scopes: BulkRoutineSectionScopeInput[];
  expected_placement_revision: number;
}

export interface BulkMoveEntriesToSectionScopedResult {
  taskchute_day_id: string;
  entry_ids: string[];
  changed_entry_ids: string[];
  propagated_entry_ids: string[];
  routine_override_changed_entry_ids: string[];
  definition_changed_routine_definition_ids: string[];
  affected_day_revisions: Array<{ taskchute_day_id: string; placement_revision: number }>;
  defaults_revisions: Array<{ routine_definition_id: string; defaults_revision: number }>;
  section_id: string | null;
  planned_start_minute: number | null;
  placement_revision: number;
}

export type BulkEstimateScopeInput =
  | { entry_id: string; scope: "occurrence" }
  | { entry_id: string; scope: "definition"; expected_defaults_revision: number };

export interface BulkSetEntriesEstimateScopedRequest {
  operation_id: string;
  taskchute_day_id: string;
  entry_ids: string[];
  estimate_seconds: number | null;
  routine_scopes: BulkEstimateScopeInput[];
}

export interface BulkSetEntriesEstimateScopedResult {
  taskchute_day_id: string;
  entry_ids: string[];
  estimate_seconds: number | null;
  changed_entry_ids: string[];
  propagated_entry_ids: string[];
  routine_override_changed_entry_ids: string[];
  definition_changed_routine_definition_ids: string[];
  defaults_revisions: Array<{ routine_definition_id: string; defaults_revision: number }>;
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

export interface RevertEntryStartRequest {
  operation_id: string;
  entry_id: string;
  execution_id: string;
  expected_started_at: string;
}

export interface RevertEntryStartResult {
  entry_id: string;
  lifecycle_state: "planned";
  execution_id: string;
  section_id: string | null;
  planned_start_minute: number | null;
  position: number;
  placement_revision: number;
}

export type ExecutionCorrectionLifecycleState = "planned" | "running" | "completed";

export interface SetExecutionTimesRequest {
  operation_id: string;
  entry_id: string;
  execution_id: string;
  expected_lifecycle_state: ExecutionCorrectionLifecycleState;
  started_at: string;
  ended_at: string | null;
  expected_started_at: string | null;
  expected_ended_at: string | null;
  expected_placement_revision?: number;
}

export interface SetExecutionTimesResult {
  entry_id: string;
  lifecycle_state: "running" | "completed";
  execution: ExecutionProjection;
  section_id: string | null;
  planned_start_minute: number | null;
  position: number;
  placement_revision: number;
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

export type RoutineScheduleInput =
  | { kind: "daily" }
  | { kind: "every_n_days"; interval_days: number }
  | { kind: "weekly"; weekdays: number[] };

export interface RoutineBoardItemProjection {
  routine_definition_id: string;
  task_id: string;
  title: string;
  project: ProjectSummary | null;
  enabled: boolean;
  schedule: RoutineScheduleInput;
  default_section_id: string | null;
  default_planned_start_minute: number | null;
  default_estimate_seconds: number | null;
  start_logical_date: string;
  end_logical_date: string | null;
  board_position: number;
  settings_revision: number;
}

export interface RoutineBoardProjection {
  board_revision: number;
  current_logical_date: string;
  sections: Array<{ id: string; title: string; logical_start_minute: number; logical_end_minute: number }>;
  routines: RoutineBoardItemProjection[];
}

export interface CreateRoutineRequest {
  operation_id: string;
  task_id: string;
  routine_definition_id: string;
  title: string;
  expected_board_revision: number;
}

export interface CreateRoutineResult {
  routine_definition_id: string;
  task_id: string;
  board_position: number;
  board_revision: number;
  settings_revision: number;
}

export interface SetRoutineEnabledRequest {
  operation_id: string;
  routine_definition_id: string;
  enabled: boolean;
  expected_settings_revision: number;
}

export interface SetRoutineEnabledResult {
  routine_definition_id: string;
  enabled: boolean;
  settings_revision: number;
}

export interface UpdateRoutineRequest {
  operation_id: string;
  routine_definition_id: string;
  expected_settings_revision: number;
  title: string;
  project_id: string | null;
  schedule: RoutineScheduleInput;
  default_section_id: string | null;
  default_planned_start_minute: number | null;
  default_estimate_seconds: number | null;
  start_logical_date: string;
  end_logical_date: string | null;
}

export interface UpdateRoutineResult {
  routine_definition_id: string;
  settings_revision: number;
}

export interface ReorderRoutinesRequest {
  operation_id: string;
  routine_definition_ids: string[];
  expected_board_revision: number;
}

export interface ReorderRoutinesResult {
  routine_definition_ids: string[];
  board_revision: number;
}
