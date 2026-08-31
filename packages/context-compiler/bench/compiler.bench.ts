import { Bench } from "tinybench";
import { DeterministicContextCompiler } from "../src/index.js";
import { artifact, events, git, workItem, workspace } from "../test/fixtures.js";

const compiler = new DeterministicContextCompiler();
const request = {
  workspace,
  workItem,
  events,
  artifacts: [artifact],
  currentGit: git,
  tokenBudget: 2_000,
};
const bench = new Bench({ name: "context-compiler", time: 1_000, warmupTime: 250 });
bench.add("compile representative ContextPack", () => {
  compiler.compile(request);
});

await bench.run();
console.table(bench.table());
