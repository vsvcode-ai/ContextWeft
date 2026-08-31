import type {
  ArtifactRef,
  ContextEvent,
  ContextPack,
  GitSnapshot,
  WorkItem,
  Workspace,
} from "@contextweft/contracts";

export interface MemoryRecall {
  readonly id: string;
  readonly content: string;
  readonly occurredAt: string;
  readonly score: number;
  readonly sourceEventIds: readonly string[];
  readonly artifactIds: readonly string[];
}

export interface CompileContextRequest {
  readonly workspace: Workspace;
  readonly workItem: WorkItem;
  readonly events: readonly ContextEvent[];
  readonly artifacts: readonly ArtifactRef[];
  readonly relevantMemory?: readonly MemoryRecall[];
  readonly currentGit?: GitSnapshot;
  readonly tokenBudget: number;
}

export interface TokenEstimator {
  estimate(text: string): number;
  truncate(text: string, maximumTokens: number): string;
}

export interface ContextCompiler {
  compile(request: CompileContextRequest): ContextPack;
}
