import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliIo } from "../src/index.js";

export function createGitRepository(): string {
  const root = mkdtempSync(join(tmpdir(), "contextweft-cli-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.name", "ContextWeft Test"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  writeFileSync(join(root, "index.ts"), "export const phase = 1;\n");
  execFileSync("git", ["add", "index.ts"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "initial"], { cwd: root });
  return root;
}

export interface CapturedIo extends CliIo {
  readonly stdoutLines: string[];
  readonly stderrLines: string[];
}

export function capturedIo(stdin = ""): CapturedIo {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  return {
    stdoutLines,
    stderrLines,
    stdout(text) {
      stdoutLines.push(text);
    },
    stderr(text) {
      stderrLines.push(text);
    },
    async readStdin(maximumBytes) {
      if (Buffer.byteLength(stdin) > maximumBytes) {
        throw new Error("stdin fixture exceeds limit");
      }
      return stdin;
    },
  };
}
