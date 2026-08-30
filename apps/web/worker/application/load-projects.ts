import type { ProjectListProjection, ProjectSummary } from "../../src/shared/contracts";

export async function loadProjects(db: D1Database, appUserId: string): Promise<ProjectListProjection> {
  const { results } = await db
    .prepare(
      `SELECT id, title
         FROM projects
        WHERE app_user_id = ?
        ORDER BY created_at ASC, id ASC`,
    )
    .bind(appUserId)
    .all<ProjectSummary>();
  return { projects: results };
}
