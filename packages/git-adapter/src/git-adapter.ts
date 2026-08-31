import { realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { canonicalJson, parseGitSnapshot, type GitSnapshot } from "@contextweft/contracts";
import { ExecFileGitCommandRunner } from "./command-runner.js";
import { GitCommandError, NotGitRepositoryError, WorkspaceRootMismatchError } from "./errors.js";
import type {
  Clock,
  GitCommandResult,
  GitCommandRunner,
  GitSnapshotProvider,
  GitWorkspaceLocator,
  SensitivePathPolicy,
} from "./ports.js";
import { DefaultSensitivePathPolicy } from "./sensitive-path-policy.js";

class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }
}

export interface GitAdapterOptions {
  readonly runner?: GitCommandRunner;
  readonly sensitivePathPolicy?: SensitivePathPolicy;
  readonly clock?: Clock;
}

export class GitAdapter implements GitSnapshotProvider, GitWorkspaceLocator {
  readonly #runner: GitCommandRunner;
  readonly #sensitivePathPolicy: SensitivePathPolicy;
  readonly #clock: Clock;

  public constructor(options: GitAdapterOptions = {}) {
    this.#runner = options.runner ?? new ExecFileGitCommandRunner();
    this.#sensitivePathPolicy = options.sensitivePathPolicy ?? new DefaultSensitivePathPolicy();
    this.#clock = options.clock ?? new SystemClock();
  }

  public async capture(workspaceRoot: string): Promise<GitSnapshot> {
    const resolvedWorkspaceRoot = await realpath(workspaceRoot);
    const resolvedRepositoryRoot = await this.locate(resolvedWorkspaceRoot);
    if (resolvedRepositoryRoot !== resolvedWorkspaceRoot) {
      throw new WorkspaceRootMismatchError(resolvedWorkspaceRoot, resolvedRepositoryRoot);
    }

    const headResult = await this.#runner.run(
      ["rev-parse", "--verify", "HEAD"],
      resolvedRepositoryRoot,
    );
    const revision = headResult.exitCode === 0 ? headResult.stdout.trim() : undefined;
    const branchResult = await this.#runner.run(
      ["symbolic-ref", "--quiet", "--short", "HEAD"],
      resolvedRepositoryRoot,
    );
    const branch = branchResult.exitCode === 0 ? branchResult.stdout.trim() : undefined;

    const changedPaths = await this.#changedPaths(resolvedRepositoryRoot, revision !== undefined);
    const visiblePaths: string[] = [];
    let excludedSensitiveFiles = 0;
    for (const path of changedPaths) {
      if (this.#sensitivePathPolicy.isSensitive(path)) {
        excludedSensitiveFiles += 1;
      } else {
        visiblePaths.push(path);
      }
    }
    visiblePaths.sort((left, right) => left.localeCompare(right));

    const fingerprintInput = {
      repositoryRoot: resolvedRepositoryRoot,
      revision,
      branch,
      dirty: changedPaths.length > 0,
      changedFiles: visiblePaths,
      excludedSensitiveFiles,
    };
    const fingerprint = createHash("sha256").update(canonicalJson(fingerprintInput)).digest("hex");

    return parseGitSnapshot({
      ...fingerprintInput,
      observedAt: this.#clock.now().toISOString(),
      fingerprint,
    });
  }

  /** Resolves a file or nested directory to its containing Git repository root. */
  public async locate(startPath: string): Promise<string> {
    const resolvedStartPath = await realpath(startPath);
    const rootResult = await this.#runner.run(
      ["rev-parse", "--path-format=absolute", "--show-toplevel"],
      resolvedStartPath,
    );
    if (rootResult.exitCode !== 0) {
      throw new NotGitRepositoryError(resolvedStartPath);
    }
    return realpath(rootResult.stdout.trim());
  }

  async #changedPaths(repositoryRoot: string, hasHead: boolean): Promise<readonly string[]> {
    const tracked = hasHead
      ? await this.#requireSuccess(["diff", "--name-only", "-z", "HEAD", "--"], repositoryRoot)
      : await this.#requireSuccess(
          ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
          repositoryRoot,
        );
    const untracked = hasHead
      ? await this.#requireSuccess(
          ["ls-files", "--others", "--exclude-standard", "-z"],
          repositoryRoot,
        )
      : "";

    return [
      ...new Set([...parseNullDelimitedPaths(tracked), ...parseNullDelimitedPaths(untracked)]),
    ];
  }

  async #requireSuccess(args: readonly string[], cwd: string): Promise<string> {
    const result: GitCommandResult = await this.#runner.run(args, cwd);
    if (result.exitCode !== 0) {
      throw new GitCommandError(args, result.exitCode, result.stderr);
    }
    return result.stdout;
  }
}

export function parseNullDelimitedPaths(output: string): readonly string[] {
  // Git's -z output makes NUL the only delimiter. Whitespace is valid in a Git
  // path, so trimming here would silently change artifact identity.
  return output.split("\0").filter((path) => path.length > 0);
}
