import { HttpError } from "../application/errors";
import { createRequestAuth } from "./better-auth";

export interface Principal {
  appUserId: string;
  authSubjectId: string;
}

export async function resolvePrincipal(request: Request, env: Env): Promise<Principal> {
  const auth = createRequestAuth(request, env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new HttpError(401, "unauthenticated", "Authentication is required");
  const mapping = await env.APP_DB.prepare(
    `SELECT app_user_id
       FROM auth_subject_mappings
      WHERE auth_provider = 'better-auth' AND auth_subject_id = ?`,
  )
    .bind(session.user.id)
    .first<{ app_user_id: string }>();
  if (!mapping) throw new HttpError(403, "forbidden", "The authenticated subject is not provisioned");
  return { appUserId: mapping.app_user_id, authSubjectId: session.user.id };
}

