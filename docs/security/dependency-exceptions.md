# Dependency security exceptions

ContextWeft's CI blocks production dependencies with known high or critical
severity vulnerabilities. Lower-severity findings are reviewed individually and
recorded here when no compatible upstream fix exists.

## GHSA-866g-f22w-33x8

- Package: `@ai-sdk/provider-utils` 5.0.0-beta.49 (transitive)
- Severity: low
- Introduced by: `@melandlabs/memory-store` → `@melandlabs/ai` →
  `@ai-sdk/anthropic`
- Accepted on: 2026-08-31
- Reviewed on: 2026-10-17 after integrating dependency PRs #15, #16, and #17
  and upgrading `@melandlabs/memory-store` to 1.3.8
- Review by: 2026-10-24

The affected resource-consumption path belongs to OpenContext's optional remote
AI provider support. ContextWeft's phase-1 adapter does not configure or expose
that support: it only uses the local SQLite raw-message manager and offline
lexical search through a narrow, runtime-validated boundary. There is no patched
version in the current upstream beta dependency chain; the advisory lists 5.0.1
as patched. Reassess when `@melandlabs/ai` updates its `@ai-sdk/anthropic`
dependency, or before the first release, whichever comes first.

The exception does not apply to high or critical findings. If the severity,
reachability, or available fix changes, the dependency must be upgraded or the
exception removed before release.

## Patched transitive dependencies (2026-10-17)

The dependency PR checks were blocked by production audit findings. The workspace
overrides and lockfile now select compatible patched versions:

| Package | Minimum selected version |
| --- | --- |
| `undici` (including legacy requests covered by the existing override) | 6.28.1 |
| `fast-uri` 3.x | 3.1.8 |
| `ip-address` 10.x | 10.7.1 |
| `proxy-addr` 2.x | 2.0.8 |
| `@modelcontextprotocol/sdk` 1.x | 1.31.0 |
| `handlebars` 4.x | 4.7.10 |

These are dependency fixes, not audit exceptions. The high/critical production
audit gate remains enabled. Recheck this list when the upstream dependency chain
no longer needs an override.

## Node.js 24 SQLite compatibility (2026-10-17)

The Node.js 24 CI run exposed a native `RemoveEnvironmentCleanupHook` assertion
in the real OpenContext memory performance test. OpenContext memory-store 1.3.1
carried better-sqlite3 11.10.0 through its SQLite package. Upgrading the published
memory-store dependency to 1.3.8 selects `@melandlabs/sqlite` 0.5.5 and
better-sqlite3 13.0.3, matching ContextWeft's canonical storage dependency. This
also applies to independently installed ContextWeft packages rather than relying
on a workspace-only SQLite override.

The optional `@langchain/community` integration still declares a SQLite peer
range below 13. The workspace explicitly accepts 13.0.3 for that integration;
ContextWeft uses OpenContext's raw-message store and does not invoke the LangChain
integration. Peer validation remains enabled for other dependencies.
