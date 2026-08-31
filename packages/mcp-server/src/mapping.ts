import type { CreateCheckpointInput, RequestIdentity } from "@contextweft/application";
import type { CheckpointPayload } from "./schemas.js";

export interface CheckpointScope extends RequestIdentity {
  readonly workspaceId: string;
  readonly workItemId: string;
  readonly idempotencyKey: string;
}

/** Converts validated transport data into exact-optional application input. */
export function toCreateCheckpointInput(
  payload: CheckpointPayload,
  scope: CheckpointScope,
): CreateCheckpointInput {
  return {
    ...scope,
    nextActions: payload.nextActions,
    ...(payload.summary === undefined ? {} : { summary: payload.summary }),
    ...(payload.goal === undefined ? {} : { goal: payload.goal }),
    ...(payload.completed === undefined ? {} : { completed: payload.completed }),
    ...(payload.inProgress === undefined ? {} : { inProgress: payload.inProgress }),
    ...(payload.pending === undefined ? {} : { pending: payload.pending }),
    ...(payload.decisions === undefined
      ? {}
      : {
          decisions: payload.decisions.map((decision) => ({
            summary: decision.summary,
            ...(decision.rationale === undefined ? {} : { rationale: decision.rationale }),
            ...(decision.alternatives === undefined ? {} : { alternatives: decision.alternatives }),
          })),
        }),
    ...(payload.constraints === undefined ? {} : { constraints: payload.constraints }),
    ...(payload.failedAttempts === undefined
      ? {}
      : {
          failedAttempts: payload.failedAttempts.map((attempt) => ({
            summary: attempt.summary,
            reason: attempt.reason,
            ...(attempt.nextAvoid === undefined ? {} : { nextAvoid: attempt.nextAvoid }),
          })),
        }),
    ...(payload.tests === undefined
      ? {}
      : {
          tests: payload.tests.map((test) => ({
            command: test.command,
            status: test.status,
            ...(test.durationMs === undefined ? {} : { durationMs: test.durationMs }),
            ...(test.summary === undefined ? {} : { summary: test.summary }),
          })),
        }),
    ...(payload.relevantFiles === undefined ? {} : { relevantFiles: payload.relevantFiles }),
  };
}
