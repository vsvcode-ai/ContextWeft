import { Type, type Static } from "@sinclair/typebox";

export const IdentifierSchema = Type.String({
  minLength: 1,
  maxLength: 128,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
});

export const TimestampSchema = Type.String({
  description: "An RFC 3339 timestamp normalized to UTC.",
  pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?Z$",
});

export const JsonValueSchema = Type.Recursive((This) =>
  Type.Union([
    Type.Null(),
    Type.Boolean(),
    Type.Number(),
    Type.String(),
    Type.Array(This),
    Type.Record(Type.String(), This),
  ]),
);

export const MetadataSchema = Type.Record(Type.String({ maxLength: 128 }), JsonValueSchema);

export const ActorSchema = Type.Object(
  {
    type: Type.Union([Type.Literal("human"), Type.Literal("agent"), Type.Literal("system")]),
    id: IdentifierSchema,
    displayName: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
  },
  { additionalProperties: false, $id: "Actor" },
);

export const SourceSchema = Type.Object(
  {
    kind: Type.Union([
      Type.Literal("cli"),
      Type.Literal("mcp"),
      Type.Literal("git"),
      Type.Literal("test"),
      Type.Literal("manual"),
      Type.Literal("memory"),
    ]),
    uri: Type.Optional(Type.String({ minLength: 1, maxLength: 2048 })),
    agent: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
    sessionId: Type.Optional(IdentifierSchema),
  },
  { additionalProperties: false, $id: "Source" },
);

export const ProvenanceSchema = Type.Object(
  {
    observedAt: TimestampSchema,
    sourceUri: Type.Optional(Type.String({ minLength: 1, maxLength: 2048 })),
    sourceEventIds: Type.Array(IdentifierSchema, { uniqueItems: true }),
    artifactIds: Type.Array(IdentifierSchema, { uniqueItems: true }),
    contentHash: Type.Optional(Type.String({ pattern: "^[a-f0-9]{64}$" })),
  },
  { additionalProperties: false, $id: "Provenance" },
);

export type JsonValue = Static<typeof JsonValueSchema>;
export type Metadata = Static<typeof MetadataSchema>;
export type Actor = Static<typeof ActorSchema>;
export type Source = Static<typeof SourceSchema>;
export type Provenance = Static<typeof ProvenanceSchema>;
