import type { GitSnapshot } from "@contextweft/contracts";
import type { GitSnapshotProvider } from "@contextweft/git-adapter";

export const time = "2026-08-31T13:00:00.000Z";
export const gitSnapshot: GitSnapshot = {
  repositoryRoot: "/tmp/contextweft-app",
  revision: "a".repeat(40),
  branch: "main",
  dirty: true,
  changedFiles: ["src/index.ts"],
  excludedSensitiveFiles: 0,
  observedAt: time,
  fingerprint: "b".repeat(64),
};

export class FakeGit implements GitSnapshotProvider {
  public snapshot = gitSnapshot;

  public async capture(): Promise<GitSnapshot> {
    return this.snapshot;
  }
}

export const identity = {
  actor: { type: "agent" as const, id: "agent_a" },
  source: { kind: "test" as const },
};
