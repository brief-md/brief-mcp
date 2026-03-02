// src/errors/error-response.ts — stub for TASK-04
// Replace with real implementation during build loop.

import type { ErrorResponse } from "../types/responses.js";

export function buildErrorResponse(_error: Error): ErrorResponse {
  throw new Error("Not implemented: buildErrorResponse");
}

export function buildErrorResponseFromUnknown(_err: unknown): ErrorResponse {
  throw new Error("Not implemented: buildErrorResponseFromUnknown");
}
