/**
 * Narrow structural boundary around OpenContext memory-store 1.3.x.
 *
 * OpenContext is intentionally kept behind this module because it is pre-1.0
 * and its facade exposes a much larger API than ContextWeft needs. Runtime
 * assertions turn upstream API drift into a clear startup error.
 */
export interface OpenContextRawMessageInput {
  readonly messageId: string;
  readonly platform: "contextweft";
  readonly botId: "contextweft";
  readonly userId: string;
  readonly channel: string;
  readonly timestamp: number;
  readonly content: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
  readonly memoryStage: "long";
  readonly importanceScore: number;
  readonly isPinned: boolean;
  readonly factType: string;
}

export interface OpenContextStoredMessage {
  readonly messageId?: unknown;
  readonly timestamp?: unknown;
  readonly metadata?: unknown;
}

export interface OpenContextRawMessageManager {
  storeMessages(messages: readonly OpenContextRawMessageInput[]): Promise<readonly number[]>;
  deprecateMessages(
    messageIds: readonly string[],
    input: {
      readonly userId: string;
      readonly deprecatedAt: number;
      readonly reason: string;
    },
  ): Promise<number>;
  getMessageById(messageId: string): Promise<OpenContextStoredMessage | null>;
  lexicalSearchMessages(input: {
    readonly userId: string;
    readonly keywords: readonly string[];
    readonly limit: number;
    readonly botId: "contextweft";
  }): Promise<readonly OpenContextSearchHit[]>;
}

export interface OpenContextSearchHit {
  readonly id: unknown;
  readonly content: unknown;
  readonly similarity: unknown;
  readonly metadata: unknown;
}

export interface OpenContextStore {
  readonly raw: {
    close(): Promise<void>;
  };
  getRawMessageManager(): Promise<OpenContextRawMessageManager>;
}

export interface OpenContextFactoryOptions {
  readonly dbPath: string;
}

export type OpenContextStoreFactory = (options: OpenContextFactoryOptions) => Promise<unknown>;
