// vitest.setup.ts — global Vitest setup
//
// Wraps node:fs/promises in a configurable passthrough mock so that
// vi.spyOn() can redefine individual exports during tests.
// Without this, ESM module namespace properties are non-configurable and
// vi.spyOn() throws "Cannot redefine property" on native built-in modules.

import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import { vi } from "vitest";

// Pin fast-check seed for deterministic property tests across CI environments.
// Without this, different platforms/runs get different random seeds, causing
// flaky failures when edge-case inputs (whitespace-only, special chars) are
// generated on some runs but not others.
fc.configureGlobal({ seed: 42 });

// Isolate tests from user config — prevents loadFromDisk() from loading
// stale test-artifact guide files from ~/.brief/type-guides/.
if (!process.env.BRIEF_HOME) {
  process.env.BRIEF_HOME = path.join(os.tmpdir(), ".brief");
}

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  // Spread into a plain object — all properties become configurable
  return { ...actual };
});
