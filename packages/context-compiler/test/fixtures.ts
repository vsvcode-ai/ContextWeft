import type {
  ArtifactRef,
  ContextEvent,
  GitSnapshot,
  WorkItem,
  Workspace,
} from "@contextweft/contracts";

export const observedAt = "2026-08-31T12:00:00.000Z";
export const workspace: Workspace = {
  schemaVersion: "0.1",
  id: "ws_compiler",
  name: "Compiler fixture",
  rootPath: "/tmp/compiler",
  createdAt: observedAt,
  updatedAt: observedAt,
  metadata: {},
};
export const workItem: WorkItem = {
  schemaVersion: "0.1",
  id: "work_compiler",
  workspaceId: workspace.id,
  title: "Compile a handoff",
  goal: "Generate a trustworthy handoff.",
  status: "active",
  createdAt: observedAt,
  updatedAt: observedAt,
  metadata: {},
};
export const git: GitSnapshot = {
  repositoryRoot: workspace.rootPath,
  revision: "a".repeat(40),
  branch: "main",
  dirty: true,
  changedFiles: ["src/compiler.ts"],
  excludedSensitiveFiles: 0,
  observedAt,
  fingerprint: "b".repeat(64),
};

function base(eventId: string, eventType: ContextEvent["eventType"]) {
  return {
    schemaVersion: "0.1" as const,
    eventId,
    eventType,
    workspaceId: workspace.id,
    workItemId: workItem.id,
    occurredAt: observedAt,
    observedAt,
    actor: { type: "agent" as const, id: "agent_a" },
    source: { kind: "test" as const },
    idempotencyKey: `idem_${eventId}`,
    provenance: { observedAt, sourceEventIds: [], artifactIds: ["artifact_compiler"] },
    metadata: {},
  };
}

export const events: ContextEvent[] = [
  {
    ...base("evt_created", "work_item.created"),
    eventType: "work_item.created",
    payload: { title: workItem.title, goal: workItem.goal },
  },
  {
    ...base("evt_decision", "decision.recorded"),
    eventType: "decision.recorded",
    payload: { summary: "Use deterministic ordering", alternatives: ["Model-generated ordering"] },
  },
  {
    ...base("evt_constraint", "constraint.recorded"),
    eventType: "constraint.recorded",
    payload: { summary: "Never include secrets", kind: "security" },
  },
  {
    ...base("evt_progress", "progress.recorded"),
    eventType: "progress.recorded",
    payload: { summary: "Compiler skeleton is complete", status: "completed" },
  },
  {
    ...base("evt_failure", "attempt.failed"),
    eventType: "attempt.failed",
    payload: { summary: "Tried raw transcript concatenation", reason: "Exceeded token budget" },
  },
  {
    ...base("evt_checkpoint", "checkpoint.created"),
    eventType: "checkpoint.created",
    payload: {
      summary: "Ready to add renderers",
      nextActions: ["Implement Markdown rendering", "Add performance tests"],
      artifactIds: ["artifact_compiler"],
      git,
    },
  },
];

export const artifact: ArtifactRef = {
  schemaVersion: "0.1",
  id: "artifact_compiler",
  workspaceId: workspace.id,
  workItemId: workItem.id,
  kind: "file",
  uri: "file:///tmp/compiler/src/compiler.ts",
  title: "src/compiler.ts",
  gitRevision: "a".repeat(40),
  observedAt,
  metadata: {},
};
