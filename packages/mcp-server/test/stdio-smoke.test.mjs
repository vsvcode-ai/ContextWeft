import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const cliPath = fileURLToPath(new URL("../../../apps/cli/dist/main.js", import.meta.url));

test("built CLI serves a complete MCP workflow over stdio", { timeout: 20_000 }, async (t) => {
  const repositoryPath = mkdtempSync(join(tmpdir(), "contextweft-stdio-"));
  execFileSync("git", ["init", "-q", repositoryPath]);

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, "mcp"],
    cwd: repositoryPath,
    stderr: "pipe",
  });
  let diagnostics = "";
  transport.stderr?.on("data", (chunk) => {
    diagnostics += chunk.toString();
  });
  const client = new Client({ name: "contextweft-stdio-smoke", version: "1.0.0" });
  t.after(async () => {
    await client.close();
    rmSync(repositoryPath, { recursive: true, force: true });
  });
  await client.connect(transport);

  const listing = await client.listTools();
  assert.deepEqual(listing.tools.map((tool) => tool.name).sort(), [
    "contextweft.bootstrap",
    "contextweft.checkpoint",
    "contextweft.correct_fact",
    "contextweft.remember",
    "contextweft.search",
    "contextweft.work_item_start",
    "contextweft.workspace_init",
    "contextweft.workspace_status",
  ]);

  async function call(name, args) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, undefined, `${name}: ${JSON.stringify(result.content)}`);
    assert.equal(result.structuredContent?.ok, true);
    return result.structuredContent.data;
  }

  const workspace = await call("contextweft.workspace_init", { name: "Stdio smoke" });
  assert.match(workspace.id, /^ws:/u);

  const missingKey = await client.callTool({
    name: "contextweft.work_item_start",
    arguments: { workspaceId: workspace.id, title: "Missing key", goal: "Reject invalid input" },
  });
  assert.equal(missingKey.isError, true);

  const workItem = await call("contextweft.work_item_start", {
    workspaceId: workspace.id,
    title: "Verify built MCP server",
    goal: "Carry a checkpoint into bootstrap",
    idempotencyKey: "stdio-work-item",
  });
  assert.match(workItem.id, /^work:/u);

  const scope = { workspaceId: workspace.id, workItemId: workItem.id };
  const remembered = await call("contextweft.remember", {
    ...scope,
    idempotencyKey: "stdio-memory",
    content: "Stdio handoffs preserve canonical context",
    kind: "fact",
    confidence: 1,
  });
  assert.match(remembered.event.eventId, /^evt:/u);

  const corrected = await call("contextweft.correct_fact", {
    ...scope,
    idempotencyKey: "stdio-correction",
    targetEventId: remembered.event.eventId,
    content: "Stdio handoffs preserve verified canonical context",
    reason: "More precise wording",
  });
  assert.equal(corrected.event.eventType, "memory.corrected");

  const search = await call("contextweft.search", {
    ...scope,
    query: "verified canonical context",
  });
  if (corrected.indexed) {
    assert.ok(search.results.some((result) => result.id === corrected.event.eventId));
  }

  const checkpoint = await call("contextweft.checkpoint", {
    ...scope,
    idempotencyKey: "stdio-checkpoint",
    summary: "Built MCP process verified",
    completed: ["Recorded and corrected memory"],
    nextActions: ["Bootstrap the next session"],
  });
  assert.equal(checkpoint.checkpoint.eventType, "checkpoint.created");

  const bootstrap = await call("contextweft.bootstrap", {
    ...scope,
    intent: "Continue the stdio smoke test",
    tokenBudget: 2_000,
  });
  assert.equal(bootstrap.pack.workItem.id, workItem.id);
  assert.match(bootstrap.pack.nextActions[0].summary, /Bootstrap/u);

  const status = await call("contextweft.workspace_status", { workspaceId: workspace.id });
  assert.equal(status.workItems.length, 1);
  assert.ok(status.eventCount >= 4);
  assert.equal(diagnostics, "");
});
