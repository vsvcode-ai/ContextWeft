export class StorageClosedError extends Error {
  public constructor() {
    super("The ContextWeft database is closed");
    this.name = "StorageClosedError";
  }
}

export class EntityNotFoundError extends Error {
  public readonly entityType: string;
  public readonly entityId: string;

  public constructor(entityType: string, entityId: string) {
    super(`${entityType} not found: ${entityId}`);
    this.name = "EntityNotFoundError";
    this.entityType = entityType;
    this.entityId = entityId;
  }
}

export class IdempotencyConflictError extends Error {
  public readonly idempotencyKey: string;

  public constructor(idempotencyKey: string) {
    super(`Idempotency key was already used for a different event: ${idempotencyKey}`);
    this.name = "IdempotencyConflictError";
    this.idempotencyKey = idempotencyKey;
  }
}

export class EntityConflictError extends Error {
  public constructor(entityType: string, entityId: string) {
    super(`${entityType} identifier is already used by different data: ${entityId}`);
    this.name = "EntityConflictError";
  }
}
