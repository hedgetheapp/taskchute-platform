import type { ApiErrorCode } from "../../src/shared/contracts";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly reconcile = false,
  ) {
    super(message);
  }
}

