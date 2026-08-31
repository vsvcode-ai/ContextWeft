import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bench } from "tinybench";
import { GitAdapter, type GitCommandRunner } from "../src/index.js";

const root = realpathSync(mkdtempSync(join(tmpdir(), "contextweft-git-bench-")));
const changedOutput = `${Array.from({ length: 1_000 }, (_, index) => `src/file-${index}.ts`).join("\0")}\0`;
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

const adapter = new GitAdapter({
  runner,
  clock: { now: () => new Date("2026-08-31T11:00:00.000Z") },
});
const bench = new Bench({ name: "git-adapter", time: 1_000, warmupTime: 250 });
bench.add("capture 1,000 changed paths", async () => {
  await adapter.capture(root);
});

await bench.run();
console.table(bench.table());
