import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { generateAgentSetupGuide, parseOptions } from "../src/index.js";

describe("CLI performance gates", () => {
  it("parses 100,000 strict command option sets within 500 ms", () => {
    const definitions = {
      title: { type: "string" as const },
      goal: { type: "string" as const },
      json: { type: "boolean" as const },
    };
    const startedAt = performance.now();
    for (let index = 0; index < 100_000; index += 1) {
      parseOptions(["--title", `Task ${index}`, "--goal=Continue", "--json"], definitions);
    }
    expect(performance.now() - startedAt).toBeLessThan(500);
  });

  it("generates 100,000 agent setup guides within 500 ms", () => {
    const startedAt = performance.now();
    for (let index = 0; index < 100_000; index += 1) {
      generateAgentSetupGuide({
        agent: index % 3 === 0 ? "codex" : index % 3 === 1 ? "cursor" : "claude-code",
      });
    }
    expect(performance.now() - startedAt).toBeLessThan(500);
  });
});
