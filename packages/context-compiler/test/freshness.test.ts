import { describe, expect, it } from "vitest";
import { evaluateFreshness } from "../src/index.js";
import { git } from "./fixtures.js";

describe("evaluateFreshness", () => {
  it("reports whether the checkpoint or current Git snapshot is missing", () => {
    expect(evaluateFreshness(git, undefined)).toEqual({
      status: "missing",
      checkpoint: git,
      reasons: ["No current Git snapshot is available."],
    });

    expect(evaluateFreshness(undefined, git)).toEqual({
      status: "missing",
      current: git,
      reasons: ["No checkpoint Git snapshot is available."],
    });
  });

  it("describes unborn repository revision divergence", () => {
    const { revision: _revision, ...unborn } = git;
    const current = { ...git, revision: "c".repeat(40), fingerprint: "d".repeat(64) };

    expect(evaluateFreshness(unborn, current).reasons[0]).toContain("unborn");
    expect(evaluateFreshness(current, unborn).reasons[0]).toContain("to unborn");
  });
});
