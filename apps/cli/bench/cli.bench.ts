import { Bench } from "tinybench";
import { parseOptions } from "../src/index.js";

const definitions = {
  title: { type: "string" as const },
  goal: { type: "string" as const },
  json: { type: "boolean" as const },
};
const bench = new Bench({ time: 1_000 });
bench.add("parse strict CLI options", () => {
  parseOptions(["--title", "Task", "--goal=Continue", "--json"], definitions);
});

await bench.run();
console.table(bench.table());
