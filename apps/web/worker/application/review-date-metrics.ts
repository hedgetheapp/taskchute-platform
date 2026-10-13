import { isLogicalDate } from "../domain/taskchute-day";

export type ReviewDateMetricGranularity = "monthly" | "yearly";

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
}

interface ReviewDateMetricsRow {
  established_day_count: number;
  completed_count: number;
  unexecuted_count: number;
  completed_actual_duration_seconds: number;
}

/** A month/year anchor is the first logical date in the selected calendar period. */
export function reviewDateMetricRange(period: unknown, anchor: unknown): ReviewDateMetricRange | null {
  if ((period !== "monthly" && period !== "yearly") || typeof anchor !== "string" || !isLogicalDate(anchor)) return null;
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
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
  };
}

