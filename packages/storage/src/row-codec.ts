import {
  canonicalJson,
  parseArtifactRef,
  parseContextEvent,
  parseWorkItem,
  parseWorkspace,
  type ArtifactRef,
  type ContextEvent,
  type WorkItem,
  type Workspace,
} from "@contextweft/contracts";

export interface WorkspaceRow {
  id: string;
  schema_version: string;
  name: string;
  root_path: string;
  created_at: string;
  updated_at: string;
  metadata_json: string;
}

export interface WorkItemRow {
  id: string;
  schema_version: string;
  workspace_id: string;
  title: string;
  goal: string;
  status: string;
  created_at: string;
  updated_at: string;
  metadata_json: string;
}

export interface EventRow {
  event_id: string;
  schema_version: string;
  event_type: string;
  workspace_id: string;
  work_item_id: string | null;
  occurred_at: string;
  observed_at: string;
  actor_json: string;
  source_json: string;
  idempotency_key: string;
  payload_json: string;
  provenance_json: string;
  metadata_json: string;
}

export interface ArtifactRow {
  id: string;
  schema_version: string;
  workspace_id: string;
  work_item_id: string | null;
  kind: string;
  uri: string;
  title: string | null;
  content_hash: string | null;
  git_revision: string | null;
  observed_at: string;
  metadata_json: string;
}

export function encodeWorkspace(workspace: Workspace): WorkspaceRow {
  return {
    id: workspace.id,
    schema_version: workspace.schemaVersion,
    name: workspace.name,
    root_path: workspace.rootPath,
    created_at: workspace.createdAt,
    updated_at: workspace.updatedAt,
    metadata_json: canonicalJson(workspace.metadata),
  };
}

export function decodeWorkspace(row: WorkspaceRow): Workspace {
  return parseWorkspace({
    schemaVersion: row.schema_version,
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: JSON.parse(row.metadata_json),
  });
}

export function encodeWorkItem(workItem: WorkItem): WorkItemRow {
  return {
    id: workItem.id,
    schema_version: workItem.schemaVersion,
    workspace_id: workItem.workspaceId,
    title: workItem.title,
    goal: workItem.goal,
    status: workItem.status,
    created_at: workItem.createdAt,
    updated_at: workItem.updatedAt,
    metadata_json: canonicalJson(workItem.metadata),
  };
}

export function decodeWorkItem(row: WorkItemRow): WorkItem {
  return parseWorkItem({
    schemaVersion: row.schema_version,
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    goal: row.goal,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: JSON.parse(row.metadata_json),
  });
}

export function encodeEvent(event: ContextEvent): EventRow {
  return {
    event_id: event.eventId,
    schema_version: event.schemaVersion,
    event_type: event.eventType,
    workspace_id: event.workspaceId,
    work_item_id: event.workItemId ?? null,
    occurred_at: event.occurredAt,
    observed_at: event.observedAt,
    actor_json: canonicalJson(event.actor),
    source_json: canonicalJson(event.source),
    idempotency_key: event.idempotencyKey,
    payload_json: canonicalJson(event.payload),
    provenance_json: canonicalJson(event.provenance),
    metadata_json: canonicalJson(event.metadata),
  };
}

export function decodeEvent(row: EventRow): ContextEvent {
  return parseContextEvent({
    schemaVersion: row.schema_version,
    eventId: row.event_id,
    eventType: row.event_type,
    workspaceId: row.workspace_id,
    ...(row.work_item_id === null ? {} : { workItemId: row.work_item_id }),
    occurredAt: row.occurred_at,
    observedAt: row.observed_at,
    actor: JSON.parse(row.actor_json),
    source: JSON.parse(row.source_json),
    idempotencyKey: row.idempotency_key,
    payload: JSON.parse(row.payload_json),
    provenance: JSON.parse(row.provenance_json),
    metadata: JSON.parse(row.metadata_json),
  });
}

export function encodeArtifact(artifact: ArtifactRef): ArtifactRow {
  return {
    id: artifact.id,
    schema_version: artifact.schemaVersion,
    workspace_id: artifact.workspaceId,
    work_item_id: artifact.workItemId ?? null,
    kind: artifact.kind,
    uri: artifact.uri,
    title: artifact.title ?? null,
    content_hash: artifact.contentHash ?? null,
    git_revision: artifact.gitRevision ?? null,
    observed_at: artifact.observedAt,
    metadata_json: canonicalJson(artifact.metadata),
  };
}

export function decodeArtifact(row: ArtifactRow): ArtifactRef {
  return parseArtifactRef({
    schemaVersion: row.schema_version,
    id: row.id,
    workspaceId: row.workspace_id,
    ...(row.work_item_id === null ? {} : { workItemId: row.work_item_id }),
    kind: row.kind,
    uri: row.uri,
    ...(row.title === null ? {} : { title: row.title }),
    ...(row.content_hash === null ? {} : { contentHash: row.content_hash }),
    ...(row.git_revision === null ? {} : { gitRevision: row.git_revision }),
    observedAt: row.observed_at,
    metadata: JSON.parse(row.metadata_json),
  });
}
