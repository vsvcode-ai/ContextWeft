import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DeterministicContextCompiler,
  renderContextPackMarkdown,
  type ContextCompiler,
  type MemoryRecall,
} from "@contextweft/context-compiler";
import {
  parseArtifactRef,
  parseContextEvent,
  parseWorkItem,
  parseWorkspace,
  type ArtifactRef,
  type ContextEvent,
  type GitSnapshot,
  type WorkItem,
  type Workspace,
} from "@contextweft/contracts";
import {
  DefaultSensitivePathPolicy,
  GitAdapter,
  type GitSnapshotProvider,
  type SensitivePathPolicy,
} from "@contextweft/git-adapter";
import { EntityNotFoundError, type CanonicalRepository } from "@contextweft/storage";
import { InvalidCheckpointError, UnsafeArtifactPathError } from "./errors.js";
import {
  NullMemoryRuntime,
  type Clock,
  type MemoryRuntime,
  type RequestIdentity,
} from "./ports.js";
import type {
  BootstrapInput,
  BootstrapResult,
  CheckpointResult,
  CorrectMemoryInput,
  CreateCheckpointInput,
  CreateHandoffInput,
  InitializeWorkspaceInput,
  MemoryRebuildResult,
  MemoryWriteResult,
  RecordMemoryInput,
  StartWorkItemInput,
  WorkspaceStatus,
} from "./types.js";

class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }
}

export interface ContextWeftServiceOptions {
  readonly repository: CanonicalRepository;
  readonly git?: GitSnapshotProvider;
  readonly compiler?: ContextCompiler;
  readonly memory?: MemoryRuntime;
  readonly clock?: Clock;
  readonly sensitivePathPolicy?: SensitivePathPolicy;
}

export class ContextWeftService {
  readonly #repository: CanonicalRepository;
  readonly #git: GitSnapshotProvider;
  readonly #compiler: ContextCompiler;
  readonly #memory: MemoryRuntime;
  readonly #clock: Clock;
  readonly #sensitivePathPolicy: SensitivePathPolicy;

  public constructor(options: ContextWeftServiceOptions) {
    this.#repository = options.repository;
    this.#git = options.git ?? new GitAdapter();
    this.#compiler = options.compiler ?? new DeterministicContextCompiler();
    this.#memory = options.memory ?? new NullMemoryRuntime();
    this.#clock = options.clock ?? new SystemClock();
    this.#sensitivePathPolicy = options.sensitivePathPolicy ?? new DefaultSensitivePathPolicy();
  }

  public async initializeWorkspace(input: InitializeWorkspaceInput): Promise<Workspace> {
    const git = await this.#git.capture(input.rootPath);
    const existing = this.#repository.findWorkspaceByRoot(git.repositoryRoot);
    if (existing !== undefined) {
      return existing;
    }

    const timestamp = this.#clock.now().toISOString();
    const workspace = parseWorkspace({
      schemaVersion: "0.1",
      id: stableId("ws", git.repositoryRoot),
      name: input.name,
      rootPath: git.repositoryRoot,
      createdAt: timestamp,
      updatedAt: timestamp,
      metadata: { initialGitFingerprint: git.fingerprint },
    });
    const event = this.#event(
      workspace.id,
      undefined,
      "workspace.initialized",
      { name: workspace.name, rootPath: workspace.rootPath },
      input,
      `workspace-init:${workspace.id}`,
      timestamp,
      [],
    );

    this.#repository.transaction(() => {
      this.#repository.putWorkspace(workspace);
      this.#repository.appendEvent(event);
    });
    return workspace;
  }

  public startWorkItem(input: StartWorkItemInput): WorkItem {
    this.#requireWorkspace(input.workspaceId);
    const eventKey = `work-start:${input.idempotencyKey}`;
    const existingEvent = this.#repository.getEventByIdempotencyKey(input.workspaceId, eventKey);
    if (existingEvent?.workItemId !== undefined) {
      return this.#requireWorkItem(existingEvent.workItemId, input.workspaceId);
    }

    const timestamp = this.#clock.now().toISOString();
    const workItem = parseWorkItem({
      schemaVersion: "0.1",
      id: stableId("work", input.workspaceId, input.idempotencyKey),
      workspaceId: input.workspaceId,
      title: input.title,
      goal: input.goal,
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
      metadata: {},
    });
    const event = this.#event(
      input.workspaceId,
      workItem.id,
      "work_item.created",
      { title: input.title, goal: input.goal },
      input,
      eventKey,
      timestamp,
      [],
    );

    this.#repository.transaction(() => {
      this.#repository.putWorkItem(workItem);
      this.#repository.appendEvent(event);
    });
    return workItem;
  }

  public async createCheckpoint(input: CreateCheckpointInput): Promise<CheckpointResult> {
    const workspace = this.#requireWorkspace(input.workspaceId);
    this.#requireWorkItem(input.workItemId, input.workspaceId);
    const checkpointKey = `${input.idempotencyKey}:checkpoint`;
    const existing = this.#repository.getEventByIdempotencyKey(input.workspaceId, checkpointKey);
    if (existing !== undefined) {
      if (existing.eventType !== "checkpoint.created") {
        throw new InvalidCheckpointError("Checkpoint idempotency key is used by another event");
      }
      return {
        checkpoint: existing,
        events: [existing],
        artifacts: existing.payload.artifactIds
          .map((artifactId) => this.#repository.getArtifact(artifactId))
          .filter((artifact): artifact is ArtifactRef => artifact !== undefined),
        replayed: true,
      };
    }
    if (input.nextActions.length === 0) {
      throw new InvalidCheckpointError("A checkpoint requires at least one next action");
    }

    const git = await this.#git.capture(workspace.rootPath);
    const timestamp = this.#clock.now().toISOString();
    const artifacts = this.#artifacts(input, workspace, git, timestamp);
    const artifactIds = artifacts.map((artifact) => artifact.id);
    const events = this.#checkpointEvents(input, git, timestamp, artifactIds);
    const checkpoint = events.at(-1);
    if (checkpoint?.eventType !== "checkpoint.created") {
      throw new InvalidCheckpointError("Internal error: checkpoint event was not generated");
    }

    this.#repository.transaction(() => {
      this.#repository.putArtifacts(artifacts);
      this.#repository.appendEvents(events);
    });

    const memoryEvents = events.filter(
      (event) => event.eventType === "memory.recorded" || event.eventType === "memory.corrected",
    );
    if (memoryEvents.length > 0) {
      await this.#memory.ingest(memoryEvents);
    }
    return { checkpoint, events, artifacts, replayed: false };
  }

  public createHandoff(input: CreateHandoffInput): ContextEvent {
    this.#requireWorkspace(input.workspaceId);
    this.#requireWorkItem(input.workItemId, input.workspaceId);
    const handoffKey = `handoff:${input.idempotencyKey}`;
    const existing = this.#repository.getEventByIdempotencyKey(input.workspaceId, handoffKey);
    if (existing !== undefined) {
      if (existing.eventType !== "handoff.created") {
        throw new InvalidCheckpointError("Handoff idempotency key is used by another event");
      }
      return existing;
    }
    const checkpoint = this.#repository.getEvent(input.checkpointEventId);
    if (
      checkpoint?.eventType !== "checkpoint.created" ||
      checkpoint.workspaceId !== input.workspaceId ||
      checkpoint.workItemId !== input.workItemId
    ) {
      throw new InvalidCheckpointError(
        "Handoff must reference a checkpoint from the same work item",
      );
    }
    const timestamp = this.#clock.now().toISOString();
    const event = this.#event(
      input.workspaceId,
      input.workItemId,
      "handoff.created",
      {
        checkpointEventId: input.checkpointEventId,
        ...(input.targetAgent === undefined ? {} : { targetAgent: input.targetAgent }),
        ...(input.note === undefined ? {} : { note: input.note }),
      },
      input,
      handoffKey,
      timestamp,
      checkpoint.provenance.artifactIds,
    );
    return this.#repository.appendEvent(event).event;
  }

  /**
   * Persists a fact to the canonical event log before updating derived memory.
   * A memory outage therefore reduces recall quality without losing the fact.
   */
  public async recordMemory(input: RecordMemoryInput): Promise<MemoryWriteResult> {
    this.#requireWorkspace(input.workspaceId);
    this.#requireWorkItem(input.workItemId, input.workspaceId);
    const eventKey = `memory-record:${input.idempotencyKey}`;
    const existing = this.#repository.getEventByIdempotencyKey(input.workspaceId, eventKey);
    if (existing !== undefined) {
      if (existing.eventType !== "memory.recorded") {
        throw new InvalidCheckpointError("Memory idempotency key is used by another event");
      }
      return this.#indexMemoryEvent(existing, true);
    }

    const timestamp = this.#clock.now().toISOString();
    const event = this.#event(
      input.workspaceId,
      input.workItemId,
      "memory.recorded",
      {
        content: input.content,
        kind: input.kind,
        confidence: input.confidence,
        ...(input.validFrom === undefined ? {} : { validFrom: input.validFrom }),
      },
      input,
      eventKey,
      timestamp,
      [],
    );
    this.#repository.appendEvent(event);
    return this.#indexMemoryEvent(event, false);
  }

  /**
   * Appends a correction rather than mutating the original fact. Consumers can
   * reconstruct both the current view and the complete audit history.
   */
  public async correctMemory(input: CorrectMemoryInput): Promise<MemoryWriteResult> {
    this.#requireWorkspace(input.workspaceId);
    this.#requireWorkItem(input.workItemId, input.workspaceId);
    const eventKey = `memory-correct:${input.idempotencyKey}`;
    const existing = this.#repository.getEventByIdempotencyKey(input.workspaceId, eventKey);
    if (existing !== undefined) {
      if (existing.eventType !== "memory.corrected") {
        throw new InvalidCheckpointError("Memory idempotency key is used by another event");
      }
      return this.#indexMemoryEvent(existing, true);
    }

    const target = this.#repository.getEvent(input.targetEventId);
    if (
      (target?.eventType !== "memory.recorded" && target?.eventType !== "memory.corrected") ||
      target.workspaceId !== input.workspaceId ||
      target.workItemId !== input.workItemId
    ) {
      throw new InvalidCheckpointError(
        "Memory correction must target a memory event from the same work item",
      );
    }

    const timestamp = this.#clock.now().toISOString();
    const event = this.#event(
      input.workspaceId,
      input.workItemId,
      "memory.corrected",
      {
        targetEventId: input.targetEventId,
        content: input.content,
        reason: input.reason,
      },
      input,
      eventKey,
      timestamp,
      target.provenance.artifactIds,
    );
    this.#repository.appendEvent(event);
    return this.#indexMemoryEvent(event, false);
  }

  /** Replays canonical memory events into a disposable derived index. */
  public async rebuildMemory(workspaceId: string): Promise<MemoryRebuildResult> {
    this.#requireWorkspace(workspaceId);
    const events = this.#repository.listEvents({
      workspaceId,
      eventTypes: ["memory.recorded", "memory.corrected"],
    });
    await this.#memory.rebuild(workspaceId, events);
    return { eventsProcessed: events.length };
  }

  public async bootstrap(input: BootstrapInput): Promise<BootstrapResult> {
    const workspace = this.#requireWorkspace(input.workspaceId);
    const workItem = this.#requireWorkItem(input.workItemId, input.workspaceId);
    const warnings: string[] = [];
    let memory: readonly MemoryRecall[] = [];
    try {
      memory = [
        ...(await this.#memory.search({
          workspaceId: input.workspaceId,
          workItemId: input.workItemId,
          query: input.intent,
          limit: input.memoryLimit ?? 10,
        })),
      ];
    } catch (error) {
      warnings.push(
        `Long-term memory is unavailable; canonical handoff data is still included (${errorMessage(error)}).`,
      );
    }

    let currentGit: GitSnapshot | undefined;
    try {
      currentGit = await this.#git.capture(workspace.rootPath);
    } catch (error) {
      warnings.push(`Current Git state is unavailable (${errorMessage(error)}).`);
    }
    const events = this.#repository.listEvents({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
    });
    const artifacts = this.#repository.listArtifacts(input.workspaceId, input.workItemId);
    const pack = this.#compiler.compile({
      workspace,
      workItem,
      events,
      artifacts,
      relevantMemory: memory,
      ...(currentGit === undefined ? {} : { currentGit }),
      tokenBudget: input.tokenBudget,
    });
    return { pack, markdown: renderContextPackMarkdown(pack), warnings };
  }

  public workspaceStatus(workspaceId: string): WorkspaceStatus {
    const workspace = this.#requireWorkspace(workspaceId);
    const workItems = this.#repository.listWorkItems(workspaceId);
    return {
      workspace,
      workItems,
      eventCount: this.#repository.countEvents(workspaceId),
      artifactCount: this.#repository.listArtifacts(workspaceId).length,
    };
  }

  async #indexMemoryEvent(event: ContextEvent, replayed: boolean): Promise<MemoryWriteResult> {
    try {
      await this.#memory.ingest([event]);
      return { event, replayed, indexed: true, warnings: [] };
    } catch (error) {
      return {
        event,
        replayed,
        indexed: false,
        warnings: [
          `The fact is safely stored, but the derived memory index was not updated (${errorMessage(error)}).`,
        ],
      };
    }
  }

  #checkpointEvents(
    input: CreateCheckpointInput,
    git: GitSnapshot,
    timestamp: string,
    artifactIds: readonly string[],
  ): ContextEvent[] {
    const events: ContextEvent[] = [];
    const add = (suffix: string, eventType: ContextEvent["eventType"], payload: unknown): void => {
      events.push(
        this.#event(
          input.workspaceId,
          input.workItemId,
          eventType,
          payload,
          input,
          `${input.idempotencyKey}:${suffix}`,
          timestamp,
          artifactIds,
        ),
      );
    };

    if (input.goal !== undefined) {
      add("goal", "goal.updated", { goal: input.goal });
    }
    for (const [index, summary] of (input.completed ?? []).entries()) {
      add(`completed:${index}`, "progress.recorded", { summary, status: "completed" });
    }
    for (const [index, summary] of (input.inProgress ?? []).entries()) {
      add(`in-progress:${index}`, "progress.recorded", { summary, status: "in_progress" });
    }
    for (const [index, summary] of (input.pending ?? []).entries()) {
      add(`pending:${index}`, "progress.recorded", { summary, status: "pending" });
    }
    for (const [index, decision] of (input.decisions ?? []).entries()) {
      add(`decision:${index}`, "decision.recorded", {
        summary: decision.summary,
        ...(decision.rationale === undefined ? {} : { rationale: decision.rationale }),
        alternatives: [...(decision.alternatives ?? [])],
      });
    }
    for (const [index, constraint] of (input.constraints ?? []).entries()) {
      add(`constraint:${index}`, "constraint.recorded", constraint);
    }
    for (const [index, failure] of (input.failedAttempts ?? []).entries()) {
      add(`failure:${index}`, "attempt.failed", failure);
    }
    for (const [index, test] of (input.tests ?? []).entries()) {
      add(`test:${index}`, "test.observed", test);
    }
    for (const [index, artifactId] of artifactIds.entries()) {
      add(`artifact:${index}`, "artifact.observed", { artifactId });
    }
    add("checkpoint", "checkpoint.created", {
      ...(input.summary === undefined ? {} : { summary: input.summary }),
      nextActions: [...input.nextActions],
      artifactIds: [...artifactIds],
      git,
    });
    return events;
  }

  #artifacts(
    input: CreateCheckpointInput,
    workspace: Workspace,
    git: GitSnapshot,
    timestamp: string,
  ): ArtifactRef[] {
    const artifacts: ArtifactRef[] = [];
    if (git.revision !== undefined) {
      artifacts.push(
        parseArtifactRef({
          schemaVersion: "0.1",
          id: stableId("artifact", input.workspaceId, input.workItemId, "git_commit", git.revision),
          workspaceId: input.workspaceId,
          workItemId: input.workItemId,
          kind: "git_commit",
          uri: `git:${git.revision}`,
          title: `Git commit ${git.revision.slice(0, 12)}`,
          gitRevision: git.revision,
          observedAt: timestamp,
          metadata: { branch: git.branch ?? null },
        }),
      );
    }
    if (git.dirty) {
      artifacts.push(
        parseArtifactRef({
          schemaVersion: "0.1",
          id: stableId(
            "artifact",
            input.workspaceId,
            input.workItemId,
            "git_diff",
            git.fingerprint,
          ),
          workspaceId: input.workspaceId,
          workItemId: input.workItemId,
          kind: "git_diff",
          uri: `git:working-tree:${git.fingerprint}`,
          title: "Working tree changes",
          ...(git.revision === undefined ? {} : { gitRevision: git.revision }),
          observedAt: timestamp,
          metadata: {
            changedFiles: [...git.changedFiles],
            dirty: git.dirty,
            excludedSensitiveFiles: git.excludedSensitiveFiles,
            fingerprint: git.fingerprint,
          },
        }),
      );
    }

    for (const path of input.relevantFiles ?? []) {
      const normalizedPath = this.#safeRelativePath(workspace.rootPath, path);
      artifacts.push(
        parseArtifactRef({
          schemaVersion: "0.1",
          id: stableId("artifact", input.workspaceId, input.workItemId, "file", normalizedPath),
          workspaceId: input.workspaceId,
          workItemId: input.workItemId,
          kind: "file",
          uri: pathToFileURL(resolve(workspace.rootPath, normalizedPath)).href,
          title: normalizedPath,
          ...(git.revision === undefined ? {} : { gitRevision: git.revision }),
          observedAt: timestamp,
          metadata: {},
        }),
      );
    }
    return deduplicateArtifacts(artifacts);
  }

  #safeRelativePath(workspaceRoot: string, inputPath: string): string {
    if (isAbsolute(inputPath)) {
      throw new UnsafeArtifactPathError(inputPath, "absolute paths are not accepted");
    }
    const candidate = resolve(workspaceRoot, inputPath);
    const workspaceRelativePath = relative(workspaceRoot, candidate);
    if (
      workspaceRelativePath.length === 0 ||
      workspaceRelativePath === ".." ||
      workspaceRelativePath.startsWith(`..${sep}`) ||
      isAbsolute(workspaceRelativePath)
    ) {
      throw new UnsafeArtifactPathError(inputPath, "path escapes or aliases the workspace root");
    }
    const portablePath = workspaceRelativePath.split(sep).join("/");
    if (this.#sensitivePathPolicy.isSensitive(portablePath)) {
      throw new UnsafeArtifactPathError(inputPath, "path is classified as sensitive");
    }
    return portablePath;
  }

  #event(
    workspaceId: string,
    workItemId: string | undefined,
    eventType: ContextEvent["eventType"],
    payload: unknown,
    identity: RequestIdentity,
    idempotencyKey: string,
    timestamp: string,
    artifactIds: readonly string[],
  ): ContextEvent {
    return parseContextEvent({
      schemaVersion: "0.1",
      eventId: stableId("evt", workspaceId, idempotencyKey),
      eventType,
      workspaceId,
      ...(workItemId === undefined ? {} : { workItemId }),
      occurredAt: timestamp,
      observedAt: timestamp,
      actor: identity.actor,
      source: identity.source,
      idempotencyKey,
      payload,
      provenance: {
        observedAt: timestamp,
        sourceEventIds: [],
        artifactIds: [...artifactIds],
      },
      metadata: {},
    });
  }

  #requireWorkspace(workspaceId: string): Workspace {
    const workspace = this.#repository.getWorkspace(workspaceId);
    if (workspace === undefined) {
      throw new EntityNotFoundError("Workspace", workspaceId);
    }
    return workspace;
  }

  #requireWorkItem(workItemId: string, workspaceId: string): WorkItem {
    const workItem = this.#repository.getWorkItem(workItemId);
    if (workItem === undefined || workItem.workspaceId !== workspaceId) {
      throw new EntityNotFoundError("WorkItem", workItemId);
    }
    return workItem;
  }
}

function stableId(prefix: string, ...parts: readonly string[]): string {
  const digest = createHash("sha256").update(parts.join("\u0000")).digest("hex");
  return `${prefix}:${digest.slice(0, 32)}`;
}

function deduplicateArtifacts(artifacts: readonly ArtifactRef[]): ArtifactRef[] {
  return [...new Map(artifacts.map((artifact) => [artifact.id, artifact])).values()].sort(
    (left, right) => left.id.localeCompare(right.id),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
