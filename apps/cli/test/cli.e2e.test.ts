import { lstat, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";
import { capturedIo, createGitRepository } from "./fixtures.js";

describe("ContextWeft CLI end-to-end", () => {
  it("runs init → task → memory → checkpoint → bootstrap → doctor offline", async () => {
    const root = createGitRepository();
    try {
      const initIo = capturedIo();
      expect(
        await runCli(["init", "--name", "CLI fixture", "--json"], { cwd: root, io: initIo }),
      ).toBe(0);
      const workspace = JSON.parse(initIo.stdoutLines[0] ?? "null") as { id: string };
      expect(workspace.id).toMatch(/^ws:/u);
      expect(initIo.stderrLines).toEqual([]);

      const stateMode = (await lstat(join(root, ".contextweft"))).mode & 0o777;
      const databaseMode = (await lstat(join(root, ".contextweft", "contextweft.db"))).mode & 0o777;
      expect(stateMode).toBe(0o700);
      expect(databaseMode).toBe(0o600);

      const taskIo = capturedIo();
      expect(
        await runCli(
          [
            "task",
            "start",
            "--title",
            "Continue across agents",
            "--goal",
            "Create a verified handoff",
            "--idempotency-key",
            "task-e2e",
            "--json",
          ],
          { cwd: root, io: taskIo },
        ),
      ).toBe(0);
      const workItem = JSON.parse(taskIo.stdoutLines[0] ?? "null") as { id: string };
      expect(workItem.id).toMatch(/^work:/u);

      const rememberIo = capturedIo();
      expect(
        await runCli(
          [
            "remember",
            "--work-item",
            workItem.id,
            "--content",
            "ContextWeft uses canonical events as the source of truth",
            "--kind",
            "decision",
            "--idempotency-key",
            "memory-e2e",
            "--json",
          ],
          { cwd: root, io: rememberIo },
        ),
      ).toBe(0);
      const memory = JSON.parse(rememberIo.stdoutLines[0] ?? "null") as {
        event: { eventId: string };
        indexed: boolean;
      };
      expect(memory.indexed).toBe(true);

      const searchIo = capturedIo();
      expect(
        await runCli(
          ["search", "--work-item", workItem.id, "--query", "canonical source truth", "--json"],
          { cwd: root, io: searchIo },
        ),
      ).toBe(0);
      const search = JSON.parse(searchIo.stdoutLines[0] ?? "null") as {
        results: Array<{ id: string }>;
      };
      expect(search.results.map((result) => result.id)).toContain(memory.event.eventId);

      const checkpointInput = JSON.stringify({
        summary: "Canonical memory and CLI are operational.",
        completed: ["Implemented offline memory"],
        pending: ["Validate another agent"],
        decisions: [{ summary: "Keep ContextPack deterministic" }],
        tests: [{ command: "pnpm test", status: "passed" }],
        nextActions: ["Connect the MCP server from another agent"],
        relevantFiles: ["index.ts"],
      });
      const checkpointIo = capturedIo(checkpointInput);
      expect(
        await runCli(
          [
            "checkpoint",
            "--work-item",
            workItem.id,
            "--input",
            "-",
            "--idempotency-key",
            "checkpoint-e2e",
            "--json",
          ],
          { cwd: root, io: checkpointIo },
        ),
      ).toBe(0);
      const checkpoint = JSON.parse(checkpointIo.stdoutLines[0] ?? "null") as {
        checkpoint: { eventId: string };
      };
      expect(checkpoint.checkpoint.eventId).toMatch(/^evt:/u);

      const bootstrapIo = capturedIo();
      expect(
        await runCli(
          [
            "bootstrap",
            "--work-item",
            workItem.id,
            "--intent",
            "Continue canonical source of truth MCP validation",
            "--token-budget",
            "2000",
            "--json",
          ],
          { cwd: root, io: bootstrapIo },
        ),
      ).toBe(0);
      const bootstrap = JSON.parse(bootstrapIo.stdoutLines[0] ?? "null") as {
        pack: { nextActions: Array<{ summary: string }>; relevantMemory: unknown[] };
      };
      expect(bootstrap.pack.nextActions[0]?.summary).toContain("Connect the MCP server");
      expect(bootstrap.pack.relevantMemory).not.toHaveLength(0);

      const rebuildIo = capturedIo();
      expect(await runCli(["memory", "rebuild", "--json"], { cwd: root, io: rebuildIo })).toBe(0);
      expect(JSON.parse(rebuildIo.stdoutLines[0] ?? "null")).toEqual({ eventsProcessed: 1 });

      const doctorIo = capturedIo();
      expect(await runCli(["doctor", "--json"], { cwd: root, io: doctorIo })).toBe(0);
      const doctor = JSON.parse(doctorIo.stdoutLines[0] ?? "null") as { ok: boolean };
      expect(doctor.ok).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not create state for status or doctor in an uninitialized repository", async () => {
    const root = createGitRepository();
    try {
      const statusIo = capturedIo();
      expect(await runCli(["task", "status"], { cwd: root, io: statusIo })).toBe(1);
      expect(statusIo.stderrLines[0]).toContain("not initialized");

      const doctorIo = capturedIo();
      expect(await runCli(["doctor", "--json"], { cwd: root, io: doctorIo })).toBe(1);
      expect(JSON.parse(doctorIo.stdoutLines[0] ?? "null").ok).toBe(false);
      await expect(lstat(join(root, ".contextweft"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a symlinked state directory before opening a database", async () => {
    const root = createGitRepository();
    const outside = createGitRepository();
    try {
      await symlink(outside, join(root, ".contextweft"));
      const io = capturedIo();
      expect(await runCli(["init"], { cwd: root, io })).toBe(1);
      expect(io.stderrLines[0]).toContain("state directory must be a real directory");
      await expect(lstat(join(outside, "contextweft.db"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
