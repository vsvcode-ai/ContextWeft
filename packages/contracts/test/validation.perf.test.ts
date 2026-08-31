import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { parseContextEvent } from "../src/index.js";
import { decisionEventFixture } from "./fixtures.js";

describe("contracts performance budget", () => {
  it("validates 10,000 representative events within 500 ms", () => {
    // Warm the generated checker so the budget measures steady-state validation.
    parseContextEvent(decisionEventFixture);
    const startedAt = performance.now();
    for (let index = 0; index < 10_000; index += 1) {
      parseContextEvent(decisionEventFixture);
    }
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs).toBeLessThan(500);
  });
});
