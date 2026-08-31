export class CliUsageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

export class WorkspaceNotInitializedError extends Error {
  public constructor(rootPath: string) {
    super(`ContextWeft is not initialized in ${rootPath}. Run: ctxweft init`);
    this.name = "WorkspaceNotInitializedError";
  }
}

export class UnsafeStatePathError extends Error {
  public constructor(path: string, reason: string) {
    super(`Unsafe ContextWeft state path ${path}: ${reason}`);
    this.name = "UnsafeStatePathError";
  }
}
