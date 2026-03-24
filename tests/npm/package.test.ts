import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// npm Package Tests [T55-02]
//
// Task spec (TASK-55) requires these tests at tests/npm/ (not tests/packaging/).
// This is the canonical location per the task spec directory structure.
// Additional packaging tests are in tests/packaging/npm-package.test.ts.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, "../..");

describe("TASK-55: npm Package — Canonical Test Location [T55-02]", () => {
  describe("bin field verification [OSS-05, T55-03]", () => {
    it("bin field exists with `brief-mcp` command name [OSS-05, T55-03]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"),
      );
      expect(pkg.bin).toBeDefined();
      expect(typeof pkg.bin).toBe("object");
      // T55-03: command name must be 'brief-mcp'
      expect(Object.keys(pkg.bin as Record<string, string>)).toContain(
        "brief-mcp",
      );
    });

    it("brief-mcp bin entry points to dist/ CLI file [OSS-05]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"),
      );
      const binValue = pkg.bin as Record<string, string>;
      const briefMcpPath = binValue["brief-mcp"];
      expect(briefMcpPath).toBeDefined();
      expect(briefMcpPath).toMatch(/^dist\/|\.js$|\.cjs$/);
    });
  });

  describe("package.json core fields [OSS-05]", () => {
    it("name field: @brief-md/mcp [OSS-05]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"),
      );
      expect(pkg.name).toBe("@brief-md/mcp");
    });

    it("version field: valid semver [OSS-01]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"),
      );
      expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it("files field: includes dist/ and assets/ [OSS-05]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"),
      );
      expect(pkg.files).toContain("dist/");
      expect(pkg.files).toContain("assets/");
    });

    it("engines.node: >=20.0.0 [OSS-05]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"),
      );
      expect(pkg.engines?.node).toMatch(/>=\s*20/);
    });
  });

  describe("npx usage modes [OSS-05]", () => {
    it("npx cold-start: package.json has npx-compatible bin entry [OSS-05]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"),
      );
      // npx requires bin to be defined as an object or string at root
      expect(pkg.bin).toBeDefined();
      // The entry must point to a runnable file (not a .ts file)
      const binPath =
        typeof pkg.bin === "string"
          ? pkg.bin
          : Object.values(pkg.bin as Record<string, string>)[0];
      expect(binPath).not.toMatch(/\.ts$/);
    });

    it("global install: package-level exports and main are defined [OSS-05]", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"),
      );
      expect(pkg.main).toBeDefined();
      expect(pkg.main).toMatch(/^dist\//);
    });
  });
});
