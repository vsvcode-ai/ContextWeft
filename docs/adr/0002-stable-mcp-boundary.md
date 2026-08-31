# ADR 0002: Stable MCP Boundary

## Status

Accepted for Phase 1.

## Context

ContextWeft is intended to work across multiple AI agents and editors. Native
integrations can provide a better user experience, but they also tie behavior to
client-specific release cycles and configuration formats.

The Model Context Protocol is the most practical Phase 1 interoperability layer
because Codex, Cursor, Claude Code, and other agent hosts can launch local stdio
servers and call typed tools.

## Decision

ContextWeft exposes its first public integration surface as an MCP stdio server.
The server owns a small, stable tool set:

- `contextweft.workspace_init`
- `contextweft.work_item_start`
- `contextweft.workspace_status`
- `contextweft.checkpoint`
- `contextweft.bootstrap`
- `contextweft.search`
- `contextweft.remember`
- `contextweft.correct_fact`

The CLI also generates setup guidance for Codex, Cursor, and Claude Code, but it
does not modify user-level client configuration in Phase 1.

## Consequences

- Agent clients can share one canonical repository context without bespoke APIs.
- Protocol tests can verify behavior independently of any one client UI.
- Client-specific integrations can be added later on top of the same tool
  contracts.
- The MCP server must keep stdout reserved for JSON-RPC and send diagnostics to
  stderr.
- Tool results must preserve structured content and sanitized error envelopes.
