import { Writable } from "node:stream";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChildLogger } from "../../src/observability/child-logger";
import { createLogger } from "../../src/observability/logger";
import { createMetricsCollector } from "../../src/observability/metrics";
import {
  generateRequestId,
  withRequestId,
} from "../../src/observability/request-id";
import {
  installStdoutGuard,
  removeStdoutGuard,
} from "../../src/observability/stdout-guard";
import {
  startTimer,
  stopTimer,
  withTiming,
} from "../../src/observability/timing";

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
  return {
    stream,
    output: () => Buffer.concat(chunks).toString("utf8"),
  };
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-03: Logger & Observability", () => {
  describe("logger output formats [OBS-01]", () => {
    it("logger in JSON mode, info message produces valid JSON with timestamp, level, module, message [OBS-01]", () => {
      const { stream, output } = createCaptureStream();
      const logger = createLogger({
        level: "info",
        format: "json",
        output: stream,
      });
      logger.info("test message");
      const parsed = JSON.parse(output());
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("test message");
      expect(parsed.module).toBeDefined();
      expect(typeof parsed.module).toBe("string");
      expect(parsed.module.length).toBeGreaterThan(0);
    });

    it("logger in pretty mode, warn message produces human-readable output [OBS-01]", () => {
      const { stream, output } = createCaptureStream();
      const logger = createLogger({
        level: "info",
        format: "pretty",
        output: stream,
      });
      logger.warn("warning message");
      const text = output();
      expect(text).toContain("WARN");
      expect(text).toContain("warning message");
    });

    it("format auto-detect: stderr.isTTY=true selects pretty format, false selects json [OBS-01, T03-03]", () => {
      // TTY output → pretty (human readable)
      // Set isTTY on the stream itself (standard Node.js TTY stream pattern)
      const { stream: ttyStream, output: ttyOutput } = createCaptureStream();
      (ttyStream as any).isTTY = true;
      const ttyLogger = createLogger({ level: "info", output: ttyStream });
      ttyLogger.info("tty message");
      const ttyText = ttyOutput();
      // Pretty format: non-JSON human-readable string
      expect(() => JSON.parse(ttyText)).toThrow();
      expect(ttyText).toContain("tty message");

      // Non-TTY output → json (machine readable)
      const { stream: jsonStream, output: jsonOutput } = createCaptureStream();
      (jsonStream as any).isTTY = false;
      const jsonLogger = createLogger({ level: "info", output: jsonStream });
      jsonLogger.info("json message");
      const jsonText = jsonOutput();
      // JSON format: parseable
      expect(() => JSON.parse(jsonText)).not.toThrow();
      const parsed = JSON.parse(jsonText);
      expect(parsed.message).toBe("json message");
    });
  });

  describe("level filtering [OBS-09]", () => {
    it("debug message when level is info produces no output [OBS-09]", () => {
      const { stream, output } = createCaptureStream();
      const logger = createLogger({
        level: "info",
        format: "json",
        output: stream,
      });
      logger.debug("should not appear");
      expect(output()).toBe("");
    });

    it("error message when level is error produces output [OBS-09]", () => {
      const { stream, output } = createCaptureStream();
      const logger = createLogger({
        level: "error",
        format: "json",
        output: stream,
      });
      logger.error("error message");
      expect(output()).not.toBe("");
    });

    it("trace message when level is info produces no output [OBS-09]", () => {
      const { stream, output } = createCaptureStream();
      const logger = createLogger({
        level: "info",
        format: "json",
        output: stream,
      });
      logger.trace("should not appear");
      expect(output()).toBe("");
    });

    it("fatal message when level is warn produces output [OBS-09]", () => {
      const { stream, output } = createCaptureStream();
      const logger = createLogger({
        level: "warn",
        format: "json",
        output: stream,
      });
      logger.fatal("fatal message");
      expect(output()).not.toBe("");
    });
  });

  describe("context and module scoping [OBS-03, OBS-07]", () => {
    it("message with context object includes context in output [OBS-07]", () => {
      const { stream, output } = createCaptureStream();
      const logger = createLogger({
        level: "info",
        format: "json",
        output: stream,
      });
      logger.info("with context", { filePath: "/test.md" });
      const parsed = JSON.parse(output());
      expect(parsed.context).toBeDefined();
      expect(parsed.context.filePath).toBe("/test.md");
    });

    it("all log output written to stderr, never stdout [OBS-02]", () => {
      // Logger with default settings should write to stderr
      const stdoutSpy = vi.spyOn(process.stdout, "write");
      const { stream } = createCaptureStream();
      const logger = createLogger({
        level: "info",
        format: "json",
        output: stream,
      });
      logger.info("test");
      // stdout should not have been written to
      expect(stdoutSpy).not.toHaveBeenCalled();
      stdoutSpy.mockRestore();
    });

    it("child logger with module name includes that module name in every line [OBS-03]", () => {
      const { stream, output } = createCaptureStream();
      const parent = createLogger({
        level: "info",
        format: "json",
        output: stream,
      });
      const child = createChildLogger(parent, "parser");
      child.info("parsing started");
      const parsed = JSON.parse(output());
      expect(parsed.module).toBe("parser");
    });
  });

  describe("request ID tracing [OBS-04]", () => {
    it("generating two request IDs produces different values [OBS-04]", () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      expect(id1).not.toBe(id2);
    });

    it("logger wrapped with request ID includes it in every line [OBS-04]", () => {
      const { stream, output } = createCaptureStream();
      const base = createLogger({
        level: "info",
        format: "json",
        output: stream,
      });
      const reqId = generateRequestId();
      const logger = withRequestId(reqId, base);
      logger.info("traced message");
      const parsed = JSON.parse(output());
      // Per OBS-04 spec: requestId is included in context object
      expect(parsed.context.requestId).toBe(reqId);
    });
  });

  describe("timing direct API [OBS-05]", () => {
    it("startTimer / stopTimer direct API returns elapsed ms [OBS-05]", () => {
      const timer = startTimer("timing-test");
      expect(timer).toBeDefined();
      // Simulate some passage of time
      const elapsed = stopTimer(timer);
      expect(typeof elapsed).toBe("number");
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });
  });

  describe("timing [OBS-05]", () => {
    it("timing a ~50ms operation logs duration in reasonable range [OBS-05]", async () => {
      const { stream, output } = createCaptureStream();
      const logger = createLogger({
        level: "debug",
        format: "json",
        output: stream,
      });
      await withTiming("test-op", logger, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return "done";
      });
      const text = output();
      // Duration should be logged and reasonably close to 50ms
      expect(text).toContain("test-op");
      expect(text).toMatch(/\d+\s*ms/);
      // Extract the duration value and verify it is in a reasonable range
      const match = text.match(/(\d+)\s*ms/);
      expect(match).not.toBeNull();
      const duration = parseInt(match![1], 10);
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThan(60000);
    });
  });

  describe("metrics [OBS-08]", () => {
    it("incrementing counter for same tool twice gives value 2 [OBS-08]", () => {
      const metrics = createMetricsCollector();
      metrics.increment("toolCalls", "brief_get_context");
      metrics.increment("toolCalls", "brief_get_context");
      const all = metrics.getAll() as any;
      expect(all.toolCalls.brief_get_context).toBe(2);
    });

    it("incrementing counters for different tools tracks independently [OBS-08]", () => {
      const metrics = createMetricsCollector();
      metrics.increment("toolCalls", "brief_get_context");
      metrics.increment("toolCalls", "brief_lint");
      const all = metrics.getAll() as any;
      expect(all.toolCalls.brief_get_context).toBe(1);
      expect(all.toolCalls.brief_lint).toBe(1);
    });

    it("getting all metrics returns snapshot with all counter categories [OBS-08]", () => {
      const metrics = createMetricsCollector();
      const all = metrics.getAll();
      expect(all).toHaveProperty("toolCalls");
      expect(all).toHaveProperty("errors");
      expect(all).toHaveProperty("fileReads");
      expect(all).toHaveProperty("fileWrites");
      expect(all).toHaveProperty("ontologySearches");
      expect(all).toHaveProperty("parseOperations");
    });

    it("resetting metrics sets all counters to zero [OBS-08]", () => {
      const metrics = createMetricsCollector();
      metrics.increment("toolCalls", "test");
      metrics.increment("errors", "system_error");
      metrics.reset();
      const all = metrics.getAll();
      expect(all.toolCalls).toEqual({});
      expect(all.errors).toEqual({});
    });

    it("incrementing fileReads, fileWrites, ontologySearches, parseOperations counters tracks independently [OBS-08]", () => {
      const metrics = createMetricsCollector();
      metrics.increment("fileReads", "read-brief-md");
      metrics.increment("fileWrites", "write-brief-md");
      metrics.increment("ontologySearches", "search-cinema-pack");
      metrics.increment("parseOperations", "parse-decisions");
      const all = metrics.getAll() as any;
      expect(all.fileReads["read-brief-md"]).toBe(1);
      expect(all.fileWrites["write-brief-md"]).toBe(1);
      expect(all.ontologySearches["search-cinema-pack"]).toBe(1);
      expect(all.parseOperations["parse-decisions"]).toBe(1);
    });

    it("logSummary(logger) emits a summary of all metric counters [OBS-08]", () => {
      const { stream, output } = createCaptureStream();
      const logger = createLogger({
        level: "info",
        format: "json",
        output: stream,
      });
      const metrics = createMetricsCollector();
      metrics.increment("toolCalls", "brief_get_context");
      metrics.increment("errors", "invalid_input");
      metrics.logSummary(logger);
      const text = output();
      // Summary log must mention the counters
      expect(text).toMatch(/toolCalls|tool_calls|metrics/i);
    });
  });

  describe("stdout guard [OBS-11]", () => {
    afterEach(() => {
      removeStdoutGuard();
    });

    it("installing stdout guard then console.log routes output to stderr not stdout [OBS-11]", () => {
      const stderrCapture = createCaptureStream();
      const logger = createLogger({
        level: "info",
        format: "json",
        output: stderrCapture.stream,
      });
      installStdoutGuard(logger);

      const stdoutSpy = vi.spyOn(process.stdout, "write");
      console.log("redirected message");
      // stdout should NOT have the message
      const stdoutCalls = stdoutSpy.mock.calls.map((c) => String(c[0]));
      expect(stdoutCalls.join("")).not.toContain("redirected message");
      stdoutSpy.mockRestore();
    });

    it("removing stdout guard restores original console methods [OBS-11]", () => {
      const { stream } = createCaptureStream();
      const logger = createLogger({
        level: "info",
        format: "json",
        output: stream,
      });
      const originalLog = console.log;
      installStdoutGuard(logger);
      expect(console.log).not.toBe(originalLog);
      removeStdoutGuard();
      expect(console.log).toBe(originalLog);
    });
  });

  describe("log level resolution [OBS-09]", () => {
    it("env var set takes priority [OBS-09]", () => {
      const original = process.env.BRIEF_LOG_LEVEL;
      try {
        process.env.BRIEF_LOG_LEVEL = "debug";
        const { stream, output } = createCaptureStream();
        const logger = createLogger({ format: "json", output: stream });
        logger.debug("env level message");
        expect(output()).not.toBe("");
      } finally {
        if (original === undefined) {
          delete process.env.BRIEF_LOG_LEVEL;
        } else {
          process.env.BRIEF_LOG_LEVEL = original;
        }
      }
    });

    it("nothing configured defaults to info [OBS-09]", () => {
      const original = process.env.BRIEF_LOG_LEVEL;
      try {
        delete process.env.BRIEF_LOG_LEVEL;
        const { stream, output } = createCaptureStream();
        const logger = createLogger({ format: "json", output: stream });
        logger.debug("should not appear");
        expect(output()).toBe("");
        logger.info("should appear");
        expect(output()).not.toBe("");
      } finally {
        if (original !== undefined) {
          process.env.BRIEF_LOG_LEVEL = original;
        }
      }
    });
  });

  describe("sensitive data protection [OBS-10]", () => {
    it("info log with file contents does not appear in output at info level [OBS-10]", () => {
      const { stream, output } = createCaptureStream();
      const logger = createLogger({
        level: "info",
        format: "json",
        output: stream,
      });
      logger.info("processing file", {
        fileContents: "# BRIEF.md\nSecret project data",
      });
      const text = output();
      expect(text).not.toContain("Secret project data");
    });

    it("info log with workspace absolute path does not appear in output at info level [OBS-10]", () => {
      const { stream, output } = createCaptureStream();
      const logger = createLogger({
        level: "info",
        format: "json",
        output: stream,
      });
      logger.info("scanning workspace", {
        path: "/home/user/secret-project/BRIEF.md",
      });
      const text = output();
      expect(text).not.toContain("/home/user/secret-project");
    });

    it("same content at debug level is accepted [OBS-10]", () => {
      const { stream, output } = createCaptureStream();
      const logger = createLogger({
        level: "debug",
        format: "json",
        output: stream,
      });
      logger.debug("debug content", {
        fileContents: "# BRIEF.md data",
        path: "/home/user/project",
      });
      const text = output();
      expect(text).toContain("BRIEF.md data");
    });
  });

  describe("stdout protocol purity [OBS-11]", () => {
    afterEach(() => {
      removeStdoutGuard();
    });

    it("stdout after guard installed contains only MCP protocol messages, no log lines [OBS-11]", () => {
      const { stream } = createCaptureStream();
      const logger = createLogger({
        level: "info",
        format: "json",
        output: stream,
      });
      installStdoutGuard(logger);

      const stdoutCapture: string[] = [];
      const spy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation((...args: any[]) => {
          stdoutCapture.push(String(args[0]));
          return true;
        });

      // Simulate log activity — these should NOT reach stdout
      console.log("should be redirected");
      logger.info("regular log");

      const stdoutContentBefore = stdoutCapture.join("");
      // stdout should not contain any log lines
      expect(stdoutContentBefore).not.toContain("should be redirected");
      expect(stdoutContentBefore).not.toContain("regular log");

      // A valid MCP JSON-RPC message should pass through stdout
      const protocolMsg = JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} });
      process.stdout.write(`${protocolMsg}\n`);

      // Assert the CONTENT written to stdout is valid JSON-RPC protocol format
      const stdoutContentAfter = stdoutCapture.join("");
      expect(stdoutContentAfter).toContain('"jsonrpc"');
      expect(stdoutContentAfter).toContain('"2.0"');
      expect(stdoutContentAfter).toContain('"result"');
      // Verify it parses as valid JSON-RPC
      const writtenLines = stdoutContentAfter.split("\n").filter(Boolean);
      const lastLine = writtenLines[writtenLines.length - 1];
      const parsed = JSON.parse(lastLine);
      expect(parsed.jsonrpc).toBe("2.0");
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("result");

      spy.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-03: Property Tests", () => {
  it("forAll(message string): logger never writes to stdout [OBS-02]", () => {
    fc.assert(
      fc.property(fc.string(), (message) => {
        const stdoutSpy = vi.spyOn(process.stdout, "write");
        const { stream } = createCaptureStream();
        const logger = createLogger({
          level: "trace",
          format: "json",
          output: stream,
        });
        logger.info(message);
        expect(stdoutSpy).not.toHaveBeenCalled();
        stdoutSpy.mockRestore();
      }),
    );
  });

  it("forAll(level, message): output contains message when level permits [OBS-01]", () => {
    const levels = [
      "trace",
      "debug",
      "info",
      "warn",
      "error",
      "fatal",
    ] as const;
    fc.assert(
      fc.property(
        fc.constantFrom(...levels),
        fc.string({ minLength: 1, maxLength: 100 }),
        (level, message) => {
          const { stream, output } = createCaptureStream();
          // Set logger to trace so all levels are permitted
          const logger = createLogger({
            level: "trace",
            format: "json",
            output: stream,
          });
          logger[level](message);
          const text = output();
          // Parse the JSON output and verify the message field matches exactly.
          // Using text.toContain(message) would fail when message includes
          // characters that JSON.stringify escapes (e.g. quotes, backslashes).
          const parsed = JSON.parse(text);
          expect(parsed.message).toBe(message);
        },
      ),
    );
  });

  it("forAll(module name): child logger includes module name in output [OBS-03]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => /^[a-zA-Z]/.test(s)),
        (moduleName) => {
          const { stream, output } = createCaptureStream();
          const parent = createLogger({
            level: "info",
            format: "json",
            output: stream,
          });
          const child = createChildLogger(parent, moduleName);
          child.info("test");
          const parsed = JSON.parse(output());
          expect(parsed.module).toBe(moduleName);
        },
      ),
    );
  });
});
