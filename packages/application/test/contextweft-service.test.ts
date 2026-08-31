import { describe, expect, it } from "vitest";
import { SqliteCanonicalRepository } from "@contextweft/storage";
import { ContextWeftService, UnsafeArtifactPathError } from "../src/index.js";
import { FakeGit, gitSnapshot, identity, time } from "./fixtures.js";

function serviceFixture() {
  const repository = new SqliteCanonicalRepository({ path: ":memory:" });
  const git = new FakeGit();
  const service = new ContextWeftService({
    repository,
    git,
    clock: { now: () => new Date(time) },
  });
  return { repository, git, service };
}

async function initializedFixture() {
  const fixture = serviceFixture();
  const workspace = await fixture.service.initializeWorkspace({
    rootPath: gitSnapshot.repositoryRoot,
    name: "Application fixture",
    ...identity,
  });
  const workItem = fixture.service.startWorkItem({
    workspaceId: workspace.id,
    title: "Implement checkpoint flow",
    goal: "Create a portable checkpoint.",
    idempotencyKey: "start-checkpoint",
    ...identity,
  });
  return { ...fixture, workspace, workItem };
}

describe("ContextWeftService", () => {
  it("creates an idempotent workspace and work item", async () => {
    const { repository, service } = serviceFixture();
    const input = {
      rootPath: gitSnapshot.repositoryRoot,
      name: "Application fixture",
      ...identity,
    };
    const first = await service.initializeWorkspace(input);
    const second = await service.initializeWorkspace(input);
    expect(first).toEqual(second);

    const workInput = {
      workspaceId: first.id,
      title: "Implement checkpoint flow",
      goal: "Create a portable checkpoint.",
      idempotencyKey: "start-checkpoint",
      ...identity,
    };
    expect(service.startWorkItem(workInput)).toEqual(service.startWorkItem(workInput));
    expect(repository.countEvents(first.id)).toBe(2);
    repository.close();
  });

  it("atomically creates artifacts, evidence events, and a checkpoint", async () => {
    const { repository, service, workspace, workItem } = await initializedFixture();
    const result = await service.createCheckpoint({
      workspaceId: workspace.id,
      workItemId: workItem.id,
      idempotencyKey: "checkpoint-1",
      summary: "Storage and compiler are implemented.",
      completed: ["Implemented canonical storage"],
      pending: ["Implement MCP"],
      decisions: [{ summary: "Use deterministic packs", alternatives: ["LLM-only summaries"] }],
      constraints: [{ summary: "Never persist secrets", kind: "security" }],
      failedAttempts: [{ summary: "Tried a flat prompt", reason: "No provenance" }],
      tests: [{ command: "pnpm test", status: "passed", durationMs: 500 }],
      nextActions: ["Implement MCP"],
      relevantFiles: ["src/index.ts"],
      ...identity,
    });

    expect(result.replayed).toBe(false);
    expect(result.checkpoint.eventType).toBe("checkpoint.created");
    expect(result.artifacts.length).toBeGreaterThanOrEqual(3);
    expect(repository.countEvents(workspace.id, workItem.id)).toBe(result.events.length + 1);

    const replay = await service.createCheckpoint({
      workspaceId: workspace.id,
      workItemId: workItem.id,
      idempotencyKey: "checkpoint-1",
      nextActions: [],
      ...identity,
    });
    expect(replay.replayed).toBe(true);
    expect(repository.countEvents(workspace.id, workItem.id)).toBe(result.events.length + 1);
    repository.close();
  });

  it("bootstraps a provenance-complete fresh handoff without memory", async () => {
    const { repository, service, workspace, workItem } = await initializedFixture();
    const checkpoint = await service.createCheckpoint({
      workspaceId: workspace.id,
      workItemId: workItem.id,
      idempotencyKey: "checkpoint-bootstrap",
      completed: ["Implemented event storage"],
      pending: ["Implement MCP server"],
      nextActions: ["Build the MCP tool surface"],
      ...identity,
    });
    service.createHandoff({
      workspaceId: workspace.id,
      workItemId: workItem.id,
      checkpointEventId: checkpoint.checkpoint.eventId,
      idempotencyKey: "handoff-b",
      targetAgent: "cursor",
      ...identity,
    });
    const handoffCount = repository.countEvents(workspace.id, workItem.id);
    service.createHandoff({
      workspaceId: workspace.id,
      workItemId: workItem.id,
      checkpointEventId: checkpoint.checkpoint.eventId,
      idempotencyKey: "handoff-b",
      targetAgent: "cursor",
      ...identity,
    });
    expect(repository.countEvents(workspace.id, workItem.id)).toBe(handoffCount);

    const bootstrap = await service.bootstrap({
      workspaceId: workspace.id,
      workItemId: workItem.id,
      intent: "Continue implementing MCP",
      tokenBudget: 2_000,
    });

    expect(bootstrap.pack.freshness.status).toBe("fresh");
    expect(bootstrap.pack.completed[0]?.summary).toContain("event storage");
    expect(bootstrap.pack.pending[0]?.summary).toContain("MCP server");
    expect(bootstrap.pack.nextActions[0]?.summary).toContain("MCP tool surface");
    expect(bootstrap.markdown).toContain("ContextWeft ContextPack");
    expect(bootstrap.warnings).toEqual([]);
    repository.close();
  });

  it("rejects path traversal and sensitive artifact paths", async () => {
    const { repository, service, workspace, workItem } = await initializedFixture();
    const base = {
      workspaceId: workspace.id,
      workItemId: workItem.id,
      nextActions: ["Continue"],
      ...identity,
    };

    await expect(
      service.createCheckpoint({
        ...base,
        idempotencyKey: "unsafe-parent",
        relevantFiles: ["../secret.txt"],
      }),
    ).rejects.toBeInstanceOf(UnsafeArtifactPathError);
    await expect(
      service.createCheckpoint({
        ...base,
        idempotencyKey: "unsafe-secret",
        relevantFiles: [".env.production"],
      }),
    ).rejects.toBeInstanceOf(UnsafeArtifactPathError);
    repository.close();
  });

  it("degrades gracefully when memory and current Git are unavailable", async () => {
    const repository = new SqliteCanonicalRepository({ path: ":memory:" });
    const git = new FakeGit();
    const service = new ContextWeftService({
      repository,
      git,
      memory: {
        async search() {
          throw new Error("memory offline");
        },
        async ingest() {},
        async rebuild() {},
      },
      clock: { now: () => new Date(time) },
    });
    const workspace = await service.initializeWorkspace({
      rootPath: gitSnapshot.repositoryRoot,
      name: "Degraded fixture",
      ...identity,
    });
    const workItem = service.startWorkItem({
      workspaceId: workspace.id,
      title: "Degraded bootstrap",
      goal: "Continue without memory.",
      idempotencyKey: "degraded-start",
      ...identity,
    });
    await service.createCheckpoint({
      workspaceId: workspace.id,
      workItemId: workItem.id,
      idempotencyKey: "degraded-checkpoint",
      nextActions: ["Continue canonically"],
      ...identity,
    });
    git.capture = async () => {
      throw new Error("git offline");
    };

    const result = await service.bootstrap({
      workspaceId: workspace.id,
      workItemId: workItem.id,
      intent: "Continue",
      tokenBudget: 1_000,
    });
    expect(result.pack.freshness.status).toBe("missing");
    expect(result.warnings).toHaveLength(2);
    repository.close();
  });

  it("keeps memory writes canonical and makes derived indexing retryable", async () => {
    const repository = new SqliteCanonicalRepository({ path: ":memory:" });
    const indexed: string[] = [];
    let indexAvailable = false;
    const service = new ContextWeftService({
      repository,
      git: new FakeGit(),
      memory: {
        async search() {
          return [];
        },
        async ingest(events) {
          if (!indexAvailable) {
            throw new Error("index offline");
          }
          indexed.push(...events.map((event) => event.eventId));
        },
        async rebuild(_workspaceId, events) {
          indexed.push(...events.map((event) => event.eventId));
        },
      },
      clock: { now: () => new Date(time) },
    });
    const workspace = await service.initializeWorkspace({
      rootPath: gitSnapshot.repositoryRoot,
      name: "Memory fixture",
      ...identity,
    });
    const workItem = service.startWorkItem({
      workspaceId: workspace.id,
      title: "Remember architecture",
      goal: "Keep decisions across agents.",
      idempotencyKey: "memory-work",
      ...identity,
    });

    const first = await service.recordMemory({
      workspaceId: workspace.id,
      workItemId: workItem.id,
      idempotencyKey: "memory-1",
      content: "Context packs are compiled deterministically.",
      kind: "decision",
      confidence: 1,
      ...identity,
    });
    expect(first.indexed).toBe(false);
    expect(first.warnings[0]).toContain("safely stored");
    expect(repository.getEvent(first.event.eventId)).toEqual(first.event);

    indexAvailable = true;
    const replay = await service.recordMemory({
      workspaceId: workspace.id,
      workItemId: workItem.id,
      idempotencyKey: "memory-1",
      content: "A retried payload cannot overwrite the canonical fact.",
      kind: "fact",
      confidence: 0.5,
      ...identity,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.indexed).toBe(true);
    expect(replay.event).toEqual(first.event);

    const correction = await service.correctMemory({
      workspaceId: workspace.id,
      workItemId: workItem.id,
      idempotencyKey: "memory-correction-1",
      targetEventId: first.event.eventId,
      content: "Context packs are deterministic for the same canonical inputs.",
      reason: "Clarify the determinism boundary.",
      ...identity,
    });
    expect(correction.event.eventType).toBe("memory.corrected");
    expect(correction.indexed).toBe(true);
    const correctionReplay = await service.correctMemory({
      workspaceId: workspace.id,
      workItemId: workItem.id,
      idempotencyKey: "memory-correction-1",
      targetEventId: "evt:does-not-exist",
      content: "A retry does not mutate canonical correction data.",
      reason: "Retry fixture.",
      ...identity,
    });
    expect(correctionReplay.replayed).toBe(true);
    expect(correctionReplay.event).toEqual(correction.event);

    const rebuilt = await service.rebuildMemory(workspace.id);
    expect(rebuilt.eventsProcessed).toBe(2);
    expect(indexed).toContain(first.event.eventId);
    repository.close();
  });
});
