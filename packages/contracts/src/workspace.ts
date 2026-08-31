import { Type, type Static } from "@sinclair/typebox";
import { CONTEXTWEFT_SCHEMA_VERSION, WORK_ITEM_STATUSES } from "./constants.js";
import { IdentifierSchema, MetadataSchema, TimestampSchema } from "./common.js";

export const WorkspaceSchema = Type.Object(
  {
    schemaVersion: Type.Literal(CONTEXTWEFT_SCHEMA_VERSION),
    id: IdentifierSchema,
    name: Type.String({ minLength: 1, maxLength: 256 }),
    rootPath: Type.String({ minLength: 1, maxLength: 4096 }),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    metadata: MetadataSchema,
  },
  { additionalProperties: false, $id: "Workspace" },
);

export const WorkItemStatusSchema = Type.Union(
  WORK_ITEM_STATUSES.map((status) => Type.Literal(status)),
  { $id: "WorkItemStatus" },
);

export const WorkItemSchema = Type.Object(
  {
    schemaVersion: Type.Literal(CONTEXTWEFT_SCHEMA_VERSION),
    id: IdentifierSchema,
    workspaceId: IdentifierSchema,
    title: Type.String({ minLength: 1, maxLength: 512 }),
    goal: Type.String({ minLength: 1, maxLength: 16_384 }),
    status: WorkItemStatusSchema,
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    metadata: MetadataSchema,
  },
  { additionalProperties: false, $id: "WorkItem" },
);

export type Workspace = Static<typeof WorkspaceSchema>;
export type WorkItemStatus = Static<typeof WorkItemStatusSchema>;
export type WorkItem = Static<typeof WorkItemSchema>;
