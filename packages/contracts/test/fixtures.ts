import type { ContextEvent, GitSnapshot, WorkItem, Workspace } from "../src/index.js";

export const timestamp = "2026-08-31T09:00:00.000Z";

export const workspaceFixture: Workspace = {
  schemaVersion: "0.1",
  id: "ws_contextweft",
  name: "ContextWeft",
  rootPath: "/work/contextweft",
  createdAt: timestamp,
  updatedAt: timestamp,
  metadata: {},
};

export const workItemFixture: WorkItem = {
  schemaVersion: "0.1",
  id: "work_auth",
  workspaceId: workspaceFixture.id,
  title: "Implement authentication",
  goal: "Implement authentication without storing plaintext credentials.",
  status: "active",
  createdAt: timestamp,
  updatedAt: timestamp,
  metadata: {},
};

export const gitSnapshotFixture: GitSnapshot = {
  repositoryRoot: workspaceFixture.rootPath,
  revision: "a".repeat(40),
  branch: "main",
  dirty: true,
  changedFiles: ["src/auth.ts"],
  excludedSensitiveFiles: 1,
  observedAt: timestamp,
  fingerprint: "b".repeat(64),
};

export const decisionEventFixture: ContextEvent = {
  schemaVersion: "0.1",
  eventId: "evt_decision_1",
  eventType: "decision.recorded",
  workspaceId: workspaceFixture.id,
  workItemId: workItemFixture.id,
  occurredAt: timestamp,
  observedAt: timestamp,
  actor: { type: "agent", id: "agent_a", displayName: "Agent A" },
  source: { kind: "mcp", agent: "codex", sessionId: "session_a" },
  idempotencyKey: "idem_decision_1",
  payload: {
    summary: "Use signed, HTTP-only session cookies.",
    rationale: "The application is server rendered and does not need browser token access.",
    alternatives: ["Store bearer tokens in local storage"],
  },
  provenance: {
    observedAt: timestamp,
    sourceEventIds: [],
    artifactIds: ["artifact_auth_design"],
  },
  metadata: {},
};
