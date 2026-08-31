import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { SqliteCanonicalRepository } from "@contextweft/storage";
import { ContextWeftService } from "../src/index.js";
import { FakeGit, gitSnapshot, identity, time } from "./fixtures.js";

describe("application performance budget", () => {
  it("creates and bootstraps a 1,000-event checkpoint within 1 second", async () => {
    const repository = new SqliteCanonicalRepository({ path: ":memory:" });
    const service = new ContextWeftService({
      repository,
      git: new FakeGit(),
      clock: { now: () => new Date(time) },
    });
    const workspace = await service.initializeWorkspace({
      rootPath: gitSnapshot.repositoryRoot,
      name: "Performance fixture",
      ...identity,
    });
    const workItem = service.startWorkItem({
      workspaceId: workspace.id,
      title: "Performance checkpoint",
      goal: "Measure application orchestration.",
      idempotencyKey: "perf-start",
      ...identity,
    });
    const progress = Array.from({ length: 1_000 }, (_, index) => `Completed unit ${index}`);

    const startedAt = performance.now();
    await service.createCheckpoint({
      workspaceId: workspace.id,
      workItemId: workItem.id,
      idempotencyKey: "perf-checkpoint",
      completed: progress,
      nextActions: ["Continue"],
      ...identity,
    });
    const bootstrap = await service.bootstrap({
      workspaceId: workspace.id,
      workItemId: workItem.id,
      intent: "Continue",
      tokenBudget: 12_000,
    });
    const elapsedMs = performance.now() - startedAt;

    expect(bootstrap.pack.budget.used).toBeLessThanOrEqual(12_000);
    expect(elapsedMs).toBeLessThan(1_000);
    repository.close();
  });
});
