import type { ProjectListProjection, ProjectSummary } from "../../src/shared/contracts";

export async function loadProjects(db: D1Database, appUserId: string): Promise<ProjectListProjection> {
  const { results } = await db
    .prepare(
      `SELECT id, title
         FROM projects p
         JOIN project_board_items i ON i.app_user_id = p.app_user_id AND i.project_id = p.id
        WHERE p.app_user_id = ?
          AND NOT EXISTS (SELECT 1 FROM project_archives a
            WHERE a.app_user_id = p.app_user_id AND a.project_id = p.id)
        ORDER BY i.board_position, p.id`,
    )
    .bind(appUserId)
    .all<ProjectSummary>();
  return { projects: results };
}
