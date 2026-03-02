// src/errors/error-response.ts

import type { ErrorResponse } from "../types/responses.js";
import { BriefError, SecurityLimitExceededError } from "./error-types.js";

// Normalize suggestion: accept plain string or object-wrapped { suggestion: string }
function normalizeSuggestion(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  if (
    raw !== null &&
    typeof raw === "object" &&
    "suggestion" in raw &&
    typeof (raw as Record<string, unknown>).suggestion === "string"
  ) {
    return (raw as Record<string, unknown>).suggestion as string;
  }
  return undefined;
}

export function buildErrorResponse(error: BriefError): ErrorResponse {
  const suggestion = normalizeSuggestion(error.suggestion);

  if (error instanceof SecurityLimitExceededError) {
    // Security limit errors use invalid_input type (the parent class type) with
    // security_limit_exceeded subtype to distinguish them (ERR-10)
    return {
      type: "invalid_input",
      message: error.message,
      subtype: error.subtype,
      ...(suggestion !== undefined ? { suggestion } : {}),
    };
  }

  return {
    type: error.type as ErrorResponse["type"],
    message: error.message,
    ...(suggestion !== undefined ? { suggestion } : {}),
    ...(error.code !== undefined ? { code: error.code } : {}),
  };
}

export function buildErrorResponseFromUnknown(err: unknown): ErrorResponse {
  if (err instanceof BriefError) {
    return buildErrorResponse(err);
  }

  let message = "An unexpected error occurred.";

  if (err instanceof Error) {
    if (err.message.length > 0) {
      message = err.message;
    }
  } else if (typeof err === "string" && err.length > 0) {
    message = err;
  } else if (err !== null && err !== undefined) {
    try {
      const str = String(err);
      if (str.length > 0 && str !== "[object Object]") {
        message = `An unexpected error occurred: ${str}`;
      }
    } catch {
      // String conversion failed — use default message
    }
  }

  return { type: "internal_error", message };
}
