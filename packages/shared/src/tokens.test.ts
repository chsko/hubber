import { describe, expect, it } from "vitest";
import { colors } from "./tokens";

const HEX = /^#[0-9A-F]{6}$/;

describe("colors", () => {
  it("defines the same tokens for light and dark", () => {
    expect(Object.keys(colors.dark).sort()).toEqual(Object.keys(colors.light).sort());
  });

  it("uses uppercase 6-digit hex values", () => {
    for (const scheme of Object.values(colors)) {
      for (const value of Object.values(scheme)) {
        expect(value).toMatch(HEX);
      }
    }
  });
});
