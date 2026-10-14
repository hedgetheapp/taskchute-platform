import { isLogicalDate } from "../domain/taskchute-day";
import { Temporal as PolyfillTemporal } from "@js-temporal/polyfill";

export type ReviewDateMetricGranularity = "daily" | "monthly" | "yearly";

export interface ReviewDateMetricRange {
  granularity: ReviewDateMetricGranularity;
  anchor: string;
  startLogicalDate: string;
  endLogicalDateExclusive: string | null;
}

export interface ReviewDateMetrics {
  period_granularity: ReviewDateMetricGranularity;
  period_anchor: string;
  established_day_count: number;
  completed_count: number;
  unexecuted_count: number;
  completed_actual_duration_seconds: number;
  routine_activity: ReviewRoutineActivity;
}

export type RoutineActivityCoverageStatus = "UNMEASURED" | "PARTIAL" | "COMPLETE";

export interface ReviewRoutineActivity {
  coverage_status: RoutineActivityCoverageStatus;
  created_count: number | null;
  deleted_count: number | null;
  coverage_started_at: string | null;
  coverage_started_logical_date: string | null;
}

interface ReviewDateMetricsRow {
  established_day_count: number;
  completed_count: number;
  unexecuted_count: number;
  completed_actual_duration_seconds: number;
}

/** A month/year anchor is the first logical date in the selected calendar period. */
export function reviewDateMetricRange(period: unknown, anchor: unknown): ReviewDateMetricRange | null {
  if ((period !== "daily" && period !== "monthly" && period !== "yearly")
    || typeof anchor !== "string" || !isLogicalDate(anchor)) return null;
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  if (period === "daily") {
    let endLogicalDateExclusive: string | null;
    try {
      endLogicalDateExclusive = PolyfillTemporal.PlainDate.from(anchor).add({ days: 1 }).toString();
    } catch {
      endLogicalDateExclusive = null;
    }
    return { granularity: period, anchor, startLogicalDate: anchor, endLogicalDateExclusive };
  }
  if (period === "monthly" && anchor.slice(8) !== "01") return null;
  if (period === "yearly" && (month !== 1 || anchor.slice(8) !== "01")) return null;

  let endLogicalDateExclusive: string | null;
  if (period === "monthly") {
    if (month === 12 && year === 9999) {
      // Logical dates have a fixed four-digit year. There is no representable
      // canonical date after 9999-12-31, so an open upper bound is equivalent.
      endLogicalDateExclusive = null;
    } else {
      const nextYear = month === 12 ? year + 1 : year;
      const nextMonth = month === 12 ? 1 : month + 1;
      endLogicalDateExclusive = `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
    }
  } else {
    endLogicalDateExclusive = year === 9999 ? null : `${String(year + 1).padStart(4, "0")}-01-01`;
  }

  return {
    granularity: period,
    anchor,
    startLogicalDate: anchor,
    endLogicalDateExclusive,
  };
}

/**
 * Read-only aggregate over persisted Days and their canonical Entry identities.
 * The Entry and Execution filters intentionally mirror loadEstablishedProjection:
 * owner-scoped Task joins, Routine suppressions excluded, Running excluded, and
 * completed duration summed from ended canonical Execution intervals.
 */
export async function loadReviewDateMetrics(
  db: D1Database,
  appUserId: string,
  range: ReviewDateMetricRange,
): Promise<ReviewDateMetrics> {
  const row = await db.prepare(`
    WITH period_days AS (
      SELECT id
        FROM taskchute_days
       WHERE app_user_id = ?
         AND logical_date >= ?
         AND (? IS NULL OR logical_date < ?)
    ),
    projected_entries AS (
      SELECT e.id AS entry_id, e.lifecycle_state
        FROM period_days d
        JOIN entries e ON e.app_user_id = ? AND e.taskchute_day_id = d.id
        JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
       WHERE NOT EXISTS (
         SELECT 1
           FROM routine_occurrence_suppressions x
          WHERE x.app_user_id = e.app_user_id
            AND x.routine_occurrence_id = e.routine_occurrence_id
       )
    ),
    completed_execution_summary AS (
      SELECT x.entry_id,
             SUM(unixepoch(x.ended_at) - unixepoch(x.started_at)) AS completed_duration_seconds
        FROM executions x
        JOIN projected_entries e ON e.entry_id = x.entry_id AND e.lifecycle_state = 'completed'
       WHERE x.app_user_id = ? AND x.ended_at IS NOT NULL
       GROUP BY x.entry_id
    )
    SELECT
      (SELECT COUNT(*) FROM period_days) AS established_day_count,
      COUNT(DISTINCT CASE WHEN e.lifecycle_state = 'completed' THEN e.entry_id END) AS completed_count,
      COUNT(DISTINCT CASE WHEN e.lifecycle_state = 'planned' THEN e.entry_id END) AS unexecuted_count,
      COALESCE(SUM(CASE WHEN e.lifecycle_state = 'completed'
        THEN COALESCE(x.completed_duration_seconds, 0) ELSE 0 END), 0)
        AS completed_actual_duration_seconds
      FROM projected_entries e
      LEFT JOIN completed_execution_summary x ON x.entry_id = e.entry_id
  `).bind(
    appUserId,
    range.startLogicalDate,
    range.endLogicalDateExclusive,
    range.endLogicalDateExclusive,
    appUserId,
    appUserId,
  ).first<ReviewDateMetricsRow>();

  if (!row) throw new Error("Review Date metrics query returned no aggregate row");
  for (const [field, value] of Object.entries(row)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid Review Date metric: ${field}`);
  }

  return {
    period_granularity: range.granularity,
    period_anchor: range.anchor,
    established_day_count: row.established_day_count,
    completed_count: row.completed_count,
    unexecuted_count: row.unexecuted_count,
    completed_actual_duration_seconds: row.completed_actual_duration_seconds,
    routine_activity: await loadReviewRoutineActivity(db, appUserId, range),
  };
}

/** Routine activity is attributed from event dates and does not require persisted Days. */
export async function loadReviewRoutineActivity(
  db: D1Database,
  appUserId: string,
  range: ReviewDateMetricRange,
): Promise<ReviewRoutineActivity> {
  const marker = await db.prepare(`SELECT started_at, started_logical_date
    FROM routine_activity_coverage WHERE app_user_id = ?`)
    .bind(appUserId).first<{ started_at: string | null; started_logical_date: string | null }>();

  if (!marker?.started_at || !marker.started_logical_date) {
    return {
      coverage_status: "UNMEASURED",
      created_count: null,
      deleted_count: null,
      coverage_started_at: null,
      coverage_started_logical_date: null,
    };
  }
  if (!Number.isFinite(Date.parse(marker.started_at)) || !isLogicalDate(marker.started_logical_date)) {
    throw new Error("Invalid Routine activity coverage marker");
  }

  let completeFromLogicalDate: string | null = null;
  try {
    // A timezone-offset change spans less than 48 hours; the boundary range adds
    // less than 24 hours. Four logical dates therefore clear any pre-marker row
    // even if timezone or boundary settings are changed after activation.
    completeFromLogicalDate = PolyfillTemporal.PlainDate.from(marker.started_logical_date)
      .add({ days: 4 }).toString();
  } catch {
    // No representable post-marker date can be proven complete near year 9999.
  }

  const startedDate = PolyfillTemporal.PlainDate.from(marker.started_logical_date);
  const endsBeforeCoverage = range.endLogicalDateExclusive !== null
    && PolyfillTemporal.PlainDate.compare(
      PolyfillTemporal.PlainDate.from(range.endLogicalDateExclusive), startedDate,
    ) <= 0;
  const startsAfterCoverageSlack = completeFromLogicalDate !== null
    && PolyfillTemporal.PlainDate.compare(
      PolyfillTemporal.PlainDate.from(range.startLogicalDate),
      PolyfillTemporal.PlainDate.from(completeFromLogicalDate),
    ) >= 0;
  const status: RoutineActivityCoverageStatus = endsBeforeCoverage
    ? "UNMEASURED"
    : startsAfterCoverageSlack ? "COMPLETE" : "PARTIAL";
  if (status === "UNMEASURED") {
    return {
      coverage_status: status,
      created_count: null,
      deleted_count: null,
      coverage_started_at: marker.started_at,
      coverage_started_logical_date: marker.started_logical_date,
    };
  }

  const row = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM routine_definitions
        WHERE app_user_id = ? AND created_logical_date >= ?
          AND (? IS NULL OR created_logical_date < ?)
          AND (? <> 'PARTIAL' OR created_at >= ?)) AS created_count,
      (SELECT COUNT(*) FROM routine_definition_archives
        WHERE app_user_id = ? AND deleted_logical_date >= ?
          AND (? IS NULL OR deleted_logical_date < ?)
          AND (? <> 'PARTIAL' OR archived_at >= ?)) AS deleted_count`)
    .bind(
      appUserId, range.startLogicalDate, range.endLogicalDateExclusive, range.endLogicalDateExclusive,
      status, marker.started_at,
      appUserId, range.startLogicalDate, range.endLogicalDateExclusive, range.endLogicalDateExclusive,
      status, marker.started_at,
    )
    .first<{ created_count: number; deleted_count: number }>();

  if (!row || !Number.isSafeInteger(row.created_count) || row.created_count < 0
    || !Number.isSafeInteger(row.deleted_count) || row.deleted_count < 0) {
    throw new Error("Invalid Routine activity aggregate");
  }
  return {
    coverage_status: status,
    created_count: row.created_count,
    deleted_count: row.deleted_count,
    coverage_started_at: marker.started_at,
    coverage_started_logical_date: marker.started_logical_date,
  };
}

