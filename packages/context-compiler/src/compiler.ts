import { createHash } from "node:crypto";
import {
  canonicalJson,
  parseContextPack,
  type ArtifactRef,
  type ContextEvent,
  type ContextPack,
  type ContextPackArtifact,
  type ContextPackItem,
  type GitSnapshot,
  type PackProvenance,
} from "@contextweft/contracts";
import { evaluateFreshness } from "./freshness.js";
import type {
  CompileContextRequest,
  ContextCompiler,
  MemoryRecall,
  TokenEstimator,
} from "./ports.js";
import { HeuristicTokenEstimator } from "./token-estimator.js";

type SectionName =
  | "currentState"
  | "completed"
  | "pending"
  | "decisions"
  | "constraints"
  | "failedAttempts"
  | "tests"
  | "relevantMemory"
  | "nextActions";

type SectionMap = Record<SectionName, ContextPackItem[]>;

const STRUCTURAL_OVERHEAD_TOKENS = 96;
const SECTION_WEIGHTS: Readonly<Record<SectionName, number>> = {
  currentState: 0.12,
  completed: 0.08,
  pending: 0.15,
  decisions: 0.13,
  constraints: 0.14,
  failedAttempts: 0.1,
  tests: 0.06,
  relevantMemory: 0.07,
  nextActions: 0.15,
};

export interface DeterministicContextCompilerOptions {
  readonly tokenEstimator?: TokenEstimator;
}

export class CompilerInputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CompilerInputError";
  }
}

export class DeterministicContextCompiler implements ContextCompiler {
  readonly #tokens: TokenEstimator;

  public constructor(options: DeterministicContextCompilerOptions = {}) {
    this.#tokens = options.tokenEstimator ?? new HeuristicTokenEstimator();
  }

  public compile(request: CompileContextRequest): ContextPack {
    if (request.tokenBudget < 128) {
      throw new CompilerInputError("Context token budget must be at least 128");
    }
    if (request.workItem.workspaceId !== request.workspace.id) {
      throw new CompilerInputError("Work item does not belong to the requested workspace");
    }

    const events = [...request.events]
      .filter(
        (event) =>
          event.workspaceId === request.workspace.id && event.workItemId === request.workItem.id,
      )
      .sort(compareEvents);
    const goalEvent = findLatest(events, ["goal.updated", "work_item.created"]);
    if (goalEvent === undefined) {
      throw new CompilerInputError("A work_item.created or goal.updated event is required");
    }

    /* v8 ignore next -- findLatest is constrained to the supported goal event types above. */
    if (goalEvent.eventType !== "goal.updated" && goalEvent.eventType !== "work_item.created") {
      throw new CompilerInputError("Internal compiler error: unsupported goal event");
    }
    const goalText = goalEvent.payload.goal;
    const goal = this.#item("goal", goalEvent, goalText, undefined, 100);
    const sections = this.#buildSections(events, request.relevantMemory ?? []);
    const checkpoint = findLatest(events, ["checkpoint.created"]);
    const checkpointGit =
      checkpoint?.eventType === "checkpoint.created" ? checkpoint.payload.git : undefined;
    const freshness = evaluateFreshness(checkpointGit, request.currentGit);

    const allocation = this.#allocate(goal, sections, request.tokenBudget);
    const selectedArtifactIds = new Set(
      [allocation.goal, ...Object.values(allocation.sections).flat()].flatMap(
        (item) => item.artifactIds,
      ),
    );
    const artifactSelection = this.#selectArtifacts(
      request.artifacts,
      selectedArtifactIds,
      events,
      request.tokenBudget - allocation.used,
    );
    const used = allocation.used + artifactSelection.used;
    const selectedItems = [allocation.goal, ...Object.values(allocation.sections).flat()];
    const provenance: PackProvenance[] = selectedItems.map((item) => ({
      itemId: item.id,
      sourceEventIds: item.sourceEventIds,
      artifactIds: item.artifactIds,
    }));
    const snapshotAt = latestTimestamp(events, request.currentGit);

    const packWithoutId = {
      schemaVersion: "0.1" as const,
      snapshotAt,
      workspace: request.workspace,
      workItem: request.workItem,
      goal: allocation.goal,
      ...allocation.sections,
      artifacts: artifactSelection.artifacts,
      provenance,
      freshness,
      budget: {
        limit: request.tokenBudget,
        used,
        truncated:
          allocation.omittedItemIds.length > 0 || artifactSelection.omittedArtifactCount > 0,
        omittedItemIds: allocation.omittedItemIds,
      },
    };
    const digest = createHash("sha256").update(canonicalJson(packWithoutId)).digest("hex");

    return parseContextPack({
      ...packWithoutId,
      packId: `pack:${digest.slice(0, 32)}`,
    });
  }

  #buildSections(events: readonly ContextEvent[], memory: readonly MemoryRecall[]): SectionMap {
    const sections: SectionMap = {
      currentState: [],
      completed: [],
      pending: [],
      decisions: [],
      constraints: [],
      failedAttempts: [],
      tests: [],
      relevantMemory: [],
      nextActions: [],
    };

    for (const event of events) {
      switch (event.eventType) {
        case "progress.recorded": {
          const item = this.#item(
            `progress:${event.payload.status}`,
            event,
            event.payload.summary,
            undefined,
            event.payload.status === "in_progress"
              ? 95
              : event.payload.status === "pending"
                ? 90
                : 65,
          );
          if (event.payload.status === "completed") {
            sections.completed.push(item);
          } else if (event.payload.status === "pending") {
            sections.pending.push(item);
          } else {
            sections.currentState.push(item);
          }
          break;
        }
        case "decision.recorded":
          sections.decisions.push(
            this.#item(
              "decision",
              event,
              event.payload.summary,
              [
                event.payload.rationale,
                event.payload.alternatives.length > 0
                  ? `Alternatives: ${event.payload.alternatives.join("; ")}`
                  : undefined,
              ]
                .filter((entry): entry is string => entry !== undefined)
                .join("\n"),
              85,
            ),
          );
          break;
        case "constraint.recorded":
          sections.constraints.push(
            this.#item(
              "constraint",
              event,
              event.payload.summary,
              `Kind: ${event.payload.kind}`,
              100,
            ),
          );
          break;
        case "attempt.failed":
          sections.failedAttempts.push(
            this.#item(
              "failure",
              event,
              event.payload.summary,
              [
                `Reason: ${event.payload.reason}`,
                event.payload.nextAvoid === undefined
                  ? undefined
                  : `Avoid next: ${event.payload.nextAvoid}`,
              ]
                .filter((entry): entry is string => entry !== undefined)
                .join("\n"),
              80,
            ),
          );
          break;
        case "test.observed":
          sections.tests.push(
            this.#item(
              "test",
              event,
              `${event.payload.status.toUpperCase()}: ${event.payload.command}`,
              event.payload.summary,
              event.payload.status === "failed" ? 88 : 60,
            ),
          );
          break;
        default:
          break;
      }
    }

    const checkpoint = findLatest(events, ["checkpoint.created"]);
    if (checkpoint?.eventType === "checkpoint.created") {
      if (checkpoint.payload.summary !== undefined) {
        sections.currentState.push(
          this.#item("checkpoint", checkpoint, checkpoint.payload.summary, undefined, 96),
        );
      }
      checkpoint.payload.nextActions.forEach((action, index) => {
        sections.nextActions.push(
          this.#item(`next:${index}`, checkpoint, action, undefined, 95 - Math.min(index, 20)),
        );
      });
    }

    for (const recall of memory) {
      sections.relevantMemory.push(this.#memoryItem(recall));
    }

    for (const section of Object.values(sections)) {
      section.sort(compareItems);
    }
    return sections;
  }

  #item(
    kind: string,
    event: ContextEvent,
    summary: string,
    details: string | undefined,
    importance: number,
  ): ContextPackItem {
    const estimatedTokens = this.#tokens.estimate(`${summary}\n${details ?? ""}`);
    return {
      id: `item:${kind}:${event.eventId}`,
      summary,
      ...(details === undefined || details.length === 0 ? {} : { details }),
      occurredAt: event.occurredAt,
      importance,
      estimatedTokens,
      sourceEventIds: [event.eventId],
      artifactIds: [...event.provenance.artifactIds],
    };
  }

  #memoryItem(recall: MemoryRecall): ContextPackItem {
    return {
      id: `item:memory:${recall.id}`,
      summary: recall.content,
      occurredAt: recall.occurredAt,
      importance: Math.max(1, Math.min(100, Math.round(recall.score * 70))),
      estimatedTokens: this.#tokens.estimate(recall.content),
      sourceEventIds: [...recall.sourceEventIds],
      artifactIds: [...recall.artifactIds],
    };
  }

  #allocate(goalInput: ContextPackItem, sections: SectionMap, tokenBudget: number) {
    const maximumGoalTokens = Math.max(16, tokenBudget - STRUCTURAL_OVERHEAD_TOKENS - 16);
    const goal = this.#fitItem(goalInput, maximumGoalTokens);
    let remaining = tokenBudget - STRUCTURAL_OVERHEAD_TOKENS - goal.estimatedTokens;
    let used = STRUCTURAL_OVERHEAD_TOKENS + goal.estimatedTokens;
    const selected: SectionMap = {
      currentState: [],
      completed: [],
      pending: [],
      decisions: [],
      constraints: [],
      failedAttempts: [],
      tests: [],
      relevantMemory: [],
      nextActions: [],
    };
    const omittedBySection = new Map<SectionName, ContextPackItem[]>();

    for (const sectionName of Object.keys(sections) as SectionName[]) {
      const sectionBudget = Math.floor(remaining * SECTION_WEIGHTS[sectionName]);
      let sectionUsed = 0;
      const omitted: ContextPackItem[] = [];
      for (const item of sections[sectionName]) {
        if (sectionUsed + item.estimatedTokens <= sectionBudget) {
          selected[sectionName].push(item);
          sectionUsed += item.estimatedTokens;
          used += item.estimatedTokens;
        } else {
          omitted.push(item);
        }
      }
      omittedBySection.set(sectionName, omitted);
    }

    remaining = tokenBudget - used;
    const overflow = [...omittedBySection.values()].flat().sort(compareItems);
    const stillOmitted: ContextPackItem[] = [];
    for (const item of overflow) {
      if (item.estimatedTokens <= remaining) {
        const sectionName = findSectionForItem(sections, item.id);
        selected[sectionName].push(item);
        selected[sectionName].sort(compareItems);
        used += item.estimatedTokens;
        remaining -= item.estimatedTokens;
      } else {
        stillOmitted.push(item);
      }
    }

    return {
      goal,
      sections: selected,
      used,
      omittedItemIds: stillOmitted.map((item) => item.id).sort(),
    };
  }

  #fitItem(item: ContextPackItem, maximumTokens: number): ContextPackItem {
    if (item.estimatedTokens <= maximumTokens) {
      return item;
    }
    const summary = this.#tokens.truncate(item.summary, maximumTokens);
    return {
      id: item.id,
      summary,
      occurredAt: item.occurredAt,
      importance: item.importance,
      estimatedTokens: this.#tokens.estimate(summary),
      sourceEventIds: item.sourceEventIds,
      artifactIds: item.artifactIds,
    };
  }

  #selectArtifacts(
    artifacts: readonly ArtifactRef[],
    selectedIds: ReadonlySet<string>,
    events: readonly ContextEvent[],
    budget: number,
  ) {
    const artifactsById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
    const candidates = [...selectedIds]
      .map((id) => artifactsById.get(id))
      .filter((artifact): artifact is ArtifactRef => artifact !== undefined)
      .sort((left, right) => left.id.localeCompare(right.id));
    const selected: ContextPackArtifact[] = [];
    let used = 0;
    let omittedArtifactCount = 0;

    for (const artifact of candidates) {
      const estimatedTokens = this.#tokens.estimate(
        `${artifact.kind}\n${artifact.title ?? ""}\n${artifact.uri}`,
      );
      if (used + estimatedTokens > budget) {
        omittedArtifactCount += 1;
        continue;
      }
      const sourceEventIds = events
        .filter(
          (event) =>
            event.provenance.artifactIds.includes(artifact.id) ||
            (event.eventType === "artifact.observed" && event.payload.artifactId === artifact.id),
        )
        .map((event) => event.eventId)
        .sort();
      selected.push({
        id: artifact.id,
        kind: artifact.kind,
        uri: artifact.uri,
        ...(artifact.title === undefined ? {} : { title: artifact.title }),
        ...(artifact.gitRevision === undefined ? {} : { gitRevision: artifact.gitRevision }),
        sourceEventIds,
      });
      used += estimatedTokens;
    }
    return { artifacts: selected, used, omittedArtifactCount };
  }
}

function compareEvents(left: ContextEvent, right: ContextEvent): number {
  return (
    left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId)
  );
}

function compareItems(left: ContextPackItem, right: ContextPackItem): number {
  return (
    right.importance - left.importance ||
    right.occurredAt.localeCompare(left.occurredAt) ||
    left.id.localeCompare(right.id)
  );
}

function findLatest<T extends ContextEvent["eventType"]>(
  events: readonly ContextEvent[],
  eventTypes: readonly T[],
): ContextEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event !== undefined && eventTypes.includes(event.eventType as T)) {
      return event;
    }
  }
  return undefined;
}

function findSectionForItem(sections: SectionMap, itemId: string): SectionName {
  for (const sectionName of Object.keys(sections) as SectionName[]) {
    if (sections[sectionName].some((item) => item.id === itemId)) {
      return sectionName;
    }
  }
  throw new CompilerInputError(`Internal compiler error: section not found for ${itemId}`);
}

function latestTimestamp(
  events: readonly ContextEvent[],
  currentGit: GitSnapshot | undefined,
): string {
  const timestamps = events.map((event) => event.observedAt);
  if (currentGit !== undefined) {
    timestamps.push(currentGit.observedAt);
  }
  const latest = timestamps.sort().at(-1);
  /* v8 ignore next -- compile requires a goal event before snapshot time is calculated. */
  if (latest === undefined) {
    throw new CompilerInputError("At least one event is required to compile a ContextPack");
  }
  return latest;
}
