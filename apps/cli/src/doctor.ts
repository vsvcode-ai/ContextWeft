import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { GitAdapter } from "@contextweft/git-adapter";
import { LATEST_SCHEMA_VERSION, SqliteCanonicalRepository } from "@contextweft/storage";
import { CANONICAL_DATABASE_NAME, MEMORY_DATABASE_NAME, STATE_DIRECTORY_NAME } from "./runtime.js";

export type DoctorCheckStatus = "ok" | "warn" | "fail";

export interface DoctorCheck {
  readonly name: string;
  readonly status: DoctorCheckStatus;
  readonly message: string;
}

export interface DoctorReport {
  readonly ok: boolean;
  readonly rootPath?: string;
  readonly checks: readonly DoctorCheck[];
}

/** Runs read-only diagnostics; it never creates or repairs runtime state. */
export async function inspectContextWeft(startPath: string): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  checks.push({
    name: "node",
    status: major >= 22 ? "ok" : "fail",
    message: `Node.js ${process.versions.node}; ContextWeft requires Node.js 22 or newer`,
  });

  const git = new GitAdapter();
  let rootPath: string;
  try {
    rootPath = await git.locate(startPath);
    const snapshot = await git.capture(rootPath);
    checks.push({
      name: "git",
      status: "ok",
      message: `repository detected${snapshot.revision === undefined ? " without a commit" : ` at ${snapshot.revision.slice(0, 12)}`}`,
    });
  } catch (error) {
    checks.push({ name: "git", status: "fail", message: errorMessage(error) });
    return { ok: false, checks };
  }

  const stateDirectory = join(rootPath, STATE_DIRECTORY_NAME);
  const canonicalDatabasePath = join(stateDirectory, CANONICAL_DATABASE_NAME);
  const memoryDatabasePath = join(stateDirectory, MEMORY_DATABASE_NAME);
  try {
    const status = await lstat(stateDirectory);
    if (status.isSymbolicLink() || !status.isDirectory()) {
      checks.push({
        name: "state-directory",
        status: "fail",
        message: "state path is not a real directory",
      });
    } else {
      const worldAccessible = (status.mode & 0o077) !== 0;
      checks.push({
        name: "state-directory",
        status: worldAccessible ? "warn" : "ok",
        message: worldAccessible
          ? "state directory permissions are broader than 0700"
          : "state directory permissions are restricted",
      });
    }
  } catch (error) {
    checks.push({ name: "state-directory", status: "fail", message: errorMessage(error) });
  }

  let repository: SqliteCanonicalRepository | undefined;
  try {
    const status = await lstat(canonicalDatabasePath);
    if (status.isSymbolicLink() || !status.isFile()) {
      throw new Error("canonical database is not a regular file");
    }
    repository = new SqliteCanonicalRepository({ path: canonicalDatabasePath, readonly: true });
    const workspace = repository.findWorkspaceByRoot(rootPath);
    if (workspace === undefined) {
      throw new Error("canonical database does not contain this workspace");
    }
    checks.push({
      name: "canonical-store",
      status: repository.schemaVersion === LATEST_SCHEMA_VERSION ? "ok" : "fail",
      message: `schema ${repository.schemaVersion}; ${repository.countEvents(workspace.id)} canonical events`,
    });
  } catch (error) {
    checks.push({ name: "canonical-store", status: "fail", message: errorMessage(error) });
  } finally {
    repository?.close();
  }

  try {
    const status = await lstat(memoryDatabasePath);
    checks.push({
      name: "derived-memory",
      status: status.isFile() && !status.isSymbolicLink() ? "ok" : "fail",
      message:
        status.isFile() && !status.isSymbolicLink()
          ? "derived OpenContext index is present"
          : "derived memory path is not a regular file",
    });
  } catch (error) {
    checks.push({
      name: "derived-memory",
      status: "warn",
      message: `derived index is absent and can be rebuilt (${errorMessage(error)})`,
    });
  }

  return {
    ok: checks.every((check) => check.status !== "fail"),
    rootPath,
    checks,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
