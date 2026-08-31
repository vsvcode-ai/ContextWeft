import type { Freshness, GitSnapshot } from "@contextweft/contracts";

export function evaluateFreshness(
  checkpoint: GitSnapshot | undefined,
  current: GitSnapshot | undefined,
): Freshness {
  if (checkpoint === undefined || current === undefined) {
    return {
      status: "missing",
      ...(checkpoint === undefined ? {} : { checkpoint }),
      ...(current === undefined ? {} : { current }),
      reasons: [
        checkpoint === undefined
          ? "No checkpoint Git snapshot is available."
          : "No current Git snapshot is available.",
      ],
    };
  }

  if (checkpoint.revision !== current.revision) {
    return {
      status: "revision-diverged",
      checkpoint,
      current,
      reasons: [
        `Git revision changed from ${checkpoint.revision ?? "unborn"} to ${current.revision ?? "unborn"}.`,
      ],
    };
  }

  if (checkpoint.fingerprint !== current.fingerprint) {
    return {
      status: "dirty-changed",
      checkpoint,
      current,
      reasons: ["Working tree content changed after the checkpoint."],
    };
  }

  return { status: "fresh", checkpoint, current, reasons: [] };
}
