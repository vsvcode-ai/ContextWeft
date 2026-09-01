import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ContextEvent } from "@contextweft/contracts";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  EntityConflictError,
  EntityNotFoundError,
  IdempotencyConflictError,
  LATEST_SCHEMA_VERSION,
  SqliteCanonicalRepository,
  StorageClosedError,
} from "../src/index.js";
import { artifact, decisionEvent, time, workItem, workspace } from "./fixtures.js";

function memoryRepository(): SqliteCanonicalRepository {
  const repository = new SqliteCanonicalRepository({ path: ":memory:" });
  repository.putWorkspace(workspace);
  repository.putWorkItem(workItem);
  return repository;
}

describe("SqliteCanonicalRepository", () => {
  it("migrates a new database and persists every canonical entity", () => {
    const repository = memoryRepository();
    expect(repository.schemaVersion).toBe(LATEST_SCHEMA_VERSION);

    repository.putArtifact(artifact);
    repository.appendEvent(decisionEvent());

    expect(repository.getWorkspace(workspace.id)).toEqual(workspace);
    expect(repository.findWorkspaceByRoot(workspace.rootPath)).toEqual(workspace);
    expect(repository.getWorkItem(workItem.id)).toEqual(workItem);
    expect(repository.getArtifact(artifact.id)).toEqual(artifact);
    expect(repository.getEvent("evt_000000")).toEqual(decisionEvent());
    expect(repository.getEventByIdempotencyKey(workspace.id, "idem_000000")).toEqual(
      decisionEvent(),
    );
    repository.close();
  });

  it("treats identical idempotent writes as successful no-ops", () => {
    const repository = memoryRepository();
    expect(repository.appendEvent(decisionEvent()).inserted).toBe(true);
    expect(repository.appendEvent(decisionEvent()).inserted).toBe(false);
    expect(repository.countEvents(workspace.id, workItem.id)).toBe(1);
    repository.close();
  });

  it("rejects reuse of an idempotency key for different content", () => {
    const repository = memoryRepository();
    const original = decisionEvent();
    repository.appendEvent(original);

    const conflicting = {
      ...decisionEvent(1),
      idempotencyKey: original.idempotencyKey,
    };
    expect(() => repository.appendEvent(conflicting)).toThrow(IdempotencyConflictError);
    repository.close();
  });

  it("prevents an entity identifier from moving across workspace boundaries", () => {
    const repository = memoryRepository();
    const otherWorkspace = {
      ...workspace,
      id: "ws_other",
      rootPath: "/tmp/contextweft-other",
    };
    repository.putWorkspace(otherWorkspace);

    expect(() => repository.putWorkItem({ ...workItem, workspaceId: otherWorkspace.id })).toThrow(
      EntityConflictError,
    );
    repository.close();
  });

  it("rolls back an event batch when an entity reference is invalid", () => {
    const repository = memoryRepository();
    const invalid = { ...decisionEvent(1), workItemId: "work_missing" };

    expect(() => repository.appendEvents([decisionEvent(), invalid])).toThrow(EntityNotFoundError);
    expect(repository.countEvents(workspace.id)).toBe(0);
    repository.close();
  });

  it("rolls back a complete application unit of work", () => {
    const repository = memoryRepository();

    expect(() =>
      repository.transaction(() => {
        repository.putArtifact(artifact);
        repository.appendEvent(decisionEvent());
        throw new Error("simulated process failure");
      }),
    ).toThrow("simulated process failure");

    expect(repository.getArtifact(artifact.id)).toBeUndefined();
    expect(repository.getEvent("evt_000000")).toBeUndefined();
    repository.close();
  });

  it("filters events deterministically by type and time", () => {
    const repository = memoryRepository();
    const first = decisionEvent(1);
    const second = {
      ...decisionEvent(2),
      eventType: "constraint.recorded" as const,
      payload: { summary: "Never store secrets", kind: "security" as const },
    };
    repository.appendEvents([second, first]);

    expect(
      repository.listEvents({
        workspaceId: workspace.id,
        workItemId: workItem.id,
        occurredAfter: "2026-08-31T09:59:00.000Z",
        occurredBefore: "2026-08-31T10:01:00.000Z",
        eventTypes: ["decision.recorded"],
        limit: 100,
      }),
    ).toEqual([first]);
    expect(repository.listEvents({ workspaceId: workspace.id, eventTypes: [], limit: -1 })).toEqual(
      [first],
    );
    repository.close();
  });

  it("round-trips workspace-scoped events and artifacts without optional fields", () => {
    const repository = memoryRepository();
    const workspaceEvent = {
      schemaVersion: "0.1" as const,
      eventId: "evt_workspace_initialized",
      eventType: "workspace.initialized" as const,
      workspaceId: workspace.id,
      occurredAt: "2026-08-31T10:00:04.000Z",
      observedAt: time,
      actor: { type: "agent" as const, id: "agent_test" },
      source: { kind: "test" as const },
      idempotencyKey: "idem_workspace_initialized",
      payload: { name: workspace.name, rootPath: workspace.rootPath },
      provenance: {
        observedAt: time,
        sourceEventIds: [],
        artifactIds: [],
      },
      metadata: {},
    };
    const workspaceArtifact = {
      schemaVersion: "0.1" as const,
      id: "artifact_workspace",
      workspaceId: workspace.id,
      kind: "terminal_output" as const,
      uri: "terminal://contextweft/session",
      observedAt: "2026-08-31T12:00:00.000Z",
      metadata: {},
    };

    repository.putArtifact(workspaceArtifact);
    expect(repository.listArtifacts(workspace.id)).toEqual([workspaceArtifact]);
    expect(repository.listArtifacts(workspace.id, workItem.id)).toEqual([]);

    repository.appendEvent(workspaceEvent);
    expect(repository.getEvent(workspaceEvent.eventId)).toEqual(workspaceEvent);
    expect(repository.countEvents(workspace.id)).toBe(1);
    repository.close();
  });

  it("rejects artifact and event identifiers that move across boundaries", () => {
    const repository = memoryRepository();
    repository.putArtifact(artifact);
    repository.putWorkspace({
      ...workspace,
      id: "ws_artifact_conflict",
      rootPath: "/tmp/contextweft-artifact-conflict",
    });
    repository.putWorkItem({
      ...workItem,
      id: "work_artifact_conflict",
    });
    expect(() =>
      repository.putArtifact({
        ...artifact,
        workItemId: "work_artifact_conflict",
      }),
    ).toThrow(EntityConflictError);
    const { workItemId: _conflictWorkItemId, ...artifactWithoutWorkItem } = artifact;
    expect(() =>
      repository.putArtifact({
        ...artifactWithoutWorkItem,
        workspaceId: "ws_artifact_conflict",
      }),
    ).toThrow(EntityConflictError);
    const { workItemId: _missingWorkItemId, ...artifactWithoutMissingWorkItem } = artifact;
    expect(() =>
      repository.putArtifact({ ...artifactWithoutMissingWorkItem, workspaceId: "ws_missing" }),
    ).toThrow(EntityNotFoundError);

    const conflictingEvent: ContextEvent = {
      ...(decisionEvent() as Extract<ContextEvent, { eventType: "decision.recorded" }>),
      payload: { summary: "different", alternatives: [] },
    };
    repository.appendEvent(decisionEvent());
    expect(() => repository.appendEvent(conflictingEvent)).toThrow(EntityConflictError);
    repository.close();
  });

  it("survives close and reopen without changing canonical data", () => {
    const directory = mkdtempSync(join(tmpdir(), "contextweft-storage-"));
    const path = join(directory, "contextweft.db");
    try {
      const first = new SqliteCanonicalRepository({ path });
      first.putWorkspace(workspace);
      first.putWorkItem(workItem);
      first.appendEvent(decisionEvent());
      first.close();

      const reopened = new SqliteCanonicalRepository({ path });
      expect(reopened.getEvent("evt_000000")).toEqual(decisionEvent());
      reopened.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fails closed instead of replacing a corrupted database", () => {
    const directory = mkdtempSync(join(tmpdir(), "contextweft-corrupt-"));
    const path = join(directory, "contextweft.db");
    try {
      writeFileSync(path, "not a sqlite database");
      expect(() => new SqliteCanonicalRepository({ path })).toThrow();
      expect(() => new SqliteCanonicalRepository({ path, readonly: true })).toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects databases newer than the supported schema", () => {
    const directory = mkdtempSync(join(tmpdir(), "contextweft-newer-schema-"));
    const path = join(directory, "contextweft.db");
    try {
      const database = new Database(path);
      database.pragma(`user_version = ${LATEST_SCHEMA_VERSION + 1}`);
      database.close();
      expect(() => new SqliteCanonicalRepository({ path })).toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fails predictably after close", () => {
    const repository = memoryRepository();
    repository.close();
    expect(() => repository.listWorkspaces()).toThrow(StorageClosedError);
    expect(() => repository.close()).not.toThrow();
  });
});
