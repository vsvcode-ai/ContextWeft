import { Type, type Static } from "@sinclair/typebox";
import { CONTEXTWEFT_SCHEMA_VERSION } from "./constants.js";
import { IdentifierSchema, TimestampSchema } from "./common.js";
import { GitSnapshotSchema } from "./git.js";
import { WorkItemSchema, WorkspaceSchema } from "./workspace.js";

export const ContextPackItemSchema = Type.Object(
  {
    id: IdentifierSchema,
    summary: Type.String({ minLength: 1, maxLength: 16_384 }),
    details: Type.Optional(Type.String({ minLength: 1, maxLength: 65_536 })),
    occurredAt: TimestampSchema,
    importance: Type.Integer({ minimum: 0, maximum: 100 }),
    estimatedTokens: Type.Integer({ minimum: 1 }),
    sourceEventIds: Type.Array(IdentifierSchema, { minItems: 1, uniqueItems: true }),
    artifactIds: Type.Array(IdentifierSchema, { uniqueItems: true }),
  },
  { additionalProperties: false, $id: "ContextPackItem" },
);

export const ContextPackArtifactSchema = Type.Object(
  {
    id: IdentifierSchema,
    kind: Type.String({ minLength: 1, maxLength: 64 }),
    uri: Type.String({ minLength: 1, maxLength: 4096 }),
    title: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
    gitRevision: Type.Optional(Type.String({ pattern: "^[a-f0-9]{40,64}$" })),
    sourceEventIds: Type.Array(IdentifierSchema, { uniqueItems: true }),
  },
  { additionalProperties: false, $id: "ContextPackArtifact" },
);

export const PackProvenanceSchema = Type.Object(
  {
    itemId: IdentifierSchema,
    sourceEventIds: Type.Array(IdentifierSchema, { minItems: 1, uniqueItems: true }),
    artifactIds: Type.Array(IdentifierSchema, { uniqueItems: true }),
  },
  { additionalProperties: false, $id: "PackProvenance" },
);

export const FreshnessSchema = Type.Object(
  {
    status: Type.Union([
      Type.Literal("fresh"),
      Type.Literal("dirty-changed"),
      Type.Literal("revision-diverged"),
      Type.Literal("missing"),
    ]),
    checkpoint: Type.Optional(GitSnapshotSchema),
    current: Type.Optional(GitSnapshotSchema),
    reasons: Type.Array(Type.String({ minLength: 1, maxLength: 2048 })),
  },
  { additionalProperties: false, $id: "Freshness" },
);

export const ContextBudgetSchema = Type.Object(
  {
    limit: Type.Integer({ minimum: 128 }),
    used: Type.Integer({ minimum: 0 }),
    truncated: Type.Boolean(),
    omittedItemIds: Type.Array(IdentifierSchema, { uniqueItems: true }),
  },
  { additionalProperties: false, $id: "ContextBudget" },
);

export const ContextPackSchema = Type.Object(
  {
    schemaVersion: Type.Literal(CONTEXTWEFT_SCHEMA_VERSION),
    packId: IdentifierSchema,
    snapshotAt: TimestampSchema,
    workspace: WorkspaceSchema,
    workItem: WorkItemSchema,
    goal: ContextPackItemSchema,
    currentState: Type.Array(ContextPackItemSchema),
    completed: Type.Array(ContextPackItemSchema),
    pending: Type.Array(ContextPackItemSchema),
    decisions: Type.Array(ContextPackItemSchema),
    constraints: Type.Array(ContextPackItemSchema),
    failedAttempts: Type.Array(ContextPackItemSchema),
    tests: Type.Array(ContextPackItemSchema),
    artifacts: Type.Array(ContextPackArtifactSchema),
    relevantMemory: Type.Array(ContextPackItemSchema),
    nextActions: Type.Array(ContextPackItemSchema),
    provenance: Type.Array(PackProvenanceSchema),
    freshness: FreshnessSchema,
    budget: ContextBudgetSchema,
  },
  { additionalProperties: false, $id: "ContextPack" },
);

export type ContextPackItem = Static<typeof ContextPackItemSchema>;
export type ContextPackArtifact = Static<typeof ContextPackArtifactSchema>;
export type PackProvenance = Static<typeof PackProvenanceSchema>;
export type Freshness = Static<typeof FreshnessSchema>;
export type ContextBudget = Static<typeof ContextBudgetSchema>;
export type ContextPack = Static<typeof ContextPackSchema>;
