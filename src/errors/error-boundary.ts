// src/errors/error-boundary.ts

import type { Logger } from "../observability/logger.js";
import type { MetricsCollector } from "../observability/metrics.js";
import type { ToolResponse } from "../types/responses.js";
import {
  buildErrorResponse,
  buildErrorResponseFromUnknown,
} from "./error-response.js";
import { BriefError, SystemError } from "./error-types.js";

export interface ErrorBoundaryOptions {
  metrics?: MetricsCollector;
  timeoutMs?: number;
}

export async function withErrorBoundary<T>(
  handler: () => Promise<T>,
  logger: Logger,
  options?: ErrorBoundaryOptions,
): Promise<ToolResponse> {
  try {
    let result: T;

    if (options?.timeoutMs !== undefined) {
      const timeoutMs = options.timeoutMs;
      let timerId: ReturnType<typeof setTimeout> | undefined;

      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => {
          reject(
            new SystemError(
              `Operation timed out after ${timeoutMs / 1000}s. The file may be very large or the system is under heavy load.`,
            ),
          );
        }, timeoutMs);
        // Unref so the timer doesn't keep the process alive during tests
        if (
          timerId !== undefined &&
          typeof (timerId as NodeJS.Timeout).unref === "function"
        ) {
          (timerId as NodeJS.Timeout).unref();
        }
      });

      try {
        result = await Promise.race([handler(), timeoutPromise]);
      } finally {
        if (timerId !== undefined) {
          clearTimeout(timerId);
        }
      }
    } else {
      result = await handler();
    }

    return result as unknown as ToolResponse;
  } catch (err) {
    // Log error at error level (OBS-07); stack trace at debug only
    const errorType = err instanceof BriefError ? err.type : "internal_error";
    logger.error("Tool handler error", { errorType });

    if (err instanceof Error && err.stack !== undefined) {
      logger.debug("Error stack trace", { stack: err.stack });
    }

    // Increment error metrics counter (OBS-07)
    if (options?.metrics !== undefined) {
      options.metrics.increment("errors", errorType);
    }

    // Build structured error response
    const errorResponse =
      err instanceof BriefError
        ? buildErrorResponse(err)
        : buildErrorResponseFromUnknown(err);

    // Include error type in content text so callers can identify the error category
    const textParts = [`[${errorResponse.type}] ${errorResponse.message}`];
    if (errorResponse.suggestion !== undefined) {
      textParts.push(`Suggestion: ${errorResponse.suggestion}`);
    }

    return {
      content: [{ type: "text" as const, text: textParts.join("\n") }],
      isError: true,
      metadata: {
        errorType: errorResponse.type,
        ...(errorResponse.suggestion !== undefined
          ? { suggestion: errorResponse.suggestion }
          : {}),
        ...(errorResponse.subtype !== undefined
          ? { subtype: errorResponse.subtype }
          : {}),
      },
    };
  }
}
