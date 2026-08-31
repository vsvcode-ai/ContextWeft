import { describe, expect, it } from "vitest";
import {
  ContractValidationError,
  isContextEvent,
  parseContextEvent,
  parseGitSnapshot,
  parseWorkItem,
  parseWorkspace,
} from "../src/index.js";
import {
  decisionEventFixture,
  gitSnapshotFixture,
  workItemFixture,
  workspaceFixture,
} from "./fixtures.js";

describe("contract validation", () => {
  it("accepts the Golden workspace and work item", () => {
    expect(parseWorkspace(workspaceFixture)).toEqual(workspaceFixture);
    expect(parseWorkItem(workItemFixture)).toEqual(workItemFixture);
  });

  it("accepts a valid discriminated context event", () => {
    expect(isContextEvent(decisionEventFixture)).toBe(true);
    expect(parseContextEvent(decisionEventFixture)).toEqual(decisionEventFixture);
  });

  it("reports precise paths for invalid event payloads", () => {
    const invalid = {
      ...decisionEventFixture,
      payload: { ...decisionEventFixture.payload, alternatives: "not-an-array" },
    };

    expect(() => parseContextEvent(invalid)).toThrow(ContractValidationError);
    try {
      parseContextEvent(invalid);
    } catch (error) {
      expect(error).toBeInstanceOf(ContractValidationError);
      expect(
        (error as ContractValidationError).issues.some((issue) => issue.path.includes("payload")),
      ).toBe(true);
    }
  });

  it("rejects mutable-looking duplicate changed files", () => {
    expect(() =>
      parseGitSnapshot({
        ...gitSnapshotFixture,
        changedFiles: ["src/auth.ts", "src/auth.ts"],
      }),
    ).toThrow(ContractValidationError);
  });

  it("rejects timestamps that are not normalized to UTC", () => {
    expect(() =>
      parseWorkspace({ ...workspaceFixture, createdAt: "2026-08-31T17:00:00+08:00" }),
    ).toThrow(ContractValidationError);
  });
});
