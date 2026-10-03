import { describe, expect, it } from "vitest";
import { hasCommittedMutation, mutationResponse } from "../worker/mutation-response";

describe("internal canonical mutation outcome", () => {
  it("marks typed domain rejection as not committed even though its JSON response is HTTP 200", async () => {
    const response = mutationResponse({ code: "resource_conflict", message: "rejected" });
    expect(response.status).toBe(200);
    expect(hasCommittedMutation(response)).toBe(false);
    await expect(response.json()).resolves.toEqual({ code: "resource_conflict", message: "rejected" });
  });

  it("marks a successful typed command projection as committed without changing its response", async () => {
    const response = mutationResponse({ entry_id: "entry", lifecycle_state: "running" });
    expect(response.status).toBe(200);
    expect(hasCommittedMutation(response)).toBe(true);
    await expect(response.json()).resolves.toEqual({ entry_id: "entry", lifecycle_state: "running" });
  });
});
