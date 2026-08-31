import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { OpenContextMemoryRuntime } from "../src/index.js";
import { FakeOpenContextStore, memoryRecorded } from "./fixtures.js";

describe("OpenContext adapter performance gates", () => {
  it("maps and ingests 10,000 canonical facts within 750 ms", async () => {
    const store = new FakeOpenContextStore();
    const runtime = await OpenContextMemoryRuntime.open({
      dbPath: ":memory:",
      factory: async () => store,
    });
    const events = Array.from({ length: 10_000 }, (_, index) =>
      memoryRecorded({
        eventId: `evt:memory-perf-${index.toString().padStart(8, "0")}`,
        idempotencyKey: `memory-perf:${index}`,
      }),
    );

    const startedAt = performance.now();
    await runtime.ingest(events);
    const elapsedMs = performance.now() - startedAt;

    expect(store.manager.messages.size).toBe(10_000);
    expect(elapsedMs).toBeLessThan(750);
    await runtime.close();
  });

  it("ingests 1,000 facts into embedded OpenContext and recalls within bounded time", async () => {
    const directory = await mkdtemp(join(tmpdir(), "contextweft-opencontext-perf-"));
    const runtime = await OpenContextMemoryRuntime.open({
      dbPath: join(directory, "memory.db"),
    });
    try {
      const events = Array.from({ length: 1_000 }, (_, index) =>
        memoryRecorded({
          eventId: `evt:memory-real-perf-${index.toString().padStart(8, "0")}`,
          idempotencyKey: `memory-real-perf:${index}`,
          payload: {
            content: `Deterministic context decision number ${index}`,
            kind: "decision",
            confidence: 0.9,
          },
        }),
      );
      const ingestStartedAt = performance.now();
      await runtime.ingest(events);
      const ingestElapsedMs = performance.now() - ingestStartedAt;

      const searchStartedAt = performance.now();
      for (let index = 0; index < 100; index += 1) {
        await runtime.search({
          workspaceId: "ws:opencontext-test",
          workItemId: "work:adapter-test",
          query: `decision number ${index}`,
          limit: 10,
        });
      }
      const searchElapsedMs = performance.now() - searchStartedAt;

      expect(ingestElapsedMs).toBeLessThan(3_000);
      expect(searchElapsedMs).toBeLessThan(2_000);
    } finally {
      await runtime.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
