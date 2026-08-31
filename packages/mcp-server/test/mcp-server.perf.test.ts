import { performance } from "node:perf_hooks";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { createContextWeftMcpServer } from "../src/index.js";
import { operationsFixture } from "./fixtures.js";

describe("MCP server performance gates", () => {
  it("serves 1,000 validated in-memory tool round trips within 2 seconds", async () => {
    const server = createContextWeftMcpServer({
      operations: operationsFixture(),
      defaultWorkspaceRoot: "/tmp/contextweft-mcp",
    });
    const client = new Client({ name: "contextweft-perf", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const startedAt = performance.now();
      for (let index = 0; index < 1_000; index += 1) {
        await client.callTool({
          name: "contextweft.workspace_status",
          arguments: { workspaceId: "ws:mcp-test" },
        });
      }
      expect(performance.now() - startedAt).toBeLessThan(2_000);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
