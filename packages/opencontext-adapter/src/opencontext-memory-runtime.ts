import { resolve } from "node:path";
import type { MemoryRuntime, MemorySearchRequest } from "@contextweft/application";
import type { MemoryRecall } from "@contextweft/context-compiler";
import type { ContextEvent } from "@contextweft/contracts";
import { createRawMessageStore } from "@melandlabs/memory-store";
import { OpenContextCompatibilityError, OpenContextRuntimeStateError } from "./errors.js";
import type {
  OpenContextFactoryOptions,
  OpenContextRawMessageInput,
  OpenContextRawMessageManager,
  OpenContextSearchHit,
  OpenContextStore,
  OpenContextStoreFactory,
  OpenContextStoredMessage,
} from "./opencontext-boundary.js";

const PLATFORM = "contextweft" as const;
const EXPECTED_OPENCONTEXT_VERSION = "@melandlabs/memory-store 1.3.x";

let activeDefaultRuntime: OpenContextMemoryRuntime | undefined;
let defaultRuntimeOpening = false;

export interface OpenContextMemoryRuntimeOptions {
  /** Path to the disposable OpenContext SQLite index, never the canonical DB. */
  readonly dbPath: string;
  /** Test/embedding seam; production callers normally leave this unset. */
  readonly factory?: OpenContextStoreFactory;
}

/**
 * Derived-memory implementation backed by embedded OpenContext.
 *
 * ContextWeft event IDs become OpenContext message IDs, making every replay
 * idempotent. Workspace IDs define the OpenContext user scope and work-item IDs
 * define the channel scope, preventing cross-workspace recall.
 */
export class OpenContextMemoryRuntime implements MemoryRuntime {
  readonly #store: OpenContextStore;
  readonly #databasePath: string;
  readonly #ownsDefaultRuntimeSlot: boolean;
  #manager: Promise<OpenContextRawMessageManager> | undefined;
  #closed = false;

  private constructor(
    store: OpenContextStore,
    databasePath: string,
    ownsDefaultRuntimeSlot: boolean,
  ) {
    this.#store = store;
    this.#databasePath = databasePath;
    this.#ownsDefaultRuntimeSlot = ownsDefaultRuntimeSlot;
  }

  public static async open(
    options: OpenContextMemoryRuntimeOptions,
  ): Promise<OpenContextMemoryRuntime> {
    const databasePath = normalizeDatabasePath(options.dbPath);
    const usesDefaultFactory = options.factory === undefined;
    if (usesDefaultFactory && (activeDefaultRuntime !== undefined || defaultRuntimeOpening)) {
      throw new OpenContextRuntimeStateError(
        "Embedded OpenContext memory uses process-global SQLite state; close the active runtime before opening another one",
      );
    }

    const factory = options.factory ?? defaultOpenContextFactory;
    if (usesDefaultFactory) {
      defaultRuntimeOpening = true;
    }
    try {
      const candidate = await factory({ dbPath: databasePath });
      const store = assertOpenContextStore(candidate);
      const runtime = new OpenContextMemoryRuntime(store, databasePath, usesDefaultFactory);
      try {
        // Open eagerly so startup reports path, native-module, and upstream API
        // failures before the application claims memory is available.
        await runtime.#getManager();
      } catch (error) {
        await store.raw.close();
        throw error;
      }
      if (usesDefaultFactory) {
        activeDefaultRuntime = runtime;
      }
      return runtime;
    } finally {
      if (usesDefaultFactory) {
        defaultRuntimeOpening = false;
      }
    }
  }

  public get databasePath(): string {
    return this.#databasePath;
  }

  public async search(request: MemorySearchRequest): Promise<readonly MemoryRecall[]> {
    this.#assertOpen();
    const keywords = lexicalKeywords(request.query);
    if (keywords.length === 0) {
      return [];
    }
    const manager = await this.#getManager();
    const hits = await manager.lexicalSearchMessages({
      userId: workspaceScope(request.workspaceId),
      keywords,
      limit: normalizeLimit(request.limit),
      botId: PLATFORM,
    });
    const recalls = await Promise.all(
      hits.map(async (hit) => this.#toRecall(hit, request, manager)),
    );
    return recalls
      .filter((recall): recall is MemoryRecall => recall !== undefined)
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .slice(0, normalizeLimit(request.limit));
  }

  public async ingest(events: readonly ContextEvent[]): Promise<void> {
    this.#assertOpen();
    const memoryEvents = canonicalMemoryEvents(events);
    if (memoryEvents.length === 0) {
      return;
    }
    const manager = await this.#getManager();

    // Store replacements first. If a process is interrupted between these two
    // operations, recall may temporarily show both versions but never loses both.
    await manager.storeMessages(memoryEvents.map(toRawMessage));
    for (const event of memoryEvents) {
      if (event.eventType === "memory.corrected") {
        await manager.deprecateMessages([event.payload.targetEventId], {
          userId: workspaceScope(event.workspaceId),
          deprecatedAt: parseTimestamp(event.occurredAt),
          reason: event.payload.reason,
        });
      }
    }
  }

  public async rebuild(workspaceId: string, events: readonly ContextEvent[]): Promise<void> {
    this.#assertOpen();
    for (const event of events) {
      if (event.workspaceId !== workspaceId) {
        throw new OpenContextRuntimeStateError(
          `Cannot rebuild workspace ${workspaceId} from event ${event.eventId} in ${event.workspaceId}`,
        );
      }
    }
    await this.ingest(events);
  }

  public async close(): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    try {
      await this.#store.raw.close();
    } finally {
      if (this.#ownsDefaultRuntimeSlot && activeDefaultRuntime === this) {
        activeDefaultRuntime = undefined;
      }
    }
  }

  async #getManager(): Promise<OpenContextRawMessageManager> {
    this.#manager ??= this.#store.getRawMessageManager();
    const manager = await this.#manager;
    return assertRawMessageManager(manager);
  }

  async #toRecall(
    hit: OpenContextSearchHit,
    request: MemorySearchRequest,
    manager: OpenContextRawMessageManager,
  ): Promise<MemoryRecall | undefined> {
    if (
      !isRecord(hit) ||
      typeof hit.id !== "string" ||
      typeof hit.content !== "string" ||
      typeof hit.similarity !== "number" ||
      !Number.isFinite(hit.similarity)
    ) {
      throw compatibilityError("searchUnifiedMemory() returned a malformed hit");
    }
    const hitMetadata = isRecord(hit.metadata) ? hit.metadata : {};
    if (hitMetadata.channel !== workItemScope(request.workItemId)) {
      return undefined;
    }

    const stored = await manager.getMessageById(hit.id);
    const metadata = stored !== null && isRecord(stored.metadata) ? stored.metadata : {};
    return {
      id: hit.id,
      content: hit.content,
      occurredAt: recallTimestamp(stored, hitMetadata),
      score: Math.max(0, Math.min(1, hit.similarity)),
      sourceEventIds: stringArray(metadata.sourceEventIds, [hit.id]),
      artifactIds: stringArray(metadata.artifactIds, []),
    };
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new OpenContextRuntimeStateError("OpenContext memory runtime is closed");
    }
  }
}

async function defaultOpenContextFactory(options: OpenContextFactoryOptions): Promise<unknown> {
  const raw = createRawMessageStore({ dbPath: options.dbPath });
  return {
    raw,
    getRawMessageManager: () => raw.getManager(),
  };
}

function normalizeDatabasePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0) {
    throw new OpenContextRuntimeStateError("OpenContext database path cannot be empty");
  }
  return trimmed === ":memory:" ? trimmed : resolve(trimmed);
}

function canonicalMemoryEvents(events: readonly ContextEvent[]): ContextEvent[] {
  return events
    .filter(
      (event) => event.eventType === "memory.recorded" || event.eventType === "memory.corrected",
    )
    .sort(
      (left, right) =>
        left.occurredAt.localeCompare(right.occurredAt) ||
        left.eventId.localeCompare(right.eventId),
    );
}

function toRawMessage(event: ContextEvent): OpenContextRawMessageInput {
  /* v8 ignore next -- @preserve canonicalMemoryEvents filters inputs before this mapper is called. */
  if (event.eventType !== "memory.recorded" && event.eventType !== "memory.corrected") {
    throw new OpenContextRuntimeStateError(`Event ${event.eventId} is not a memory event`);
  }
  const sourceEventIds =
    event.eventType === "memory.corrected"
      ? [event.eventId, event.payload.targetEventId]
      : [event.eventId];
  const confidence = event.eventType === "memory.recorded" ? event.payload.confidence : 1;
  return {
    messageId: event.eventId,
    platform: PLATFORM,
    botId: PLATFORM,
    userId: workspaceScope(event.workspaceId),
    channel: workItemScope(event.workItemId ?? "workspace"),
    timestamp: Math.floor(parseTimestamp(event.occurredAt) / 1_000),
    content: event.payload.content,
    metadata: {
      contextweftSchemaVersion: event.schemaVersion,
      eventType: event.eventType,
      workspaceId: event.workspaceId,
      ...(event.workItemId === undefined ? {} : { workItemId: event.workItemId }),
      sourceEventIds,
      artifactIds: [...event.provenance.artifactIds],
      observedAt: event.observedAt,
      ...(event.eventType === "memory.recorded"
        ? {
            kind: event.payload.kind,
            confidence: event.payload.confidence,
            ...(event.payload.validFrom === undefined
              ? {}
              : { validFrom: event.payload.validFrom }),
          }
        : {
            targetEventId: event.payload.targetEventId,
            correctionReason: event.payload.reason,
          }),
    },
    createdAt: Math.floor(parseTimestamp(event.observedAt) / 1_000),
    memoryStage: "long",
    importanceScore: confidence,
    isPinned: event.eventType === "memory.recorded" && event.payload.kind === "constraint",
    factType: event.eventType === "memory.recorded" ? event.payload.kind : "correction",
  };
}

function workspaceScope(workspaceId: string): string {
  return `contextweft:workspace:${workspaceId}`;
}

function workItemScope(workItemId: string): string {
  return `contextweft:work-item:${workItemId}`;
}

function normalizeLimit(limit: number): number {
  return Number.isFinite(limit) ? Math.min(50, Math.max(1, Math.floor(limit))) : 10;
}

function lexicalKeywords(query: string): readonly string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2)
    .slice(0, 16);
}

function parseTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new OpenContextRuntimeStateError(`Invalid canonical timestamp: ${value}`);
  }
  return timestamp;
}

function recallTimestamp(
  stored: OpenContextStoredMessage | null,
  hitMetadata: RuntimeRecord,
): string {
  const timestamp =
    stored !== null && typeof stored.timestamp === "number"
      ? stored.timestamp
      : typeof hitMetadata.timestamp === "number"
        ? hitMetadata.timestamp
        : 0;
  const milliseconds = timestamp < 100_000_000_000 ? timestamp * 1_000 : timestamp;
  return new Date(milliseconds).toISOString();
}

function stringArray(value: unknown, fallback: readonly string[]): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : fallback;
}

function assertOpenContextStore(candidate: unknown): OpenContextStore {
  if (
    !isRecord(candidate) ||
    !isRecord(candidate.raw) ||
    typeof candidate.raw.close !== "function" ||
    typeof candidate.getRawMessageManager !== "function"
  ) {
    throw compatibilityError("createMemoryStore() returned an incompatible store");
  }
  return candidate as unknown as OpenContextStore;
}

function assertRawMessageManager(candidate: unknown): OpenContextRawMessageManager {
  if (
    !isRecord(candidate) ||
    typeof candidate.storeMessages !== "function" ||
    typeof candidate.deprecateMessages !== "function" ||
    typeof candidate.getMessageById !== "function" ||
    typeof candidate.lexicalSearchMessages !== "function"
  ) {
    throw compatibilityError("OpenContext raw message manager is incompatible");
  }
  return candidate as unknown as OpenContextRawMessageManager;
}

function compatibilityError(detail: string): OpenContextCompatibilityError {
  return new OpenContextCompatibilityError(
    `${detail}; ContextWeft expects ${EXPECTED_OPENCONTEXT_VERSION}`,
  );
}

interface RuntimeRecord {
  readonly [key: string]: unknown;
  readonly raw?: unknown;
  readonly close?: unknown;
  readonly getRawMessageManager?: unknown;
  readonly storeMessages?: unknown;
  readonly deprecateMessages?: unknown;
  readonly getMessageById?: unknown;
  readonly lexicalSearchMessages?: unknown;
  readonly channel?: unknown;
  readonly timestamp?: unknown;
  readonly sourceEventIds?: unknown;
  readonly artifactIds?: unknown;
}

function isRecord(value: unknown): value is RuntimeRecord {
  return typeof value === "object" && value !== null;
}
