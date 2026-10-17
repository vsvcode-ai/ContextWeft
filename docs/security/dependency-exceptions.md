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
