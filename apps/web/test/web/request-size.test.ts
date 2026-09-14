import { describe, expect, it } from "vitest";
import {
  JSON_REQUEST_BODY_LIMIT_BYTES,
  JSON_REQUEST_BODY_WARNING_BYTES,
  serializeJsonRequestBody,
} from "../../src/shared/request-size";

describe("JSON request size guard", () => {
  it("measures the serialized UTF-8 JSON body, including ids and escaping", () => {
    const ascii = serializeJsonRequestBody({ operation_id: "op", document_id: "doc", title: "a", markdown_body: "x" });
    const japanese = serializeJsonRequestBody({ operation_id: "op", document_id: "doc", title: "日本語😀", markdown_body: "行\n\\\"" });
    expect(japanese.byteLength).toBeGreaterThan(ascii.byteLength);
    expect(japanese.body).toContain("\\n");
  });

  it("marks the warning range and blocks only bodies over the server ceiling", () => {
    const below = serializeJsonRequestBody({ body: "x".repeat(JSON_REQUEST_BODY_WARNING_BYTES - 40) });
    const warning = serializeJsonRequestBody({ body: "x".repeat(JSON_REQUEST_BODY_WARNING_BYTES) });
    const atLimit = serializeJsonRequestBody({ body: "x".repeat(JSON_REQUEST_BODY_LIMIT_BYTES - 20) });
    const over = serializeJsonRequestBody({ body: "x".repeat(JSON_REQUEST_BODY_LIMIT_BYTES) });
    expect(below.warning).toBe(false);
    expect(warning.warning).toBe(true);
    expect(atLimit.overLimit).toBe(false);
    expect(over.overLimit).toBe(true);
  });
});
