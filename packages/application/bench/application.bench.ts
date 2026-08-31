import { Bench } from "tinybench";
import { SqliteCanonicalRepository } from "@contextweft/storage";
import { ContextWeftService } from "../src/index.js";
import { FakeGit, gitSnapshot, identity, time } from "../test/fixtures.js";

const repository = new SqliteCanonicalRepository({ path: ":memory:" });
const service = new ContextWeftService({
  repository,
  git: new FakeGit(),
  clock: { now: () => new Date(time) },
});
const workspace = await service.initializeWorkspace({
  rootPath: gitSnapshot.repositoryRoot,
  name: "Benchmark fixture",
  ...identity,
});
const workItem = service.startWorkItem({
  workspaceId: workspace.id,
  title: "Benchmark bootstrap",
  goal: "Measure bootstrap orchestration.",
  idempotencyKey: "bench-start",
  ...identity,
});
await service.createCheckpoint({
  workspaceId: workspace.id,
  workItemId: workItem.id,
  idempotencyKey: "bench-checkpoint",
  completed: ["Built the fixture"],
  nextActions: ["Measure bootstrap"],
  ...identity,
});

const bench = new Bench({ name: "application", time: 1_000, warmupTime: 250 });
bench.add("bootstrap representative work item", async () => {
  await service.bootstrap({
    workspaceId: workspace.id,
    workItemId: workItem.id,
    intent: "Continue",
    tokenBudget: 2_000,
  });
});
await bench.run();
console.table(bench.table());
repository.close();
