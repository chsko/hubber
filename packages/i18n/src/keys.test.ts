import { describe, expect, it } from "vitest";
import { messages } from "./index";
import { findMissingKeys, flattenKeys } from "./keys";

describe("catalogs", () => {
  it("have the same keys in every locale", () => {
    expect(findMissingKeys(messages)).toEqual({});
  });

  it("have no empty strings", () => {
    for (const catalog of Object.values(messages)) {
      for (const key of flattenKeys(catalog)) {
        const value = key
          .split(".")
          .reduce<unknown>((node, part) => (node as never)[part], catalog);
        expect(value, key).not.toBe("");
      }
    }
  });
});

describe("findMissingKeys", () => {
  it("reports keys one locale lacks, in both directions", () => {
    expect(
      findMissingKeys({
        nb: { a: "a", nested: { b: "b" } },
        en: { a: "a", c: "c" },
      }),
    ).toEqual({ nb: ["c"], en: ["nested.b"] });
  });
});
