import type { ApiErrorBody } from "../src/shared/contracts";
import { addTaskToDay, isAddTaskToDayRequest } from "./application/add-task-to-day";
import { createProject, isCreateProjectRequest } from "./application/create-project";
import { HttpError } from "./application/errors";
import { loadCurrentTaskChuteDay } from "./application/load-current-day";
import { createRequestAuth } from "./auth/better-auth";
import { bootstrapInitialUser } from "./auth/bootstrap";
import { resolvePrincipal } from "./auth/principal";
import { readBoundedJson } from "./http/json";

const SECURITY_HEADERS: Record<string, string> = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
};

function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) secured.headers.set(name, value);
  return secured;
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/auth/")) {
    return createRequestAuth(request, env).handler(request);
  }
  if (request.method === "POST" && url.pathname === "/api/internal/bootstrap") {
    return bootstrapInitialUser(request, env, await readBoundedJson(request));
  }
  if (!url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });

  const principal = await resolvePrincipal(request, env);
  if (request.method === "GET" && url.pathname === "/api/v1/taskchute-days/current") {
    return Response.json(await loadCurrentTaskChuteDay(env.APP_DB, principal.appUserId));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/projects") {
    const body = await readBoundedJson(request);
    if (!isCreateProjectRequest(body)) throw new HttpError(400, "malformed_request", "Invalid CreateProject request");
    return Response.json(await createProject(env.APP_DB, principal.appUserId, body));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/taskchute-days/current/entries") {
    const body = await readBoundedJson(request);
    if (!isAddTaskToDayRequest(body)) throw new HttpError(400, "malformed_request", "Invalid AddTaskToDay request");
    return Response.json(await addTaskToDay(env.APP_DB, principal.appUserId, body));
  }
  return Response.json({ error: { code: "resource_not_found", message: "Not found", reconcile: false } }, { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return withSecurityHeaders(await route(request, env));
    } catch (error) {
      if (error instanceof HttpError) {
        const body: ApiErrorBody = {
          error: { code: error.code, message: error.message, reconcile: error.reconcile },
        };
        return withSecurityHeaders(Response.json(body, { status: error.status }));
      }
      console.error(
        JSON.stringify({
          message: "unhandled request failure",
          method: request.method,
          path: new URL(request.url).pathname,
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
      const body: ApiErrorBody = {
        error: {
          code: "infrastructure_ambiguous",
          message: "The server could not determine a safe outcome; reload canonical state before retrying",
          reconcile: true,
        },
      };
      return withSecurityHeaders(Response.json(body, { status: 503 }));
    }
  },
} satisfies ExportedHandler<Env>;

