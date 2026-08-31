import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EntityConflictError,
  EntityNotFoundError,
  IdempotencyConflictError,
  LATEST_SCHEMA_VERSION,
  SqliteCanonicalRepository,
  StorageClosedError,
} from "../src/index.js";
import { artifact, decisionEvent, workItem, workspace } from "./fixtures.js";

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
        eventTypes: ["decision.recorded"],
      }),
    ).toEqual([first]);
    repository.close();
  });

  it("survives close and reopen without changing canonical data", () => {
    const directory = mkdtempSync(join(tmpdir(), "contextweft-storage-"));
    const path = join(directory, "contextweft.db");
    const first = new SqliteCanonicalRepository({ path });
    first.putWorkspace(workspace);
    first.putWorkItem(workItem);
    first.appendEvent(decisionEvent());
    first.close();

    const reopened = new SqliteCanonicalRepository({ path });
    expect(reopened.getEvent("evt_000000")).toEqual(decisionEvent());
    reopened.close();
  });

  it("fails predictably after close", () => {
    const repository = memoryRepository();
    repository.close();
    expect(() => repository.listWorkspaces()).toThrow(StorageClosedError);
    expect(() => repository.close()).not.toThrow();
  });
});
