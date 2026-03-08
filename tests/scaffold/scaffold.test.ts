import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { checkNodeVersion } from "../../src/check-node-version";

const ROOT = resolve(__dirname, "../..");
const SRC = join(ROOT, "src");

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-01: Project Scaffold & Architecture", () => {
  describe("package.json [ARCH-01, ARCH-04]", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

    it("engines requires Node 20+ [ARCH-04]", () => {
      expect(pkg.engines).toBeDefined();
      expect(pkg.engines.node).toMatch(/>=\s*20/);
    });

    it("bin maps CLI entry [ARCH-04]", () => {
      expect(pkg.bin).toBeDefined();
      expect(pkg.bin["brief-mcp"]).toMatch(/cli/);
    });

    it("main/module/exports present for dual format [ARCH-04]", () => {
      expect(pkg.main).toBeDefined();
      expect(typeof pkg.main).toBe("string");
      expect(pkg.main).toMatch(/dist\//);
      expect(pkg.module).toBeDefined();
      expect(typeof pkg.module).toBe("string");
      expect(pkg.module).toMatch(/dist\//);

      expect(pkg.exports).toBeDefined();
      expect(pkg.exports["."]).toBeDefined();
      expect(pkg.exports["."].import).toBeDefined();
      expect(typeof pkg.exports["."].import).toBe("string");
      expect(pkg.exports["."].import).toMatch(/\/dist\//);
      expect(pkg.exports["."].require).toBeDefined();
      expect(typeof pkg.exports["."].require).toBe("string");
      expect(pkg.exports["."].require).toMatch(/\/dist\//);
    });

    it("files includes dist [ARCH-04]", () => {
      expect(pkg.files).toContain("dist/");
    });

    it("all required scripts present [ARCH-04]", () => {
      const requiredScripts = [
        "build",
        "build:ts",
        "build:assets",
        "dev",
        "test",
        "lint",
        "typecheck",
      ];
      for (const script of requiredScripts) {
        expect(pkg.scripts[script]).toBeDefined();
        expect(typeof pkg.scripts[script]).toBe("string");
        expect(pkg.scripts[script].trim().length).toBeGreaterThan(0);
      }
    });

    it("MCP SDK in dependencies [MCP-01]", () => {
      expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toBeDefined();
      expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toBe("^1.26.0");
    });
  });

  describe("tsconfig.json [ARCH-04]", () => {
    const tsconfig = JSON.parse(
      readFileSync(join(ROOT, "tsconfig.json"), "utf8"),
    );

    it("strict mode enabled [ARCH-04]", () => {
      expect(tsconfig.compilerOptions.strict).toBe(true);
    });

    it("ESM module target [ARCH-04]", () => {
      expect(tsconfig.compilerOptions.module).toMatch(/^nodenext$/i);
    });
  });

  describe("tsup config [ARCH-04]", () => {
    it("two entry points (server + CLI), both CJS and ESM formats [ARCH-04]", async () => {
      // Dynamic import to handle TS config
      const configPath = join(ROOT, "tsup.config.ts");
      expect(existsSync(configPath)).toBe(true);
      const content = readFileSync(configPath, "utf8");
      // Verify entry points include both server and CLI
      expect(content).toMatch(/index/);
      expect(content).toMatch(/cli/);
      // Verify dual format
      expect(content).toMatch(/cjs/);
      expect(content).toMatch(/esm/);
    });
  });

  describe("src/ directory structure [ARCH-04]", () => {
    const expectedModuleDirs = [
      "types",
      "parser",
      "writer",
      "hierarchy",
      "workspace",
      "context",
      "validation",
      "ontology",
      "reference",
      "type-intelligence",
      "extension",
      "visibility",
      "server",
      "cli",
      "observability",
      "errors",
      "security",
      "config",
      "io",
    ];

    it("all 19 module folders exist [ARCH-04]", () => {
      for (const dir of expectedModuleDirs) {
        const dirPath = join(SRC, dir);
        expect(
          existsSync(dirPath),
          `Missing module directory: src/${dir}/`,
        ).toBe(true);
      }
    });
  });

  describe("entry points [ARCH-04]", () => {
    it("src/index.ts exists and is importable [ARCH-04]", () => {
      expect(existsSync(join(SRC, "index.ts"))).toBe(true);
    });

    it("src/cli.ts exists and is importable [ARCH-04]", () => {
      expect(existsSync(join(SRC, "cli.ts"))).toBe(true);
    });
  });

  describe("git hooks [ARCH-04]", () => {
    it(".husky/pre-commit hook file exists [ARCH-04]", () => {
      const huskyPreCommit = join(ROOT, ".husky", "pre-commit");
      expect(existsSync(huskyPreCommit), "Missing .husky/pre-commit hook").toBe(
        true,
      );
    });

    it(".husky/pre-commit hook runs lint and typecheck [ARCH-04]", () => {
      const huskyPreCommit = join(ROOT, ".husky", "pre-commit");
      if (existsSync(huskyPreCommit)) {
        const content = readFileSync(huskyPreCommit, "utf8");
        // Pre-commit must run at least a lint/typecheck step
        expect(content).toMatch(/lint|typecheck|tsc/i);
      }
    });
  });

  describe("vitest config [ARCH-04]", () => {
    it("vitest.config.ts exists [ARCH-04]", () => {
      const vitestConfig = join(ROOT, "vitest.config.ts");
      expect(existsSync(vitestConfig), "Missing vitest.config.ts").toBe(true);
    });

    it("vitest.config.ts enables globals and includes test pattern [ARCH-04]", () => {
      const vitestConfig = join(ROOT, "vitest.config.ts");
      if (existsSync(vitestConfig)) {
        const content = readFileSync(vitestConfig, "utf8");
        expect(content).toMatch(/globals\s*:\s*true/);
        expect(content).toMatch(/test|spec/i);
      }
    });
  });

  describe("Node.js version check [ARCH-04]", () => {
    it("version check with current runtime (>=20) passes silently [ARCH-04]", () => {
      // Current Node.js should be 20+; this should not throw or exit
      expect(() => checkNodeVersion(20)).not.toThrow();
    });

    it("version check with simulated old version (16) warns to stderr and non-zero exit [ARCH-04]", () => {
      // Mock process.versions.node to simulate Node 16
      const originalVersion = process.versions.node;
      const stderrWrite = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);
      const processExit = vi.spyOn(process, "exit").mockImplementation((() => {
        throw new Error("process.exit called");
      }) as never);

      try {
        Object.defineProperty(process.versions, "node", {
          value: "16.20.0",
          writable: true,
          configurable: true,
        });
        expect(() => checkNodeVersion(20)).toThrow("process.exit called");
        expect(stderrWrite).toHaveBeenCalled();
        expect(processExit).toHaveBeenCalledWith(1);
      } finally {
        Object.defineProperty(process.versions, "node", {
          value: originalVersion,
          writable: true,
          configurable: true,
        });
        stderrWrite.mockRestore();
        processExit.mockRestore();
      }
    });
  });

  describe("scaffold quality [CODE-06, CODE-07]", () => {
    it("TypeScript compiler on scaffold produces no type errors [ARCH-04]", async () => {
      // This is validated by running `npx tsc --noEmit` as a pre-flight check.
      // The test simply verifies the scaffold passes tsc.
      const { execSync } = await import("node:child_process");
      expect(() => {
        execSync("npx tsc --noEmit", { cwd: ROOT, stdio: "pipe" });
      }).not.toThrow();
    }, 30_000);

    it("linter on scaffold produces no violations [ARCH-04]", async () => {
      const { execSync } = await import("node:child_process");
      expect(() => {
        execSync("npx biome check src/", { cwd: ROOT, stdio: "pipe" });
      }).not.toThrow();
    });

    it("all TypeScript source files in src/ have kebab-case filenames [CODE-06]", () => {
      const kebabCaseRegex = /^[a-z][a-z0-9]*(-[a-z0-9]+)*\.ts$/;
      const tsFiles = getAllTsFiles(SRC);
      for (const filePath of tsFiles) {
        const fileName = basename(filePath);
        // index.ts is a special case (barrel file) — always valid
        if (fileName === "index.ts") continue;
        expect(
          kebabCaseRegex.test(fileName),
          `File "${fileName}" does not follow kebab-case naming convention`,
        ).toBe(true);
      }
    });

    it.skip("no source file in src/ exceeds 500 lines at scaffold time [CODE-07]", () => {
      const tsFiles = getAllTsFiles(SRC);
      for (const filePath of tsFiles) {
        const content = readFileSync(filePath, "utf8");
        const lineCount = content.split("\n").length;
        expect(
          lineCount,
          `File "${filePath}" has ${lineCount} lines (limit ~500)`,
        ).toBeLessThanOrEqual(500);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-01: Property Tests", () => {
  it('forAll(version "X.Y.Z" where X >= 20): version check passes [ARCH-04]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 99 }),
        fc.integer({ min: 0, max: 99 }),
        fc.integer({ min: 0, max: 99 }),
        (major, minor, patch) => {
          const originalVersion = process.versions.node;
          try {
            Object.defineProperty(process.versions, "node", {
              value: `${major}.${minor}.${patch}`,
              writable: true,
              configurable: true,
            });
            // Should not throw or exit
            expect(() => checkNodeVersion(20)).not.toThrow();
          } finally {
            Object.defineProperty(process.versions, "node", {
              value: originalVersion,
              writable: true,
              configurable: true,
            });
          }
        },
      ),
    );
  });

  it('forAll(version "X.Y.Z" where X < 20): version check rejects [ARCH-04]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 19 }),
        fc.integer({ min: 0, max: 99 }),
        fc.integer({ min: 0, max: 99 }),
        (major, minor, patch) => {
          const originalVersion = process.versions.node;
          const processExit = vi
            .spyOn(process, "exit")
            .mockImplementation((() => {
              throw new Error("process.exit called");
            }) as never);
          const stderrWrite = vi
            .spyOn(process.stderr, "write")
            .mockImplementation(() => true);
          try {
            Object.defineProperty(process.versions, "node", {
              value: `${major}.${minor}.${patch}`,
              writable: true,
              configurable: true,
            });
            expect(() => checkNodeVersion(20)).toThrow("process.exit called");
          } finally {
            Object.defineProperty(process.versions, "node", {
              value: originalVersion,
              writable: true,
              configurable: true,
            });
            processExit.mockRestore();
            stderrWrite.mockRestore();
          }
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllTsFiles(fullPath));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      results.push(fullPath);
    }
  }
  return results;
}
