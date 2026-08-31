import type { Actor, ContextEvent, Source } from "@contextweft/contracts";
import type { MemoryRecall } from "@contextweft/context-compiler";

export interface Clock {
  now(): Date;
}

export interface RequestIdentity {
  readonly actor: Actor;
  readonly source: Source;
}

export interface MemorySearchRequest {
  readonly workspaceId: string;
  readonly workItemId: string;
  readonly query: string;
  readonly limit: number;
}

export interface MemoryRuntime {
  search(request: MemorySearchRequest): Promise<readonly MemoryRecall[]>;
  ingest(events: readonly ContextEvent[]): Promise<void>;
  rebuild(workspaceId: string, events: readonly ContextEvent[]): Promise<void>;
}

export class NullMemoryRuntime implements MemoryRuntime {
  public async search(): Promise<readonly MemoryRecall[]> {
    return [];
  }

  public async ingest(): Promise<void> {}

  public async rebuild(): Promise<void> {}
}

/** Memory port used when an optional runtime could not be initialized. */
export class UnavailableMemoryRuntime implements MemoryRuntime {
  readonly #reason: string;

  public constructor(reason: string) {
    this.#reason = reason;
  }

  public async search(): Promise<readonly MemoryRecall[]> {
    throw new Error(this.#reason);
  }

  public async ingest(): Promise<void> {
    throw new Error(this.#reason);
  }

  public async rebuild(): Promise<void> {
    throw new Error(this.#reason);
  }
}
