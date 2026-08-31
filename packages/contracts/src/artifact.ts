import { Type, type Static } from "@sinclair/typebox";
import { ARTIFACT_KINDS, CONTEXTWEFT_SCHEMA_VERSION } from "./constants.js";
import { IdentifierSchema, MetadataSchema, TimestampSchema } from "./common.js";

export const ArtifactKindSchema = Type.Union(
  ARTIFACT_KINDS.map((kind) => Type.Literal(kind)),
  { $id: "ArtifactKind" },
);

export const ArtifactRefSchema = Type.Object(
  {
    schemaVersion: Type.Literal(CONTEXTWEFT_SCHEMA_VERSION),
    id: IdentifierSchema,
    workspaceId: IdentifierSchema,
    workItemId: Type.Optional(IdentifierSchema),
    kind: ArtifactKindSchema,
    uri: Type.String({ minLength: 1, maxLength: 4096 }),
    title: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
    contentHash: Type.Optional(Type.String({ pattern: "^[a-f0-9]{64}$" })),
    gitRevision: Type.Optional(Type.String({ pattern: "^[a-f0-9]{40,64}$" })),
    observedAt: TimestampSchema,
    metadata: MetadataSchema,
  },
  { additionalProperties: false, $id: "ArtifactRef" },
);

export type ArtifactKind = Static<typeof ArtifactKindSchema>;
export type ArtifactRef = Static<typeof ArtifactRefSchema>;
