import { execFileSync } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteCanonicalRepository } from "@contextweft/storage";
import { describe, expect, it } from "vitest";
import { inspectContextWeft, runCli } from "../src/index.js";
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

      const correctIo = capturedIo();
      expect(
        await runCli(
          [
            "correct",
            "--work-item",
            workItem.id,
            "--target-event",
            memory.event.eventId,
            "--content",
            "Canonical events remain the source of truth.",
            "--reason",
            "Shorter wording",
            "--idempotency-key",
            "memory-correction-e2e",
            "--json",
          ],
          { cwd: root, io: correctIo },
        ),
      ).toBe(0);
      expect(JSON.parse(correctIo.stdoutLines[0] ?? "null").event.eventType).toBe(
        "memory.corrected",
      );
      const correction = JSON.parse(correctIo.stdoutLines[0] ?? "null") as {
        event: { eventId: string };
      };

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
      expect(search.results.map((result) => result.id)).toContain(correction.event.eventId);
      expect(search.results.map((result) => result.id)).not.toContain(memory.event.eventId);

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
      expect(JSON.parse(rebuildIo.stdoutLines[0] ?? "null")).toEqual({ eventsProcessed: 2 });

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

  it("returns usage errors for invalid command shapes", async () => {
    for (const argv of [
      ["unknown"],
      ["task", "delete"],
      ["memory", "compact"],
      ["mcp", "--unknown"],
      ["setup", "unknown"],
      ["remember", "--work-item", "work:test", "--content", "x", "--kind", "unknown"],
    ]) {
      const io = capturedIo();
      expect(await runCli(argv, { io })).toBe(2);
      expect(io.stderrLines[0]).toMatch(/^Error:/u);
    }

    const helpIo = capturedIo();
    expect(await runCli(["help"], { io: helpIo })).toBe(0);
    expect(helpIo.stdoutLines[0]).toContain("Usage:");
  });

  it("rejects malformed checkpoint input before mutating state", async () => {
    const root = createGitRepository();
    try {
      const initIo = capturedIo();
      expect(await runCli(["init"], { cwd: root, io: initIo })).toBe(0);
      const taskIo = capturedIo();
      expect(
        await runCli(["task", "start", "--title", "Checkpoint", "--goal", "Validate input"], {
          cwd: root,
          io: taskIo,
        }),
      ).toBe(0);
      const workItemId = taskIo.stdoutLines[0]?.match(/\((work:[^)]+)\)$/u)?.[1];
      expect(workItemId).toBeDefined();

      const invalidJson = `${root}/invalid.json`;
      await writeFile(invalidJson, "{", "utf8");
      const jsonIo = capturedIo();
      expect(
        await runCli(["checkpoint", "--work-item", workItemId ?? "", "--input", invalidJson], {
          cwd: root,
          io: jsonIo,
        }),
      ).toBe(2);
      expect(jsonIo.stderrLines[0]).toContain("not valid JSON");

      const invalidSchema = `${root}/invalid-schema.json`;
      await writeFile(invalidSchema, JSON.stringify({ nextActions: [] }), "utf8");
      const schemaIo = capturedIo();
      expect(
        await runCli(["checkpoint", "--work-item", workItemId ?? "", "--input", invalidSchema], {
          cwd: root,
          io: schemaIo,
        }),
      ).toBe(2);
      expect(schemaIo.stderrLines[0]).toContain("Invalid checkpoint input");

      const rootSchema = `${root}/invalid-root-schema.json`;
      await writeFile(rootSchema, "null", "utf8");
      const rootSchemaIo = capturedIo();
      expect(
        await runCli(["checkpoint", "--work-item", workItemId ?? "", "--input", rootSchema], {
          cwd: root,
          io: rootSchemaIo,
        }),
      ).toBe(2);
      expect(rootSchemaIo.stderrLines[0]).toContain("$:");

      const large = `${root}/large.json`;
      await writeFile(large, "x".repeat(1_048_577), "utf8");
      const largeIo = capturedIo();
      expect(
        await runCli(["checkpoint", "--work-item", workItemId ?? "", "--input", large], {
          cwd: root,
          io: largeIo,
        }),
      ).toBe(2);
      expect(largeIo.stderrLines[0]).toContain("regular file no larger");
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

  it("reports doctor warnings and failures for unsafe local state", async () => {
    const notGit = await mkdtemp(join(tmpdir(), "contextweft-not-git-"));
    try {
      expect((await inspectContextWeft(notGit)).ok).toBe(false);
    } finally {
      await rm(notGit, { recursive: true, force: true });
    }

    const root = createGitRepository();
    try {
      const initIo = capturedIo();
      expect(await runCli(["init"], { cwd: root, io: initIo })).toBe(0);
      await chmod(`${root}/.contextweft`, 0o755);
      const warning = await inspectContextWeft(root);
      expect(warning.checks).toContainEqual(
        expect.objectContaining({ name: "state-directory", status: "warn" }),
      );

      await rm(`${root}/.contextweft/contextweft.db`, { force: true });
      await symlink(`${root}/index.ts`, `${root}/.contextweft/contextweft.db`);
      const failure = await inspectContextWeft(root);
      expect(failure.checks).toContainEqual(
        expect.objectContaining({ name: "canonical-store", status: "fail" }),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports doctor edge states without repairing them", async () => {
    const unborn = await mkdtemp(join(tmpdir(), "contextweft-unborn-"));
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: unborn });
    try {
      const report = await inspectContextWeft(unborn);
      expect(report.checks).toContainEqual(
        expect.objectContaining({
          name: "git",
          message: expect.stringContaining("without a commit"),
        }),
      );
    } finally {
      await rm(unborn, { recursive: true, force: true });
    }

    const stateFile = createGitRepository();
    try {
      await writeFile(join(stateFile, ".contextweft"), "not a directory", "utf8");
      const report = await inspectContextWeft(stateFile);
      expect(report.checks).toContainEqual(
        expect.objectContaining({ name: "state-directory", status: "fail" }),
      );
    } finally {
      await rm(stateFile, { recursive: true, force: true });
    }

    const missingWorkspace = createGitRepository();
    try {
      const initIo = capturedIo();
      expect(await runCli(["init"], { cwd: missingWorkspace, io: initIo })).toBe(0);
      await rm(join(missingWorkspace, ".contextweft", "contextweft.db"), { force: true });
      const repository = new SqliteCanonicalRepository({
        path: join(missingWorkspace, ".contextweft", "contextweft.db"),
      });
      repository.close();
      const report = await inspectContextWeft(missingWorkspace);
      expect(report.checks).toContainEqual(
        expect.objectContaining({
          name: "canonical-store",
          message: expect.stringContaining("does not contain this workspace"),
        }),
      );
    } finally {
      await rm(missingWorkspace, { recursive: true, force: true });
    }

    const memoryDirectory = createGitRepository();
    try {
      const initIo = capturedIo();
      expect(await runCli(["init"], { cwd: memoryDirectory, io: initIo })).toBe(0);
      await rm(join(memoryDirectory, ".contextweft", "memory.db"), { force: true });
      await rm(join(memoryDirectory, ".contextweft", "memory.db-wal"), { force: true });
      await rm(join(memoryDirectory, ".contextweft", "memory.db-shm"), { force: true });
      await rm(join(memoryDirectory, ".contextweft", "memory.db"), {
        recursive: true,
        force: true,
      });
      await mkdir(join(memoryDirectory, ".contextweft", "memory.db"));
      const report = await inspectContextWeft(memoryDirectory);
      expect(report.checks).toContainEqual(
        expect.objectContaining({ name: "derived-memory", status: "fail" }),
      );
    } finally {
      await rm(memoryDirectory, { recursive: true, force: true });
    }
  });
});
