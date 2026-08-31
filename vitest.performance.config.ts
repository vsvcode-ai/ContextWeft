import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/**/test/**/*.perf.test.ts",
      "apps/**/test/**/*.perf.test.ts",
      "tests/**/*.perf.test.ts",
    ],
    maxConcurrency: 1,
    pool: "forks",
    sequence: {
      concurrent: false,
    },
    testTimeout: 30_000,
  },
});
