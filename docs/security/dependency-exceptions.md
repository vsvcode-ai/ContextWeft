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
- Reviewed on: 2026-09-24 after upgrading `@melandlabs/memory-store` to 1.3.1
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
