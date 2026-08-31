import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["**/dist/**", "**/bench/**", "**/*.d.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        branches: 80,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.perf.test.ts"],
    include: ["packages/**/test/**/*.test.ts", "apps/**/test/**/*.test.ts", "tests/**/*.test.ts"],
    pool: "forks",
    restoreMocks: true,
    testTimeout: 10_000,
  },
});
