export class GitCommandError extends Error {
  public readonly args: readonly string[];
  public readonly exitCode: number;
  public readonly stderr: string;

  public constructor(args: readonly string[], exitCode: number, stderr: string) {
    super(`git ${args.join(" ")} failed with exit code ${exitCode}: ${stderr.trim()}`);
    this.name = "GitCommandError";
    this.args = args;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

export class NotGitRepositoryError extends Error {
  public constructor(rootPath: string) {
    super(`Workspace is not a Git repository: ${rootPath}`);
    this.name = "NotGitRepositoryError";
  }
}

export class WorkspaceRootMismatchError extends Error {
  public readonly workspaceRoot: string;
  public readonly repositoryRoot: string;

  public constructor(workspaceRoot: string, repositoryRoot: string) {
    super(
      `Workspace root must equal the Git repository root (workspace: ${workspaceRoot}, repository: ${repositoryRoot})`,
    );
    this.name = "WorkspaceRootMismatchError";
    this.workspaceRoot = workspaceRoot;
    this.repositoryRoot = repositoryRoot;
  }
}
