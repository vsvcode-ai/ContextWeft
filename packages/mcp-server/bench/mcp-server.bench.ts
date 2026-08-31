import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { Bench } from "tinybench";
import { createContextWeftMcpServer } from "../src/index.js";
import { operationsFixture } from "../test/fixtures.js";

const server = createContextWeftMcpServer({
  operations: operationsFixture(),
  defaultWorkspaceRoot: "/tmp/contextweft-mcp",
});
const client = new Client({ name: "contextweft-bench", version: "1.0.0" });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
await client.connect(clientTransport);

const bench = new Bench({ time: 1_000 });
bench.add("validated MCP workspace status round trip", async () => {
  await client.callTool({
    name: "contextweft.workspace_status",
    arguments: { workspaceId: "ws:mcp-test" },
  });
});

await bench.run();
console.table(bench.table());
await client.close();
await server.close();
