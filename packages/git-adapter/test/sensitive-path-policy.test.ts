import { describe, expect, it } from "vitest";
import { DefaultSensitivePathPolicy, parseNullDelimitedPaths } from "../src/index.js";

describe("DefaultSensitivePathPolicy", () => {
  const policy = new DefaultSensitivePathPolicy();

  it.each([
    ".env",
    ".env.production",
    "keys/server.pem",
    "config/credentials.json",
    ".ssh/id_rsa.pub",
    "backup/secrets/token.txt",
  ])("classifies %s as sensitive", (path) => {
    expect(policy.isSensitive(path)).toBe(true);
  });

  it.each(["", "src/index.ts", "docs/environment.md", "packages/keyboard/index.ts"])(
    "allows %s",
    (path) => {
      expect(policy.isSensitive(path)).toBe(false);
    },
  );

  it("normalizes case and platform separators before classification", () => {
    expect(policy.isSensitive("Config\\Secrets\\TOKEN.txt")).toBe(true);
    expect(policy.isSensitive("keys/CLIENT.P12")).toBe(true);
  });
});

describe("parseNullDelimitedPaths", () => {
  it("preserves spaces and removes empty terminators", () => {
    expect(parseNullDelimitedPaths(" src/a file.ts \0src/b.ts\0")).toEqual([
      " src/a file.ts ",
      "src/b.ts",
    ]);
  });
});
