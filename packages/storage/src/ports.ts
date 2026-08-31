import type {
  ArtifactRef,
  ContextEvent,
  ContextEventType,
  WorkItem,
  Workspace,
} from "@contextweft/contracts";

export interface EventQuery {
  readonly workspaceId: string;
  readonly workItemId?: string;
  readonly eventTypes?: readonly ContextEventType[];
  readonly occurredAfter?: string;
  readonly occurredBefore?: string;
  readonly limit?: number;
}

export interface AppendResult {
  readonly event: ContextEvent;
  readonly inserted: boolean;
}

export interface EventStore {
  appendEvent(event: ContextEvent): AppendResult;
  appendEvents(events: readonly ContextEvent[]): readonly AppendResult[];
  getEvent(eventId: string): ContextEvent | undefined;
  listEvents(query: EventQuery): readonly ContextEvent[];
  countEvents(workspaceId: string, workItemId?: string): number;
}

export interface WorkspaceRepository {
  putWorkspace(workspace: Workspace): void;
  getWorkspace(workspaceId: string): Workspace | undefined;
  findWorkspaceByRoot(rootPath: string): Workspace | undefined;
  listWorkspaces(): readonly Workspace[];
}

export interface WorkItemRepository {
  putWorkItem(workItem: WorkItem): void;
  getWorkItem(workItemId: string): WorkItem | undefined;
  listWorkItems(workspaceId: string): readonly WorkItem[];
}

export interface ArtifactRepository {
  putArtifact(artifact: ArtifactRef): void;
  putArtifacts(artifacts: readonly ArtifactRef[]): void;
  getArtifact(artifactId: string): ArtifactRef | undefined;
  listArtifacts(workspaceId: string, workItemId?: string): readonly ArtifactRef[];
}

export interface CanonicalRepository
  extends EventStore,
    WorkspaceRepository,
    WorkItemRepository,
    ArtifactRepository {
  readonly schemaVersion: number;
  close(): void;
}
