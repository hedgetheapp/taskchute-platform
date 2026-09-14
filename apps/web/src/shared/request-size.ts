export const JSON_REQUEST_BODY_LIMIT_BYTES = 64 * 1024;
export const JSON_REQUEST_BODY_WARNING_BYTES = Math.floor(JSON_REQUEST_BODY_LIMIT_BYTES * 0.9);

export interface SerializedJsonRequestBody {
  body: string;
  byteLength: number;
  warning: boolean;
  overLimit: boolean;
}

export function serializeJsonRequestBody(value: unknown): SerializedJsonRequestBody {
  const body = JSON.stringify(value);
  const byteLength = new TextEncoder().encode(body).byteLength;
  return {
    body,
    byteLength,
    warning: byteLength >= JSON_REQUEST_BODY_WARNING_BYTES,
    overLimit: byteLength > JSON_REQUEST_BODY_LIMIT_BYTES,
  };
}

export function formatJsonRequestSize(byteLength: number): string {
  return `${byteLength.toLocaleString("ja-JP")} / ${JSON_REQUEST_BODY_LIMIT_BYTES.toLocaleString("ja-JP")} bytes`;
}
