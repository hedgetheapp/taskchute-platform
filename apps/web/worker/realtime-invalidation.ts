import type { RealtimeScope } from "../src/shared/realtime";
import { parseRealtimeInvalidation, serializeRealtimeInvalidation } from "../src/shared/realtime";

function documentScope(documentId?: string): RealtimeScope {
  return documentId ? { kind: "documents", document_ids: [documentId] } : { kind: "documents" };
}

export function realtimeScopesForMutation(request: Request): RealtimeScope[] {
  if (request.method !== "POST") return [];
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/v1/")) return [];

  if (path === "/api/v1/settings/auto-carry-overdue-planned"
    || path === "/api/v1/settings/effective-day-overrides"
    || path.startsWith("/api/v1/settings/effective-day-overrides/")
    || path === "/api/v1/section-configurations/initial"
    || path === "/api/v1/section-configuration") return [{ kind: "day" }];

  if (path.startsWith("/api/v1/documents") || path.startsWith("/api/v1/project-primary-documents")
    || path.startsWith("/api/v1/task-primary-documents") || path.includes("/primary-document")) {
    const match = path.match(/(?:documents|primary-documents)\/([^/]+)/);
    return [documentScope(match?.[1]), { kind: "day" }, { kind: "projects" }];
  }

  if (path.startsWith("/api/v1/projects")) return [{ kind: "projects" }, { kind: "routines" }, { kind: "day" }, { kind: "documents" }];
  if (path.startsWith("/api/v1/modes") || path.endsWith("/mode") || path.endsWith("/routine-mode")) {
    return [{ kind: "modes" }, { kind: "routines" }, { kind: "day" }];
  }
  if (path.startsWith("/api/v1/routines") || path.endsWith("/routine") || path.endsWith("/routine-estimate")
    || path.endsWith("/routine-section-plan")) return [{ kind: "routines" }, { kind: "day" }];
  if (path.startsWith("/api/v1/taskchute-days") || path.startsWith("/api/v1/entries/")) return [{ kind: "day" }];
  return [];
}

export function serializePublishRequest(scopes: RealtimeScope[]): string | null {
  return serializeRealtimeInvalidation(scopes);
}

export function parsePublishRequest(body: string) {
  return parseRealtimeInvalidation(body);
}
