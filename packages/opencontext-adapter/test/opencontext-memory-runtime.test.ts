import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OpenContextCompatibilityError,
  OpenContextMemoryRuntime,
  OpenContextRuntimeStateError,
} from "../src/index.js";
import { FakeOpenContextStore, memoryCorrected, memoryRecorded } from "./fixtures.js";

describe("OpenContextMemoryRuntime", () => {
  it("maps canonical events into scoped, provenance-preserving recall", async () => {
    const store = new FakeOpenContextStore();
    const runtime = await OpenContextMemoryRuntime.open({
      dbPath: "relative-memory.db",
      factory: async () => store,
    });
    const event = memoryRecorded();
    await runtime.ingest([event]);

    const raw = store.manager.messages.get(event.eventId);
    expect(raw?.messageId).toBe(event.eventId);
    expect(raw?.userId).toBe(`contextweft:workspace:${event.workspaceId}`);
    expect(raw?.channel).toBe(`contextweft:work-item:${event.workItemId}`);
    expect(Reflect.get(raw?.metadata ?? {}, "artifactIds")).toEqual(["artifact:design"]);

    const recalls = await runtime.search({
      workspaceId: event.workspaceId,
      workItemId: event.workItemId ?? "",
      query: "deterministic",
      limit: 10,
    });
    expect(recalls).toEqual([
      expect.objectContaining({
        id: event.eventId,
        content: event.payload.content,
        sourceEventIds: [event.eventId],
        artifactIds: ["artifact:design"],
      }),
    ]);

    const otherWorkItem = await runtime.search({
      workspaceId: event.workspaceId,
      workItemId: "work:other",
      query: "deterministic",
      limit: 10,
    });
    expect(otherWorkItem).toEqual([]);
    await runtime.close();
  });

  it("stores a correction before deprecating the superseded fact", async () => {
    const store = new FakeOpenContextStore();
    const runtime = await OpenContextMemoryRuntime.open({
      dbPath: ":memory:",
      factory: async () => store,
    });
    const original = memoryRecorded();
    const correction = memoryCorrected(original.eventId);
    await runtime.rebuild(original.workspaceId, [original, correction]);

    expect(store.manager.operationOrder).toEqual(["store", "deprecate"]);
    expect(store.manager.messages.get(original.eventId)?.deprecated).toBe(true);
    expect(store.manager.messages.get(correction.eventId)?.deprecated).toBe(false);
    const results = await runtime.search({
      workspaceId: original.workspaceId,
      workItemId: original.workItemId ?? "",
      query: "identical",
      limit: 10,
    });
    expect(results[0]?.sourceEventIds).toEqual([correction.eventId, original.eventId]);
    await runtime.close();
  });

  it("rejects invalid upstream APIs, cross-workspace rebuilds, and use after close", async () => {
    await expect(
      OpenContextMemoryRuntime.open({ dbPath: ":memory:", factory: async () => ({}) }),
    ).rejects.toBeInstanceOf(OpenContextCompatibilityError);

    const runtime = await OpenContextMemoryRuntime.open({
      dbPath: ":memory:",
      factory: async () => new FakeOpenContextStore(),
    });
    await expect(runtime.rebuild("ws:other", [memoryRecorded()])).rejects.toBeInstanceOf(
      OpenContextRuntimeStateError,
    );
    await runtime.close();
    await expect(
      runtime.search({
        workspaceId: "ws:test",
        workItemId: "work:test",
        query: "test",
        limit: 1,
      }),
    ).rejects.toBeInstanceOf(OpenContextRuntimeStateError);
  });

  it("runs offline against the real embedded OpenContext SQLite store", async () => {
    const directory = await mkdtemp(join(tmpdir(), "contextweft-opencontext-"));
    const runtime = await OpenContextMemoryRuntime.open({
      dbPath: join(directory, "memory.db"),
    });
    try {
      const original = memoryRecorded();
      await runtime.ingest([original]);
      const first = await runtime.search({
        workspaceId: original.workspaceId,
        workItemId: original.workItemId ?? "",
        query: "deterministic provenance",
        limit: 10,
      });
      expect(first.map((recall) => recall.id)).toContain(original.eventId);

      const correction = memoryCorrected(original.eventId);
      await runtime.ingest([correction]);
      const corrected = await runtime.search({
        workspaceId: original.workspaceId,
        workItemId: original.workItemId ?? "",
        query: "identical canonical inputs",
        limit: 10,
      });
      expect(corrected.map((recall) => recall.id)).toContain(correction.eventId);
      expect(corrected.map((recall) => recall.id)).not.toContain(original.eventId);

      await runtime.rebuild(original.workspaceId, [original, correction]);
    } finally {
      await runtime.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("persists recall across runtime restarts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "contextweft-opencontext-restart-"));
    const databasePath = join(directory, "memory.db");
    const event = memoryRecorded();
    const first = await OpenContextMemoryRuntime.open({ dbPath: databasePath });
    await first.ingest([event]);
    await first.close();

    const second = await OpenContextMemoryRuntime.open({ dbPath: databasePath });
    try {
      const recalls = await second.search({
        workspaceId: event.workspaceId,
        workItemId: event.workItemId ?? "",
        query: "deterministic provenance",
        limit: 10,
      });
      expect(recalls.map((recall) => recall.id)).toContain(event.eventId);
    } finally {
      await second.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
