import { describe, expect, it } from "vitest";
import {
  CliUsageError,
  formatAgentSetupGuide,
  generateAgentSetupGuide,
  parseSupportedAgent,
  runCli,
} from "../src/index.js";
import { capturedIo } from "./fixtures.js";

describe("agent setup guide generation", () => {
  it("generates a Codex project TOML snippet and CLI command", () => {
    const guide = generateAgentSetupGuide({
      agent: "codex",
      command: "/opt/contextweft/bin/ctxweft",
      serverName: "contextweft",
    });

    expect(guide.installCommand).toEqual([
      "codex",
      "mcp",
      "add",
      "contextweft",
      "--",
      "/opt/contextweft/bin/ctxweft",
      "mcp",
    ]);
    expect(guide.configSnippet).toBe(
      [
        "[mcp_servers.contextweft]",
        'command = "/opt/contextweft/bin/ctxweft"',
        'args = ["mcp"]',
        "enabled = true",
        "startup_timeout_sec = 10",
        "tool_timeout_sec = 60",
      ].join("\n"),
    );
  });

  it("generates stable Cursor mcp.json", () => {
    const guide = generateAgentSetupGuide({ agent: "cursor" });

    expect(JSON.parse(guide.configSnippet)).toEqual({
      mcpServers: {
        contextweft: {
          command: "ctxweft",
          args: ["mcp"],
        },
      },
    });
    expect(guide.configPath).toBe(".cursor/mcp.json or ~/.cursor/mcp.json");
  });

  it("generates stable Claude Code JSON and install command", () => {
    const guide = generateAgentSetupGuide({ agent: "claude-code", serverName: "cw" });

    expect(guide.installCommand).toEqual([
      "claude",
      "mcp",
      "add",
      "--transport",
      "stdio",
      "cw",
      "--",
      "ctxweft",
      "mcp",
    ]);
    expect(JSON.parse(guide.configSnippet)).toEqual({
      type: "stdio",
      command: "ctxweft",
      args: ["mcp"],
      env: {},
    });
  });

  it("formats a human-readable guide without shell-unsafe argv ambiguity", () => {
    const guide = generateAgentSetupGuide({
      agent: "codex",
      command: "/Applications/Context Weft/ctxweft",
    });

    expect(formatAgentSetupGuide(guide)).toContain(
      "codex mcp add contextweft -- '/Applications/Context Weft/ctxweft' mcp",
    );
  });

  it("formats manual setup and every supported guide title", () => {
    const cursor = generateAgentSetupGuide({ agent: "cursor" });
    const claude = generateAgentSetupGuide({ agent: "claude-code" });
    expect(formatAgentSetupGuide(cursor)).toContain("manual JSON configuration");
    expect(formatAgentSetupGuide(cursor)).toContain("Cursor MCP setup");
    expect(formatAgentSetupGuide(claude)).toContain("Claude Code MCP setup");
  });

  it("validates target agents and server names", () => {
    expect(parseSupportedAgent("cursor")).toBe("cursor");
    expect(() => parseSupportedAgent(undefined)).toThrow(CliUsageError);
    expect(() => parseSupportedAgent("unknown")).toThrow(CliUsageError);
    expect(() => generateAgentSetupGuide({ agent: "codex", serverName: "../bad" })).toThrow(
      CliUsageError,
    );
    expect(() => generateAgentSetupGuide({ agent: "codex", command: " \n " })).toThrow(
      CliUsageError,
    );
    expect(() =>
      generateAgentSetupGuide({ agent: "codex", command: `ctxweft${String.fromCharCode(127)}` }),
    ).toThrow(CliUsageError);
  });
});

describe("ctxweft setup CLI", () => {
  it("prints JSON setup guides", async () => {
    const io = capturedIo();
    await expect(runCli(["setup", "cursor", "--json"], { io })).resolves.toBe(0);

    expect(JSON.parse(io.stdoutLines[0] ?? "null")).toEqual(
      expect.objectContaining({
        agent: "cursor",
        serverName: "contextweft",
        configFormat: "json",
      }),
    );
  });
});
