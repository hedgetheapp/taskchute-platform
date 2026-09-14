import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ClientRequestBodyTooLargeError } from "../../src/web/api";
import { JSON_REQUEST_BODY_LIMIT_BYTES } from "../../src/shared/request-size";

describe("client JSON request protection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("measures and sends the exact serialized standalone request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ document: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const request = {
      operation_id: "0199d104-0000-7000-8000-000000000001",
      document_id: "0199d104-0000-7000-8000-000000000002",
      title: "日本語😀",
      markdown_body: "line\\n\"quoted\"",
    };
    await api.createStandaloneDocument(request);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new TextEncoder().encode(String(init.body)).byteLength).toBeLessThanOrEqual(JSON_REQUEST_BODY_LIMIT_BYTES);
    expect(init.body).toBe(JSON.stringify(request));
  });

  it("rejects an over-limit request before fetch for every shared Note mutation path", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const body = "あ😀".repeat(JSON_REQUEST_BODY_LIMIT_BYTES);
    expect(() => api.createStandaloneDocument({
      operation_id: "0199d104-0000-7000-8000-000000000003",
      document_id: "0199d104-0000-7000-8000-000000000004",
      title: "too large",
      markdown_body: body,
    })).toThrow(ClientRequestBodyTooLargeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
