import { describe, expect, it } from "vitest";
import {
  CliUsageError,
  booleanOption,
  integerOption,
  numberOption,
  parseOptions,
  requiredStringOption,
  stringOption,
} from "../src/index.js";

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
    expect(() => parseOptions(["--"], definitions)).toThrow(CliUsageError);
    expect(() => parseOptions(["--name"], definitions)).toThrow(CliUsageError);
    expect(() => parseOptions(["--name", "--json"], definitions)).toThrow(CliUsageError);
    expect(() => parseOptions(["--json=true"], definitions)).toThrow(CliUsageError);
  });

  it("normalizes optional values and rejects invalid numeric options", () => {
    const parsed = parseOptions(["--name", "  ContextWeft  ", "--json"], definitions);

    expect(stringOption(parsed, "name")).toBe("  ContextWeft  ");
    expect(stringOption(parsed, "json")).toBeUndefined();
    expect(requiredStringOption(parsed, "name")).toBe("  ContextWeft  ");
    expect(booleanOption(parsed, "json")).toBe(true);

    expect(() => requiredStringOption(new Map([["name", "   "]]), "name")).toThrow(CliUsageError);
    expect(integerOption(new Map(), "limit", 7, 1, 10)).toBe(7);
    expect(integerOption(new Map([["limit", "10"]]), "limit", 7, 1, 10)).toBe(10);
    expect(() => integerOption(new Map([["limit", "1.5"]]), "limit", 7, 1, 10)).toThrow(
      CliUsageError,
    );
    expect(() =>
      integerOption(new Map([["limit", "9007199254740993"]]), "limit", 7, 1, 10),
    ).toThrow(CliUsageError);
    expect(numberOption(new Map(), "confidence", 0.5, 0, 1)).toBe(0.5);
    expect(numberOption(new Map([["confidence", "0.25"]]), "confidence", 0.5, 0, 1)).toBe(0.25);
    expect(() =>
      numberOption(new Map([["confidence", "Infinity"]]), "confidence", 0.5, 0, 1),
    ).toThrow(CliUsageError);
  });
});
