import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { GitAdapter, type GitCommandRunner } from "../src/index.js";

describe("GitAdapter performance budget", () => {
  it("normalizes and filters 10,000 changed paths within 250 ms", async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "contextweft-git-perf-")));
    const paths = Array.from({ length: 9_999 }, (_, index) => `src/file-${index}.ts`);
    paths.push(".env.production");
    const changedOutput = `${paths.join("\0")}\0`;
    const runner: GitCommandRunner = {
      async run(args) {
        const command = args.join(" ");
        if (command.includes("--show-toplevel")) {
          return { exitCode: 0, stdout: `${root}\n`, stderr: "" };
        }
        if (command.includes("rev-parse --verify HEAD")) {
          return { exitCode: 0, stdout: `${"a".repeat(40)}\n`, stderr: "" };
        }
        if (command.includes("symbolic-ref")) {
          return { exitCode: 0, stdout: "main\n", stderr: "" };
        }
        if (command.includes("diff --name-only")) {
          return { exitCode: 0, stdout: changedOutput, stderr: "" };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    };

    const startedAt = performance.now();
    const snapshot = await new GitAdapter({
      runner,
      clock: { now: () => new Date("2026-08-31T11:00:00.000Z") },
    }).capture(root);
    const elapsedMs = performance.now() - startedAt;

    expect(snapshot.changedFiles).toHaveLength(9_999);
    expect(snapshot.excludedSensitiveFiles).toBe(1);
    expect(elapsedMs).toBeLessThan(250);
  });
});
