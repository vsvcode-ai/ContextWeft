import { Bench } from "tinybench";
import { SqliteCanonicalRepository } from "../src/index.js";
import { decisionEvent, workItem, workspace } from "../test/fixtures.js";

const repository = new SqliteCanonicalRepository({ path: ":memory:" });
repository.putWorkspace(workspace);
repository.putWorkItem(workItem);

let index = 0;
const bench = new Bench({ name: "storage", time: 1_000, warmupTime: 250 });
bench.add("append canonical event", () => {
  repository.appendEvent(decisionEvent(index));
  index += 1;
});

await bench.run();
console.table(bench.table());
repository.close();
