export class OpenContextCompatibilityError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "OpenContextCompatibilityError";
  }
}

export class OpenContextRuntimeStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "OpenContextRuntimeStateError";
  }
}
