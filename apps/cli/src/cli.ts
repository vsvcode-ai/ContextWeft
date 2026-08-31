import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { RequestIdentity } from "@contextweft/application";
import { canonicalJson, type Workspace } from "@contextweft/contracts";
import {
  CheckpointPayloadSchema,
  serveContextWeftStdio,
  toCreateCheckpointInput,
  type CheckpointPayload,
} from "@contextweft/mcp-server";
import {
  formatAgentSetupGuide,
  generateAgentSetupGuide,
  parseSupportedAgent,
} from "./agent-config.js";
import { inspectContextWeft } from "./doctor.js";
import { CliUsageError, WorkspaceNotInitializedError } from "./errors.js";
import type { CliIo } from "./io.js";
import { processIo } from "./io.js";
import {
  booleanOption,
  integerOption,
  numberOption,
  parseOptions,
  requiredStringOption,
  stringOption,
  type OptionDefinition,
  type ParsedOptions,
} from "./options.js";
import {
  openContextWeftRuntime,
  type ContextWeftRuntime,
  type OpenContextWeftRuntimeOptions,
} from "./runtime.js";

const MAX_CHECKPOINT_INPUT_BYTES = 1_048_576;
const MUTATION_OPTIONS = {
  "idempotency-key": { type: "string" },
  json: { type: "boolean" },
} as const satisfies Readonly<Record<string, OptionDefinition>>;
const CLI_IDENTITY = {
  actor: { type: "human", id: "local-user" },
  source: { kind: "cli", agent: "ctxweft" },
} as const satisfies RequestIdentity;

export interface RunCliOptions {
  readonly cwd?: string;
  readonly io?: CliIo;
  readonly openRuntime?: (options: OpenContextWeftRuntimeOptions) => Promise<ContextWeftRuntime>;
}

export async function runCli(
  argv: readonly string[],
  options: RunCliOptions = {},
): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const io = options.io ?? processIo;
  const openRuntime = options.openRuntime ?? openContextWeftRuntime;
  try {
    const [command, subcommand, ...rest] = argv;
    if (command === undefined || command === "help" || command === "--help") {
      io.stdout(helpText());
      return 0;
    }
    if (command === "init") {
      return await runInit([subcommand, ...rest].filter(isDefined), cwd, io, openRuntime);
    }
    if (command === "task") {
      if (subcommand === "start") {
        return await runTaskStart(rest, cwd, io, openRuntime);
      }
      if (subcommand === "status") {
        return await runTaskStatus(rest, cwd, io, openRuntime);
      }
      throw new CliUsageError("Expected: ctxweft task <start|status>");
    }
    if (command === "checkpoint") {
      return await runCheckpoint([subcommand, ...rest].filter(isDefined), cwd, io, openRuntime);
    }
    if (command === "bootstrap") {
      return await runBootstrap([subcommand, ...rest].filter(isDefined), cwd, io, openRuntime);
    }
    if (command === "search") {
      return await runSearch([subcommand, ...rest].filter(isDefined), cwd, io, openRuntime);
    }
    if (command === "remember") {
      return await runRemember([subcommand, ...rest].filter(isDefined), cwd, io, openRuntime);
    }
    if (command === "correct") {
      return await runCorrect([subcommand, ...rest].filter(isDefined), cwd, io, openRuntime);
    }
    if (command === "memory") {
      if (subcommand !== "rebuild") {
        throw new CliUsageError("Expected: ctxweft memory rebuild");
      }
      return await runMemoryRebuild(rest, cwd, io, openRuntime);
    }
    if (command === "doctor") {
      return await runDoctor([subcommand, ...rest].filter(isDefined), cwd, io);
    }
    if (command === "setup") {
      return runSetup([subcommand, ...rest].filter(isDefined), io);
    }
    if (command === "mcp") {
      return await runMcp([subcommand, ...rest].filter(isDefined), cwd, io, openRuntime);
    }
    throw new CliUsageError(`Unknown command: ${command}`);
  } catch (error) {
    io.stderr(`Error: ${errorMessage(error)}`);
    return error instanceof CliUsageError ? 2 : 1;
  }
}

async function runInit(
  args: readonly string[],
  cwd: string,
  io: CliIo,
  openRuntime: NonNullable<RunCliOptions["openRuntime"]>,
): Promise<number> {
  const parsed = parseOptions(args, {
    name: { type: "string" },
    root: { type: "string" },
    json: { type: "boolean" },
  });
  const startPath = resolve(cwd, stringOption(parsed, "root") ?? ".");
  return withRuntime(openRuntime, { startPath, allowCreate: true }, io, async (runtime) => {
    const workspace = await runtime.service.initializeWorkspace({
      rootPath: runtime.rootPath,
      name: stringOption(parsed, "name") ?? basename(runtime.rootPath),
      ...CLI_IDENTITY,
    });
    writeResult(io, parsed, workspace, `Initialized ${workspace.name} (${workspace.id})`);
    return 0;
  });
}

async function runTaskStart(
  args: readonly string[],
  cwd: string,
  io: CliIo,
  openRuntime: NonNullable<RunCliOptions["openRuntime"]>,
): Promise<number> {
  const parsed = parseOptions(args, {
    title: { type: "string" },
    goal: { type: "string" },
    ...MUTATION_OPTIONS,
  });
  return withRuntime(openRuntime, { startPath: cwd, allowCreate: false }, io, async (runtime) => {
    const workspace = currentWorkspace(runtime);
    const workItem = runtime.service.startWorkItem({
      workspaceId: workspace.id,
      title: requiredStringOption(parsed, "title"),
      goal: requiredStringOption(parsed, "goal"),
      idempotencyKey: idempotencyKey(parsed),
      ...CLI_IDENTITY,
    });
    writeResult(io, parsed, workItem, `Started ${workItem.title} (${workItem.id})`);
    return 0;
  });
}

async function runTaskStatus(
  args: readonly string[],
  cwd: string,
  io: CliIo,
  openRuntime: NonNullable<RunCliOptions["openRuntime"]>,
): Promise<number> {
  const parsed = parseOptions(args, { json: { type: "boolean" } });
  return withRuntime(openRuntime, { startPath: cwd, allowCreate: false }, io, async (runtime) => {
    const workspace = currentWorkspace(runtime);
    const status = runtime.service.workspaceStatus(workspace.id);
    writeResult(io, parsed, status, formatStatus(status));
    return 0;
  });
}

async function runCheckpoint(
  args: readonly string[],
  cwd: string,
  io: CliIo,
  openRuntime: NonNullable<RunCliOptions["openRuntime"]>,
): Promise<number> {
  const parsed = parseOptions(args, {
    "work-item": { type: "string" },
    input: { type: "string" },
    ...MUTATION_OPTIONS,
  });
  const payload = await readCheckpointPayload(requiredStringOption(parsed, "input"), cwd, io);
  return withRuntime(openRuntime, { startPath: cwd, allowCreate: false }, io, async (runtime) => {
    const workspace = currentWorkspace(runtime);
    const result = await runtime.service.createCheckpoint(
      toCreateCheckpointInput(payload, {
        workspaceId: workspace.id,
        workItemId: requiredStringOption(parsed, "work-item"),
        idempotencyKey: idempotencyKey(parsed),
        ...CLI_IDENTITY,
      }),
    );
    writeResult(
      io,
      parsed,
      result,
      `${result.replayed ? "Replayed" : "Created"} checkpoint ${result.checkpoint.eventId} (${result.events.length} events, ${result.artifacts.length} artifacts)`,
    );
    return 0;
  });
}

async function runBootstrap(
  args: readonly string[],
  cwd: string,
  io: CliIo,
  openRuntime: NonNullable<RunCliOptions["openRuntime"]>,
): Promise<number> {
  const parsed = parseOptions(args, {
    "work-item": { type: "string" },
    intent: { type: "string" },
    "token-budget": { type: "string" },
    "memory-limit": { type: "string" },
    json: { type: "boolean" },
  });
  return withRuntime(openRuntime, { startPath: cwd, allowCreate: false }, io, async (runtime) => {
    const workspace = currentWorkspace(runtime);
    const result = await runtime.service.bootstrap({
      workspaceId: workspace.id,
      workItemId: requiredStringOption(parsed, "work-item"),
      intent: requiredStringOption(parsed, "intent"),
      tokenBudget: integerOption(parsed, "token-budget", 8_000, 256, 200_000),
      memoryLimit: integerOption(parsed, "memory-limit", 10, 1, 50),
    });
    for (const warning of result.warnings) {
      io.stderr(`Warning: ${warning}`);
    }
    io.stdout(booleanOption(parsed, "json") ? canonicalJson(result) : result.markdown);
    return 0;
  });
}

async function runSearch(
  args: readonly string[],
  cwd: string,
  io: CliIo,
  openRuntime: NonNullable<RunCliOptions["openRuntime"]>,
): Promise<number> {
  const parsed = parseOptions(args, {
    "work-item": { type: "string" },
    query: { type: "string" },
    limit: { type: "string" },
    json: { type: "boolean" },
  });
  return withRuntime(openRuntime, { startPath: cwd, allowCreate: false }, io, async (runtime) => {
    const workspace = currentWorkspace(runtime);
    const result = await runtime.service.searchMemory({
      workspaceId: workspace.id,
      workItemId: requiredStringOption(parsed, "work-item"),
      query: requiredStringOption(parsed, "query"),
      limit: integerOption(parsed, "limit", 10, 1, 50),
    });
    writeResult(
      io,
      parsed,
      result,
      result.results.map((item) => `${item.score.toFixed(3)}  ${item.content}`).join("\n") ||
        "No memory found.",
    );
    return 0;
  });
}

async function runRemember(
  args: readonly string[],
  cwd: string,
  io: CliIo,
  openRuntime: NonNullable<RunCliOptions["openRuntime"]>,
): Promise<number> {
  const parsed = parseOptions(args, {
    "work-item": { type: "string" },
    content: { type: "string" },
    kind: { type: "string" },
    confidence: { type: "string" },
    "valid-from": { type: "string" },
    ...MUTATION_OPTIONS,
  });
  const kind = requiredStringOption(parsed, "kind");
  if (!isMemoryKind(kind)) {
    throw new CliUsageError("Option --kind must be fact, decision, preference, or constraint");
  }
  return withRuntime(openRuntime, { startPath: cwd, allowCreate: false }, io, async (runtime) => {
    const workspace = currentWorkspace(runtime);
    const validFrom = stringOption(parsed, "valid-from");
    const result = await runtime.service.recordMemory({
      workspaceId: workspace.id,
      workItemId: requiredStringOption(parsed, "work-item"),
      idempotencyKey: idempotencyKey(parsed),
      content: requiredStringOption(parsed, "content"),
      kind,
      confidence: numberOption(parsed, "confidence", 1, 0, 1),
      ...(validFrom === undefined ? {} : { validFrom }),
      ...CLI_IDENTITY,
    });
    writeResult(
      io,
      parsed,
      result,
      `Recorded ${result.event.eventId}${result.indexed ? "" : " (derived index unavailable)"}`,
    );
    return 0;
  });
}

async function runCorrect(
  args: readonly string[],
  cwd: string,
  io: CliIo,
  openRuntime: NonNullable<RunCliOptions["openRuntime"]>,
): Promise<number> {
  const parsed = parseOptions(args, {
    "work-item": { type: "string" },
    "target-event": { type: "string" },
    content: { type: "string" },
    reason: { type: "string" },
    ...MUTATION_OPTIONS,
  });
  return withRuntime(openRuntime, { startPath: cwd, allowCreate: false }, io, async (runtime) => {
    const workspace = currentWorkspace(runtime);
    const result = await runtime.service.correctMemory({
      workspaceId: workspace.id,
      workItemId: requiredStringOption(parsed, "work-item"),
      idempotencyKey: idempotencyKey(parsed),
      targetEventId: requiredStringOption(parsed, "target-event"),
      content: requiredStringOption(parsed, "content"),
      reason: requiredStringOption(parsed, "reason"),
      ...CLI_IDENTITY,
    });
    writeResult(io, parsed, result, `Recorded correction ${result.event.eventId}`);
    return 0;
  });
}

async function runMemoryRebuild(
  args: readonly string[],
  cwd: string,
  io: CliIo,
  openRuntime: NonNullable<RunCliOptions["openRuntime"]>,
): Promise<number> {
  const parsed = parseOptions(args, { json: { type: "boolean" } });
  return withRuntime(openRuntime, { startPath: cwd, allowCreate: false }, io, async (runtime) => {
    const workspace = currentWorkspace(runtime);
    const result = await runtime.service.rebuildMemory(workspace.id);
    writeResult(io, parsed, result, `Rebuilt ${result.eventsProcessed} memory events`);
    return 0;
  });
}

async function runDoctor(args: readonly string[], cwd: string, io: CliIo): Promise<number> {
  const parsed = parseOptions(args, { json: { type: "boolean" } });
  const report = await inspectContextWeft(cwd);
  if (booleanOption(parsed, "json")) {
    io.stdout(canonicalJson(report));
  } else {
    io.stdout(
      report.checks
        .map((check) => `${check.status.toUpperCase().padEnd(4)} ${check.name}: ${check.message}`)
        .join("\n"),
    );
  }
  return report.ok ? 0 : 1;
}

function runSetup(args: readonly string[], io: CliIo): number {
  const [agent, ...rest] = args;
  const parsed = parseOptions(rest, {
    command: { type: "string" },
    "server-name": { type: "string" },
    json: { type: "boolean" },
  });
  const command = stringOption(parsed, "command");
  const serverName = stringOption(parsed, "server-name");
  const guide = generateAgentSetupGuide({
    agent: parseSupportedAgent(agent),
    ...(command === undefined ? {} : { command }),
    ...(serverName === undefined ? {} : { serverName }),
  });
  io.stdout(booleanOption(parsed, "json") ? canonicalJson(guide) : formatAgentSetupGuide(guide));
  return 0;
}

async function runMcp(
  args: readonly string[],
  cwd: string,
  io: CliIo,
  openRuntime: NonNullable<RunCliOptions["openRuntime"]>,
): Promise<number> {
  parseOptions(args, {});
  const runtime = await openRuntime({ startPath: cwd, allowCreate: true });
  for (const warning of runtime.warnings) {
    io.stderr(`Warning: ${warning}`);
  }
  const handle = serveContextWeftStdio(
    { operations: runtime.service, defaultWorkspaceRoot: runtime.rootPath },
    (error) => io.stderr(`MCP error: ${error.message}`),
  );
  return new Promise<number>((resolveResult) => {
    let closing = false;
    const shutdown = async () => {
      if (closing) {
        return;
      }
      closing = true;
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      process.stdin.off("end", shutdown);
      process.stdin.off("close", shutdown);
      try {
        await handle.close();
        await runtime.close();
        resolveResult(0);
      } catch (error) {
        io.stderr(`MCP shutdown error: ${errorMessage(error)}`);
        resolveResult(1);
      }
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    process.stdin.once("end", shutdown);
    process.stdin.once("close", shutdown);
    if (process.stdin.readableEnded) {
      void shutdown();
    }
  });
}

async function withRuntime<T>(
  openRuntime: NonNullable<RunCliOptions["openRuntime"]>,
  runtimeOptions: OpenContextWeftRuntimeOptions,
  io: CliIo,
  operation: (runtime: ContextWeftRuntime) => Promise<T>,
): Promise<T> {
  const runtime = await openRuntime(runtimeOptions);
  try {
    for (const warning of runtime.warnings) {
      io.stderr(`Warning: ${warning}`);
    }
    return await operation(runtime);
  } finally {
    await runtime.close();
  }
}

function currentWorkspace(runtime: ContextWeftRuntime): Workspace {
  const workspace = runtime.repository.findWorkspaceByRoot(runtime.rootPath);
  if (workspace === undefined) {
    throw new WorkspaceNotInitializedError(runtime.rootPath);
  }
  return workspace;
}

async function readCheckpointPayload(
  inputPath: string,
  cwd: string,
  io: CliIo,
): Promise<CheckpointPayload> {
  let text: string;
  if (inputPath === "-") {
    text = await io.readStdin(MAX_CHECKPOINT_INPUT_BYTES);
  } else {
    const absolutePath = resolve(cwd, inputPath);
    const fileStatus = await stat(absolutePath);
    if (!fileStatus.isFile() || fileStatus.size > MAX_CHECKPOINT_INPUT_BYTES) {
      throw new CliUsageError(
        `Checkpoint input must be a regular file no larger than ${MAX_CHECKPOINT_INPUT_BYTES} bytes`,
      );
    }
    text = await readFile(absolutePath, "utf8");
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    throw new CliUsageError("Checkpoint input is not valid JSON");
  }
  const parsed = CheckpointPayloadSchema.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 10)
      .map((issue) => `${issue.path.join(".") || "$"}: ${issue.message}`)
      .join("; ");
    throw new CliUsageError(`Invalid checkpoint input: ${issues}`);
  }
  return parsed.data;
}

function writeResult(io: CliIo, options: ParsedOptions, value: unknown, humanText: string): void {
  io.stdout(booleanOption(options, "json") ? canonicalJson(value) : humanText);
}

function idempotencyKey(options: ParsedOptions): string {
  return stringOption(options, "idempotency-key") ?? `cli:${randomUUID()}`;
}

function formatStatus(
  status: ReturnType<ContextWeftRuntime["service"]["workspaceStatus"]>,
): string {
  const lines = [
    `${status.workspace.name} (${status.workspace.id})`,
    `${status.eventCount} events, ${status.artifactCount} artifacts`,
  ];
  for (const workItem of status.workItems) {
    lines.push(`- [${workItem.status}] ${workItem.title} (${workItem.id})`);
  }
  return lines.join("\n");
}

function isMemoryKind(value: string): value is "fact" | "decision" | "preference" | "constraint" {
  return ["fact", "decision", "preference", "constraint"].includes(value);
}

function isDefined(value: string | undefined): value is string {
  return value !== undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function helpText(): string {
  return `ContextWeft — portable context for AI agents

Usage:
  ctxweft init [--name NAME] [--root PATH] [--json]
  ctxweft task start --title TITLE --goal GOAL [--idempotency-key KEY] [--json]
  ctxweft task status [--json]
  ctxweft checkpoint --work-item ID --input FILE|- [--idempotency-key KEY] [--json]
  ctxweft bootstrap --work-item ID --intent TEXT [--token-budget N] [--json]
  ctxweft search --work-item ID --query TEXT [--limit N] [--json]
  ctxweft remember --work-item ID --content TEXT --kind KIND [--confidence N] [--json]
  ctxweft correct --work-item ID --target-event ID --content TEXT --reason TEXT [--json]
  ctxweft memory rebuild [--json]
  ctxweft doctor [--json]
  ctxweft setup <codex|cursor|claude-code> [--command CMD] [--server-name NAME] [--json]
  ctxweft mcp`;
}
