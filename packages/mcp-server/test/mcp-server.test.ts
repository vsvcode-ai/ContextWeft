import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";
import { createContextWeftMcpServer } from "../src/index.js";
import { operationsFixture } from "./fixtures.js";

const closeCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map((close) => close()));
});

async function connectedClient(operations = operationsFixture()) {
  const server = createContextWeftMcpServer({
    operations,
    defaultWorkspaceRoot: "/tmp/contextweft-mcp",
  });
  const client = new Client({ name: "contextweft-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  closeCallbacks.push(async () => {
    await client.close();
    await server.close();
  });
  return client;
}

describe("ContextWeft MCP server", () => {
  it("publishes the stable phase-1 tool surface", async () => {
    const client = await connectedClient();
    const listing = await client.listTools();

    expect(listing.tools.map((tool) => tool.name).sort()).toEqual([
      "contextweft.bootstrap",
      "contextweft.checkpoint",
      "contextweft.correct_fact",
      "contextweft.remember",
      "contextweft.search",
      "contextweft.work_item_start",
      "contextweft.workspace_init",
      "contextweft.workspace_status",
    ]);
    expect(listing.tools.every((tool) => tool.inputSchema.type === "object")).toBe(true);
  });

  it("returns structured and textual results over a real MCP round trip", async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: "contextweft.workspace_status",
      arguments: { workspaceId: "ws:mcp-test" },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      ok: true,
      data: expect.objectContaining({ eventCount: 3, artifactCount: 2 }),
    });
    expect(result.content[0]).toEqual(
      expect.objectContaining({ type: "text", text: expect.stringContaining("ws:mcp-test") }),
    );
  });

  it("sanitizes unexpected failures instead of leaking internal details", async () => {
    const base = operationsFixture();
    const client = await connectedClient({
      ...base,
      async searchMemory() {
        throw new Error("secret path: /Users/private/.env");
      },
    });
    const result = await client.callTool({
      name: "contextweft.search",
      arguments: {
        workspaceId: "ws:mcp-test",
        workItemId: "work:mcp-test",
        query: "decision",
        limit: 10,
      },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain("/Users/private/.env");
    expect(result.structuredContent).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "INTERNAL_ERROR", retryable: true }),
    });
  });

  it("rejects invalid tool input before invoking application operations", async () => {
    let calls = 0;
    const base = operationsFixture();
    const client = await connectedClient({
      ...base,
      workspaceStatus() {
        calls += 1;
        return base.workspaceStatus("ws:mcp-test");
      },
    });
    const result = await client.callTool({
      name: "contextweft.workspace_status",
      arguments: { workspaceId: "" },
    });

    expect(result.isError).toBe(true);
    expect(calls).toBe(0);
  });
});
