import { Type, type Static } from "@sinclair/typebox";
import { TimestampSchema } from "./common.js";

export const GitSnapshotSchema = Type.Object(
  {
    repositoryRoot: Type.String({ minLength: 1, maxLength: 4096 }),
    revision: Type.Optional(Type.String({ pattern: "^[a-f0-9]{40,64}$" })),
    branch: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })),
    dirty: Type.Boolean(),
    changedFiles: Type.Array(Type.String({ minLength: 1, maxLength: 4096 }), {
      uniqueItems: true,
    }),
    excludedSensitiveFiles: Type.Integer({ minimum: 0 }),
    observedAt: TimestampSchema,
    fingerprint: Type.String({ pattern: "^[a-f0-9]{64}$" }),
  },
  { additionalProperties: false, $id: "GitSnapshot" },
);

export type GitSnapshot = Static<typeof GitSnapshotSchema>;
