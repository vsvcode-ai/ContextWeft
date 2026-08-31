import type {
  ArtifactRef,
  ContextEvent,
  ContextPack,
  WorkItem,
  Workspace,
} from "@contextweft/contracts";
import type { MemoryRecall } from "@contextweft/context-compiler";
import type { RequestIdentity } from "./ports.js";

export interface InitializeWorkspaceInput extends RequestIdentity {
  readonly rootPath: string;
  readonly name: string;
}

export interface StartWorkItemInput extends RequestIdentity {
  readonly workspaceId: string;
  readonly title: string;
  readonly goal: string;
  readonly idempotencyKey: string;
}

export interface CheckpointDecision {
  readonly summary: string;
  readonly rationale?: string;
  readonly alternatives?: readonly string[];
}

export interface CheckpointConstraint {
  readonly summary: string;
  readonly kind: "technical" | "product" | "security" | "process";
}

export interface CheckpointFailure {
  readonly summary: string;
  readonly reason: string;
  readonly nextAvoid?: string;
}

export interface CheckpointTest {
  readonly command: string;
  readonly status: "passed" | "failed" | "skipped";
  readonly durationMs?: number;
  readonly summary?: string;
}

export interface CreateCheckpointInput extends RequestIdentity {
  readonly workspaceId: string;
  readonly workItemId: string;
  readonly idempotencyKey: string;
  readonly summary?: string;
  readonly goal?: string;
  readonly completed?: readonly string[];
  readonly inProgress?: readonly string[];
  readonly pending?: readonly string[];
  readonly decisions?: readonly CheckpointDecision[];
  readonly constraints?: readonly CheckpointConstraint[];
  readonly failedAttempts?: readonly CheckpointFailure[];
  readonly tests?: readonly CheckpointTest[];
  readonly nextActions: readonly string[];
  readonly relevantFiles?: readonly string[];
}

export interface CreateHandoffInput extends RequestIdentity {
  readonly workspaceId: string;
  readonly workItemId: string;
  readonly checkpointEventId: string;
  readonly idempotencyKey: string;
  readonly targetAgent?: string;
  readonly note?: string;
}

export interface RecordMemoryInput extends RequestIdentity {
  readonly workspaceId: string;
  readonly workItemId: string;
  readonly idempotencyKey: string;
  readonly content: string;
  readonly kind: "fact" | "decision" | "preference" | "constraint";
  readonly confidence: number;
  readonly validFrom?: string;
}

export interface CorrectMemoryInput extends RequestIdentity {
  readonly workspaceId: string;
  readonly workItemId: string;
  readonly idempotencyKey: string;
  readonly targetEventId: string;
  readonly content: string;
  readonly reason: string;
}

export interface SearchMemoryInput {
  readonly workspaceId: string;
  readonly workItemId: string;
  readonly query: string;
  readonly limit?: number;
}

export interface BootstrapInput {
  readonly workspaceId: string;
  readonly workItemId: string;
  readonly intent: string;
  readonly tokenBudget: number;
  readonly memoryLimit?: number;
}

export interface CheckpointResult {
  readonly checkpoint: ContextEvent;
  readonly events: readonly ContextEvent[];
  readonly artifacts: readonly ArtifactRef[];
  readonly replayed: boolean;
}

export interface BootstrapResult {
  readonly pack: ContextPack;
  readonly markdown: string;
  readonly warnings: readonly string[];
}

export interface MemoryWriteResult {
  readonly event: ContextEvent;
  readonly replayed: boolean;
  readonly indexed: boolean;
  readonly warnings: readonly string[];
}

export interface MemoryRebuildResult {
  readonly eventsProcessed: number;
}

export interface SearchMemoryResult {
  readonly results: readonly MemoryRecall[];
  readonly warnings: readonly string[];
}

export interface WorkspaceStatus {
  readonly workspace: Workspace;
  readonly workItems: readonly WorkItem[];
  readonly eventCount: number;
  readonly artifactCount: number;
}
