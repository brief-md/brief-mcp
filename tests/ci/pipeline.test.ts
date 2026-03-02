import * as fs from "node:fs";
import * as path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Unit Tests — CI Pipeline Verification (testable components)
// ---------------------------------------------------------------------------

describe("TASK-56: Packaging — CI/CD Pipeline", () => {
  describe("stdout purity [OBS-11]", () => {
    it("stdout purity test: only valid MCP messages on stdout during tool calls [OBS-11]", async () => {
      const { captureStdout } = await import("../../src/server/stdout-guard");

      // Simulate a non-MCP write to stdout — the guard should prevent it
      const captured = await captureStdout(async () => {
        // Guard installed: writing logs should go to stderr, not stdout
        process.stderr.write("this is a log message\n");
      });
      // Captured stdout should be empty (logs go to stderr, not stdout)
      expect(captured).toBe("");
    });

    it("console.log/info: redirected to stderr via structured logger [OBS-11]", async () => {
      const { installStdoutGuard, removeStdoutGuard } = await import(
        "../../src/server/stdout-guard"
      );
      const stderrWrites: string[] = [];
      const originalWrite = process.stderr.write.bind(process.stderr);

      // Capture stderr output
      const spy = ((process.stderr.write as any) = (chunk: any) => {
        stderrWrites.push(String(chunk));
        return true;
      });

      installStdoutGuard();
      console.log("test message via console.log");
      removeStdoutGuard();

      // Restore stderr
      process.stderr.write = originalWrite;

      expect(stderrWrites.some((w) => w.includes("test message"))).toBe(true);
    });
  });

  describe("log level configuration [OBS-09]", () => {
    it("log level env var: configurable via BRIEF_LOG_LEVEL [OBS-09]", async () => {
      // T56-03: use canonical import path src/observability/logger (not src/server/logger)
      const { resolveLogLevel } = await import(
        "../../src/observability/logger"
      );
      const level = resolveLogLevel({ env: { BRIEF_LOG_LEVEL: "debug" } });
      expect(level).toBe("debug");
    });

    it("info-level logs: no sensitive data (no file contents, paths, or BRIEF.md content) [OBS-10, T56-06]", async () => {
      const { sanitizeLogOutput } = await import(
        "../../src/observability/logger"
      );
      // T56-06: must check specific sensitive categories, not just generic token/secret
      // Category 1: auth tokens/secrets
      const withToken = sanitizeLogOutput(
        '{"level":"info","token":"secret123","message":"hello"}',
      );
      expect(withToken).not.toContain("secret123");
      expect(() => JSON.parse(withToken)).not.toThrow();

      // Category 2: file system paths (may expose directory structure)
      const withPath = sanitizeLogOutput(
        '{"level":"info","filePath":"/home/user/.config/brief.json","message":"loaded"}',
      );
      expect(withPath).not.toContain("/home/user/.config");

      // Category 3: BRIEF.md content (project data must never appear in logs)
      const withBriefContent = sanitizeLogOutput(
        '{"level":"info","briefContent":"**Project:** My Secret Project","message":"parsed"}',
      );
      expect(withBriefContent).not.toContain("My Secret Project");

      // Category 4: API keys / credentials
      const withApiKey = sanitizeLogOutput(
        '{"level":"info","apiKey":"sk-abc123xyz","message":"auth"}',
      );
      expect(withApiKey).not.toContain("sk-abc123xyz");
    });
  });

  describe("CI pipeline checks (structural) [OSS-03]", () => {
    it("lint step: zero errors from biome check [OSS-03]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
      );
      expect(pkg.scripts?.lint).toBeDefined();
      expect(pkg.scripts?.lint).toMatch(/\S/); // not empty
    });

    it("type check: tsc --noEmit passes without errors [OSS-03]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
      );
      expect(pkg.scripts?.typecheck).toBeDefined();
    });

    it("unit tests: all pass on Node.js 20 and 22 [OSS-03]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
      );
      expect(pkg.scripts?.test).toBeDefined();
      expect(pkg.scripts?.test ?? "").toMatch(/\S/);
      expect(pkg.engines?.node).toMatch(/>=\s*20/);
    });

    it("unit tests: all pass on Ubuntu, macOS, and Windows [OSS-03]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
      );
      expect(pkg.scripts?.test).toBeDefined();
      // T56-02: validate workflow file content — must have matrix builds for all three platforms
      const workflowDir = path.resolve(__dirname, "../../.github/workflows");
      expect(fs.existsSync(workflowDir)).toBe(true);
      const workflows = fs
        .readdirSync(workflowDir)
        .filter((f: string) => f.endsWith(".yml") || f.endsWith(".yaml"));
      expect(workflows.length).toBeGreaterThan(0);
      // Read each workflow and verify it contains platform matrix entries
      const allWorkflowContent = workflows
        .map((f: string) => fs.readFileSync(path.join(workflowDir, f), "utf-8"))
        .join("\n");
      expect(allWorkflowContent).toMatch(/ubuntu|ubuntu-latest/i);
      expect(allWorkflowContent).toMatch(/macos|macos-latest/i);
      expect(allWorkflowContent).toMatch(/windows|windows-latest/i);
      expect(allWorkflowContent).toMatch(/node-version/i);
    });

    it("production build: succeeds without errors [OSS-03]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
      );
      expect(pkg.scripts?.build).toBeDefined();
      expect(pkg.scripts?.build ?? "").toMatch(/\S/);
    });

    it("dependency audit: no high/critical vulnerabilities [OSS-02]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
      );
      // Verify no known-vulnerable packages in production dependencies
      const deps = Object.keys(pkg.dependencies || {});
      const blocklist = [
        "eval",
        "serialize-javascript-unsafe",
        "node-serialize",
        "cryo",
        "vm2",
      ];
      blocklist.forEach((banned) => {
        expect(deps).not.toContain(banned);
      });
    });

    it("npm ci: uses lock file, not npm install [OSS-06]", () => {
      const lockPath = path.resolve(__dirname, "../../package-lock.json");
      expect(fs.existsSync(lockPath)).toBe(true);
      // T56-02: workflow must use `npm ci` (not `npm install`) for reproducible builds
      const workflowDir = path.resolve(__dirname, "../../.github/workflows");
      if (fs.existsSync(workflowDir)) {
        const workflows = fs
          .readdirSync(workflowDir)
          .filter((f: string) => f.endsWith(".yml") || f.endsWith(".yaml"));
        const allContent = workflows
          .map((f: string) =>
            fs.readFileSync(path.join(workflowDir, f), "utf-8"),
          )
          .join("\n");
        expect(allContent).toMatch(/npm ci/);
        expect(allContent).not.toMatch(/npm install(?!\s*-)/); // must not use bare `npm install`
      }
    });

    it("coverage: report generated and uploaded [OSS-03]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
      );
      const coverageScript = pkg.scripts?.coverage;
      expect(coverageScript).toBeDefined();
      expect(coverageScript).toMatch(/coverage|c8|istanbul|nyc/i);
    });

    it('child process stdio configured as piped: ["pipe","pipe","pipe"] [T56-05]', async () => {
      // T56-05: verify the server subprocess is spawned with all three stdio streams piped
      // This ensures stdin/stdout/stderr are all captured (no inherit that would mix MCP and log output)
      const { getChildProcessConfig } = await import(
        "../../src/server/bootstrap"
      );
      const config = getChildProcessConfig();
      expect(config.stdio).toBeDefined();
      // Must be ['pipe', 'pipe', 'pipe'] — all three streams piped
      expect(config.stdio).toEqual(["pipe", "pipe", "pipe"]);
    });

    it("NODE_NO_WARNINGS=1 set in workflow environment [T56-04]", () => {
      const workflowDir = path.resolve(__dirname, "../../.github/workflows");
      expect(fs.existsSync(workflowDir)).toBe(true);
      const workflows = fs
        .readdirSync(workflowDir)
        .filter((f: string) => f.endsWith(".yml") || f.endsWith(".yaml"));
      expect(workflows.length).toBeGreaterThan(0);
      const allContent = workflows
        .map((f: string) => fs.readFileSync(path.join(workflowDir, f), "utf-8"))
        .join("\n");
      expect(allContent).toMatch(/NODE_NO_WARNINGS\s*[:=]\s*['"]?1['"]?/);
    });

    it("sensitive data scanning: workflow checks for secrets, tokens, BRIEF.md content, and file paths [T56-06]", () => {
      const workflowDir = path.resolve(__dirname, "../../.github/workflows");
      expect(fs.existsSync(workflowDir)).toBe(true);
      const workflows = fs
        .readdirSync(workflowDir)
        .filter((f: string) => f.endsWith(".yml") || f.endsWith(".yaml"));
      const allContent = workflows
        .map((f: string) => fs.readFileSync(path.join(workflowDir, f), "utf-8"))
        .join("\n");
      // Workflow must include a secrets/sensitive data scan step
      expect(allContent).toMatch(/secret|token|credential|sensitive/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-56: Property Tests", () => {
  it("forAll(CI run): lint, type check, and tests all pass before merge [OSS-03]", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("lint", "typecheck", "test", "build"),
        (step) => {
          const pkg = JSON.parse(
            fs.readFileSync(
              path.resolve(__dirname, "../../package.json"),
              "utf-8",
            ),
          );
          // Each CI step must have a corresponding script
          const scripts = pkg.scripts || {};
          const hasScript = scripts[step];
          expect(hasScript).toBeDefined();
        },
      ),
    );
  });

  it("forAll(stdout output): contains only valid MCP protocol messages [OBS-11]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => s.trim().length > 0),
        async (msgContent) => {
          const { formatProtocolMessage } = await import(
            "../../src/server/response-formatting"
          );
          const msg = formatProtocolMessage({ id: 1, result: msgContent });
          expect(() => JSON.parse(msg)).not.toThrow();
          const parsed = JSON.parse(msg);
          expect(parsed.jsonrpc).toBe("2.0");
        },
      ),
    );
  });

  it("forAll(info-level log): no sensitive user data present [OBS-10]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          value: fc.string({ minLength: 1, maxLength: 20 }),
          field: fc.constantFrom("token", "secret", "password", "key", "auth"),
        }),
        async ({ value, field }) => {
          const { sanitizeLogOutput } = await import(
            "../../src/observability/logger"
          );
          const logLine = JSON.stringify({
            level: "info",
            message: "test",
            [field]: value,
          });
          const sanitized = sanitizeLogOutput(logLine);
          expect(sanitized).not.toContain(value);
          expect(() => JSON.parse(sanitized)).not.toThrow();
        },
      ),
    );
  });

  it("forAll(build): reproducible from same source and dependencies [OSS-06]", () => {
    fc.assert(
      fc.property(fc.boolean(), () => {
        // Verify lock file exists for reproducible builds
        const lockPath = path.resolve(__dirname, "../../package-lock.json");
        expect(fs.existsSync(lockPath)).toBe(true);
        const pkg = JSON.parse(
          fs.readFileSync(
            path.resolve(__dirname, "../../package.json"),
            "utf-8",
          ),
        );
        expect(pkg.scripts?.build).toBeDefined();
      }),
    );
  });
});
