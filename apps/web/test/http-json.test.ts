import { describe, expect, it } from "vitest";
import { readBoundedJson } from "../worker/http/json";

describe("bounded JSON request body", () => {
  it("rejects an oversized body before any command can mutate state", async () => {
    const body = JSON.stringify({ markdown_body: "x".repeat(64 * 1024) });
    const request = new Request("https://example.test/api/v1/documents", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(new TextEncoder().encode(body).byteLength) },
      body,
    });

    await expect(readBoundedJson(request)).rejects.toMatchObject({ status: 400, code: "malformed_request" });
  });
});
