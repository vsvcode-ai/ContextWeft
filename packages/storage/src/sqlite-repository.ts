import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  canonicalJson,
  parseArtifactRef,
  parseContextEvent,
  parseWorkItem,
  parseWorkspace,
  type ArtifactRef,
  type ContextEvent,
  type ContextEventType,
  type WorkItem,
  type Workspace,
} from "@contextweft/contracts";
import Database from "better-sqlite3";
import {
  EntityConflictError,
  EntityNotFoundError,
  IdempotencyConflictError,
  StorageClosedError,
} from "./errors.js";
import { migrate } from "./migrations.js";
import type { AppendResult, CanonicalRepository, EventQuery } from "./ports.js";
import {
  decodeArtifact,
  decodeEvent,
  decodeWorkItem,
  decodeWorkspace,
  encodeArtifact,
  encodeEvent,
  encodeWorkItem,
  encodeWorkspace,
  type ArtifactRow,
  type EventRow,
  type WorkItemRow,
  type WorkspaceRow,
} from "./row-codec.js";

export interface SqliteRepositoryOptions {
  readonly path: string;
  readonly readonly?: boolean;
}

const MAX_QUERY_LIMIT = 100_000;

interface EventQueryParameters {
  [name: string]: string | number | undefined;
  workspaceId: string;
  workItemId?: string;
  occurredAfter?: string;
  occurredBefore?: string;
  limit?: number;
}

/**
 * Canonical SQLite repository.
 *
 * SQLite is synchronous by design. Keeping this adapter synchronous avoids
 * fake promises and gives the application layer explicit control over where
 * future remote/Postgres adapters introduce asynchrony.
 */
export class SqliteCanonicalRepository implements CanonicalRepository {
  readonly #database: Database.Database;
  readonly #schemaVersion: number;
  #closed = false;

  public constructor(options: SqliteRepositoryOptions) {
    if (options.path !== ":memory:" && !options.readonly) {
      mkdirSync(dirname(resolve(options.path)), { recursive: true });
    }

    this.#database = new Database(options.path, {
      readonly: options.readonly ?? false,
      fileMustExist: options.readonly ?? false,
      timeout: 5_000,
    });
    this.#database.pragma("foreign_keys = OFF");
    this.#database.pragma("busy_timeout = 5000");
    this.#database.pragma("temp_store = MEMORY");
    if (!options.readonly) {
      this.#database.pragma("journal_mode = WAL");
      this.#database.pragma("synchronous = NORMAL");
    }
    this.#schemaVersion = options.readonly
      ? (this.#database.pragma("user_version", { simple: true }) as number)
      : migrate(this.#database);
  }

  public get schemaVersion(): number {
    this.#assertOpen();
    return this.#schemaVersion;
  }

  public putWorkspace(input: Workspace): void {
    this.#assertOpen();
    const workspace = parseWorkspace(input);
    const row = encodeWorkspace(workspace);
    this.#database
      .prepare(
        `INSERT INTO workspaces
          (id, schema_version, name, root_path, created_at, updated_at, metadata_json)
         VALUES
          (@id, @schema_version, @name, @root_path, @created_at, @updated_at, @metadata_json)
         ON CONFLICT(id) DO UPDATE SET
          schema_version = excluded.schema_version,
          name = excluded.name,
          root_path = excluded.root_path,
          updated_at = excluded.updated_at,
          metadata_json = excluded.metadata_json`,
      )
      .run(row);
  }

  public getWorkspace(workspaceId: string): Workspace | undefined {
    this.#assertOpen();
    const row = this.#database.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId) as
      | WorkspaceRow
      | undefined;
    return row === undefined ? undefined : decodeWorkspace(row);
  }

  public findWorkspaceByRoot(rootPath: string): Workspace | undefined {
    this.#assertOpen();
    const row = this.#database
      .prepare("SELECT * FROM workspaces WHERE root_path = ?")
      .get(rootPath) as WorkspaceRow | undefined;
    return row === undefined ? undefined : decodeWorkspace(row);
  }

  public listWorkspaces(): readonly Workspace[] {
    this.#assertOpen();
    const rows = this.#database
      .prepare("SELECT * FROM workspaces ORDER BY created_at, id")
      .all() as WorkspaceRow[];
    return rows.map(decodeWorkspace);
  }

  public putWorkItem(input: WorkItem): void {
    this.#assertOpen();
    const workItem = parseWorkItem(input);
    this.#requireWorkspace(workItem.workspaceId);
    const existing = this.getWorkItem(workItem.id);
    if (existing !== undefined && existing.workspaceId !== workItem.workspaceId) {
      throw new EntityConflictError("WorkItem", workItem.id);
    }
    const row = encodeWorkItem(workItem);
    this.#database
      .prepare(
        `INSERT INTO work_items
          (id, schema_version, workspace_id, title, goal, status, created_at, updated_at, metadata_json)
         VALUES
          (@id, @schema_version, @workspace_id, @title, @goal, @status, @created_at, @updated_at, @metadata_json)
         ON CONFLICT(id) DO UPDATE SET
          schema_version = excluded.schema_version,
          title = excluded.title,
          goal = excluded.goal,
          status = excluded.status,
          updated_at = excluded.updated_at,
          metadata_json = excluded.metadata_json
         WHERE work_items.workspace_id = excluded.workspace_id`,
      )
      .run(row);
  }

  public getWorkItem(workItemId: string): WorkItem | undefined {
    this.#assertOpen();
    const row = this.#database.prepare("SELECT * FROM work_items WHERE id = ?").get(workItemId) as
      | WorkItemRow
      | undefined;
    return row === undefined ? undefined : decodeWorkItem(row);
  }

  public listWorkItems(workspaceId: string): readonly WorkItem[] {
    this.#assertOpen();
    const rows = this.#database
      .prepare("SELECT * FROM work_items WHERE workspace_id = ? ORDER BY created_at, id")
      .all(workspaceId) as WorkItemRow[];
    return rows.map(decodeWorkItem);
  }

  public putArtifact(input: ArtifactRef): void {
    this.putArtifacts([input]);
  }

  public putArtifacts(inputs: readonly ArtifactRef[]): void {
    this.#assertOpen();
    const artifacts = inputs.map((input) => parseArtifactRef(input));
    const statement = this.#database.prepare(
      `INSERT INTO artifacts
        (id, schema_version, workspace_id, work_item_id, kind, uri, title, content_hash,
         git_revision, observed_at, metadata_json)
       VALUES
        (@id, @schema_version, @workspace_id, @work_item_id, @kind, @uri, @title, @content_hash,
         @git_revision, @observed_at, @metadata_json)
       ON CONFLICT(id) DO UPDATE SET
        schema_version = excluded.schema_version,
        kind = excluded.kind,
        uri = excluded.uri,
        title = excluded.title,
        content_hash = excluded.content_hash,
        git_revision = excluded.git_revision,
        observed_at = excluded.observed_at,
        metadata_json = excluded.metadata_json
       WHERE artifacts.workspace_id = excluded.workspace_id
         AND COALESCE(artifacts.work_item_id, '') = COALESCE(excluded.work_item_id, '')`,
    );

    this.#database.transaction(() => {
      for (const artifact of artifacts) {
        this.#requireWorkspace(artifact.workspaceId);
        if (artifact.workItemId !== undefined) {
          this.#requireWorkItem(artifact.workItemId, artifact.workspaceId);
        }
        const existing = this.getArtifact(artifact.id);
        if (
          existing !== undefined &&
          (existing.workspaceId !== artifact.workspaceId ||
            existing.workItemId !== artifact.workItemId)
        ) {
          throw new EntityConflictError("ArtifactRef", artifact.id);
        }
        statement.run(encodeArtifact(artifact));
      }
    })();
  }

  public getArtifact(artifactId: string): ArtifactRef | undefined {
    this.#assertOpen();
    const row = this.#database.prepare("SELECT * FROM artifacts WHERE id = ?").get(artifactId) as
      | ArtifactRow
      | undefined;
    return row === undefined ? undefined : decodeArtifact(row);
  }

  public listArtifacts(workspaceId: string, workItemId?: string): readonly ArtifactRef[] {
    this.#assertOpen();
    const rows =
      workItemId === undefined
        ? (this.#database
            .prepare("SELECT * FROM artifacts WHERE workspace_id = ? ORDER BY observed_at, id")
            .all(workspaceId) as ArtifactRow[])
        : (this.#database
            .prepare(
              `SELECT * FROM artifacts
               WHERE workspace_id = ? AND work_item_id = ?
               ORDER BY observed_at, id`,
            )
            .all(workspaceId, workItemId) as ArtifactRow[]);
    return rows.map(decodeArtifact);
  }

  public appendEvent(input: ContextEvent): AppendResult {
    return this.appendEvents([input])[0] as AppendResult;
  }

  public appendEvents(inputs: readonly ContextEvent[]): readonly AppendResult[] {
    this.#assertOpen();
    const events = inputs.map((input) => parseContextEvent(input));
    const insert = this.#database.prepare(
      `INSERT INTO context_events
        (event_id, schema_version, event_type, workspace_id, work_item_id, occurred_at,
         observed_at, actor_json, source_json, idempotency_key, payload_json,
         provenance_json, metadata_json)
       VALUES
        (@event_id, @schema_version, @event_type, @workspace_id, @work_item_id, @occurred_at,
         @observed_at, @actor_json, @source_json, @idempotency_key, @payload_json,
         @provenance_json, @metadata_json)`,
    );
    const byId = this.#database.prepare("SELECT * FROM context_events WHERE event_id = ?");
    const byIdempotency = this.#database.prepare(
      "SELECT * FROM context_events WHERE workspace_id = ? AND idempotency_key = ?",
    );

    return this.#database.transaction(() => {
      const validatedWorkspaces = new Set<string>();
      const validatedWorkItems = new Set<string>();
      return events.map((event): AppendResult => {
        if (!validatedWorkspaces.has(event.workspaceId)) {
          this.#requireWorkspace(event.workspaceId);
          validatedWorkspaces.add(event.workspaceId);
        }
        if (event.workItemId !== undefined) {
          const workItemKey = `${event.workspaceId}\u0000${event.workItemId}`;
          if (!validatedWorkItems.has(workItemKey)) {
            this.#requireWorkItem(event.workItemId, event.workspaceId);
            validatedWorkItems.add(workItemKey);
          }
        }

        const existingById = byId.get(event.eventId) as EventRow | undefined;
        if (existingById !== undefined) {
          const existing = decodeEvent(existingById);
          if (canonicalJson(existing) !== canonicalJson(event)) {
            throw new EntityConflictError("ContextEvent", event.eventId);
          }
          return { event: existing, inserted: false };
        }

        const existingByKey = byIdempotency.get(event.workspaceId, event.idempotencyKey) as
          | EventRow
          | undefined;
        if (existingByKey !== undefined) {
          const existing = decodeEvent(existingByKey);
          if (canonicalJson(existing) !== canonicalJson(event)) {
            throw new IdempotencyConflictError(event.idempotencyKey);
          }
          return { event: existing, inserted: false };
        }

        insert.run(encodeEvent(event));
        return { event, inserted: true };
      });
    })();
  }

  public getEvent(eventId: string): ContextEvent | undefined {
    this.#assertOpen();
    const row = this.#database
      .prepare("SELECT * FROM context_events WHERE event_id = ?")
      .get(eventId) as EventRow | undefined;
    return row === undefined ? undefined : decodeEvent(row);
  }

  public listEvents(query: EventQuery): readonly ContextEvent[] {
    this.#assertOpen();
    const conditions = ["workspace_id = @workspaceId"];
    const parameters: EventQueryParameters = { workspaceId: query.workspaceId };

    if (query.workItemId !== undefined) {
      conditions.push("work_item_id = @workItemId");
      parameters.workItemId = query.workItemId;
    }
    if (query.occurredAfter !== undefined) {
      conditions.push("occurred_at > @occurredAfter");
      parameters.occurredAfter = query.occurredAfter;
    }
    if (query.occurredBefore !== undefined) {
      conditions.push("occurred_at < @occurredBefore");
      parameters.occurredBefore = query.occurredBefore;
    }
    if (query.eventTypes !== undefined && query.eventTypes.length > 0) {
      const placeholders = query.eventTypes.map((eventType, index) => {
        const name = `eventType${index}`;
        parameters[name] = eventType;
        return `@${name}`;
      });
      conditions.push(`event_type IN (${placeholders.join(", ")})`);
    }

    const limit = Math.min(Math.max(query.limit ?? MAX_QUERY_LIMIT, 1), MAX_QUERY_LIMIT);
    parameters.limit = limit;
    const rows = this.#database
      .prepare(
        `SELECT * FROM context_events
         WHERE ${conditions.join(" AND ")}
         ORDER BY occurred_at, event_id
         LIMIT @limit`,
      )
      .all(parameters) as EventRow[];
    return rows.map(decodeEvent);
  }

  public countEvents(workspaceId: string, workItemId?: string): number {
    this.#assertOpen();
    const row =
      workItemId === undefined
        ? (this.#database
            .prepare("SELECT COUNT(*) AS count FROM context_events WHERE workspace_id = ?")
            .get(workspaceId) as { count: number })
        : (this.#database
            .prepare(
              `SELECT COUNT(*) AS count FROM context_events
               WHERE workspace_id = ? AND work_item_id = ?`,
            )
            .get(workspaceId, workItemId) as { count: number });
    return row.count;
  }

  public close(): void {
    if (this.#closed) {
      return;
    }
    this.#database.close();
    this.#closed = true;
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new StorageClosedError();
    }
  }

  #requireWorkspace(workspaceId: string): void {
    if (this.getWorkspace(workspaceId) === undefined) {
      throw new EntityNotFoundError("Workspace", workspaceId);
    }
  }

  #requireWorkItem(workItemId: string, workspaceId: string): void {
    const workItem = this.getWorkItem(workItemId);
    if (workItem === undefined || workItem.workspaceId !== workspaceId) {
      throw new EntityNotFoundError("WorkItem", workItemId);
    }
  }
}

export function openCanonicalRepository(options: SqliteRepositoryOptions): CanonicalRepository {
  return new SqliteCanonicalRepository(options);
}

export type { ContextEventType };
