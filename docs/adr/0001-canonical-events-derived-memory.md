# ADR 0001: Canonical Events and Derived Memory

## Status

Accepted for Phase 1.

## Context

ContextWeft needs to support continuity across agents without depending on one
editor, model, vector database, or memory runtime. Long-term memory is useful
for recall, but it is not a reliable audit log: indexes can be rebuilt,
re-ranked, corrected, or temporarily unavailable.

## Decision

ContextWeft stores every durable fact of work in an append-only canonical event
log. Derived memory systems, including the Phase 1 OpenContext memory-store
integration, are recall indexes built from those events.

The canonical event log owns:

- workspace and work item lifecycle;
- explicit progress, decisions, constraints, failures, tests, and checkpoints;
- explicit long-term memory writes and corrections;
- artifact references and Git snapshot provenance;
- idempotency keys and replay semantics.

Derived memory owns:

- search and recall acceleration;
- ranked retrieval for bootstrap;
- rebuildable local indexes.

## Consequences

- A failed memory write does not lose canonical state.
- Memory can be rebuilt from canonical events.
- Corrections are auditable because the original event remains in history.
- Public contracts stay independent from OpenContext internals.
- Implementations must treat recalled memory as untrusted evidence with
  provenance, not as executable instruction text.
