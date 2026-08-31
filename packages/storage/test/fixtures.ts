import type { ArtifactRef, ContextEvent, WorkItem, Workspace } from "@contextweft/contracts";

export const time = "2026-08-31T10:00:00.000Z";

export const workspace: Workspace = {
  schemaVersion: "0.1",
  id: "ws_test",
  name: "Test workspace",
  rootPath: "/tmp/contextweft-test",
  createdAt: time,
  updatedAt: time,
  metadata: {},
};

export const workItem: WorkItem = {
  schemaVersion: "0.1",
  id: "work_test",
  workspaceId: workspace.id,
  title: "Test work",
  goal: "Prove canonical storage behavior.",
  status: "active",
  createdAt: time,
  updatedAt: time,
  metadata: {},
};

export const artifact: ArtifactRef = {
  schemaVersion: "0.1",
  id: "artifact_test",
  workspaceId: workspace.id,
  workItemId: workItem.id,
  kind: "file",
  uri: "file:///tmp/contextweft-test/src/index.ts",
  title: "src/index.ts",
  contentHash: "a".repeat(64),
  gitRevision: "b".repeat(40),
  observedAt: time,
  metadata: {},
};

export function decisionEvent(index = 0): ContextEvent {
  const suffix = index.toString().padStart(6, "0");
  return {
    schemaVersion: "0.1",
    eventId: `evt_${suffix}`,
    eventType: "decision.recorded",
    workspaceId: workspace.id,
    workItemId: workItem.id,
    occurredAt: `2026-08-31T10:00:${(index % 60).toString().padStart(2, "0")}.000Z`,
    observedAt: time,
    actor: { type: "agent", id: "agent_test" },
    source: { kind: "test" },
    idempotencyKey: `idem_${suffix}`,
    payload: {
      summary: `Decision ${index}`,
      alternatives: [],
    },
    provenance: {
      observedAt: time,
      sourceEventIds: [],
      artifactIds: [],
    },
    metadata: {},
  };
}
