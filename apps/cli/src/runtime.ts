import { chmod, lstat, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  ContextWeftService,
  UnavailableMemoryRuntime,
  type MemoryRuntime,
} from "@contextweft/application";
import { GitAdapter } from "@contextweft/git-adapter";
import { OpenContextMemoryRuntime } from "@contextweft/opencontext-adapter";
import { SqliteCanonicalRepository } from "@contextweft/storage";
import { UnsafeStatePathError, WorkspaceNotInitializedError } from "./errors.js";

export const STATE_DIRECTORY_NAME = ".contextweft";
export const CANONICAL_DATABASE_NAME = "contextweft.db";
export const MEMORY_DATABASE_NAME = "memory.db";

export interface ContextWeftRuntime {
  readonly rootPath: string;
  readonly stateDirectory: string;
  readonly canonicalDatabasePath: string;
  readonly memoryDatabasePath: string;
  readonly repository: SqliteCanonicalRepository;
  readonly service: ContextWeftService;
  readonly memoryAvailable: boolean;
  readonly warnings: readonly string[];
  close(): Promise<void>;
}

export interface OpenContextWeftRuntimeOptions {
  readonly startPath: string;
  readonly allowCreate: boolean;
}

/** Opens a repository-local runtime without consulting user-global state. */
export async function openContextWeftRuntime(
  options: OpenContextWeftRuntimeOptions,
): Promise<ContextWeftRuntime> {
  const git = new GitAdapter();
  const rootPath = await git.locate(options.startPath);
  const stateDirectory = join(rootPath, STATE_DIRECTORY_NAME);
  const canonicalDatabasePath = join(stateDirectory, CANONICAL_DATABASE_NAME);
  const memoryDatabasePath = join(stateDirectory, MEMORY_DATABASE_NAME);

  if (options.allowCreate) {
    if (await pathExists(stateDirectory)) {
      await assertSafeStateDirectory(stateDirectory);
    } else {
      await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
    }
    await assertSafeStateDirectory(stateDirectory);
    await chmod(stateDirectory, 0o700);
  } else if (!(await pathExists(canonicalDatabasePath))) {
    throw new WorkspaceNotInitializedError(rootPath);
  }
  await assertSafeStateDirectory(stateDirectory);
  await assertSafeDatabaseFamily(canonicalDatabasePath);
  await assertSafeDatabaseFamily(memoryDatabasePath);

  const repository = new SqliteCanonicalRepository({ path: canonicalDatabasePath });
  await chmod(canonicalDatabasePath, 0o600);
  let memory: MemoryRuntime;
  let openContextMemory: OpenContextMemoryRuntime | undefined;
  const warnings: string[] = [];
  try {
    openContextMemory = await OpenContextMemoryRuntime.open({ dbPath: memoryDatabasePath });
    memory = openContextMemory;
    await chmod(memoryDatabasePath, 0o600);
  } catch (error) {
    /* v8 ignore next -- covers the rare half-open OpenContext cleanup path. */
    await openContextMemory?.close().catch(() => undefined);
    openContextMemory = undefined;
    const reason = `OpenContext memory is unavailable (${errorMessage(error)})`;
    warnings.push(reason);
    memory = new UnavailableMemoryRuntime(reason);
  }

  const service = new ContextWeftService({ repository, git, memory });
  let closed = false;
  return {
    rootPath,
    stateDirectory,
    canonicalDatabasePath,
    memoryDatabasePath,
    repository,
    service,
    memoryAvailable: openContextMemory !== undefined,
    warnings,
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      try {
        await openContextMemory?.close();
      } finally {
        repository.close();
      }
    },
  };
}

async function assertSafeStateDirectory(path: string): Promise<void> {
  const status = await lstat(path);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new UnsafeStatePathError(path, "state directory must be a real directory");
  }
}

async function assertSafeDatabaseFamily(databasePath: string): Promise<void> {
  await Promise.all(
    [databasePath, `${databasePath}-wal`, `${databasePath}-shm`].map(async (path) => {
      try {
        const status = await lstat(path);
        if (status.isSymbolicLink() || !status.isFile()) {
          throw new UnsafeStatePathError(path, "database entries must be regular files");
        }
      } catch (error) {
        if (isMissingFile(error)) {
          return;
        }
        throw error;
      }
    }),
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    /* v8 ignore next -- non-ENOENT lstat failures depend on host filesystem races/permissions. */
    if (isMissingFile(error)) {
      return false;
    }
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

/* v8 ignore start -- runtime startup errors normally arrive as Error objects. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
/* v8 ignore stop */
