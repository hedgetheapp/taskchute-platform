export const REALTIME_PROTOCOL_VERSION = 1 as const;
export const REALTIME_MAX_MESSAGE_BYTES = 16 * 1024;

export type RealtimeScope =
  | { kind: "day"; logical_date?: string }
  | { kind: "projects" }
  | { kind: "modes" }
  | { kind: "routines" }
  | { kind: "documents"; document_ids?: string[] };

export interface RealtimeInvalidation {
  version: typeof REALTIME_PROTOCOL_VERSION;
  type: "invalidate";
  scopes: RealtimeScope[];
}

export interface RealtimeRefresh {
  token: number;
  scopes: RealtimeScope[];
}

function isLogicalDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

function isScope(value: unknown): value is RealtimeScope {
  if (!value || typeof value !== "object") return false;
  const scope = value as Record<string, unknown>;
  if (scope.kind === "day") return (scope.logical_date === undefined || isLogicalDate(scope.logical_date))
    && Object.keys(scope).every((key) => key === "kind" || key === "logical_date");
  if (scope.kind === "projects" || scope.kind === "modes" || scope.kind === "routines") {
    return Object.keys(scope).every((key) => key === "kind");
  }
  if (scope.kind !== "documents") return false;
  if (scope.document_ids === undefined) return Object.keys(scope).every((key) => key === "kind");
  return Array.isArray(scope.document_ids)
    && scope.document_ids.length <= 100
    && scope.document_ids.every(isSafeIdentifier)
    && Object.keys(scope).every((key) => key === "kind" || key === "document_ids");
}

export function isRealtimeInvalidation(value: unknown): value is RealtimeInvalidation {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return message.version === REALTIME_PROTOCOL_VERSION
    && message.type === "invalidate"
    && Array.isArray(message.scopes)
    && message.scopes.length > 0
    && message.scopes.length <= 32
    && message.scopes.every(isScope)
    && Object.keys(message).every((key) => key === "version" || key === "type" || key === "scopes");
}

export function serializeRealtimeInvalidation(scopes: RealtimeScope[]): string | null {
  const message: RealtimeInvalidation = {
    version: REALTIME_PROTOCOL_VERSION,
    type: "invalidate",
    scopes,
  };
  const serialized = JSON.stringify(message);
  const bytes = typeof TextEncoder === "undefined"
    ? serialized.length
    : new TextEncoder().encode(serialized).byteLength;
  return bytes <= REALTIME_MAX_MESSAGE_BYTES ? serialized : null;
}

export function parseRealtimeInvalidation(serialized: string): RealtimeInvalidation | null {
  const bytes = typeof TextEncoder === "undefined"
    ? serialized.length
    : new TextEncoder().encode(serialized).byteLength;
  if (bytes > REALTIME_MAX_MESSAGE_BYTES) return null;
  try {
    const parsed: unknown = JSON.parse(serialized);
    return isRealtimeInvalidation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function mergeRealtimeScopes(scopes: RealtimeScope[]): RealtimeScope[] {
  const merged = new Map<string, RealtimeScope>();
  for (const scope of scopes) {
    const key = scope.kind === "day" ? `day:${scope.logical_date ?? "*"}` : scope.kind;
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, scope);
      continue;
    }
    if (previous.kind === "documents" && scope.kind === "documents") {
      if (!previous.document_ids || !scope.document_ids) merged.set(key, { kind: "documents" });
      else {
        const ids = [...new Set([...(previous.document_ids ?? []), ...(scope.document_ids ?? [])])];
        merged.set(key, ids.length > 0 ? { kind: "documents", document_ids: ids } : { kind: "documents" });
      }
    }
  }
  return [...merged.values()];
}
