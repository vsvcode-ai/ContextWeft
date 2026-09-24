import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryPath = fileURLToPath(new URL("..", import.meta.url));
const packageFolders = [
  "packages/contracts",
  "packages/git-adapter",
  "packages/storage",
  "packages/context-compiler",
  "packages/application",
  "packages/opencontext-adapter",
  "packages/mcp-server",
  "apps/cli",
];

test("published package contents install and run outside the workspace", {
  timeout: 120_000,
}, (t) => {
  const scratch = mkdtempSync(join(tmpdir(), "contextweft-package-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));

  const overrides = {};
  for (const folder of packageFolders) {
    const manifest = JSON.parse(readFileSync(join(repositoryPath, folder, "package.json"), "utf8"));
    const tarball = join(scratch, `${manifest.name.split("/")[1]}.tgz`);
    execFileSync("pnpm", ["--filter", manifest.name, "pack", "--out", tarball], {
      cwd: repositoryPath,
    });
    overrides[manifest.name] = `file:${tarball}`;
  }

  const consumer = join(scratch, "consumer");
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({
      name: "contextweft-package-smoke",
      version: "1.0.0",
      private: true,
      dependencies: { "@contextweft/cli": overrides["@contextweft/cli"] },
      pnpm: {
        overrides,
        onlyBuiltDependencies: ["better-sqlite3", "sqlite-vec", "esbuild"],
      },
    }),
  );
  execFileSync("git", ["init", "-q", consumer]);
  // pnpm scripts export this workspace's peer policy into child processes.
  // Exercise installation with the consumer's own default policy instead.
  const consumerEnvironment = { ...process.env };
  delete consumerEnvironment.INIT_CWD;
  delete consumerEnvironment.npm_config_auto_install_peers;
  delete consumerEnvironment.npm_config_peer_dependency_rules;
  delete consumerEnvironment.npm_config_strict_peer_dependencies;
  try {
    execFileSync("pnpm", ["install"], { cwd: consumer, env: consumerEnvironment });
  } catch (error) {
    throw new Error(
      `Tarball install failed: ${error.stdout?.toString() ?? ""}\n${error.stderr?.toString() ?? error}`,
      { cause: error },
    );
  }

  const help = execFileSync("pnpm", ["exec", "ctxweft", "--help"], {
    cwd: consumer,
    encoding: "utf8",
  });
  assert.match(help, /Usage:/u);

  const initialized = JSON.parse(
    execFileSync("pnpm", ["exec", "ctxweft", "init", "--name", "Tarball smoke", "--json"], {
      cwd: consumer,
      encoding: "utf8",
    }),
  );
  assert.match(initialized.id, /^ws:/u);

  const doctor = JSON.parse(
    execFileSync("pnpm", ["exec", "ctxweft", "doctor", "--json"], {
      cwd: consumer,
      encoding: "utf8",
    }),
  );
  assert.equal(doctor.ok, true);
});
