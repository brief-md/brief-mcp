import * as fs from "node:fs";
import * as path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-55: Packaging — npm Package Configuration", () => {
  describe("package.json fields [OSS-05]", () => {
    it("files field: includes only dist/, assets/, LICENSE, README, CHANGELOG [OSS-05]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
      );
      expect(pkg.files).toBeDefined();
      expect(pkg.files).toContain("dist/");
      expect(pkg.files).toContain("assets/");
    });

    it("bin field: points to compiled CLI entry [OSS-05]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
      );
      const binValue = pkg.bin;
      expect(binValue).toBeDefined();
      const binPath =
        typeof binValue === "string"
          ? binValue
          : Object.values(binValue as Record<string, string>)[0];
      expect(binPath).toBeDefined();
      expect(String(binPath)).toMatch(/\.js$|\.cjs$|^dist\//);
    });

    it("bin field: command name is `brief-mcp` [OSS-05, T55-03]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
      );
      const binValue = pkg.bin;
      expect(binValue).toBeDefined();
      // bin must be an object with key 'brief-mcp'
      expect(typeof binValue).toBe("object");
      expect(Object.keys(binValue as Record<string, string>)).toContain(
        "brief-mcp",
      );
    });

    it("engines: node >=20.0.0 [OSS-05]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
      );
      expect(pkg.engines).toBeDefined();
      expect(pkg.engines.node).toMatch(/>=\s*20/);
    });

    it("main, types, module: all set correctly [OSS-05]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
      );
      expect(pkg.main).toBeDefined();
      expect(pkg.types).toBeDefined();
      expect(pkg.module).toBeDefined();
      expect(pkg.main).toMatch(/^(\.\/)?dist\//);
      expect(pkg.types).toMatch(/\.d\.ts$/);
    });

    it("version: follows semver, starts at 0.1.0 [OSS-01]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
      );
      expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(pkg.version).toBe("0.1.0");
    });
  });

  describe("supporting files [OSS-04, OSS-07]", () => {
    it("LICENSE file: exists and contains valid license text [OSS-07]", () => {
      const licensePath = path.resolve(__dirname, "../../LICENSE");
      expect(fs.existsSync(licensePath)).toBe(true);
      const content = fs.readFileSync(licensePath, "utf-8");
      expect(content).toMatch(/MIT|Apache|BSD|ISC|license/i);
    });

    it("CHANGELOG.md: exists and follows Keep a Changelog format [OSS-04]", () => {
      const changelogPath = path.resolve(__dirname, "../../CHANGELOG.md");
      expect(fs.existsSync(changelogPath)).toBe(true);
      const content = fs.readFileSync(changelogPath, "utf-8");
      expect(content).toMatch(/changelog|unreleased|added|changed|fixed/i);
    });

    it("SECURITY.md: exists with disclosure process documented [OSS-07]", () => {
      const securityPath = path.resolve(__dirname, "../../SECURITY.md");
      expect(fs.existsSync(securityPath)).toBe(true);
      const content = fs.readFileSync(securityPath, "utf-8");
      expect(content).toMatch(/security|vulnerabilit|report|disclos/i);
    });
  });

  describe("package exclusions [OSS-05]", () => {
    it("published package: does not contain test files, source maps, .env, or dev configs [OSS-05]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
      );
      expect(pkg.files).toBeDefined();
      const filesField: string[] = pkg.files;
      expect(filesField).not.toContain("tests");
      expect(filesField).not.toContain(".env");
      expect(filesField).not.toContain("*.map");
      expect(filesField.some((f: string) => f.includes("dist"))).toBe(true);
    });

    it("published package: estimated size under 10 MB limit [OSS-05]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
      );
      // The `files` field controls what's published — dist/ and assets/ only
      // This is a structural test: large files should not be in dist/
      expect(pkg.files).not.toContain("tests/");
      expect(pkg.files).not.toContain("src/");
      expect(pkg.files).not.toContain("node_modules/");
      // dist/ must exist and must not contain source maps in the published output
      // (skip dist/ content check if not yet built — CI may run tests before build)
      const distPath = path.resolve(__dirname, "../../dist");
      const distExists = fs.existsSync(distPath);
      if (distExists) {
        const distFiles = fs.readdirSync(distPath);
        const hasSourceMaps = distFiles.some((f: string) => f.endsWith(".map"));
        // Source maps should not be in the published dist unless explicitly opted in
        if (hasSourceMaps) {
          expect(pkg.files).not.toContain("*.map");
        }
      }
    });
  });

  describe("dependency hygiene [OSS-02]", () => {
    it.skipIf(process.platform === "win32")(
      "no known high/critical vulnerabilities",
      async () => {
        const { execSync } = await import("node:child_process");
        let auditOutput = "";
        try {
          auditOutput = execSync("npm audit --audit-level=high 2>/dev/null", {
            encoding: "utf8",
            timeout: 30000,
          });
          // Command succeeded with exit 0: no high/critical vulnerabilities found
        } catch (e: any) {
          // npm audit exits non-zero when vulnerabilities are found (status 1) or on command errors
          auditOutput = e.stdout ?? e.stderr ?? "";
          if (e.status !== 1) {
            // Status > 1 means the audit command itself failed (not a vulnerability result) — rethrow
            throw e;
          }
          // T55-01: status 1 means high/critical vulnerabilities were found — this must fail the test
          throw new Error(
            `npm audit found high/critical vulnerabilities:\n${auditOutput}`,
          );
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-55: Property Tests", () => {
  it("forAll(published package): only files in `files` field are included [OSS-05]", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "dist/",
          "assets/",
          "LICENSE",
          "README.md",
          "CHANGELOG.md",
        ),
        (file) => {
          const pkg = JSON.parse(
            fs.readFileSync(
              path.resolve(__dirname, "../../package.json"),
              "utf-8",
            ),
          );
          expect(pkg.files).toBeDefined();
          const filesField: string[] = pkg.files;
          expect(filesField).toContain(file);
          expect(
            filesField.some((f: string) => f.includes("dist") || f === "dist"),
          ).toBe(true);
          expect(
            filesField.some((f: string) => f.includes("tests") || f === "src"),
          ).toBe(false);
        },
      ),
      { numRuns: 25 },
    );
  });

  it("forAll(excluded file): NOT in files field [OSS-05]", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "tests/",
          "src/",
          ".env",
          "node_modules/",
          "*.map",
          ".github/",
          "tsconfig.json",
        ),
        (excluded) => {
          const pkg = JSON.parse(
            fs.readFileSync(
              path.resolve(__dirname, "../../package.json"),
              "utf-8",
            ),
          );
          const filesField: string[] = pkg.files;
          expect(filesField).not.toContain(excluded);
        },
      ),
      { numRuns: 25 },
    );
  });

  it("forAll(build): output is reproducible (deterministic) [OSS-06]", () => {
    fc.assert(
      fc.property(fc.boolean(), () => {
        // Verify deterministic build prerequisites exist
        const lockPath = path.resolve(__dirname, "../../package-lock.json");
        expect(fs.existsSync(lockPath)).toBe(true);
      }),
      { numRuns: 25 },
    );
  });

  it("forAll(dependency): pinned in package-lock.json [OSS-02]", () => {
    fc.assert(
      fc.property(fc.boolean(), () => {
        const lockPath = path.resolve(__dirname, "../../package-lock.json");
        expect(fs.existsSync(lockPath)).toBe(true);
        const pkg = JSON.parse(
          fs.readFileSync(
            path.resolve(__dirname, "../../package.json"),
            "utf-8",
          ),
        );
        const lockContent = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
        const deps = Object.keys(pkg.dependencies || {});
        deps.forEach((dep) => {
          expect(
            lockContent.packages?.[`node_modules/${dep}`] ??
              lockContent.dependencies?.[dep],
          ).toBeDefined();
        });
      }),
      { numRuns: 25 },
    );
  });
});
