export type ContextWeftToolErrorCode =
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "UNSAFE_PATH"
  | "INTERNAL_ERROR";

export interface ContextWeftToolError {
  readonly code: ContextWeftToolErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export function mapToolError(error: unknown): ContextWeftToolError {
  const name = error instanceof Error ? error.name : "";
  if (name === "EntityNotFoundError") {
    return { code: "NOT_FOUND", message: safeMessage(error), retryable: false };
  }
  if (name === "UnsafeArtifactPathError") {
    return { code: "UNSAFE_PATH", message: safeMessage(error), retryable: false };
  }
  if (name === "InvalidCheckpointError" || name === "ContractValidationError") {
    return { code: "INVALID_INPUT", message: safeMessage(error), retryable: false };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "ContextWeft could not complete the operation. Inspect stderr or run ctxweft doctor.",
    retryable: true,
  };
}

function safeMessage(error: unknown): string {
  /* v8 ignore next -- mapToolError calls safeMessage only after matching Error.name. */
  if (error instanceof Error) {
    return error.message.slice(0, 2_048);
  }
  return "Invalid operation";
}
