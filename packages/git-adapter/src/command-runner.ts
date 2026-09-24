import { execFile } from "node:child_process";
import type { GitCommandRunner, GitCommandResult } from "./ports.js";

const MAX_GIT_OUTPUT_BYTES = 32 * 1024 * 1024;

/** Runs Git without a shell so repository paths and revisions cannot inject commands. */
export class ExecFileGitCommandRunner implements GitCommandRunner {
  public run(args: readonly string[], cwd: string): Promise<GitCommandResult> {
    return new Promise((resolve) => {
      execFile(
        "git",
        [...args],
        {
          cwd,
          encoding: "utf8",
          maxBuffer: MAX_GIT_OUTPUT_BYTES,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          /* v8 ignore next -- @preserve Node normally reports child_process exit codes as numbers here. */
          const exitCode =
            error !== null && typeof error.code === "number" ? error.code : error === null ? 0 : 1;
          resolve({ exitCode, stdout, stderr });
        },
      );
    });
  }
}
