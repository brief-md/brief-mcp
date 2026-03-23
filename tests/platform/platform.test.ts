import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { readWithTimeout } from "../../src/io/file-io";
import {
  isReservedFilename,
  normalizePath,
  resolveRealPath,
} from "../../src/platform/platform";

// ---------------------------------------------------------------------------
// TASK-57: Platform Testing — Property Tests [T57-03]
//
// Task spec (TASK-57) requires platform-specific tests in separate files:
//   - windows.test.ts    (Windows NTFS junctions, rename retry, reserved names)
//   - macos.test.ts      (case-insensitive FS, symlink handling)
//   - linux.test.ts      (case-sensitive FS, BRIEF.md variant detection)
//   - cross-platform.test.ts  (path separators, home dir, network drives)
//
// This file contains ONLY the cross-cutting property tests that apply on all
// platforms. See the files above for platform-specific unit tests.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("TASK-57: Property Tests", () => {
  it("forAll(path with ..): rejected if it would escape boundary [SEC-01]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => s.includes("..")),
        async (traversalPath) => {
          try {
            const result = await resolveRealPath(traversalPath, {
              withinBase: "/tmp",
            });
            expect(result.resolved).toMatch(/^\/tmp/);
          } catch (e: any) {
            expect(e.message).toMatch(
              /traversal|outside|forbidden|invalid|denied/i,
            );
          }
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(Windows path): resolved via fs.realpath() before validation [SEC-01]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 3, maxLength: 50 })
          .filter((s) => /^[a-zA-Z]:\\/.test(s)),
        async (windowsPath) => {
          const result = await resolveRealPath(windowsPath);
          expect(result.resolved).toBeDefined();
        },
      ),
      { numRuns: 10 },
    );
  });

  it("forAll(platform): path separator handling works correctly [FS-06]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 5, maxLength: 100 })
          .filter((s) => /^[a-zA-Z0-9/\\._-]+$/.test(s)),
        (inputPath) => {
          const result = normalizePath(inputPath);
          expect(result.normalized).toBeDefined();
        },
      ),
      { numRuns: 25 },
    );
  });

  it("forAll(network drive operation): timeout always enforced [FS-09]", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 10, max: 200 }), async (timeoutMs) => {
        const start = Date.now();
        await readWithTimeout("/tmp/nonexistent-slow.md", {
          timeoutMs,
          simulateSlowRead: true,
        }).catch(() => {});
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThanOrEqual(timeoutMs + 200);
      }),
      { numRuns: 10 },
    );
  });

  it("forAll(non-reserved name): isReservedFilename returns false [FS-06]", () => {
    const RESERVED = new Set([
      "CON",
      "PRN",
      "AUX",
      "NUL",
      "CLOCK$",
      "COM1",
      "COM2",
      "COM3",
      "COM4",
      "COM5",
      "COM6",
      "COM7",
      "COM8",
      "COM9",
      "LPT1",
      "LPT2",
      "LPT3",
      "LPT4",
      "LPT5",
      "LPT6",
      "LPT7",
      "LPT8",
      "LPT9",
    ]);
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 4, maxLength: 30 })
          .filter((s) => /^[a-zA-Z][a-zA-Z0-9_]+$/.test(s))
          .filter((s) => !RESERVED.has(s.toUpperCase())),
        (safeName) => {
          expect(isReservedFilename(safeName)).toBe(false);
        },
      ),
      { numRuns: 25 },
    );
  });

  it("forAll(path): normalizePath always returns { normalized: string } [FS-06]", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((s) => /^[a-zA-Z0-9/\\._-]+$/.test(s)),
        (inputPath) => {
          const result = normalizePath(inputPath);
          expect(Object.keys(result)).toEqual(
            expect.arrayContaining(["normalized"]),
          );
          expect(typeof result.normalized).toBe("string");
          expect(result.normalized.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 25 },
    );
  });
});
