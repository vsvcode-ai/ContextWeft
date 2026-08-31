import { z } from "zod";

const IdentifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const SummarySchema = z.string().trim().min(1).max(8_192);
const IdempotencyKeySchema = z.string().trim().min(1).max(256);

export const CheckpointPayloadSchema = z
  .object({
    summary: SummarySchema.optional(),
    goal: SummarySchema.optional(),
    completed: z.array(SummarySchema).max(128).optional(),
    inProgress: z.array(SummarySchema).max(128).optional(),
    pending: z.array(SummarySchema).max(128).optional(),
    decisions: z
      .array(
        z
          .object({
            summary: SummarySchema,
            rationale: SummarySchema.optional(),
            alternatives: z.array(SummarySchema).max(32).optional(),
          })
          .strict(),
      )
      .max(128)
      .optional(),
    constraints: z
      .array(
        z
          .object({
            summary: SummarySchema,
            kind: z.enum(["technical", "product", "security", "process"]),
          })
          .strict(),
      )
      .max(128)
      .optional(),
    failedAttempts: z
      .array(
        z
          .object({
            summary: SummarySchema,
            reason: SummarySchema,
            nextAvoid: SummarySchema.optional(),
          })
          .strict(),
      )
      .max(128)
      .optional(),
    tests: z
      .array(
        z
          .object({
            command: z.string().min(1).max(4_096),
            status: z.enum(["passed", "failed", "skipped"]),
            durationMs: z.number().finite().nonnegative().optional(),
            summary: SummarySchema.optional(),
          })
          .strict(),
      )
      .max(128)
      .optional(),
    nextActions: z.array(SummarySchema).min(1).max(128),
    relevantFiles: z.array(z.string().min(1).max(2_048)).max(256).optional(),
  })
  .strict();

export const WorkspaceInitSchema = z
  .object({
    name: z.string().trim().min(1).max(256),
    rootPath: z.string().min(1).max(4_096).optional(),
  })
  .strict();

export const WorkItemStartSchema = z
  .object({
    workspaceId: IdentifierSchema,
    title: z.string().trim().min(1).max(512),
    goal: SummarySchema,
    idempotencyKey: IdempotencyKeySchema,
  })
  .strict();

export const WorkspaceStatusSchema = z.object({ workspaceId: IdentifierSchema }).strict();

export const CheckpointToolSchema = CheckpointPayloadSchema.extend({
  workspaceId: IdentifierSchema,
  workItemId: IdentifierSchema,
  idempotencyKey: IdempotencyKeySchema,
}).strict();

export const BootstrapSchema = z
  .object({
    workspaceId: IdentifierSchema,
    workItemId: IdentifierSchema,
    intent: SummarySchema,
    tokenBudget: z.number().int().min(256).max(200_000).default(8_000),
    memoryLimit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

export const SearchSchema = z
  .object({
    workspaceId: IdentifierSchema,
    workItemId: IdentifierSchema,
    query: SummarySchema,
    limit: z.number().int().min(1).max(50).default(10),
  })
  .strict();

export const RememberSchema = z
  .object({
    workspaceId: IdentifierSchema,
    workItemId: IdentifierSchema,
    idempotencyKey: IdempotencyKeySchema,
    content: SummarySchema,
    kind: z.enum(["fact", "decision", "preference", "constraint"]),
    confidence: z.number().finite().min(0).max(1).default(1),
    validFrom: z.iso.datetime().optional(),
  })
  .strict();

export const CorrectFactSchema = z
  .object({
    workspaceId: IdentifierSchema,
    workItemId: IdentifierSchema,
    idempotencyKey: IdempotencyKeySchema,
    targetEventId: IdentifierSchema,
    content: SummarySchema,
    reason: SummarySchema,
  })
  .strict();

export type CheckpointPayload = z.infer<typeof CheckpointPayloadSchema>;
