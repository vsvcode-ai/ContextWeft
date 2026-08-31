export const CONTEXTWEFT_SCHEMA_VERSION = "0.1" as const;

export const EVENT_TYPES = [
  "workspace.initialized",
  "work_item.created",
  "work_item.status_changed",
  "goal.updated",
  "artifact.observed",
  "decision.recorded",
  "constraint.recorded",
  "progress.recorded",
  "attempt.failed",
  "test.observed",
  "memory.recorded",
  "memory.corrected",
  "checkpoint.created",
  "handoff.created",
] as const;

export const ARTIFACT_KINDS = [
  "file",
  "git_commit",
  "git_diff",
  "test_result",
  "terminal_output",
] as const;

export const WORK_ITEM_STATUSES = ["active", "blocked", "completed", "cancelled"] as const;
