import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OpenContextCompatibilityError,
  OpenContextMemoryRuntime,
  OpenContextRuntimeStateError,
} from "../src/index.js";
import {
  FakeOpenContextManager,
  FakeOpenContextStore,
  memoryCorrected,
  memoryRecorded,
} from "./fixtures.js";

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
    await expect(OpenContextMemoryRuntime.open({ dbPath: "   " })).rejects.toBeInstanceOf(
      OpenContextRuntimeStateError,
    );
    await expect(
      OpenContextMemoryRuntime.open({ dbPath: ":memory:", factory: async () => ({}) }),
    ).rejects.toBeInstanceOf(OpenContextCompatibilityError);
    await expect(
      OpenContextMemoryRuntime.open({
        dbPath: ":memory:",
        factory: async () => ({
          raw: { close: async () => undefined },
          getRawMessageManager: async () => ({}),
        }),
      }),
    ).rejects.toBeInstanceOf(OpenContextCompatibilityError);

    const runtime = await OpenContextMemoryRuntime.open({
      dbPath: ":memory:",
      factory: async () => new FakeOpenContextStore(),
    });
    await runtime.close();
    await expect(runtime.close()).resolves.toBeUndefined();
    await expect(runtime.ingest([])).rejects.toBeInstanceOf(OpenContextRuntimeStateError);

    const second = await OpenContextMemoryRuntime.open({
      dbPath: ":memory:",
      factory: async () => new FakeOpenContextStore(),
    });
    await expect(second.rebuild("ws:other", [memoryRecorded()])).rejects.toBeInstanceOf(
      OpenContextRuntimeStateError,
    );
    await second.close();
    await expect(
      second.search({
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

  it("normalizes search limits, empty queries, malformed hits, and recall metadata fallbacks", async () => {
    class BranchyManager extends FakeOpenContextManager {
      public mode: "fallback" | "wrong-channel" | "malformed" = "fallback";

      public override async lexicalSearchMessages(input: {
        readonly userId: string;
        readonly keywords: readonly string[];
        readonly limit: number;
        readonly botId: "contextweft";
      }) {
        if (this.mode === "malformed") {
          return [{ id: 1, content: "bad", similarity: 0.5, metadata: {} }];
        }
        const hits = await super.lexicalSearchMessages(input);
        return hits.map((hit) => ({
          ...hit,
          similarity: 2,
          metadata:
            this.mode === "wrong-channel"
              ? {
                  channel: "contextweft:work-item:other",
                  timestamp: Date.parse("2026-08-31T12:00:00.000Z"),
                }
              : {
                  channel: (hit.metadata as { readonly channel: string }).channel,
                  timestamp: Date.parse("2026-08-31T12:00:00.000Z"),
                },
        }));
      }

      public override async getMessageById() {
        return {
          metadata: { sourceEventIds: "bad", artifactIds: "bad" },
        };
      }
    }

    const manager = new BranchyManager();
    const store = {
      raw: { close: async () => undefined },
      getRawMessageManager: async () => manager,
    };
    const runtime = await OpenContextMemoryRuntime.open({
      dbPath: ":memory:",
      factory: async () => store,
    });
    const event = memoryRecorded({
      payload: {
        content: "Constraint memory for coverage",
        kind: "constraint",
        confidence: 0.4,
        validFrom: "2026-08-31T12:00:00.000Z",
      },
      provenance: { observedAt: "2026-08-31T12:00:00.000Z", sourceEventIds: [], artifactIds: [] },
    });

    await runtime.ingest([]);
    expect(
      await runtime.search({
        workspaceId: event.workspaceId,
        workItemId: event.workItemId ?? "",
        query: "a",
        limit: Number.NaN,
      }),
    ).toEqual([]);
    await runtime.ingest([
      event,
      {
        ...event,
        eventType: "progress.recorded",
        payload: { summary: "not memory", status: "completed" },
      },
    ]);
    const recalls = await runtime.search({
      workspaceId: event.workspaceId,
      workItemId: event.workItemId ?? "",
      query: "constraint coverage",
      limit: Number.POSITIVE_INFINITY,
    });
    expect(recalls[0]).toEqual(
      expect.objectContaining({
        id: event.eventId,
        score: 1,
        sourceEventIds: [event.eventId],
        artifactIds: [],
      }),
    );

    manager.mode = "wrong-channel";
    expect(
      await runtime.search({
        workspaceId: event.workspaceId,
        workItemId: event.workItemId ?? "",
        query: "constraint coverage",
        limit: 0,
      }),
    ).toEqual([]);

    manager.mode = "malformed";
    await expect(
      runtime.search({
        workspaceId: event.workspaceId,
        workItemId: event.workItemId ?? "",
        query: "constraint coverage",
        limit: 1,
      }),
    ).rejects.toBeInstanceOf(OpenContextCompatibilityError);
    await runtime.close();
  });

  it("handles malformed metadata, missing stored messages, workspace memory, and invalid timestamps", async () => {
    class MetadataManager extends FakeOpenContextManager {
      public stored: "normal" | "missing" = "normal";
      public hitMetadata: unknown = null;

      public override async lexicalSearchMessages(input: {
        readonly userId: string;
        readonly keywords: readonly string[];
        readonly limit: number;
        readonly botId: "contextweft";
      }) {
        const hits = await super.lexicalSearchMessages(input);
        return hits.map((hit) => ({ ...hit, metadata: this.hitMetadata }));
      }

      public override async getMessageById(messageId: string) {
        if (this.stored === "missing") {
          return null;
        }
        return super.getMessageById(messageId);
      }
    }

    const manager = new MetadataManager();
    const runtime = await OpenContextMemoryRuntime.open({
      dbPath: ":memory:",
      factory: async () => ({
        raw: { close: async () => undefined },
        getRawMessageManager: async () => manager,
      }),
    });
    const { workItemId: _workItemId, ...event } = memoryRecorded();

    await runtime.ingest([event]);
    expect(
      await runtime.search({
        workspaceId: event.workspaceId,
        workItemId: "workspace",
        query: "deterministic",
        limit: 10,
      }),
    ).toEqual([]);

    manager.hitMetadata = {
      channel: "contextweft:work-item:workspace",
      timestamp: Date.parse("2026-08-31T12:00:00.000Z"),
    };
    manager.stored = "missing";
    const recalls = await runtime.search({
      workspaceId: event.workspaceId,
      workItemId: "workspace",
      query: "deterministic",
      limit: 10,
    });
    expect(recalls[0]?.occurredAt).toBe("2026-08-31T12:00:00.000Z");

    manager.hitMetadata = { channel: "contextweft:work-item:workspace" };
    const epochRecall = await runtime.search({
      workspaceId: event.workspaceId,
      workItemId: "workspace",
      query: "deterministic",
      limit: 10,
    });
    expect(epochRecall[0]?.occurredAt).toBe("1970-01-01T00:00:00.000Z");

    await expect(
      runtime.ingest([{ ...memoryRecorded(), occurredAt: "not-a-date" }]),
    ).rejects.toBeInstanceOf(OpenContextRuntimeStateError);
    await runtime.close();
  });

  it("orders equal-score recalls by identifier", async () => {
    const store = new FakeOpenContextStore();
    const runtime = await OpenContextMemoryRuntime.open({
      dbPath: ":memory:",
      factory: async () => store,
    });
    const first = memoryRecorded({
      eventId: "evt:memory-b",
      idempotencyKey: "memory-record:b",
      payload: {
        content: "Shared sortable recall content",
        kind: "fact",
        confidence: 1,
      },
    });
    const second = memoryRecorded({
      eventId: "evt:memory-a",
      idempotencyKey: "memory-record:a",
      payload: {
        content: "Shared sortable recall content",
        kind: "fact",
        confidence: 1,
      },
    });

    await runtime.ingest([first, second]);
    const recalls = await runtime.search({
      workspaceId: first.workspaceId,
      workItemId: first.workItemId ?? "",
      query: "sortable recall",
      limit: 10,
    });

    expect(recalls.map((recall) => recall.id)).toEqual(["evt:memory-a", "evt:memory-b"]);
    await runtime.close();
  });

  it("guards the default OpenContext runtime singleton", async () => {
    const directory = await mkdtemp(join(tmpdir(), "contextweft-opencontext-singleton-"));
    const first = await OpenContextMemoryRuntime.open({
      dbPath: join(directory, "first.db"),
    });
    try {
      await expect(
        OpenContextMemoryRuntime.open({ dbPath: join(directory, "second.db") }),
      ).rejects.toBeInstanceOf(OpenContextRuntimeStateError);
    } finally {
      await first.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
