import { describe, expect, it } from "vitest";
import { CliUsageError, parseOptions } from "../src/index.js";

const definitions = {
  name: { type: "string" as const },
  json: { type: "boolean" as const },
};

describe("CLI option parser", () => {
  it("parses separate and inline long options", () => {
    expect(parseOptions(["--name", "ContextWeft", "--json"], definitions)).toEqual(
      new Map<string, string | true>([
        ["name", "ContextWeft"],
        ["json", true],
      ]),
    );
    expect(parseOptions(["--name=ContextWeft"], definitions).get("name")).toBe("ContextWeft");
  });

  it("rejects unknown, duplicate, positional, and missing options", () => {
    expect(() => parseOptions(["--unknown"], definitions)).toThrow(CliUsageError);
    expect(() => parseOptions(["--json", "--json"], definitions)).toThrow(CliUsageError);
    expect(() => parseOptions(["position"], definitions)).toThrow(CliUsageError);
    expect(() => parseOptions(["--name"], definitions)).toThrow(CliUsageError);
  });
});
