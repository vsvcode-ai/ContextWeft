import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { CONTEXTWEFT_SCHEMA_VERSION } from "./constants.js";
import {
  ActorSchema,
  IdentifierSchema,
  MetadataSchema,
  ProvenanceSchema,
  SourceSchema,
  TimestampSchema,
} from "./common.js";
import { GitSnapshotSchema } from "./git.js";
import { WorkItemStatusSchema } from "./workspace.js";

function eventEnvelope<TType extends string, TPayload extends TSchema>(
  eventType: TType,
  payload: TPayload,
) {
  return Type.Object(
    {
      schemaVersion: Type.Literal(CONTEXTWEFT_SCHEMA_VERSION),
      eventId: IdentifierSchema,
      eventType: Type.Literal(eventType),
      workspaceId: IdentifierSchema,
      workItemId: Type.Optional(IdentifierSchema),
      occurredAt: TimestampSchema,
      observedAt: TimestampSchema,
      actor: ActorSchema,
      source: SourceSchema,
      idempotencyKey: IdentifierSchema,
      payload,
      provenance: ProvenanceSchema,
      metadata: MetadataSchema,
    },
    { additionalProperties: false },
  );
}

const SummarySchema = Type.String({ minLength: 1, maxLength: 16_384 });

export const WorkspaceInitializedEventSchema = eventEnvelope(
  "workspace.initialized",
  Type.Object(
    {
      name: Type.String({ minLength: 1, maxLength: 256 }),
      rootPath: Type.String({ minLength: 1, maxLength: 4096 }),
    },
    { additionalProperties: false },
  ),
);

export const WorkItemCreatedEventSchema = eventEnvelope(
  "work_item.created",
  Type.Object(
    {
      title: Type.String({ minLength: 1, maxLength: 512 }),
      goal: SummarySchema,
    },
    { additionalProperties: false },
  ),
);

export const WorkItemStatusChangedEventSchema = eventEnvelope(
  "work_item.status_changed",
  Type.Object({ status: WorkItemStatusSchema }, { additionalProperties: false }),
);

export const GoalUpdatedEventSchema = eventEnvelope(
  "goal.updated",
  Type.Object({ goal: SummarySchema }, { additionalProperties: false }),
);

export const ArtifactObservedEventSchema = eventEnvelope(
  "artifact.observed",
  Type.Object({ artifactId: IdentifierSchema }, { additionalProperties: false }),
);

export const DecisionRecordedEventSchema = eventEnvelope(
  "decision.recorded",
  Type.Object(
    {
      summary: SummarySchema,
      rationale: Type.Optional(SummarySchema),
      alternatives: Type.Array(SummarySchema, { maxItems: 128 }),
    },
    { additionalProperties: false },
  ),
);

export const ConstraintRecordedEventSchema = eventEnvelope(
  "constraint.recorded",
  Type.Object(
    {
      summary: SummarySchema,
      kind: Type.Union([
        Type.Literal("technical"),
        Type.Literal("product"),
        Type.Literal("security"),
        Type.Literal("process"),
      ]),
    },
    { additionalProperties: false },
  ),
);

export const ProgressRecordedEventSchema = eventEnvelope(
  "progress.recorded",
  Type.Object(
    {
      summary: SummarySchema,
      status: Type.Union([
        Type.Literal("completed"),
        Type.Literal("in_progress"),
        Type.Literal("pending"),
      ]),
    },
    { additionalProperties: false },
  ),
);

export const AttemptFailedEventSchema = eventEnvelope(
  "attempt.failed",
  Type.Object(
    {
      summary: SummarySchema,
      reason: SummarySchema,
      nextAvoid: Type.Optional(SummarySchema),
    },
    { additionalProperties: false },
  ),
);

export const TestObservedEventSchema = eventEnvelope(
  "test.observed",
  Type.Object(
    {
      command: Type.String({ minLength: 1, maxLength: 4096 }),
      status: Type.Union([Type.Literal("passed"), Type.Literal("failed"), Type.Literal("skipped")]),
      durationMs: Type.Optional(Type.Number({ minimum: 0 })),
      summary: Type.Optional(SummarySchema),
      artifactId: Type.Optional(IdentifierSchema),
    },
    { additionalProperties: false },
  ),
);

export const MemoryRecordedEventSchema = eventEnvelope(
  "memory.recorded",
  Type.Object(
    {
      content: SummarySchema,
      kind: Type.Union([
        Type.Literal("fact"),
        Type.Literal("decision"),
        Type.Literal("preference"),
        Type.Literal("constraint"),
      ]),
      validFrom: Type.Optional(TimestampSchema),
      confidence: Type.Number({ minimum: 0, maximum: 1 }),
    },
    { additionalProperties: false },
  ),
);

export const MemoryCorrectedEventSchema = eventEnvelope(
  "memory.corrected",
  Type.Object(
    {
      targetEventId: IdentifierSchema,
      content: SummarySchema,
      reason: SummarySchema,
    },
    { additionalProperties: false },
  ),
);

export const CheckpointCreatedEventSchema = eventEnvelope(
  "checkpoint.created",
  Type.Object(
    {
      summary: Type.Optional(SummarySchema),
      nextActions: Type.Array(SummarySchema, { maxItems: 128 }),
      artifactIds: Type.Array(IdentifierSchema, { uniqueItems: true }),
      git: GitSnapshotSchema,
    },
    { additionalProperties: false },
  ),
);

export const HandoffCreatedEventSchema = eventEnvelope(
  "handoff.created",
  Type.Object(
    {
      checkpointEventId: IdentifierSchema,
      targetAgent: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
      note: Type.Optional(SummarySchema),
    },
    { additionalProperties: false },
  ),
);

export const ContextEventSchema = Type.Union(
  [
    WorkspaceInitializedEventSchema,
    WorkItemCreatedEventSchema,
    WorkItemStatusChangedEventSchema,
    GoalUpdatedEventSchema,
    ArtifactObservedEventSchema,
    DecisionRecordedEventSchema,
    ConstraintRecordedEventSchema,
    ProgressRecordedEventSchema,
    AttemptFailedEventSchema,
    TestObservedEventSchema,
    MemoryRecordedEventSchema,
    MemoryCorrectedEventSchema,
    CheckpointCreatedEventSchema,
    HandoffCreatedEventSchema,
  ],
  { $id: "ContextEvent" },
);

export type ContextEvent = Static<typeof ContextEventSchema>;
export type ContextEventType = ContextEvent["eventType"];
