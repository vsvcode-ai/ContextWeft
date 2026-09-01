import { describe, expect, it } from "vitest";
import { HeuristicTokenEstimator } from "../src/index.js";

describe("HeuristicTokenEstimator", () => {
  const estimator = new HeuristicTokenEstimator();

  it("counts CJK conservatively and groups ASCII", () => {
    expect(estimator.estimate("abcdefgh")).toBe(2);
    expect(estimator.estimate("上下文继承")).toBe(5);
  });

  it("truncates without splitting Unicode code points or exceeding the limit", () => {
    const truncated = estimator.truncate("Context上下文continuity", 6);
    expect(estimator.estimate(truncated)).toBeLessThanOrEqual(6);
    expect(truncated.endsWith("…")).toBe(true);
  });

  it("returns empty or original text when no binary search is needed", () => {
    expect(estimator.truncate("anything", 0)).toBe("");
    expect(estimator.truncate("short", 10)).toBe("short");
  });
});
