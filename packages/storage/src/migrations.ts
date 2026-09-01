import type Database from "better-sqlite3";

interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "canonical_context_store",
    sql: `
      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY,
        schema_version TEXT NOT NULL,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE work_items (
        id TEXT PRIMARY KEY,
        schema_version TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        title TEXT NOT NULL,
        goal TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL
      ) STRICT;

      CREATE INDEX work_items_workspace_updated
        ON work_items (workspace_id, updated_at DESC, id);

      CREATE TABLE context_events (
        event_id TEXT PRIMARY KEY,
        schema_version TEXT NOT NULL,
        event_type TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        work_item_id TEXT,
        occurred_at TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        actor_json TEXT NOT NULL,
        source_json TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        provenance_json TEXT NOT NULL,
        metadata_json TEXT NOT NULL
      ) STRICT;

      CREATE UNIQUE INDEX context_events_workspace_idempotency
        ON context_events (workspace_id, idempotency_key);

      CREATE INDEX context_events_workspace_time
        ON context_events (workspace_id, occurred_at, event_id);

      CREATE INDEX context_events_work_item_time
        ON context_events (workspace_id, work_item_id, occurred_at, event_id);

      CREATE INDEX context_events_type_time
        ON context_events (workspace_id, event_type, occurred_at, event_id);

      CREATE TABLE artifacts (
        id TEXT PRIMARY KEY,
        schema_version TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        work_item_id TEXT,
        kind TEXT NOT NULL,
        uri TEXT NOT NULL,
        title TEXT,
        content_hash TEXT,
        git_revision TEXT,
        observed_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL
      ) STRICT;

      CREATE INDEX artifacts_workspace_time
        ON artifacts (workspace_id, observed_at, id);

      CREATE INDEX artifacts_work_item_time
        ON artifacts (workspace_id, work_item_id, observed_at, id);
    `,
  },
];

/* v8 ignore next -- the migration list is a compile-time invariant. */
export const LATEST_SCHEMA_VERSION = MIGRATIONS.at(-1)?.version ?? 0;

/** Applies every migration atomically and records the version in SQLite itself. */
export function migrate(database: Database.Database): number {
  const currentVersion = database.pragma("user_version", { simple: true }) as number;
  if (currentVersion > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `Database schema ${currentVersion} is newer than supported schema ${LATEST_SCHEMA_VERSION}`,
    );
  }

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue;
    }

    database.transaction(() => {
      database.exec(migration.sql);
      database.pragma(`user_version = ${migration.version}`);
    })();
  }

  return database.pragma("user_version", { simple: true }) as number;
}
