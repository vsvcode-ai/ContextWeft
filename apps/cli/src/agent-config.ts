import { canonicalJson } from "@contextweft/contracts";
import { CliUsageError } from "./errors.js";

const DEFAULT_SERVER_NAME = "contextweft";
const DEFAULT_COMMAND = "ctxweft";
const DEFAULT_ARGS = ["mcp"] as const;

export const SUPPORTED_AGENTS = ["codex", "cursor", "claude-code"] as const;

export type SupportedAgent = (typeof SUPPORTED_AGENTS)[number];

export interface GenerateAgentConfigOptions {
  readonly agent: SupportedAgent;
  readonly serverName?: string;
  readonly command?: string;
}

export interface AgentSetupGuide {
  readonly agent: SupportedAgent;
  readonly serverName: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly installCommand: readonly string[];
  readonly configPath: string;
  readonly configFormat: "toml" | "json";
  readonly configSnippet: string;
  readonly notes: readonly string[];
}

export function parseSupportedAgent(value: string | undefined): SupportedAgent {
  if (value !== undefined && isSupportedAgent(value)) {
    return value;
  }
  throw new CliUsageError(`Expected setup target: ${SUPPORTED_AGENTS.join(", ")}`);
}

export function generateAgentSetupGuide(options: GenerateAgentConfigOptions): AgentSetupGuide {
  const serverName = normalizeServerName(options.serverName ?? DEFAULT_SERVER_NAME);
  const command = normalizeCommand(options.command ?? DEFAULT_COMMAND);
  switch (options.agent) {
    case "codex":
      return codexGuide(serverName, command);
    case "cursor":
      return cursorGuide(serverName, command);
    case "claude-code":
      return claudeCodeGuide(serverName, command);
  }
}

export function formatAgentSetupGuide(guide: AgentSetupGuide): string {
  return [
    `${titleForAgent(guide.agent)} MCP setup`,
    "",
    `Server: ${guide.serverName}`,
    `Config path: ${guide.configPath}`,
    `Install command: ${renderShellCommand(guide.installCommand)}`,
    "",
    "Config snippet:",
    fenced(guide.configFormat, guide.configSnippet),
    "",
    "Notes:",
    ...guide.notes.map((note) => `- ${note}`),
  ].join("\n");
}

function codexGuide(serverName: string, command: string): AgentSetupGuide {
  return {
    agent: "codex",
    serverName,
    command,
    args: DEFAULT_ARGS,
    installCommand: ["codex", "mcp", "add", serverName, "--", command, ...DEFAULT_ARGS],
    configPath: ".codex/config.toml or ~/.codex/config.toml",
    configFormat: "toml",
    configSnippet: [
      `[mcp_servers.${serverName}]`,
      `command = ${tomlString(command)}`,
      `args = [${DEFAULT_ARGS.map(tomlString).join(", ")}]`,
      "enabled = true",
      "startup_timeout_sec = 10",
      "tool_timeout_sec = 60",
    ].join("\n"),
    notes: [
      "Codex CLI, the Codex IDE extension, and ChatGPT desktop share Codex MCP configuration.",
      "Use a project-scoped .codex/config.toml when the server should follow one trusted repository.",
    ],
  };
}

function cursorGuide(serverName: string, command: string): AgentSetupGuide {
  const config = {
    mcpServers: {
      [serverName]: {
        command,
        args: [...DEFAULT_ARGS],
      },
    },
  };
  return {
    agent: "cursor",
    serverName,
    command,
    args: DEFAULT_ARGS,
    installCommand: [],
    configPath: ".cursor/mcp.json or ~/.cursor/mcp.json",
    configFormat: "json",
    configSnippet: canonicalJson(config),
    notes: [
      "Cursor supports project-scoped .cursor/mcp.json and global ~/.cursor/mcp.json configuration.",
      "After adding the server, restart Cursor or reload MCP servers from Cursor settings.",
    ],
  };
}

function claudeCodeGuide(serverName: string, command: string): AgentSetupGuide {
  const config = {
    type: "stdio",
    command,
    args: [...DEFAULT_ARGS],
    env: {},
  };
  return {
    agent: "claude-code",
    serverName,
    command,
    args: DEFAULT_ARGS,
    installCommand: [
      "claude",
      "mcp",
      "add",
      "--transport",
      "stdio",
      serverName,
      "--",
      command,
      ...DEFAULT_ARGS,
    ],
    configPath: "Claude Code MCP config via `claude mcp add` or `claude mcp add-json`",
    configFormat: "json",
    configSnippet: canonicalJson(config),
    notes: [
      "Claude Code supports stdio servers through `claude mcp add --transport stdio`.",
      "Run `/mcp` inside Claude Code to inspect the connected server and available tools.",
    ],
  };
}

function isSupportedAgent(value: string): value is SupportedAgent {
  return (SUPPORTED_AGENTS as readonly string[]).includes(value);
}

function normalizeServerName(value: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(trimmed)) {
    throw new CliUsageError(
      "Option --server-name must be 1-64 characters of letters, numbers, hyphens, or underscores",
    );
  }
  return trimmed;
}

function normalizeCommand(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 4096 || hasControlCharacter(trimmed)) {
    throw new CliUsageError("Option --command must be a non-empty executable path or command");
  }
  return trimmed;
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function renderShellCommand(argv: readonly string[]): string {
  if (argv.length === 0) {
    return "manual JSON configuration";
  }
  return argv.map(shellArg).join(" ");
}

function shellArg(value: string): string {
  return /^[A-Za-z0-9_./:-]+$/u.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function fenced(language: string, content: string): string {
  return `\`\`\`${language}\n${content}\n\`\`\``;
}

function titleForAgent(agent: SupportedAgent): string {
  if (agent === "claude-code") {
    return "Claude Code";
  }
  return agent === "codex" ? "Codex" : "Cursor";
}
