import { describe, expect, it } from "vitest";
import type { ContextEvent } from "@contextweft/contracts";
import { SqliteCanonicalRepository } from "@contextweft/storage";
import {
  ContextWeftService,
  InvalidCheckpointError,
  UnsafeArtifactPathError,
} from "../src/index.js";
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
  it("can be constructed with default infrastructure adapters", () => {
    const repository = new SqliteCanonicalRepository({ path: ":memory:" });
    expect(new ContextWeftService({ repository })).toBeInstanceOf(ContextWeftService);
    repository.close();
  });

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
    expect(() =>
      service.startWorkItem({ ...workInput, workspaceId: "ws:missing", idempotencyKey: "missing" }),
    ).toThrow();
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
    await expect(
      service.createCheckpoint({
        ...base,
        idempotencyKey: "unsafe-absolute",
        relevantFiles: ["/tmp/contextweft-app/src/index.ts"],
      }),
    ).rejects.toBeInstanceOf(UnsafeArtifactPathError);
    await expect(
      service.createCheckpoint({
        ...base,
        idempotencyKey: "unsafe-root",
        relevantFiles: ["."],
      }),
    ).rejects.toBeInstanceOf(UnsafeArtifactPathError);
    repository.close();
  });

  it("rejects incomplete checkpoints and invalid handoffs", async () => {
    const { repository, service, workspace, workItem } = await initializedFixture();
    repository.appendEvent(conflictEvent(workspace.id, workItem.id, "handoff:conflict"));

    await expect(
      service.createCheckpoint({
        workspaceId: workspace.id,
        workItemId: workItem.id,
        idempotencyKey: "empty-checkpoint",
        nextActions: [],
        ...identity,
      }),
    ).rejects.toBeInstanceOf(InvalidCheckpointError);
    expect(() =>
      service.createHandoff({
        workspaceId: workspace.id,
        workItemId: workItem.id,
        checkpointEventId: "evt:missing",
        idempotencyKey: "bad-handoff",
        note: "Cannot hand off a missing checkpoint",
        ...identity,
      }),
    ).toThrow(InvalidCheckpointError);
    expect(() =>
      service.createHandoff({
        workspaceId: workspace.id,
        workItemId: "work:missing",
        checkpointEventId: "evt:missing",
        idempotencyKey: "missing-work-item",
        ...identity,
      }),
    ).toThrow();
    expect(() =>
      service.createHandoff({
        workspaceId: workspace.id,
        workItemId: workItem.id,
        checkpointEventId: "evt:missing",
        idempotencyKey: "conflict",
        ...identity,
      }),
    ).toThrow(InvalidCheckpointError);

    const checkpoint = await service.createCheckpoint({
      workspaceId: workspace.id,
      workItemId: workItem.id,
      idempotencyKey: "handoff-note-checkpoint",
      nextActions: ["Continue"],
      ...identity,
    });
    const noteOnlyHandoff = service.createHandoff({
      workspaceId: workspace.id,
      workItemId: workItem.id,
      checkpointEventId: checkpoint.checkpoint.eventId,
      idempotencyKey: "handoff-note-only",
      note: "No target agent yet",
      ...identity,
    });
    expect(noteOnlyHandoff.payload).toEqual({
      checkpointEventId: checkpoint.checkpoint.eventId,
      note: "No target agent yet",
    });
    repository.close();
  });

  it("rejects checkpoint and memory idempotency keys owned by different event types", async () => {
    const { repository, service, workspace, workItem } = await initializedFixture();
    repository.appendEvents([
      conflictEvent(workspace.id, workItem.id, "checkpoint-conflict:checkpoint"),
      conflictEvent(workspace.id, workItem.id, "memory-record:conflict"),
      conflictEvent(workspace.id, workItem.id, "memory-correct:conflict"),
    ]);

    await expect(
      service.createCheckpoint({
        workspaceId: workspace.id,
        workItemId: workItem.id,
        idempotencyKey: "checkpoint-conflict",
        nextActions: ["Continue"],
        ...identity,
      }),
    ).rejects.toBeInstanceOf(InvalidCheckpointError);
    await expect(
      service.recordMemory({
        workspaceId: workspace.id,
        workItemId: workItem.id,
        idempotencyKey: "conflict",
        content: "Fact",
        kind: "fact",
        confidence: 1,
        ...identity,
      }),
    ).rejects.toBeInstanceOf(InvalidCheckpointError);
    await expect(
      service.correctMemory({
        workspaceId: workspace.id,
        workItemId: workItem.id,
        idempotencyKey: "conflict",
        targetEventId: "evt:missing",
        content: "Correction",
        reason: "Conflict",
        ...identity,
      }),
    ).rejects.toBeInstanceOf(InvalidCheckpointError);
    repository.close();
  });

  it("captures checkpoint optional fields against an unborn clean repository", async () => {
    const fixture = await initializedFixture();
    const unbornCleanSnapshot = (({
      revision: _revision,
      branch: _branch,
      ...snapshot
    }: typeof gitSnapshot) => snapshot)(gitSnapshot);
    fixture.git.snapshot = { ...unbornCleanSnapshot, dirty: false, changedFiles: [] };

    const result = await fixture.service.createCheckpoint({
      workspaceId: fixture.workspace.id,
      workItemId: fixture.workItem.id,
      idempotencyKey: "clean-checkpoint",
      goal: "Updated goal",
      summary: "No git commit exists yet.",
      completed: ["Completed branch coverage planning"],
      inProgress: ["Writing tests"],
      pending: ["Publish alpha"],
      decisions: [
        { summary: "Keep tests focused", rationale: "Coverage should explain behavior" },
        { summary: "No optional alternatives" },
      ],
      constraints: [{ summary: "Do not expose secrets", kind: "security" }],
      failedAttempts: [{ summary: "Tried ignoring source branches", reason: "It weakened signal" }],
      tests: [{ command: "pnpm test:coverage", status: "failed", summary: "Below 95%" }],
      nextActions: ["Run coverage again"],
      relevantFiles: ["src/index.ts", "./src/index.ts"],
      ...identity,
    });

    expect(result.artifacts.map((artifact) => artifact.kind)).toEqual(["file"]);
    expect(result.events.map((event) => event.eventType)).toEqual([
      "goal.updated",
      "progress.recorded",
      "progress.recorded",
      "progress.recorded",
      "decision.recorded",
      "decision.recorded",
      "constraint.recorded",
      "attempt.failed",
      "test.observed",
      "artifact.observed",
      "checkpoint.created",
    ]);
    fixture.repository.close();
  });

  it("captures branchless commits and unborn dirty diffs", async () => {
    const branchless = await initializedFixture();
    const branchlessSnapshot = (({ branch: _branch, ...snapshot }: typeof gitSnapshot) => snapshot)(
      gitSnapshot,
    );
    branchless.git.snapshot = { ...branchlessSnapshot, dirty: false, changedFiles: [] };
    const branchlessCheckpoint = await branchless.service.createCheckpoint({
      workspaceId: branchless.workspace.id,
      workItemId: branchless.workItem.id,
      idempotencyKey: "branchless-checkpoint",
      nextActions: ["Continue"],
      ...identity,
    });
    expect(branchlessCheckpoint.artifacts[0]?.metadata).toEqual({ branch: null });
    branchless.repository.close();

    const unbornDirty = await initializedFixture();
    const unbornDirtySnapshot = (({ revision: _revision, ...snapshot }: typeof gitSnapshot) =>
      snapshot)(gitSnapshot);
    unbornDirty.git.snapshot = { ...unbornDirtySnapshot, dirty: true };
    const dirtyCheckpoint = await unbornDirty.service.createCheckpoint({
      workspaceId: unbornDirty.workspace.id,
      workItemId: unbornDirty.workItem.id,
      idempotencyKey: "unborn-dirty-checkpoint",
      nextActions: ["Continue"],
      relevantFiles: ["src/index.ts"],
      ...identity,
    });
    expect(dirtyCheckpoint.artifacts.every((artifact) => artifact.gitRevision === undefined)).toBe(
      true,
    );
    unbornDirty.repository.close();
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
      validFrom: "2026-08-31T13:00:00.000Z",
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

    await expect(
      service.correctMemory({
        workspaceId: workspace.id,
        workItemId: workItem.id,
        idempotencyKey: "bad-memory-correction",
        targetEventId: "evt:missing",
        content: "Cannot correct a missing fact.",
        reason: "Missing target.",
        ...identity,
      }),
    ).rejects.toBeInstanceOf(InvalidCheckpointError);

    const stringThrowingService = new ContextWeftService({
      repository,
      git: new FakeGit(),
      memory: {
        async search() {
          throw "offline";
        },
        async ingest() {},
        async rebuild() {},
      },
      clock: { now: () => new Date(time) },
    });
    const search = await stringThrowingService.searchMemory({
      workspaceId: workspace.id,
      workItemId: workItem.id,
      query: "deterministic",
    });
    expect(search.warnings[0]).toContain("offline");

    const rebuilt = await service.rebuildMemory(workspace.id);
    expect(rebuilt.eventsProcessed).toBe(2);
    expect(indexed).toContain(first.event.eventId);
    repository.close();
  });
});

function conflictEvent(
  workspaceId: string,
  workItemId: string,
  idempotencyKey: string,
): ContextEvent {
  return {
    schemaVersion: "0.1",
    eventId: `evt:${idempotencyKey.replaceAll(":", "-")}`,
    eventType: "decision.recorded",
    workspaceId,
    workItemId,
    occurredAt: time,
    observedAt: time,
    actor: identity.actor,
    source: identity.source,
    idempotencyKey,
    payload: { summary: `Conflict for ${idempotencyKey}`, alternatives: [] },
    provenance: { observedAt: time, sourceEventIds: [], artifactIds: [] },
    metadata: {},
  };
}
