import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { SqliteCanonicalRepository } from "../src/index.js";
import { decisionEvent, workItem, workspace } from "./fixtures.js";

describe("storage performance budgets", () => {
  it("appends and reads 10,000 canonical events within conservative CI budgets", () => {
    const repository = new SqliteCanonicalRepository({ path: ":memory:" });
    repository.putWorkspace(workspace);
    repository.putWorkItem(workItem);
    const events = Array.from({ length: 10_000 }, (_, index) => decisionEvent(index));

    const appendStartedAt = performance.now();
    repository.appendEvents(events);
    const appendElapsedMs = performance.now() - appendStartedAt;

    const readStartedAt = performance.now();
    const stored = repository.listEvents({ workspaceId: workspace.id, workItemId: workItem.id });
    const readElapsedMs = performance.now() - readStartedAt;

    expect(stored).toHaveLength(10_000);
    expect(appendElapsedMs).toBeLessThan(2_500);
    expect(readElapsedMs).toBeLessThan(1_000);
    repository.close();
  });
});
