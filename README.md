# ContextWeft

English | [Simplified Chinese](README.zh-CN.md)

Portable, permission-aware context infrastructure for AI agents.

ContextWeft gives software teams a canonical context layer that survives editor,
model, and agent switches. The Phase 1 implementation focuses on developer
continuity: verified checkpoints, deterministic bootstrap packs, local
long-term memory, and one MCP tool surface that can be shared by Codex, Cursor,
Claude Code, and other MCP-compatible clients.

## Status

Phase 1 foundation is implemented locally and covered by tests. The project is
still pre-release and the public API may change before the first tagged alpha.

Implemented:

- Versioned JSON contracts for workspaces, work items, canonical events, Git
  snapshots, artifacts, and ContextPacks.
- Canonical SQLite event store with transactions, migrations, idempotency, and
  strict cross-entity checks.
- Git snapshot capture with repository-root validation and sensitive path
  filtering.
- Deterministic ContextPack compiler with token budgeting, provenance, freshness
  reporting, golden contract tests, and prompt-injection boundary rendering.
- OpenContext-derived local memory through `@melandlabs/memory-store`, with the
  canonical event log kept as the source of truth.
- CLI and MCP stdio server exposing the same Phase 1 workflow.
- Setup guide generation for Codex, Cursor, and Claude Code.

Not implemented yet:

- Hosted sync, multi-device replication, or SaaS control plane.
- Enterprise identity, RBAC, audit export, or policy management.
- Vector recall beyond the current local OpenContext memory-store boundary.
- Stable npm release.

## Quick Start

Requirements:

- Node.js 22 or newer
- pnpm 10 or newer
- Git

```bash
pnpm install
pnpm check
pnpm build
```

Initialize a Git repository for local ContextWeft state:

```bash
ctxweft init --name "My workspace"
ctxweft task start --title "Continue feature work" --goal "Ship the next verified change"
ctxweft task status
```

Create a checkpoint from JSON:

```bash
ctxweft checkpoint --work-item work_123 --input checkpoint.json
```

Bootstrap the next agent:

```bash
ctxweft bootstrap --work-item work_123 --intent "Continue implementation"
```

Run the MCP server:

```bash
ctxweft mcp
```

## MCP Clients

Generate setup guidance without modifying any user config:

```bash
ctxweft setup codex
ctxweft setup cursor
ctxweft setup claude-code
```

JSON output is available for automation:

```bash
ctxweft setup cursor --json
```

The MCP server currently exposes:

- `contextweft.workspace_init`
- `contextweft.work_item_start`
- `contextweft.workspace_status`
- `contextweft.checkpoint`
- `contextweft.bootstrap`
- `contextweft.search`
- `contextweft.remember`
- `contextweft.correct_fact`

## Security Model

ContextWeft treats generated packs and recalled memory as untrusted evidence.
Canonical state lives in a local SQLite event log; derived memory can be rebuilt
from canonical events. Phase 1 rejects path traversal and sensitive artifact
paths, avoids symlinked state directories, keeps local state permissions strict,
and fails closed on corrupted canonical databases.

Dependency exceptions are documented in
[docs/security/dependency-exceptions.md](docs/security/dependency-exceptions.md).

## Development

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:performance
pnpm build
pnpm security:audit
```

The full gate is:

```bash
pnpm check
```

Benchmarks are available with:

```bash
pnpm bench
```

## Architecture Notes

- Canonical events are append-only and engine-independent.
- OpenContext memory is a derived recall index, not the source of truth.
- ContextPacks are deterministic, budgeted, and provenance-first.
- MCP is the first public interoperability boundary; native editor integrations
  can be layered on top later.

See [docs/adr](docs/adr) for implemented architecture decisions.

## License

Apache License 2.0. See [LICENSE](LICENSE).
