import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";
import { createContextWeftMcpServer, mapToolError, toCreateCheckpointInput } from "../src/index.js";
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

  it("passes optional tool inputs through the MCP boundary", async () => {
    const calls: string[] = [];
    const base = operationsFixture();
    const client = await connectedClient({
      ...base,
      async bootstrap(input) {
        calls.push(`bootstrap:${input.memoryLimit}`);
        return base.bootstrap(input);
      },
      async recordMemory(input) {
        calls.push(`remember:${input.validFrom}`);
        return base.recordMemory(input);
      },
    });

    await client.callTool({
      name: "contextweft.bootstrap",
      arguments: {
        workspaceId: "ws:mcp-test",
        workItemId: "work:mcp-test",
        intent: "Continue",
        tokenBudget: 1_000,
        memoryLimit: 3,
      },
    });
    await client.callTool({
      name: "contextweft.remember",
      arguments: {
        workspaceId: "ws:mcp-test",
        workItemId: "work:mcp-test",
        idempotencyKey: "remember-valid-from",
        content: "Fact",
        kind: "fact",
        confidence: 1,
        validFrom: "2026-08-31T12:00:00.000Z",
      },
    });
    await client.callTool({
      name: "contextweft.remember",
      arguments: {
        workspaceId: "ws:mcp-test",
        workItemId: "work:mcp-test",
        idempotencyKey: "remember-no-valid-from",
        content: "Fact",
        kind: "fact",
        confidence: 1,
      },
    });

    expect(calls).toEqual([
      "bootstrap:3",
      "remember:2026-08-31T12:00:00.000Z",
      "remember:undefined",
    ]);
  });

  it("wraps primitive operation results as structured JSON values", async () => {
    const base = operationsFixture();
    const client = await connectedClient({
      ...base,
      workspaceStatus() {
        return "primitive" as never;
      },
    });
    const result = await client.callTool({
      name: "contextweft.workspace_status",
      arguments: { workspaceId: "ws:mcp-test" },
    });

    expect(result.structuredContent).toEqual({ ok: true, data: "primitive" });
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

  it("maps every checkpoint payload optional field exactly once", () => {
    const mapped = toCreateCheckpointInput(
      {
        summary: "Ready to hand off",
        goal: "Finish branch coverage",
        completed: ["Added unit tests"],
        inProgress: ["Testing coverage"],
        pending: ["Release alpha"],
        decisions: [
          {
            summary: "Use canonical events",
            rationale: "Auditability",
            alternatives: ["Opaque vector memory"],
          },
          { summary: "Keep MCP stable" },
        ],
        constraints: [{ summary: "No secrets", kind: "security" }],
        failedAttempts: [
          { summary: "Tried broad excludes", reason: "Too weak", nextAvoid: "Lowering signal" },
          { summary: "Skipped e2e", reason: "Lost CLI confidence" },
        ],
        tests: [
          {
            command: "pnpm test",
            status: "passed",
            durationMs: 123,
            summary: "All unit tests passed",
          },
          { command: "pnpm lint", status: "passed" },
        ],
        nextActions: ["Run coverage"],
        relevantFiles: ["packages/mcp-server/src/mapping.ts"],
      },
      {
        workspaceId: "ws:mcp-test",
        workItemId: "work:mcp-test",
        idempotencyKey: "checkpoint-map",
        actor: { type: "agent", id: "test" },
        source: { kind: "test" },
      },
    );

    expect(mapped).toEqual(
      expect.objectContaining({
        summary: "Ready to hand off",
        goal: "Finish branch coverage",
        completed: ["Added unit tests"],
        inProgress: ["Testing coverage"],
        pending: ["Release alpha"],
        relevantFiles: ["packages/mcp-server/src/mapping.ts"],
      }),
    );
    expect(mapped.decisions).toEqual([
      {
        summary: "Use canonical events",
        rationale: "Auditability",
        alternatives: ["Opaque vector memory"],
      },
      { summary: "Keep MCP stable" },
    ]);
    expect(mapped.failedAttempts).toEqual([
      { summary: "Tried broad excludes", reason: "Too weak", nextAvoid: "Lowering signal" },
      { summary: "Skipped e2e", reason: "Lost CLI confidence" },
    ]);
    expect(mapped.tests).toEqual([
      {
        command: "pnpm test",
        status: "passed",
        durationMs: 123,
        summary: "All unit tests passed",
      },
      { command: "pnpm lint", status: "passed" },
    ]);
  });

  it("omits absent checkpoint optional fields from application input", () => {
    const mapped = toCreateCheckpointInput(
      { nextActions: ["Continue"] },
      {
        workspaceId: "ws:mcp-test",
        workItemId: "work:mcp-test",
        idempotencyKey: "checkpoint-minimal",
        actor: { type: "agent", id: "test" },
        source: { kind: "test" },
      },
    );

    expect(Object.hasOwn(mapped, "completed")).toBe(false);
    expect(Object.hasOwn(mapped, "relevantFiles")).toBe(false);
    expect(mapped.nextActions).toEqual(["Continue"]);
  });

  it("maps known operation errors to stable sanitized envelopes", () => {
    for (const [name, code] of [
      ["EntityNotFoundError", "NOT_FOUND"],
      ["UnsafeArtifactPathError", "UNSAFE_PATH"],
      ["InvalidCheckpointError", "INVALID_INPUT"],
      ["ContractValidationError", "INVALID_INPUT"],
    ] as const) {
      const error = new Error(`${name} details`);
      error.name = name;
      expect(mapToolError(error)).toEqual({
        code,
        message: `${name} details`,
        retryable: false,
      });
    }

    expect(mapToolError("not an error")).toEqual({
      code: "INTERNAL_ERROR",
      message:
        "ContextWeft could not complete the operation. Inspect stderr or run ctxweft doctor.",
      retryable: true,
    });
  });
});
