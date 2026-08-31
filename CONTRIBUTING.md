# Contributing to ContextWeft

Thank you for helping build portable, trustworthy context infrastructure.

ContextWeft is pre-alpha. Before starting a public API or architectural change,
open an issue so that the problem and compatibility constraints can be agreed
before implementation begins.

## Development setup

Requirements:

- Node.js 22 or newer;
- pnpm 10.28.2 or a compatible pnpm 10 release;
- Git 2.39 or newer.

```bash
pnpm install --frozen-lockfile
pnpm check
```

Useful focused commands:

```bash
pnpm typecheck
pnpm test
pnpm test:performance
pnpm bench
pnpm test:coverage
```

## Change requirements

Every change must preserve the following properties:

- public contracts remain versioned and backward compatibility is explicit;
- important context remains traceable to source events or artifacts;
- derived memory can be rebuilt from canonical data;
- secrets and hidden model reasoning are never persisted;
- deterministic components remain deterministic;
- package boundaries do not depend on implementation details downstream.

New behavior requires tests. Performance-sensitive behavior requires both a
repeatable benchmark and a conservative CI regression budget. Bug fixes should
include a failing regression test whenever practical.

Comments should explain invariants, security boundaries, compatibility choices,
or non-obvious trade-offs. Avoid comments that merely restate the code.

## Pull requests

Keep pull requests focused and reviewable. Include:

- the problem and intended behavior;
- compatibility and migration impact;
- security and privacy impact;
- tests and benchmark results;
- documentation for behavior that is actually implemented.

Do not publish speculative product requirements as implemented capability.

## Commits

Use concise imperative commit subjects, for example:

```text
feat(contracts): add versioned ContextEvent schema
fix(store): preserve idempotency across restarts
perf(compiler): avoid repeated token estimation
```

By contributing, you agree that your contribution is licensed under the
Apache License 2.0 used by this repository.
