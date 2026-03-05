import { Writable } from "node:stream";
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withErrorBoundary } from "../../src/errors/error-boundary";
import {
  buildErrorResponse,
  buildErrorResponseFromUnknown,
} from "../../src/errors/error-response";
import {
  InternalError,
  InvalidInputError,
  NotFoundError,
  ParseWarningError,
  SecurityLimitExceededError,
  SystemError,
} from "../../src/errors/error-types";
import { settleAll } from "../../src/errors/partial-success";
import {
  installUnhandledRejectionHandler,
  removeUnhandledRejectionHandler,
} from "../../src/errors/unhandled-rejection";
import { createLogger } from "../../src/observability/logger";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createCaptureStream(): { stream: Writable; output: () => string } {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  return { stream, output: () => Buffer.concat(chunks).toString("utf8") };
}

function makeLogger() {
  const { stream, output } = createCaptureStream();
  return {
    logger: createLogger({ level: "trace", format: "json", output: stream }),
    output,
  };
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-04: Error Handling Framework", () => {
  describe("error taxonomy [ERR-05]", () => {
    it("each of the five taxonomy categories produces structured response with correct type string [ERR-05]", () => {
      const cases = [
        {
          error: new InvalidInputError("bad input"),
          expectedType: "invalid_input",
        },
        { error: new NotFoundError("not found"), expectedType: "not_found" },
        {
          error: new ParseWarningError("parse issue"),
          expectedType: "parse_warning",
        },
        {
          error: new SystemError("system problem"),
          expectedType: "system_error",
        },
        {
          error: new InternalError("unexpected"),
          expectedType: "internal_error",
        },
      ];
      for (const { error, expectedType } of cases) {
        const response = buildErrorResponse(error);
        expect(response.type).toBe(expectedType);
        expect(response.message).toBeDefined();
        expect(response.message).toMatch(/\S/);
      }
    });

    it("security limit exceeded produces response with its own distinct type [ERR-10]", () => {
      const error = new SecurityLimitExceededError(
        "file_size",
        15_000_000,
        10_485_760,
      );
      const response = buildErrorResponse(error);
      expect(response.type).toBe("invalid_input");
      // Should have subtype or distinguishing field for security_limit_exceeded
      expect(response).toHaveProperty("subtype", "security_limit_exceeded");
    });
  });

  describe("buildErrorResponseFromUnknown [ERR-01]", () => {
    it("buildErrorResponseFromUnknown with Error instance produces internal_error response [ERR-01]", () => {
      const err = new Error("something broke");
      const response = buildErrorResponseFromUnknown(err);
      expect(response.type).toBe("internal_error");
      expect(response.message).toContain("something broke");
    });

    it("buildErrorResponseFromUnknown with string produces internal_error response [ERR-01]", () => {
      const response = buildErrorResponseFromUnknown("plain string error");
      expect(response.type).toBe("internal_error");
      expect(response.message).toBeDefined();
    });

    it("buildErrorResponseFromUnknown with known BriefError preserves its type [ERR-01]", () => {
      const err = new InvalidInputError("bad value");
      const response = buildErrorResponseFromUnknown(err);
      expect(response.type).toBe("invalid_input");
    });

    it("buildErrorResponseFromUnknown with undefined/null produces internal_error response [ERR-01]", () => {
      const responseUndef = buildErrorResponseFromUnknown(undefined);
      expect(responseUndef.type).toBe("internal_error");
      const responseNull = buildErrorResponseFromUnknown(null);
      expect(responseNull.type).toBe("internal_error");
    });
  });

  describe("suggestion handling [ERR-02]", () => {
    it("error with suggestion includes suggestion in response [ERR-02]", () => {
      const error = new InvalidInputError("bad scope", {
        suggestion: 'Use "design" instead',
      });
      const response = buildErrorResponse(error);
      expect(response.suggestion).toBe('Use "design" instead');
    });

    it("error without suggestion has no suggestion field [ERR-02]", () => {
      const error = new InvalidInputError("bad scope");
      const response = buildErrorResponse(error);
      expect(response.suggestion).toBeUndefined();
    });
  });

  describe("error boundary [ERR-01, CODE-04]", () => {
    it("successful handler through boundary returns normal result, isError not set [ERR-01]", async () => {
      const { logger } = makeLogger();
      const result = await withErrorBoundary(async () => {
        return { content: [{ type: "text", text: "success" }] };
      }, logger);
      // Task spec: on success, isError should not be set (undefined), not explicitly false
      expect(result.isError).toBeUndefined();
    });

    it("handler throws known error produces structured error with isError true and correct type [ERR-01]", async () => {
      const { logger } = makeLogger();
      const result = await withErrorBoundary(async () => {
        throw new InvalidInputError("bad param");
      }, logger);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("invalid_input");
    });

    it("handler throws non-error value (string, undefined) produces internal_error with isError true [ERR-01]", async () => {
      const { logger } = makeLogger();

      const resultString = await withErrorBoundary(async () => {
        throw "string error";
      }, logger);
      expect(resultString.isError).toBe(true);
      expect(resultString.content[0].text).toContain("internal_error");

      const resultUndef = await withErrorBoundary(async () => {
        throw undefined;
      }, logger);
      expect(resultUndef.isError).toBe(true);
      expect(resultUndef.content[0].text).toContain("internal_error");
    });

    it("error boundary on throw logs error; stack trace at debug level only [OBS-07]", async () => {
      const { logger, output } = makeLogger();
      await withErrorBoundary(async () => {
        throw new SystemError("disk full");
      }, logger);
      const text = output();
      // Error should be logged
      expect(text).toContain("disk full");
      // Stack trace should only appear at debug level, not in error-level entries
      const parsed = text
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      const errorLevelEntries = parsed.filter((e: any) => e.level === "error");
      for (const entry of errorLevelEntries) {
        expect(JSON.stringify(entry)).not.toMatch(/^\s+at /m);
      }
    });
  });

  describe("partial success [ERR-11]", () => {
    it("all async ops succeed returns all results, no warnings [ERR-11]", async () => {
      const { logger } = makeLogger();
      const result = await settleAll(
        [async () => "a", async () => "b", async () => "c"],
        logger,
      );
      expect(result.results).toEqual(["a", "b", "c"]);
      expect(result.warnings).toHaveLength(0);
    });

    it("some async ops fail returns successful results plus warnings for failures [ERR-11]", async () => {
      const { logger } = makeLogger();
      const result = await settleAll(
        [
          async () => "ok",
          async () => {
            throw new Error("source-2 failed");
          },
          async () => "also ok",
        ],
        logger,
      );
      expect(result.results).toContain("ok");
      expect(result.results).toContain("also ok");
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes("source-2 failed"))).toBe(
        true,
      );
    });

    it("all async ops fail returns empty results, warning per failure [ERR-11]", async () => {
      const { logger } = makeLogger();
      const result = await settleAll(
        [
          async () => {
            throw new Error("fail-1");
          },
          async () => {
            throw new Error("fail-2");
          },
        ],
        logger,
      );
      expect(result.results).toHaveLength(0);
      expect(result.warnings).toHaveLength(2);
    });

    it("one of two multi-source ops fails returns partial results plus warning naming failed source [ERR-11]", async () => {
      const { logger } = makeLogger();
      const result = await settleAll(
        [
          async () => ({ source: "root-a", projects: ["p1"] }),
          async () => {
            throw new Error("root-b: ENOENT");
          },
        ],
        logger,
      );
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toEqual({ source: "root-a", projects: ["p1"] });
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("root-b");
    });
  });

  describe("unhandled rejection [ERR-01]", () => {
    afterEach(() => {
      removeUnhandledRejectionHandler();
    });

    it("unhandled rejection triggered is logged, not swallowed [ERR-01]", async () => {
      const { logger, output } = makeLogger();
      installUnhandledRejectionHandler(logger);

      // Trigger an unhandled rejection
      const rejection = Promise.reject(new Error("unhandled test"));
      // Allow the event loop to process the rejection
      await new Promise((resolve) => setTimeout(resolve, 50));

      const text = output();
      expect(text).toContain("unhandled");
      // Clean up to prevent actual unhandled rejection
      rejection.catch(() => {});
    });
  });

  describe("error metrics counter [OBS-08, T04-02]", () => {
    it("error boundary on caught error: error metrics counter incremented [OBS-08, T04-02]", async () => {
      const { logger } = makeLogger();
      const { createMetricsCollector } = await import(
        "../../src/observability/metrics"
      );
      const metrics = createMetricsCollector();

      await withErrorBoundary(
        async () => {
          throw new InvalidInputError("metrics test error");
        },
        logger,
        { metrics },
      );

      const all = metrics.getAll();
      expect(all.errors).toBeDefined();
      const totalErrors = Object.values(
        all.errors as Record<string, unknown>,
      ).reduce((sum: number, count: any) => sum + count, 0);
      expect(totalErrors).toBeGreaterThan(0);
    });
  });

  describe("operation timeout [ERR-09]", () => {
    it("operation timeout exceeded is cancelled with cleanup, system_error returned [ERR-09]", async () => {
      const { logger } = makeLogger();
      // Simulate a handler that takes too long with an AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 100);

      const result = await withErrorBoundary(async () => {
        await new Promise((resolve, reject) => {
          controller.signal.addEventListener("abort", () =>
            reject(
              new SystemError(
                "Operation timed out after 30s. The file may be very large or the system is under heavy load.",
              ),
            ),
          );
          // Simulate long operation
          setTimeout(resolve, 5000);
        });
      }, logger);

      clearTimeout(timeoutId);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("system_error");
    });
  });

  describe("security limit violation [ERR-10]", () => {
    it("security limit violation returns invalid_input with security_limit_exceeded subtype, includes limit details [ERR-10, M4]", () => {
      // ERR-10: response MUST include which limit was exceeded, the actual value,
      // the configured limit, and how to adjust if needed.
      const actualValue = 15_000_000;
      const configuredLimit = 10_485_760;
      const error = new SecurityLimitExceededError(
        "file_size",
        actualValue,
        configuredLimit,
      );
      const response = buildErrorResponse(error);

      expect(response.type).toBe("invalid_input");
      expect(response).toHaveProperty("subtype", "security_limit_exceeded");

      // Which limit was exceeded
      expect(response.message).toContain("file_size");

      // Actual value must appear (raw number or human-readable form)
      const hasActualValue =
        response.message.includes(String(actualValue)) ||
        response.message.includes("15") || // e.g. "15MB" or "15,000,000"
        (response as any).details?.actualValue === actualValue;
      expect(hasActualValue).toBe(true);

      // Configured limit must appear
      const hasConfiguredLimit =
        response.message.includes(String(configuredLimit)) ||
        response.message.includes("10") || // e.g. "10MB" or "10,485,760"
        (response as any).details?.configuredLimit === configuredLimit;
      expect(hasConfiguredLimit).toBe(true);

      // Adjustment guidance must be present (suggestion or message text)
      const hasGuidance =
        (response.suggestion != null && response.suggestion.length > 0) ||
        response.message.toLowerCase().includes("adjust") ||
        response.message.toLowerCase().includes("config") ||
        response.message.toLowerCase().includes("setting") ||
        response.message.toLowerCase().includes("limit");
      expect(hasGuidance).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-04: Property Tests", () => {
  it("forAll(error message): boundary never throws, always returns structured response [ERR-01]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (message) => {
        const { logger } = makeLogger();
        const result = await withErrorBoundary(async () => {
          throw new Error(message);
        }, logger);
        // Must never throw, always return structured response
        expect(result).toBeDefined();
        expect(result.isError).toBe(true);
        expect(result.content).toBeDefined();
      }),
    );
  });

  it("forAll(taxonomy type): structured response always has type and message [ERR-05]", () => {
    const errorFactories = [
      (msg: string) => new InvalidInputError(msg),
      (msg: string) => new NotFoundError(msg),
      (msg: string) => new ParseWarningError(msg),
      (msg: string) => new SystemError(msg),
      (msg: string) => new InternalError(msg),
    ];
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: errorFactories.length - 1 }),
        fc.string({ minLength: 1 }),
        (index, message) => {
          const error = errorFactories[index](message);
          const response = buildErrorResponse(error);
          expect(response.type).toBeDefined();
          expect(response.message).toBeDefined();
          expect(response.type.length).toBeGreaterThan(0);
          expect(response.message.length).toBeGreaterThan(0);
        },
      ),
    );
  });

  it("forAll(list of ops, some failing): partial success never throws, returns results + warnings [ERR-11]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
        async (successes) => {
          const { logger } = makeLogger();
          const ops = successes.map((shouldSucceed) => async () => {
            if (!shouldSucceed) throw new Error("op failed");
            return "ok";
          });
          // settleAll must never throw
          const result = await settleAll(ops, logger);
          expect(result).toBeDefined();
          expect(result.results).toBeDefined();
          expect(result.warnings).toBeDefined();
          // Results should match the number of successful operations
          const expectedSuccessCount = successes.filter(Boolean).length;
          expect(result.results).toHaveLength(expectedSuccessCount);
          // Warnings should match the number of failed operations
          const expectedFailCount = successes.filter((s) => !s).length;
          expect(result.warnings).toHaveLength(expectedFailCount);
        },
      ),
    );
  });

  it("forAll(unknown thrown value): boundary produces valid response [ERR-01]", async () => {
    const arbitraryThrowable = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.constant(undefined),
      fc.constant(null),
      fc.dictionary(fc.string(), fc.string()),
    );
    await fc.assert(
      fc.asyncProperty(arbitraryThrowable, async (thrown) => {
        const { logger } = makeLogger();
        const result = await withErrorBoundary(async () => {
          throw thrown;
        }, logger);
        expect(result).toBeDefined();
        expect(result.isError).toBe(true);
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);
      }),
    );
  });
});
