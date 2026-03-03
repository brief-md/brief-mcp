// vitest.setup.ts — global Vitest setup
//
// Wraps node:fs/promises in a configurable passthrough mock so that
// vi.spyOn() can redefine individual exports during tests.
// Without this, ESM module namespace properties are non-configurable and
// vi.spyOn() throws "Cannot redefine property" on native built-in modules.

import { vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  // Spread into a plain object — all properties become configurable
  return { ...actual };
});
