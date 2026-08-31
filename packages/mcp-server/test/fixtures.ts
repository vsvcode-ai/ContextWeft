import type { ContextWeftOperations } from "../src/index.js";

export const workspace = {
  schemaVersion: "0.1" as const,
  id: "ws:mcp-test",
  name: "MCP test workspace",
  rootPath: "/tmp/contextweft-mcp",
  createdAt: "2026-08-31T12:00:00.000Z",
  updatedAt: "2026-08-31T12:00:00.000Z",
  metadata: {},
};

export function operationsFixture(): ContextWeftOperations {
  return {
    async initializeWorkspace() {
      return workspace;
    },
    startWorkItem() {
      throw new Error("not exercised by this fixture");
    },
    workspaceStatus() {
      return { workspace, workItems: [], eventCount: 3, artifactCount: 2 };
    },
    async createCheckpoint() {
      throw new Error("not exercised by this fixture");
    },
    async bootstrap() {
      throw new Error("not exercised by this fixture");
    },
    async searchMemory() {
      return { results: [], warnings: [] };
    },
    async recordMemory() {
      throw new Error("not exercised by this fixture");
    },
    async correctMemory() {
      throw new Error("not exercised by this fixture");
    },
  };
}
