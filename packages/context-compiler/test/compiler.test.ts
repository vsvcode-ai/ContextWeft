import { describe, expect, it } from "vitest";
import {
  CompilerInputError,
  DeterministicContextCompiler,
  renderContextPackMarkdown,
} from "../src/index.js";
import { artifact, events, git, workItem, workspace } from "./fixtures.js";

describe("DeterministicContextCompiler", () => {
  const compiler = new DeterministicContextCompiler();

  it("produces a deterministic, provenance-complete ContextPack", () => {
    const request = {
      workspace,
      workItem,
      events,
      artifacts: [artifact],
      currentGit: git,
      tokenBudget: 2_000,
    };
    const first = compiler.compile(request);
    const second = compiler.compile({ ...request, events: [...events].reverse() });

    expect(first).toEqual(second);
    expect(first.freshness.status).toBe("fresh");
    expect(first.decisions).toHaveLength(1);
    expect(first.constraints).toHaveLength(1);
    expect(first.failedAttempts).toHaveLength(1);
    expect(first.nextActions).toHaveLength(2);
    expect(first.provenance).toHaveLength(
      1 +
        first.currentState.length +
        first.completed.length +
        first.pending.length +
        first.decisions.length +
        first.constraints.length +
        first.failedAttempts.length +
        first.tests.length +
        first.relevantMemory.length +
        first.nextActions.length,
    );
  });

  it("enforces a hard token budget and reports omitted items", () => {
    const pack = compiler.compile({
      workspace,
      workItem,
      events,
      artifacts: [artifact],
      currentGit: git,
      tokenBudget: 128,
    });

    expect(pack.budget.used).toBeLessThanOrEqual(128);
    expect(pack.budget.truncated).toBe(true);
    expect(pack.budget.omittedItemIds.length).toBeGreaterThan(0);
  });

  it("marks revision and working-tree divergence separately", () => {
    const revisionPack = compiler.compile({
      workspace,
      workItem,
      events,
      artifacts: [],
      currentGit: { ...git, revision: "c".repeat(40), fingerprint: "d".repeat(64) },
      tokenBudget: 2_000,
    });
    const dirtyPack = compiler.compile({
      workspace,
      workItem,
      events,
      artifacts: [],
      currentGit: { ...git, fingerprint: "d".repeat(64) },
      tokenBudget: 2_000,
    });

    expect(revisionPack.freshness.status).toBe("revision-diverged");
    expect(dirtyPack.freshness.status).toBe("dirty-changed");
  });

  it("renders Markdown with an explicit untrusted-data boundary", () => {
    const pack = compiler.compile({
      workspace,
      workItem,
      events,
      artifacts: [artifact],
      currentGit: git,
      tokenBudget: 2_000,
    });
    const markdown = renderContextPackMarkdown(pack);

    expect(markdown).toContain("Security boundary");
    expect(markdown).toContain("## Decisions");
    expect(markdown).toContain("--- END CONTEXTWEFT EVIDENCE ---");
  });

  it("rejects a work item from another workspace", () => {
    expect(() =>
      compiler.compile({
        workspace,
        workItem: { ...workItem, workspaceId: "ws_other" },
        events,
        artifacts: [],
        tokenBudget: 2_000,
      }),
    ).toThrow(CompilerInputError);
  });
});
