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
