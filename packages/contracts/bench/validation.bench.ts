import { Bench } from "tinybench";
import { parseContextEvent } from "../src/index.js";
import { decisionEventFixture } from "../test/fixtures.js";

const bench = new Bench({ name: "contracts", time: 1_000, warmupTime: 250 });

bench.add("validate ContextEvent", () => {
  parseContextEvent(decisionEventFixture);
});

await bench.run();
console.table(bench.table());
