import { TypeCompiler, type TypeCheck } from "@sinclair/typebox/compiler";
import type { Static, TSchema } from "@sinclair/typebox";
import { ArtifactRefSchema } from "./artifact.js";
import { ContextPackSchema } from "./context-pack.js";
import {
  ArtifactObservedEventSchema,
  AttemptFailedEventSchema,
  CheckpointCreatedEventSchema,
  ConstraintRecordedEventSchema,
  ContextEventSchema,
  DecisionRecordedEventSchema,
  GoalUpdatedEventSchema,
  HandoffCreatedEventSchema,
  MemoryCorrectedEventSchema,
  MemoryRecordedEventSchema,
  ProgressRecordedEventSchema,
  TestObservedEventSchema,
  WorkItemCreatedEventSchema,
  WorkItemStatusChangedEventSchema,
  WorkspaceInitializedEventSchema,
  type ContextEvent,
} from "./event.js";
import { GitSnapshotSchema } from "./git.js";
import { WorkItemSchema, WorkspaceSchema } from "./workspace.js";

export interface ContractIssue {
  readonly path: string;
  readonly message: string;
  readonly value: unknown;
}

export class ContractValidationError extends Error {
  public readonly issues: readonly ContractIssue[];

  public constructor(contractName: string, issues: readonly ContractIssue[]) {
    super(
      `Invalid ${contractName}: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`,
    );
    this.name = "ContractValidationError";
    this.issues = issues;
  }
}

function compile<T extends TSchema>(schema: T): TypeCheck<T> {
  return TypeCompiler.Compile(schema);
}

const checks = {
  ArtifactRef: compile(ArtifactRefSchema),
  ContextEvent: compile(ContextEventSchema),
  ContextPack: compile(ContextPackSchema),
  GitSnapshot: compile(GitSnapshotSchema),
  WorkItem: compile(WorkItemSchema),
  Workspace: compile(WorkspaceSchema),
} as const;

// Dispatching by discriminator produces both faster validation and precise
// payload error paths. Validating the complete union would collapse many
// failures into an unhelpful "Expected union value" error at the root.
const eventChecks: Readonly<Record<string, TypeCheck<TSchema>>> = {
  "workspace.initialized": compile(WorkspaceInitializedEventSchema),
  "work_item.created": compile(WorkItemCreatedEventSchema),
  "work_item.status_changed": compile(WorkItemStatusChangedEventSchema),
  "goal.updated": compile(GoalUpdatedEventSchema),
  "artifact.observed": compile(ArtifactObservedEventSchema),
  "decision.recorded": compile(DecisionRecordedEventSchema),
  "constraint.recorded": compile(ConstraintRecordedEventSchema),
  "progress.recorded": compile(ProgressRecordedEventSchema),
  "attempt.failed": compile(AttemptFailedEventSchema),
  "test.observed": compile(TestObservedEventSchema),
  "memory.recorded": compile(MemoryRecordedEventSchema),
  "memory.corrected": compile(MemoryCorrectedEventSchema),
  "checkpoint.created": compile(CheckpointCreatedEventSchema),
  "handoff.created": compile(HandoffCreatedEventSchema),
};

function parse<T extends TSchema>(name: string, check: TypeCheck<T>, input: unknown): Static<T> {
  if (check.Check(input)) {
    return input as Static<T>;
  }

  const issues = [...check.Errors(input)].map((error) => ({
    path: error.path || "/",
    message: error.message,
    value: error.value,
  }));
  throw new ContractValidationError(name, issues);
}

export const parseArtifactRef = (input: unknown) => parse("ArtifactRef", checks.ArtifactRef, input);
export function parseContextEvent(input: unknown): ContextEvent {
  const eventType =
    typeof input === "object" && input !== null && "eventType" in input
      ? (input as { eventType?: unknown }).eventType
      : undefined;
  const eventCheck = typeof eventType === "string" ? eventChecks[eventType] : undefined;
  return parse("ContextEvent", eventCheck ?? checks.ContextEvent, input) as ContextEvent;
}
export const parseContextPack = (input: unknown) => parse("ContextPack", checks.ContextPack, input);
export const parseGitSnapshot = (input: unknown) => parse("GitSnapshot", checks.GitSnapshot, input);
export const parseWorkItem = (input: unknown) => parse("WorkItem", checks.WorkItem, input);
export const parseWorkspace = (input: unknown) => parse("Workspace", checks.Workspace, input);

export function isContextEvent(input: unknown): input is Static<typeof ContextEventSchema> {
  return checks.ContextEvent.Check(input);
}
