import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/index.js";

describe("canonicalJson", () => {
  it("sorts nested object keys while preserving array order", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 }, list: [{ d: 4, c: 5 }] })).toBe(
      '{"a":{"b":3,"y":2},"list":[{"c":5,"d":4}],"z":1}',
    );
  });

  it("is invariant to top-level key insertion order", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (record) => {
        const reversed = Object.fromEntries(Object.entries(record).reverse());
        expect(canonicalJson(record)).toBe(canonicalJson(reversed));
      }),
    );
  });

  it("normalizes negative zero and rejects non-finite numbers", () => {
    expect(canonicalJson({ value: -0 })).toBe('{"value":0}');
    expect(() => canonicalJson({ value: Number.POSITIVE_INFINITY })).toThrow(TypeError);
  });

  it("rejects values outside the JSON data model", () => {
    expect(() => canonicalJson({ value: 1n })).toThrow(TypeError);
    expect(() => canonicalJson(Symbol("unsupported"))).toThrow(TypeError);
  });
});
