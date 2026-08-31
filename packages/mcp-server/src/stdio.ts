import { serveStdio, type StdioServerHandle } from "@modelcontextprotocol/server/stdio";
import { createContextWeftMcpServer, type CreateContextWeftMcpServerOptions } from "./server.js";

/**
 * Serves both current and legacy MCP clients on stdio. Callers must reserve
 * stdout for JSON-RPC and send diagnostics to stderr.
 */
export function serveContextWeftStdio(
  options: CreateContextWeftMcpServerOptions,
  onerror?: (error: Error) => void,
): StdioServerHandle {
  return serveStdio(() => createContextWeftMcpServer(options), {
    legacy: "serve",
    ...(onerror === undefined ? {} : { onerror }),
  });
}
