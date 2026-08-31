import type {
  BootstrapInput,
  BootstrapResult,
  CreateCheckpointInput,
  StartWorkItemInput,
} from "@contextweft/application";
import type { ContextEvent, ContextPack, ContextPackItem, WorkItem } from "@contextweft/contracts";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";
import { createContextWeftMcpServer, type ContextWeftOperations } from "../src/index.js";
import { workspace } from "./fixtures.js";

const observedAt = "2026-08-31T12:00:00.000Z";
const toolNames = [
  "contextweft.bootstrap",
  "contextweft.checkpoint",
  "contextweft.correct_fact",
  "contextweft.remember",
  "contextweft.search",
  "contextweft.work_item_start",
  "contextweft.workspace_init",
  "contextweft.workspace_status",
] as const;

const closeCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map((close) => close()));
});

describe("multi-agent MCP compatibility", () => {
  it("lets Codex, Cursor, and Claude Code identities continue one canonical work item", async () => {
    const operations = continuityOperations();
    const codex = await connectedClient("codex", operations);
    const cursor = await connectedClient("cursor", operations);
    const claude = await connectedClient("claude-code", operations);

    const codexTools = await codex.listTools();
    const cursorTools = await cursor.listTools();
    const claudeTools = await claude.listTools();
    expect(codexTools.tools.map((tool) => tool.name).sort()).toEqual([...toolNames]);
    expect(cursorTools.tools.map((tool) => tool.name).sort()).toEqual([...toolNames]);
    expect(claudeTools.tools.map((tool) => tool.name).sort()).toEqual([...toolNames]);

    await codex.callTool({
      name: "contextweft.workspace_init",
      arguments: { name: "Compatibility workspace" },
    });
    const started = await codex.callTool({
      name: "contextweft.work_item_start",
      arguments: {
        workspaceId: workspace.id,
        title: "Carry state across clients",
        goal: "Verify one context source works across agent hosts",
        idempotencyKey: "codex-start",
      },
    });
    const workItemId = readData<WorkItem>(started).id;

    await cursor.callTool({
      name: "contextweft.checkpoint",
      arguments: {
        workspaceId: workspace.id,
        workItemId,
        idempotencyKey: "cursor-checkpoint",
        completed: ["Codex initialized the canonical workspace"],
        nextActions: ["Claude Code should bootstrap from Cursor's checkpoint"],
        relevantFiles: ["packages/mcp-server/src/server.ts"],
      },
    });

    const bootstrapped = await claude.callTool({
      name: "contextweft.bootstrap",
      arguments: {
        workspaceId: workspace.id,
        workItemId,
        intent: "Continue after Cursor checkpoint",
        tokenBudget: 4000,
      },
    });

    const result = readData<{ pack: ContextPack; warnings: readonly string[] }>(bootstrapped);
    expect(result.warnings).toEqual([]);
    expect(result.pack.workItem.id).toBe(workItemId);
    expect(result.pack.nextActions[0]?.summary).toBe(
      "Claude Code should bootstrap from Cursor's checkpoint",
    );
    expect(result.pack.provenance.flatMap((item) => item.sourceEventIds)).toContain(
      "evt_cursor_checkpoint",
    );
    expect(operations.sources).toEqual(["codex", "codex", "cursor", "claude-code"]);
  });
});

async function connectedClient(agent: string, operations: ContextWeftOperations): Promise<Client> {
  const server = createContextWeftMcpServer({
    operations,
    defaultWorkspaceRoot: workspace.rootPath,
    actor: { type: "agent", id: agent },
    source: { kind: "mcp", agent },
  });
  const client = new Client({ name: agent, version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  closeCallbacks.push(async () => {
    await client.close();
    await server.close();
  });
  return client;
}

function continuityOperations(): ContextWeftOperations & { readonly sources: string[] } {
  const sources: string[] = [];
  let workItem: WorkItem | undefined;
  let nextActions: readonly string[] = [];

  return {
    sources,
    async initializeWorkspace(input) {
      sources.push(input.source.agent ?? "unknown");
      return { ...workspace, name: input.name, rootPath: input.rootPath };
    },
    startWorkItem(input: StartWorkItemInput) {
      sources.push(input.source.agent ?? "unknown");
      workItem = {
        schemaVersion: "0.1",
        id: "work_cross_agent",
        workspaceId: input.workspaceId,
        title: input.title,
        goal: input.goal,
        status: "active",
        createdAt: observedAt,
        updatedAt: observedAt,
        metadata: {},
      };
      return workItem;
    },
    workspaceStatus() {
      return {
        workspace,
        workItems: workItem === undefined ? [] : [workItem],
        eventCount: nextActions.length === 0 ? 1 : 2,
        artifactCount: 0,
      };
    },
    async createCheckpoint(input: CreateCheckpointInput) {
      sources.push(input.source.agent ?? "unknown");
      nextActions = input.nextActions;
      const event = checkpointEvent(input);
      return { checkpoint: event, events: [event], artifacts: [], replayed: false };
    },
    async bootstrap(input: BootstrapInput): Promise<BootstrapResult> {
      sources.push("claude-code");
      if (workItem === undefined) {
        throw new Error(`missing work item ${input.workItemId}`);
      }
      const item = packItem(nextActions[0] ?? "No next action");
      const pack: ContextPack = {
        schemaVersion: "0.1",
        packId: "pack_cross_agent",
        snapshotAt: observedAt,
        workspace,
        workItem,
        goal: packItem(workItem.goal, "goal"),
        currentState: [],
        completed: [],
        pending: [],
        decisions: [],
        constraints: [],
        failedAttempts: [],
        tests: [],
        artifacts: [],
        relevantMemory: [],
        nextActions: [item],
        provenance: [
          {
            itemId: item.id,
            sourceEventIds: ["evt_cursor_checkpoint"],
            artifactIds: [],
          },
        ],
        freshness: { status: "fresh", reasons: [] },
        budget: { limit: input.tokenBudget, used: 100, truncated: false, omittedItemIds: [] },
      };
      return { pack, markdown: item.summary, warnings: [] };
    },
    async searchMemory() {
      return { results: [], warnings: [] };
    },
    async recordMemory() {
      throw new Error("not exercised by this compatibility test");
    },
    async correctMemory() {
      throw new Error("not exercised by this compatibility test");
    },
  } satisfies ContextWeftOperations & { readonly sources: string[] };
}

function checkpointEvent(input: CreateCheckpointInput): ContextEvent {
  return {
    schemaVersion: "0.1",
    eventId: "evt_cursor_checkpoint",
    eventType: "checkpoint.created",
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    occurredAt: observedAt,
    observedAt,
    actor: input.actor,
    source: input.source,
    idempotencyKey: input.idempotencyKey,
    payload: {
      nextActions: [...input.nextActions],
      artifactIds: [],
      git: {
        repositoryRoot: workspace.rootPath,
        revision: "a".repeat(40),
        branch: "main",
        dirty: false,
        changedFiles: [],
        excludedSensitiveFiles: 0,
        observedAt,
        fingerprint: "b".repeat(64),
      },
    },
    provenance: { observedAt, sourceEventIds: [], artifactIds: [] },
    metadata: {},
  };
}

function packItem(summary: string, id = "next_cross_agent"): ContextPackItem {
  return {
    id,
    summary,
    occurredAt: observedAt,
    importance: 90,
    estimatedTokens: 10,
    sourceEventIds: ["evt_cursor_checkpoint"],
    artifactIds: [],
  };
}

function readData<T>(result: Awaited<ReturnType<Client["callTool"]>>): T {
  const structured = result.structuredContent as { ok?: boolean; data?: unknown } | undefined;
  expect(structured?.ok).toBe(true);
  return structured?.data as T;
}
