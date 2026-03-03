import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});
