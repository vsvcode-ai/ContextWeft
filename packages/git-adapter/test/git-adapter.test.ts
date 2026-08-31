import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GitAdapter, WorkspaceRootMismatchError } from "../src/index.js";

const fixedClock = { now: () => new Date("2026-08-31T11:00:00.000Z") };

function createRepository(): string {
  const root = mkdtempSync(join(tmpdir(), "contextweft-git-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.name", "ContextWeft Test"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "index.ts"), "export const version = 1;\n");
  execFileSync("git", ["add", "src/index.ts"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "initial"], { cwd: root });
  return root;
}

describe("GitAdapter", () => {
  it("captures a deterministic snapshot without sensitive path names", async () => {
    const root = createRepository();
    writeFileSync(join(root, "src", "index.ts"), "export const version = 2;\n");
    writeFileSync(join(root, ".env"), "SECRET=do-not-capture\n");

    const snapshot = await new GitAdapter({ clock: fixedClock }).capture(root);

    expect(snapshot.revision).toMatch(/^[a-f0-9]{40}$/);
    expect(snapshot.branch).toBe("main");
    expect(snapshot.dirty).toBe(true);
    expect(snapshot.changedFiles).toEqual(["src/index.ts"]);
    expect(snapshot.excludedSensitiveFiles).toBe(1);
    expect(snapshot.observedAt).toBe("2026-08-31T11:00:00.000Z");
    expect(snapshot.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces the same fingerprint when only observation time changes", async () => {
    const root = createRepository();
    const first = await new GitAdapter({ clock: fixedClock }).capture(root);
    const second = await new GitAdapter({
      clock: { now: () => new Date("2026-09-01T11:00:00.000Z") },
    }).capture(root);

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.observedAt).not.toBe(second.observedAt);
  });

  it("does not silently widen a workspace to a parent repository", async () => {
    const root = createRepository();
    const nested = join(root, "src");
    const adapter = new GitAdapter({ clock: fixedClock });

    await expect(adapter.locate(nested)).resolves.toBe(realpathSync(root));
    await expect(adapter.capture(nested)).rejects.toBeInstanceOf(WorkspaceRootMismatchError);
  });
});
