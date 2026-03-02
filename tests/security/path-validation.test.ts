import os from "node:os";
import { join, resolve } from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mock functions — available before vi.mock factory runs
const { realpathMock, chmodMock, existsSyncMock } = vi.hoisted(() => ({
  realpathMock: vi.fn(),
  chmodMock: vi.fn(),
  existsSyncMock: vi.fn(),
}));

// Mock node:fs at the module level (hoisted by Vitest).
// The implementation does `import fs from "node:fs"` and accesses
// fs.existsSync, fs.promises.realpath, fs.promises.chmod.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: existsSyncMock,
      promises: {
        ...actual.promises,
        realpath: realpathMock,
        chmod: chmodMock,
      },
    },
  };
});

import {
  checkSecurityLimits,
  createFdSemaphore,
  setFilePermissions,
  slugify,
  toNativePath,
  toStoragePath,
  validatePath,
  withEmfileRetry,
} from "../../src/security/path-validation";

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-05a: Security — Path Validation & Resource Limits", () => {
  beforeEach(() => {
    // Default: paths don't exist on disk
    existsSyncMock.mockReturnValue(false);
  });

  afterEach(() => {
    realpathMock.mockReset();
    chmodMock.mockReset();
    existsSyncMock.mockReset();
  });

  const workspaceRoot = resolve("/workspace/project");
  // Use actual homedir so ~/.brief/ matches cross-platform
  const briefHome = resolve(os.homedir(), ".brief");

  describe("path traversal prevention [SEC-01]", () => {
    it("path traversal ../../../etc/passwd from workspace root is rejected with security error [SEC-01]", async () => {
      await expect(
        validatePath("../../../etc/passwd", [workspaceRoot]),
      ).rejects.toThrow(/security/i);
    });

    it("path with .. that stays inside workspace is accepted after resolution [SEC-01]", async () => {
      // e.g., /workspace/project/subdir/../file.md resolves to /workspace/project/file.md
      const result = await validatePath(
        join(workspaceRoot, "subdir", "..", "file.md"),
        [workspaceRoot],
      );
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      expect(result.startsWith(workspaceRoot)).toBe(true);
    });

    it("Windows 8.3 short filename resolving outside workspace is rejected after realpath [SEC-01]", async () => {
      // Simulate a file that exists and whose realpath resolves outside workspace
      existsSyncMock.mockReturnValue(true);
      realpathMock.mockResolvedValueOnce("/outside/secret/file.md");

      await expect(
        validatePath("SHORTF~1.md", [workspaceRoot]),
      ).rejects.toThrow(/security/i);
    });

    it("symlink pointing outside workspace root is rejected after realpath [SEC-01]", async () => {
      existsSyncMock.mockReturnValue(true);
      realpathMock.mockResolvedValueOnce("/etc/shadow");

      await expect(
        validatePath(join(workspaceRoot, "link.md"), [workspaceRoot]),
      ).rejects.toThrow(/security/i);
    });

    it("path within ~/.brief/ is accepted regardless of workspace roots [SEC-01]", async () => {
      const result = await validatePath(join(briefHome, "config.json"), [
        workspaceRoot,
      ]);
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      expect(result.startsWith(briefHome)).toBe(true);
    });

    it("path outside all allowed roots is rejected with error naming the path [SEC-01]", async () => {
      const attemptedPath = "/completely/different/path.md";
      await expect(
        validatePath(attemptedPath, [workspaceRoot]),
      ).rejects.toThrow(attemptedPath);
    });
  });

  describe("cross-platform path handling [FS-06]", () => {
    it("forward slashes and backslashes are normalized correctly [FS-06]", () => {
      const storage = toStoragePath("path\\to\\file.md");
      // Storage paths must always use forward slashes and never have double slashes
      expect(storage).toBe("path/to/file.md");
      expect(storage).not.toContain("\\");
      expect(storage).not.toMatch(/\/\//);

      // toStoragePath is idempotent on forward-slash input
      const storageAlreadyForward = toStoragePath("path/to/file.md");
      expect(storageAlreadyForward).toBe("path/to/file.md");
      expect(storageAlreadyForward).not.toContain("\\");
      expect(storageAlreadyForward).not.toMatch(/\/\//);

      const native = toNativePath("path/to/file.md");
      // On the current platform, should use native separators
      if (process.platform === "win32") {
        expect(native).toContain("\\");
      } else {
        expect(native).not.toContain("\\");
      }
    });
  });

  describe("resource limits [SEC-17]", () => {
    it("file size exactly at limit (10,485,760 bytes) is accepted; one byte over is rejected [SEC-17]", () => {
      expect(() => checkSecurityLimits({ fileSize: 10_485_760 })).not.toThrow();
      expect(() => checkSecurityLimits({ fileSize: 10_485_761 })).toThrow(
        /file.*size/i,
      );
    });

    it("section count 500 is accepted; 501 is rejected naming the limit [SEC-17]", () => {
      expect(() => checkSecurityLimits({ sectionCount: 500 })).not.toThrow();
      expect(() => checkSecurityLimits({ sectionCount: 501 })).toThrow(
        /section/i,
      );
    });

    it("chain depth 100 is accepted; 101 is rejected naming the limit [SEC-17]", () => {
      expect(() => checkSecurityLimits({ chainDepth: 100 })).not.toThrow();
      expect(() => checkSecurityLimits({ chainDepth: 101 })).toThrow(
        /chain.*depth/i,
      );
    });
  });

  describe("slugification [SEC-01]", () => {
    it('slugify "My Cool Project!" produces `my-cool-project` [SEC-01]', () => {
      expect(slugify("My Cool Project!")).toBe("my-cool-project");
    });

    it("accented text is converted to ASCII hyphens [SEC-01]", () => {
      const result = slugify("Café Résumé");
      expect(result).toMatch(/^[a-z0-9-]+$/);
      expect(result).toContain("cafe");
    });

    it('Windows reserved "CON" produces safe variant [SEC-01]', () => {
      const result = slugify("CON");
      expect(result).not.toBe("con");
      expect(result).toContain("project");
    });

    it("empty input produces fallback name [SEC-01]", () => {
      expect(slugify("")).toBe("unnamed-project");
      expect(slugify("   ")).toBe("unnamed-project");
    });
  });

  describe("file permissions [SEC-05]", () => {
    it("Unix file permissions: 600 for files, 700 for dirs; Windows: no-op [SEC-05]", async () => {
      if (process.platform !== "win32") {
        chmodMock.mockResolvedValue(undefined);

        await setFilePermissions("/tmp/test.json", "file");
        expect(chmodMock).toHaveBeenCalledWith("/tmp/test.json", 0o600);

        await setFilePermissions("/tmp/testdir", "dir");
        expect(chmodMock).toHaveBeenCalledWith("/tmp/testdir", 0o700);
      } else {
        // Windows: should be a no-op
        await expect(
          setFilePermissions("C:\\test.json", "file"),
        ).resolves.toBeUndefined();
      }
    });
  });

  describe("file descriptor semaphore [SEC-17]", () => {
    it("semaphore at capacity 50: all proceed; 51st waits for release [SEC-17]", async () => {
      const semaphore = createFdSemaphore(50);
      const releases: Array<() => void> = [];

      // Acquire 50 permits
      for (let i = 0; i < 50; i++) {
        const release = await semaphore.acquire();
        releases.push(release);
      }

      // 51st should not resolve immediately
      let acquired51 = false;
      const acquire51 = semaphore.acquire().then((release) => {
        acquired51 = true;
        return release;
      });

      // Give it a tick
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(acquired51).toBe(false);

      // Release one — 51st should now proceed
      releases[0]();
      const release51 = await acquire51;
      expect(acquired51).toBe(true);

      // Clean up
      for (let i = 1; i < releases.length; i++) releases[i]();
      release51();
    });

    it("EMFILE during read is retried with delay before failing [SEC-17]", async () => {
      let attempts = 0;
      const alwaysEmfile = async () => {
        attempts++;
        const err: any = new Error("too many open files");
        err.code = "EMFILE";
        throw err;
      };
      await expect(
        withEmfileRetry(alwaysEmfile, { maxRetries: 3, delay: 10 }),
      ).rejects.toMatchObject({ code: "EMFILE" });
      expect(attempts).toBe(4); // initial + 3 retries
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-05a: Property Tests", () => {
  beforeEach(() => {
    existsSyncMock.mockReturnValue(false);
  });

  afterEach(() => {
    realpathMock.mockReset();
    chmodMock.mockReset();
    existsSyncMock.mockReset();
  });

  it("forAll(path within allowed root): validation succeeds [SEC-01]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => !s.includes("..") && /^[a-zA-Z0-9_-]+$/.test(s)),
        async (filename) => {
          const root = resolve("/workspace");
          const testPath = join(root, `${filename}.md`);
          // Mock: path exists and realpath returns it as-is
          existsSyncMock.mockReturnValueOnce(true);
          realpathMock.mockResolvedValueOnce(testPath);
          const result = await validatePath(testPath, [root]);
          expect(result).toBeDefined();
          expect(typeof result).toBe("string");
          expect(result.startsWith(root)).toBe(true);
        },
      ),
    );
  });

  it("forAll(path resolved outside all roots): validation rejects [SEC-01]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)),
        async (filename) => {
          const root = resolve("/workspace");
          const outsidePath = resolve("/outside", `${filename}.md`);
          // Mock: path exists and realpath confirms it's outside
          existsSyncMock.mockReturnValueOnce(true);
          realpathMock.mockResolvedValueOnce(outsidePath);
          await expect(validatePath(outsidePath, [root])).rejects.toThrow();
        },
      ),
    );
  });

  it("forAll(name string): slugify output matches [a-z0-9-]+ and is never empty [SEC-01]", () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        const result = slugify(name);
        expect(result.length).toBeGreaterThan(0);
        expect(result).toMatch(/^[a-z0-9-]+$/);
      }),
    );
  });

  it("forAll(values at or below limits): limits check passes; above any limit fails [SEC-17]", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_485_760 }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 100 }),
        (fileSize, sectionCount, chainDepth) => {
          expect(() =>
            checkSecurityLimits({ fileSize, sectionCount, chainDepth }),
          ).not.toThrow();
        },
      ),
    );

    fc.assert(
      fc.property(
        fc.integer({ min: 10_485_761, max: 100_000_000 }),
        (fileSize) => {
          expect(() => checkSecurityLimits({ fileSize })).toThrow();
        },
      ),
    );
  });
});
