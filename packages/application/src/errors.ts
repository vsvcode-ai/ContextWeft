export class UnsafeArtifactPathError extends Error {
  public readonly path: string;

  public constructor(path: string, reason: string) {
    super(`Unsafe artifact path '${path}': ${reason}`);
    this.name = "UnsafeArtifactPathError";
    this.path = path;
  }
}

export class InvalidCheckpointError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidCheckpointError";
  }
}
