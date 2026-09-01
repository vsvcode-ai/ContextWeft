import { lstat, rm, symlink } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UnsafeStatePathError, openContextWeftRuntime } from "../src/index.js";
import { createGitRepository } from "./fixtures.js";

describe("openContextWeftRuntime", () => {
  it("creates local state and closes idempotently", async () => {
    const root = createGitRepository();
    try {
      const runtime = await openContextWeftRuntime({ startPath: root, allowCreate: true });
      await expect(lstat(runtime.stateDirectory)).resolves.toEqual(
        expect.objectContaining({ mode: expect.any(Number) }),
      );
      await runtime.close();
      await expect(runtime.close()).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects unsafe database sidecar entries before opening SQLite", async () => {
    const root = createGitRepository();
    try {
      await openContextWeftRuntime({ startPath: root, allowCreate: true }).then((runtime) =>
        runtime.close(),
      );
      await symlink(join(root, "index.ts"), join(root, ".contextweft", "memory.db-wal"));

      await expect(
        openContextWeftRuntime({ startPath: root, allowCreate: true }),
      ).rejects.toBeInstanceOf(UnsafeStatePathError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("surfaces non-ENOENT filesystem errors while locating a repository", async () => {
    const missingParent = mkdtempSync(join(tmpdir(), "contextweft-runtime-missing-"));
    await rm(missingParent, { recursive: true, force: true });

    await expect(
      openContextWeftRuntime({ startPath: join(missingParent, "child"), allowCreate: false }),
    ).rejects.toThrow();
  });
});
