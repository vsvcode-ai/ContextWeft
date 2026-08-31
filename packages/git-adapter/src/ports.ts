import type { GitSnapshot } from "@contextweft/contracts";

export interface GitCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface GitCommandRunner {
  run(args: readonly string[], cwd: string): Promise<GitCommandResult>;
}

export interface SensitivePathPolicy {
  isSensitive(repositoryRelativePath: string): boolean;
}

export interface Clock {
  now(): Date;
}

export interface GitSnapshotProvider {
  capture(workspaceRoot: string): Promise<GitSnapshot>;
}

export interface GitWorkspaceLocator {
  locate(startPath: string): Promise<string>;
}
