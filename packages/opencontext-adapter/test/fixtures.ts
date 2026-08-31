import { parseContextEvent, type ContextEvent } from "@contextweft/contracts";
import type {
  OpenContextRawMessageInput,
  OpenContextRawMessageManager,
  OpenContextSearchHit,
  OpenContextStore,
} from "../src/index.js";

const occurredAt = "2026-08-31T12:00:00.000Z";
type MemoryRecordedEvent = Extract<ContextEvent, { eventType: "memory.recorded" }>;
type MemoryCorrectedEvent = Extract<ContextEvent, { eventType: "memory.corrected" }>;

export function memoryRecorded(
  overrides: Readonly<Record<string, unknown>> = {},
): MemoryRecordedEvent {
  return parseContextEvent({
    schemaVersion: "0.1",
    eventId: "evt:memory-recorded-0000000000000001",
    eventType: "memory.recorded",
    workspaceId: "ws:opencontext-test",
    workItemId: "work:adapter-test",
    occurredAt,
    observedAt: occurredAt,
    actor: { type: "agent", id: "agent:test" },
    source: { kind: "mcp", agent: "test" },
    idempotencyKey: "memory-record:test",
    payload: {
      content: "Context packs are deterministic and provenance complete.",
      kind: "decision",
      confidence: 0.95,
    },
    provenance: {
      observedAt: occurredAt,
      sourceEventIds: [],
      artifactIds: ["artifact:design"],
    },
    metadata: {},
    ...overrides,
  }) as MemoryRecordedEvent;
}

export function memoryCorrected(targetEventId: string): MemoryCorrectedEvent {
  return parseContextEvent({
    schemaVersion: "0.1",
    eventId: "evt:memory-corrected-000000000000001",
    eventType: "memory.corrected",
    workspaceId: "ws:opencontext-test",
    workItemId: "work:adapter-test",
    occurredAt: "2026-08-31T12:01:00.000Z",
    observedAt: "2026-08-31T12:01:00.000Z",
    actor: { type: "human", id: "user:test" },
    source: { kind: "cli", agent: "test" },
    idempotencyKey: "memory-correct:test",
    payload: {
      targetEventId,
      content: "Context packs are deterministic for identical canonical inputs.",
      reason: "Clarify the determinism boundary.",
    },
    provenance: {
      observedAt: "2026-08-31T12:01:00.000Z",
      sourceEventIds: [],
      artifactIds: ["artifact:design"],
    },
    metadata: {},
  }) as MemoryCorrectedEvent;
}

interface Stored extends OpenContextRawMessageInput {
  deprecated: boolean;
}

export class FakeOpenContextManager implements OpenContextRawMessageManager {
  public readonly messages = new Map<string, Stored>();
  public readonly operationOrder: string[] = [];

  public async storeMessages(messages: readonly OpenContextRawMessageInput[]) {
    this.operationOrder.push("store");
    for (const message of messages) {
      this.messages.set(message.messageId, {
        ...message,
        deprecated: this.messages.get(message.messageId)?.deprecated ?? false,
      });
    }
    return messages.map((_, index) => index + 1);
  }

  public async deprecateMessages(messageIds: readonly string[]) {
    this.operationOrder.push("deprecate");
    let changed = 0;
    for (const messageId of messageIds) {
      const message = this.messages.get(messageId);
      if (message !== undefined && !message.deprecated) {
        this.messages.set(messageId, { ...message, deprecated: true });
        changed += 1;
      }
    }
    return changed;
  }

  public async getMessageById(messageId: string) {
    return this.messages.get(messageId) ?? null;
  }

  public async lexicalSearchMessages(input: {
    readonly userId: string;
    readonly keywords: readonly string[];
    readonly limit: number;
    readonly botId: "contextweft";
  }) {
    return [...this.messages.values()]
      .filter(
        (message) =>
          !message.deprecated &&
          message.userId === input.userId &&
          message.botId === input.botId &&
          input.keywords.some((word) => message.content.toLowerCase().includes(word)),
      )
      .slice(0, input.limit)
      .map((message) => ({
        id: message.messageId,
        content: message.content,
        similarity: 0.9,
        metadata: { channel: message.channel, timestamp: message.timestamp },
      }));
  }
}

export class FakeOpenContextStore implements OpenContextStore {
  public readonly manager = new FakeOpenContextManager();
  public closed = false;
  public readonly raw = {
    close: async () => {
      this.closed = true;
    },
  };

  public async getRawMessageManager() {
    return this.manager;
  }

  public async searchUnifiedMemory(input: {
    readonly userId: string;
    readonly query: string;
    readonly limit: number;
  }) {
    const words = input.query.toLowerCase().split(/\s+/u).filter(Boolean);
    const results: OpenContextSearchHit[] = [...this.manager.messages.values()]
      .filter(
        (message) =>
          !message.deprecated &&
          message.userId === input.userId &&
          words.some((word) => message.content.toLowerCase().includes(word)),
      )
      .slice(0, input.limit)
      .map((message) => ({
        id: message.messageId,
        content: message.content,
        similarity: 0.9,
        metadata: { channel: message.channel, timestamp: message.timestamp },
      }));
    return { results };
  }
}
