import { performance } from "node:perf_hooks";
import type { ContextEvent } from "@contextweft/contracts";
import { describe, expect, it } from "vitest";
import { DeterministicContextCompiler } from "../src/index.js";
import { artifact, events, git, workItem, workspace } from "./fixtures.js";

describe("compiler performance budget", () => {
  it("compiles 10,000 events within 750 ms", () => {
    const manyEvents: ContextEvent[] = [events[0] as ContextEvent];
    for (let index = 0; index < 9_999; index += 1) {
      manyEvents.push({
        ...(events[2] as Extract<ContextEvent, { eventType: "constraint.recorded" }>),
        eventId: `evt_constraint_${index.toString().padStart(5, "0")}`,
        idempotencyKey: `idem_constraint_${index.toString().padStart(5, "0")}`,
        payload: { summary: `Constraint ${index}`, kind: "technical" },
      });
    }
    manyEvents.push(events.at(-1) as ContextEvent);

    const startedAt = performance.now();
    const pack = new DeterministicContextCompiler().compile({
      workspace,
      workItem,
      events: manyEvents,
      artifacts: [artifact],
      currentGit: git,
      tokenBudget: 12_000,
    });
    const elapsedMs = performance.now() - startedAt;

    expect(pack.budget.used).toBeLessThanOrEqual(12_000);
    expect(pack.budget.omittedItemIds.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(750);
  });
});
