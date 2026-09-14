import { describe, expect, it } from "vitest";
import { isRealtimeInvalidation, mergeRealtimeScopes, parseRealtimeInvalidation, serializeRealtimeInvalidation } from "../src/shared/realtime";
import { realtimeScopesForMutation } from "../worker/realtime-invalidation";

describe("realtime invalidation contract", () => {
  it("accepts only versioned invalidate messages and bounds malformed input", () => {
    const serialized = serializeRealtimeInvalidation([{ kind: "documents", document_ids: ["doc-1"] }]);
    expect(serialized).not.toBeNull();
    expect(isRealtimeInvalidation(JSON.parse(serialized!))).toBe(true);
    expect(parseRealtimeInvalidation(serialized!)).toEqual(JSON.parse(serialized!));
    expect(parseRealtimeInvalidation(JSON.stringify({ version: 1, type: "invalidate", scopes: [] }))).toBeNull();
    expect(parseRealtimeInvalidation("not-json")).toBeNull();
  });

  it("coalesces repeated document scopes without losing identifiers", () => {
    expect(mergeRealtimeScopes([
      { kind: "documents", document_ids: ["b"] },
      { kind: "documents", document_ids: ["a", "b"] },
      { kind: "day" },
      { kind: "day" },
    ])).toEqual([
      { kind: "documents", document_ids: ["b", "a"] },
      { kind: "day" },
    ]);
  });

  it("covers each current mutation family with one discoverable scope mapping", () => {
    expect(realtimeScopesForMutation(new Request("https://example.test/api/v1/taskchute-days/current/entries", { method: "POST" }))).toEqual([{ kind: "day" }]);
    expect(realtimeScopesForMutation(new Request("https://example.test/api/v1/projects/abc", { method: "POST" })).map((scope) => scope.kind)).toEqual(["projects", "routines", "day", "documents"]);
    expect(realtimeScopesForMutation(new Request("https://example.test/api/v1/modes/reorder", { method: "POST" })).map((scope) => scope.kind)).toEqual(["modes", "routines", "day"]);
    expect(realtimeScopesForMutation(new Request("https://example.test/api/v1/routines/reorder", { method: "POST" })).map((scope) => scope.kind)).toEqual(["routines", "day"]);
    expect(realtimeScopesForMutation(new Request("https://example.test/api/v1/documents/doc-1", { method: "POST" })).map((scope) => scope.kind)).toEqual(["documents", "day", "projects"]);
    expect(realtimeScopesForMutation(new Request("https://example.test/api/v1/projects/abc", { method: "GET" }))).toEqual([]);
  });
});
