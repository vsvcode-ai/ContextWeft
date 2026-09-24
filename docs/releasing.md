# Alpha release procedure

The eight publishable packages are versioned together at `0.1.0-alpha.1`.
The root `contextweft-monorepo` package is private and must not be published.

## Release gates

1. Run `pnpm install --frozen-lockfile` and `pnpm check` on Node.js 22 and 24 in CI, plus `pnpm test:coverage` on Node.js 22. `pnpm check` includes a built MCP stdio round trip and a tarball install outside this workspace.
2. Follow the [Cursor MCP guide](cursor-mcp-testing.zh-CN.md) in Cursor. Repeat the same `workspace_init` → `work_item_start` → `remember` → `checkpoint` → `bootstrap` workflow in Codex and Claude Code using the generated setup guides. Before publication, generate each guide with `node apps/cli/dist/main.js setup <codex|claude-code> --command "$PWD/apps/cli/dist/main.js"` from the repository root so it points to the built executable. Use a fresh Git repository for each client and record its tool results. Every write call needs a unique `idempotencyKey`; reuse that key only when retrying the same operation.
3. Confirm npm access to the `@contextweft` scope and inspect the tarballs with `pnpm --filter @contextweft/cli pack --dry-run --json`. Review [the dependency exception](security/dependency-exceptions.md) before publication.
4. Commit the final release candidate, wait for CI to pass, and create the `v0.1.0-alpha.1` tag.

## Publish order

Publish with the `alpha` dist-tag in dependency order. Run each command from the repository root after the release gates pass:

```bash
pnpm --dir packages/contracts publish --tag alpha --access public
pnpm --dir packages/git-adapter publish --tag alpha --access public
pnpm --dir packages/storage publish --tag alpha --access public
pnpm --dir packages/context-compiler publish --tag alpha --access public
pnpm --dir packages/application publish --tag alpha --access public
pnpm --dir packages/opencontext-adapter publish --tag alpha --access public
pnpm --dir packages/mcp-server publish --tag alpha --access public
pnpm --dir apps/cli publish --tag alpha --access public
```

After publication, install `@contextweft/cli@alpha` in a clean project and repeat the CLI and MCP smoke workflow. Create the GitHub prerelease only after the published packages pass that check.
