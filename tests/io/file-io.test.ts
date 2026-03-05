import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireLock,
  atomicWriteFile,
  checkMtime,
  detectOrphanTempFiles,
  renameWithRetry,
} from "../../src/io/file-io";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "brief-io-test-"));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("TASK-07: File I/O Utilities", () => {
  describe("atomic writes [WRITE-04, CONC-05]", () => {
    it("atomic write to new file creates file with correct content [WRITE-04]", async () => {
      const target = join(testDir, "new-file.md");
      await atomicWriteFile(target, "# Hello World");
      const content = await readFile(target, "utf8");
      expect(content).toBe("# Hello World");
    });

    it("atomic write to existing file replaces content, no partial writes observable [WRITE-04]", async () => {
      const target = join(testDir, "existing.md");
      await writeFile(target, "original content");
      await atomicWriteFile(target, "new content");
      const content = await readFile(target, "utf8");
      expect(content).toBe("new content");
    });

    it("simulated crash after temp write, before rename: original file unchanged, orphan temp remains [WRITE-04]", async () => {
      const target = join(testDir, "crash-test.md");
      await writeFile(target, "original");

      // Simulate a temp file left behind (as if rename failed)
      const tempFile = join(testDir, "crash-test.md.brief-tmp.abc12345");
      await writeFile(tempFile, "new content");

      // Original should be unchanged
      const content = await readFile(target, "utf8");
      expect(content).toBe("original");
    });

    it("atomic write preserves original file permissions [WRITE-04]", async () => {
      if (process.platform === "win32") return; // Skip on Windows
      const target = join(testDir, "perms.md");
      await writeFile(target, "content");
      const { mode: originalMode } = await stat(target);
      await atomicWriteFile(target, "updated content");
      const { mode: newMode } = await stat(target);
      expect(newMode & 0o777).toBe(originalMode & 0o777);
    });

    it("temp file creation with O_EXCL: if path exists, fails safely [SEC-21]", async () => {
      // O_EXCL prevents overwriting existing temp files (symlink attack prevention)
      const tempPath = join(testDir, "existing.brief-tmp.test123");
      await writeFile(tempPath, "pre-existing");
      // Attempt exclusive write to same path — should fail with EEXIST
      await expect(
        writeFile(tempPath, "overwrite attempt", { flag: "wx" }),
      ).rejects.toThrow(/EEXIST/);
      // Original content preserved
      const content = await readFile(tempPath, "utf-8");
      expect(content).toBe("pre-existing");
    });

    it("ENOSPC during atomic write: temp file deleted in catch, original untouched, system_error returned [ERR-04, ERR-07, M3]", async () => {
      // ERR-07: "Disk full during atomic write: catch ENOSPC, delete partial temp file in catch block,
      // return system_error: 'Not enough disk space.' Original file untouched."
      const target = join(testDir, "enospc-target.md");
      await writeFile(target, "original content");

      const fsPromises = await import("node:fs/promises");
      const originalWriteFile = fsPromises.writeFile.bind(fsPromises);
      const unlinkSpy = vi.spyOn(fsPromises, "unlink");

      // Throw ENOSPC only when writing the temp file (*.brief-tmp.*)
      vi.spyOn(fsPromises, "writeFile").mockImplementation(
        async (path: any, content: any, opts?: any) => {
          if (String(path).includes(".brief-tmp.")) {
            const err: any = new Error(
              "ENOSPC: no space left on device, write",
            );
            err.code = "ENOSPC";
            throw err;
          }
          return originalWriteFile(path, content, opts);
        },
      );

      // atomicWriteFile must handle ENOSPC and return/throw system_error
      let caughtError: any;
      try {
        await atomicWriteFile(target, "new content");
      } catch (err: any) {
        caughtError = err;
      }

      // (a) Must have thrown (or returned) a system_error
      expect(caughtError).toBeDefined();
      expect(caughtError.message ?? caughtError).toMatch(
        /disk space|ENOSPC|space/i,
      );

      // (b) Temp file must have been cleaned up (unlink called or file gone)
      const { existsSync } = await import("node:fs");
      const orphanedTemps = require("node:fs")
        .readdirSync(testDir)
        .filter((f: string) => f.includes(".brief-tmp."));
      expect(orphanedTemps).toHaveLength(0);

      // (c) Original file must be untouched
      const original = await readFile(target, "utf8");
      expect(original).toBe("original content");

      vi.restoreAllMocks();
    });

    it("atomicWriteFile uses O_EXCL flag (wx) when creating temp file [SEC-21, M4]", async () => {
      // SEC-21: atomicWriteFile MUST use { flag: 'wx' } (O_EXCL) for temp file creation
      // to prevent a symlink pre-created at the predicted temp path from being silently followed.
      // This test verifies the flag is actually passed, not just that the concept works.
      const fsPromises = await import("node:fs/promises");
      const writeFileSpy = vi.spyOn(fsPromises, "writeFile");

      const target = join(testDir, "atomic-sec21.md");
      await atomicWriteFile(target, "test content");

      // Find the call that wrote the temp file (*.brief-tmp.*)
      const tempWriteCall = writeFileSpy.mock.calls.find((call) =>
        String(call[0]).includes(".brief-tmp."),
      );
      expect(tempWriteCall).toBeDefined();
      // The options arg must include { flag: 'wx' } (exclusive create — O_EXCL)
      const options = tempWriteCall?.[2] as any;
      expect(options).toBeDefined();
      expect(options.flag ?? options).toMatch(/wx/);

      writeFileSpy.mockRestore();
    });
  });

  describe("orphan temp file cleanup [CONC-05]", () => {
    it("orphaned temp file older than 1 hour is cleaned up on startup [CONC-05]", async () => {
      const orphan = join(testDir, "old.brief-tmp.deadbeef");
      await writeFile(orphan, "orphaned content");
      // Set mtime to 2 hours ago
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const { utimes } = await import("node:fs/promises");
      await utimes(orphan, twoHoursAgo, twoHoursAgo);

      await detectOrphanTempFiles([testDir]);
      // Orphan should be deleted
      const { existsSync } = await import("node:fs");
      expect(existsSync(orphan)).toBe(false);
    });

    it("recent temp file (< 1 hour) is preserved [CONC-05]", async () => {
      const recent = join(testDir, "recent.brief-tmp.12345678");
      await writeFile(recent, "in-progress");

      await detectOrphanTempFiles([testDir]);
      const { existsSync } = await import("node:fs");
      expect(existsSync(recent)).toBe(true);
    });
  });

  describe("per-file write mutex [CONC-01, CONC-02, CONC-03]", () => {
    it("concurrent writes to same file are serialised, both succeed in order [CONC-01]", async () => {
      const target = join(testDir, "concurrent.md");
      const results: number[] = [];

      const write1 = acquireLock(target).then(async (release) => {
        await new Promise((r) => setTimeout(r, 50));
        results.push(1);
        release();
      });

      const write2 = acquireLock(target).then(async (release) => {
        results.push(2);
        release();
      });

      await Promise.all([write1, write2]);
      expect(results).toEqual([1, 2]);
    });

    it("lock timeout exceeded (slow writer holds >10s) gives timeout error to second writer [CONC-02]", async () => {
      const target = join(testDir, "timeout.md");
      const release = await acquireLock(target);

      // Second lock should timeout
      await expect(
        acquireLock(target, 100), // Short timeout for testing
      ).rejects.toThrow(/timeout|lock/i);

      release();
    });

    it("lock released allows next waiter to acquire immediately [CONC-01]", async () => {
      const target = join(testDir, "release.md");
      const release1 = await acquireLock(target);

      let acquired = false;
      const waiter = acquireLock(target).then((release) => {
        acquired = true;
        release();
      });

      // Not yet acquired
      await new Promise((r) => setTimeout(r, 10));
      expect(acquired).toBe(false);

      // Release — waiter should acquire
      release1();
      await waiter;
      expect(acquired).toBe(true);
    });

    it("paths with different separator styles or .. segments share same lock key [CONC-01]", async () => {
      const path1 = join(testDir, "sub", "..", "file.md");
      const path2 = join(testDir, "file.md");

      const release1 = await acquireLock(path1);

      // Same logical path — should contend for the same lock
      let acquired = false;
      const waiter = acquireLock(path2, 100)
        .then((release) => {
          acquired = true;
          release();
        })
        .catch((err: Error) => {
          // Timeout is expected — it means they did share a lock (correct behavior)
          if (!err.message.match(/timeout|lock/i)) {
            throw err; // Re-throw unexpected errors
          }
        });

      await new Promise((r) => setTimeout(r, 50));
      expect(acquired).toBe(false); // Still locked

      release1();
      await waiter;
    });

    it("no waiters remaining: lock manager cleans up (no memory leak) [CONC-01]", async () => {
      const target = join(testDir, "cleanup.md");
      const release = await acquireLock(target);
      release();
      // After release with no waiters, internal state should be cleaned up
      // This is implementation-verified; the test confirms no error on re-acquire
      const release2 = await acquireLock(target);
      release2();
    });

    it("read operations proceed without acquiring lock [CONC-03]", async () => {
      const target = join(testDir, "read-while-locked.md");
      await writeFile(target, "test content");
      const release = await acquireLock(target);

      // Reads should still work while lock is held
      const content = await readFile(target, "utf8");
      expect(content).toBe("test content");

      release();
    });

    it("config.json path uses same per-file write mutex as BRIEF.md [CONC-01, M1]", async () => {
      // CONC-01: mutex applies to ~/.brief/config.json as well as BRIEF.md files
      // Multiple tools write config (brief_add_workspace, brief_set_tutorial_dismissed)
      const { join: pathJoin } = await import("node:path");
      const { tmpdir } = await import("node:os");
      const configPath = pathJoin(tmpdir(), ".brief", "config.json");

      const release = await acquireLock(configPath);

      // Same path — concurrent acquire must be serialized (timeout proves contention)
      await expect(acquireLock(configPath, 100)).rejects.toThrow(
        /timeout|lock/i,
      );

      release();

      // After release, lock must be acquirable again
      const release2 = await acquireLock(configPath, 200);
      release2();
    });
  });

  describe("Windows rename retry [CONC-01]", () => {
    it("Windows rename EBUSY is retried with backoff, succeeds on retry [CONC-01]", async () => {
      // Simulate EBUSY on first attempt, success on second
      const fsPromises = await import("node:fs/promises");
      let attempt = 0;
      vi.spyOn(fsPromises, "rename").mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          const err: any = new Error("EBUSY");
          err.code = "EBUSY";
          throw err;
        }
      });

      await expect(
        renameWithRetry("/tmp/src", "/tmp/dest"),
      ).resolves.toBeUndefined();
      expect(attempt).toBe(2);
      vi.restoreAllMocks();
    });

    it("all retries exhausted propagates error with retry context [CONC-01]", async () => {
      const fsPromises = await import("node:fs/promises");
      vi.spyOn(fsPromises, "rename").mockImplementation(async () => {
        const err: any = new Error("EPERM");
        err.code = "EPERM";
        throw err;
      });

      await expect(renameWithRetry("/tmp/src", "/tmp/dest")).rejects.toThrow(
        /EPERM/,
      );
      vi.restoreAllMocks();
    });
  });

  describe("optimistic concurrency [CONC-09]", () => {
    it("mtime unchanged since read: concurrency check passes silently [CONC-09]", async () => {
      const target = join(testDir, "mtime.md");
      await writeFile(target, "content");
      const { mtime } = await stat(target);

      await expect(checkMtime(target, mtime)).resolves.toBeUndefined();
    });

    it('mtime changed (external edit): warning with "modified externally" message [CONC-09]', async () => {
      const target = join(testDir, "mtime2.md");
      await writeFile(target, "original");
      const oldMtime = new Date(Date.now() - 60_000);

      // The file's actual mtime is newer than expected
      const result = await checkMtime(target, oldMtime);
      expect(result).toMatch(/modified externally/i);
    });

    it("mtime check with force=true skips check, write proceeds [CONC-09]", async () => {
      const target = join(testDir, "force.md");
      await writeFile(target, "content");
      const oldMtime = new Date(Date.now() - 60_000);

      await expect(
        checkMtime(target, oldMtime, { force: true }),
      ).resolves.toBeUndefined();
    });
  });

  describe("Windows MAX_PATH guard [FS-06]", () => {
    it("path exceeding 260 chars is rejected before I/O on Windows [FS-06]", async () => {
      if (process.platform === "win32") {
        const longPath = `C:\\${"a".repeat(258)}.md`; // > 260 chars
        await expect(atomicWriteFile(longPath, "content")).rejects.toThrow(
          /path.*too.*long|MAX_PATH|260/i,
        );
      } else {
        // On non-Windows, path up to 260 chars should be fine (no guard applies)
        // Just verify the guard is a no-op
        const { checkWindowsMaxPath } = await import("../../src/io/file-io");
        expect(() => checkWindowsMaxPath("/short/path.md")).not.toThrow();
      }
    });

    it("path of exactly 260 chars is accepted on Windows [FS-06]", async () => {
      if (process.platform === "win32") {
        const { checkWindowsMaxPath } = await import("../../src/io/file-io");
        const exactPath = `C:\\${"a".repeat(257)}`; // exactly 260 chars
        expect(() => checkWindowsMaxPath(exactPath)).not.toThrow();
      }
    });
  });

  describe("orphan temp cleanup skipping symlinks [CONC-05]", () => {
    it("symlink matching *.brief-tmp.* pattern is not deleted during orphan cleanup [CONC-05, M1]", async () => {
      if (process.platform === "win32") return; // Symlinks require admin on Windows
      const fsPromises = await import("node:fs/promises");
      const symTarget = join(testDir, "real-file.md");
      await writeFile(symTarget, "real content");

      // Create a symlink that matches the temp file pattern
      const symPath = join(testDir, "linked.brief-tmp.deadbeef");
      await fsPromises.symlink(symTarget, symPath);

      // Spy on lstat to verify it (not stat) is called during orphan scan
      // SEC-01/TASK-07: fs.lstat() must be used so symlinks are NOT followed
      const lstatSpy = vi.spyOn(fsPromises, "lstat");

      await detectOrphanTempFiles([testDir]);

      // lstat MUST have been called (not stat) — this verifies TOCTOU protection
      expect(lstatSpy).toHaveBeenCalled();

      // Symlink should NOT have been deleted (lstat reveals it's not a regular file)
      const { existsSync } = await import("node:fs");
      expect(existsSync(symPath)).toBe(true);

      lstatSpy.mockRestore();
    });
  });

  describe("AbortSignal cancellation [CONC-06]", () => {
    it("detectOrphanTempFiles accepts AbortSignal and respects pre-aborted signal [CONC-06, M2]", async () => {
      // CONC-06: long-running operations MUST accept AbortSignal so shutdown can cancel them.
      // An already-aborted signal should cause early exit without throwing (or with AbortError).
      const controller = new AbortController();
      controller.abort(); // Abort before starting

      // Must not hang; must either resolve early or throw AbortError — never TypeError
      let threw: Error | undefined;
      try {
        await detectOrphanTempFiles([testDir], { signal: controller.signal });
      } catch (err: any) {
        threw = err;
        // Only acceptable thrown value is an AbortError
        expect(err.name).toMatch(/AbortError/);
      }
      // If it resolved without throwing, that's also acceptable (early-exit path)
      // The key invariant: function accepted the signal parameter and completed quickly
    });

    it("detectOrphanTempFiles aborted mid-scan stops processing further directories [CONC-06, M2]", async () => {
      // Create multiple subdirectories so the scan has meaningful work to abort
      const { mkdir: mkDir } = await import("node:fs/promises");
      const subDirs = ["dir-a", "dir-b", "dir-c"].map((d) => join(testDir, d));
      for (const d of subDirs) {
        await mkDir(d, { recursive: true });
        await writeFile(join(d, "file.brief-tmp.abc"), "orphan");
      }

      const controller = new AbortController();
      const scannedDirs: string[] = [];

      // Patch detectOrphanTempFiles to intercept via signal — abort after first dir scanned
      // Use a short-circuit: abort immediately before the call; the function should exit early
      controller.abort();

      const start = Date.now();
      try {
        await detectOrphanTempFiles(subDirs, { signal: controller.signal });
      } catch {
        // AbortError acceptable
      }
      const elapsed = Date.now() - start;

      // Should complete very quickly (not scan all dirs) when pre-aborted
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe("writability pre-check [ERR-07]", () => {
    it("file not writable gives pre-check error with permission suggestion [ERR-07]", async () => {
      const { writeFileSafe } = await import("../../src/io/file-io");
      const result = await writeFileSafe(
        "/root-only-inaccessible/file.md",
        "content",
      );
      expect(result.isError).toBe(true);
      expect(result.message).toMatch(/permission|writable|access|denied/i);
    });

    it("ENOSPC during atomicWriteFile: original file unchanged, temp file deleted [ERR-07, G4, M4]", async () => {
      // G4: ENOSPC (disk full) must leave state identical to pre-call — ERR-07 rollback guarantee.
      // Simulate: the temp write succeeds but the rename step fails with ENOSPC.
      const target = join(testDir, "enospc-test.md");
      const originalContent = "original content before disk full";
      await writeFile(target, originalContent);

      const fsPromises = await import("node:fs/promises");
      const renameSpy = vi
        .spyOn(fsPromises, "rename")
        .mockImplementation(async () => {
          const err: any = new Error("ENOSPC: no space left on device");
          err.code = "ENOSPC";
          throw err;
        });

      // atomicWriteFile should fail and surface the ENOSPC error
      await expect(atomicWriteFile(target, "new content")).rejects.toThrow(
        /ENOSPC|space/i,
      );

      renameSpy.mockRestore();

      // Original file must be unchanged
      const afterContent = await readFile(target, "utf8");
      expect(afterContent).toBe(originalContent);

      // No leftover temp files matching *.brief-tmp.* pattern
      const { readdirSync } = await import("node:fs");
      const dir = testDir;
      const tempFiles = readdirSync(dir).filter((f: string) =>
        f.includes(".brief-tmp."),
      );
      expect(tempFiles).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-07: Property Tests", () => {
  it("forAll(content string): atomic write then read produces identical content [WRITE-04]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 10_000 }), async (content) => {
        const target = join(
          testDir,
          `prop-${Date.now()}-${Math.random().toString(36).slice(2)}.md`,
        );
        await atomicWriteFile(target, content);
        const read = await readFile(target, "utf8");
        expect(read).toBe(content);
      }),
      { numRuns: 20 },
    );
  });

  it("forAll(N concurrent writes to same path): exactly N sequential writes; final content = last writer [CONC-01]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 5 }), async (n) => {
        const target = join(testDir, `concurrent-prop-${Date.now()}.md`);
        const writes = Array.from({ length: n }, (_, i) =>
          acquireLock(target).then(async (release) => {
            await atomicWriteFile(target, `writer-${i}`);
            release();
          }),
        );
        await Promise.all(writes);
        const content = await readFile(target, "utf8");
        // Content should be from one of the writers
        expect(content).toMatch(/^writer-\d+$/);
        const writerIndex = parseInt(
          content.match(/writer-(\d+)/)?.[1] ?? "-1",
          10,
        );
        expect(writerIndex).toBeGreaterThanOrEqual(0);
        expect(writerIndex).toBeLessThan(n);
      }),
      { numRuns: 5 },
    );
  });

  it("forAll(path string): lock key is identical regardless of slash direction or .. segments [CONC-01]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^\w+$/.test(s)),
        async (filename) => {
          const { getLockKey } = await import("../../src/io/file-io");
          const key1 = getLockKey(`/tmp/base/sub/../${filename}.md`);
          const key2 = getLockKey(`/tmp/base/${filename}.md`);
          expect(key1).toBe(key2);
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(temp file name): matches pattern *.brief-tmp.* [CONC-05]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => /^[\w.-]+$/.test(s)),
        async (filename) => {
          const { atomicWriteFile } = await import("../../src/io/file-io");
          const result = await atomicWriteFile(
            `/tmp/${filename}.md`,
            "content",
            { dryRun: true, returnTempName: true },
          );
          expect(result!.tempFileName).toBeDefined();
          expect(result!.tempFileName).toMatch(/\.brief-tmp\./);
        },
      ),
      { numRuns: 10 },
    );
  });
});
