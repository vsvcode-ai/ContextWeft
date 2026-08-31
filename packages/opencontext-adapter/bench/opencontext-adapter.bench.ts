import { Bench } from "tinybench";
import { OpenContextMemoryRuntime } from "../src/index.js";
import { FakeOpenContextStore, memoryRecorded } from "../test/fixtures.js";

const store = new FakeOpenContextStore();
const runtime = await OpenContextMemoryRuntime.open({
  dbPath: ":memory:",
  factory: async () => store,
});
await runtime.ingest(
  Array.from({ length: 1_000 }, (_, index) =>
    memoryRecorded({
      eventId: `evt:memory-bench-${index.toString().padStart(8, "0")}`,
      idempotencyKey: `memory-bench:${index}`,
    }),
  ),
);

const bench = new Bench({ time: 1_000 });
bench.add("recall from 1,000 scoped memory records", async () => {
  await runtime.search({
    workspaceId: "ws:opencontext-test",
    workItemId: "work:adapter-test",
    query: "deterministic provenance",
    limit: 10,
  });
});

await bench.run();
console.table(bench.table());
await runtime.close();
