import type { Workspace } from "@contextweft/contracts";
import type { ContextWeftRuntime, OpenContextWeftRuntimeOptions } from "../src/index.js";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";
import { capturedIo } from "./fixtures.js";

const workspace: Workspace = {
  schemaVersion: "0.1",
  id: "ws:cli-branch",
  name: "CLI branch fixture",
  rootPath: "/tmp/contextweft-cli-branch",
  createdAt: "2026-08-31T12:00:00.000Z",
  updatedAt: "2026-08-31T12:00:00.000Z",
  metadata: {},
};

const workItem = {
  schemaVersion: "0.1" as const,
  id: "work:cli-branch",
  workspaceId: workspace.id,
  title: "Cover CLI branches",
  goal: "Exercise human output",
  status: "active" as const,
  createdAt: "2026-08-31T12:00:00.000Z",
  updatedAt: "2026-08-31T12:00:00.000Z",
  metadata: {},
};

describe("ContextWeft CLI branch behavior", () => {
  it("can use the default process IO for help output", async () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      await expect(runCli(["--help"])).resolves.toBe(0);
    } finally {
      write.mockRestore();
    }
  });

  it("uses defaults, emits warnings, and formats non-JSON command output", async () => {
    const calls: string[] = [];
    const openRuntime = async (_options: OpenContextWeftRuntimeOptions) =>
      ({
        rootPath: workspace.rootPath,
        stateDirectory: `${workspace.rootPath}/.contextweft`,
        canonicalDatabasePath: `${workspace.rootPath}/.contextweft/contextweft.db`,
        memoryDatabasePath: `${workspace.rootPath}/.contextweft/memory.db`,
        memoryAvailable: false,
        warnings: ["derived memory unavailable"],
        repository: {
          findWorkspaceByRoot() {
            return workspace;
          },
        },
        service: {
          async initializeWorkspace() {
            calls.push("init");
            return workspace;
          },
          startWorkItem(input: { readonly idempotencyKey: string }) {
            calls.push(`start:${input.idempotencyKey.startsWith("cli:")}`);
            return workItem;
          },
          workspaceStatus() {
            calls.push("status");
            return { workspace, workItems: [workItem], eventCount: 2, artifactCount: 1 };
          },
          async createCheckpoint() {
            calls.push("checkpoint");
            return {
              replayed: true,
              checkpoint: { eventId: "evt:checkpoint" },
              events: [{ eventId: "evt:checkpoint" }],
              artifacts: [],
            };
          },
          async bootstrap(input: { readonly memoryLimit?: number }) {
            calls.push(`bootstrap:${input.memoryLimit}`);
            return {
              pack: { nextActions: [], relevantMemory: [] },
              markdown: "ContextPack markdown",
              warnings: ["bootstrap warning"],
            };
          },
          async searchMemory(input: { readonly limit?: number }) {
            calls.push(`search:${input.limit}`);
            return { results: [], warnings: [] };
          },
          async recordMemory(input: { readonly confidence: number; readonly validFrom?: string }) {
            calls.push(`remember:${input.confidence}:${input.validFrom}`);
            return {
              event: { eventId: "evt:memory" },
              replayed: false,
              indexed: false,
              warnings: [],
            };
          },
          async correctMemory() {
            calls.push("correct");
            return {
              event: { eventId: "evt:correction" },
              replayed: false,
              indexed: true,
              warnings: [],
            };
          },
          async rebuildMemory() {
            calls.push("rebuild");
            return { eventsProcessed: 3 };
          },
        },
        async close() {
          calls.push("close");
        },
      }) as unknown as ContextWeftRuntime;

    for (const argv of [
      ["init"],
      ["task", "start", "--title", "T", "--goal", "G"],
      ["task", "status"],
      ["bootstrap", "--work-item", workItem.id, "--intent", "Continue", "--memory-limit", "3"],
      ["search", "--work-item", workItem.id, "--query", "nothing"],
      [
        "remember",
        "--work-item",
        workItem.id,
        "--content",
        "Remembered",
        "--kind",
        "fact",
        "--confidence",
        "0.25",
        "--valid-from",
        "2026-08-31T12:00:00.000Z",
      ],
      [
        "correct",
        "--work-item",
        workItem.id,
        "--target-event",
        "evt:memory",
        "--content",
        "Corrected",
        "--reason",
        "Test",
      ],
      ["memory", "rebuild"],
    ]) {
      const io = capturedIo();
      expect(await runCli(argv, { cwd: workspace.rootPath, io, openRuntime })).toBe(0);
      expect(io.stderrLines).toContain("Warning: derived memory unavailable");
    }

    expect(calls).toContain("start:true");
    expect(calls).toContain("bootstrap:3");
    expect(calls).toContain("search:10");
    expect(calls).toContain("remember:0.25:2026-08-31T12:00:00.000Z");
    expect(calls).toContain("rebuild");
  });

  it("formats setup and doctor human output branches", async () => {
    const setupIo = capturedIo();
    expect(
      await runCli(
        ["setup", "codex", "--command", "/opt/Context Weft/ctxweft", "--server-name", "cw"],
        { io: setupIo },
      ),
    ).toBe(0);
    expect(setupIo.stdoutLines[0]).toContain("Codex MCP setup");

    const doctorIo = capturedIo();
    expect(await runCli(["doctor"], { cwd: process.cwd(), io: doctorIo })).toBe(1);
    expect(doctorIo.stdoutLines[0]).toContain("canonical-store");
  });

  it("reports missing current workspace and non-Error runtime failures", async () => {
    const missingWorkspaceRuntime = async () =>
      ({
        rootPath: workspace.rootPath,
        warnings: [],
        repository: {
          findWorkspaceByRoot() {
            return undefined;
          },
        },
        async close() {},
      }) as unknown as ContextWeftRuntime;

    const missingIo = capturedIo();
    expect(
      await runCli(["task", "status"], {
        cwd: workspace.rootPath,
        io: missingIo,
        openRuntime: missingWorkspaceRuntime,
      }),
    ).toBe(1);
    expect(missingIo.stderrLines[0]).toContain("not initialized");

    const failingIo = capturedIo();
    expect(
      await runCli(["task", "status"], {
        cwd: workspace.rootPath,
        io: failingIo,
        openRuntime: async () => Promise.reject("plain failure"),
      }),
    ).toBe(1);
    expect(failingIo.stderrLines[0]).toContain("plain failure");
  });

  it("formats newly created checkpoints in human output", async () => {
    const io = capturedIo(JSON.stringify({ nextActions: ["Continue"] }));
    const openRuntime = async () =>
      ({
        rootPath: workspace.rootPath,
        warnings: [],
        repository: {
          findWorkspaceByRoot() {
            return workspace;
          },
        },
        service: {
          async createCheckpoint() {
            return {
              replayed: false,
              checkpoint: { eventId: "evt:new-checkpoint" },
              events: [{ eventId: "evt:new-checkpoint" }, { eventId: "evt:artifact" }],
              artifacts: [{ id: "artifact:file" }],
            };
          },
        },
        async close() {},
      }) as unknown as ContextWeftRuntime;

    expect(
      await runCli(["checkpoint", "--work-item", workItem.id, "--input", "-"], {
        cwd: workspace.rootPath,
        io,
        openRuntime,
      }),
    ).toBe(0);
    expect(io.stdoutLines[0]).toBe("Created checkpoint evt:new-checkpoint (2 events, 1 artifacts)");
  });

  it("formats replayed checkpoints in human output", async () => {
    const io = capturedIo(JSON.stringify({ nextActions: ["Continue"] }));
    const openRuntime = async () =>
      ({
        rootPath: workspace.rootPath,
        warnings: [],
        repository: {
          findWorkspaceByRoot() {
            return workspace;
          },
        },
        service: {
          async createCheckpoint() {
            return {
              replayed: true,
              checkpoint: { eventId: "evt:replayed-checkpoint" },
              events: [{ eventId: "evt:replayed-checkpoint" }],
              artifacts: [],
            };
          },
        },
        async close() {},
      }) as unknown as ContextWeftRuntime;

    expect(
      await runCli(["checkpoint", "--work-item", workItem.id, "--input", "-"], {
        cwd: workspace.rootPath,
        io,
        openRuntime,
      }),
    ).toBe(0);
    expect(io.stdoutLines[0]).toBe(
      "Replayed checkpoint evt:replayed-checkpoint (1 events, 0 artifacts)",
    );
  });
});
