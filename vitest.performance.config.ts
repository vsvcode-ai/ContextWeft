import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@contextweft/cli": fileURLToPath(new URL("./apps/cli/src/index.ts", import.meta.url)),
      "@contextweft/application": fileURLToPath(
        new URL("./packages/application/src/index.ts", import.meta.url),
      ),
      "@contextweft/context-compiler": fileURLToPath(
        new URL("./packages/context-compiler/src/index.ts", import.meta.url),
      ),
      "@contextweft/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url),
      ),
      "@contextweft/git-adapter": fileURLToPath(
        new URL("./packages/git-adapter/src/index.ts", import.meta.url),
      ),
      "@contextweft/mcp-server": fileURLToPath(
        new URL("./packages/mcp-server/src/index.ts", import.meta.url),
      ),
      "@contextweft/opencontext-adapter": fileURLToPath(
        new URL("./packages/opencontext-adapter/src/index.ts", import.meta.url),
      ),
      "@contextweft/storage": fileURLToPath(
        new URL("./packages/storage/src/index.ts", import.meta.url),
      ),
    },
  },
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
