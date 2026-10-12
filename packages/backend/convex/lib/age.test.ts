import { describe, expect, it } from "vitest";
import { ageInOslo, assertAdult } from "./age";

describe("ageInOslo", () => {
  it("counts whole years on the Oslo calendar date", () => {
    expect(ageInOslo("1985-04-17", Date.UTC(2026, 9, 12, 12))).toBe(41);
    expect(ageInOslo("1985-11-02", Date.UTC(2026, 9, 12, 12))).toBe(40);
  });

  it("turns 18 on the 18th birthday in Oslo, not in UTC", () => {
    // 2026-05-08 23:30 UTC is already 2026-05-09 01:30 in Oslo (CEST).
    expect(ageInOslo("2008-05-09", Date.UTC(2026, 4, 8, 21, 59))).toBe(17);
    expect(ageInOslo("2008-05-09", Date.UTC(2026, 4, 8, 22, 0))).toBe(18);
    expect(ageInOslo("2008-05-09", Date.UTC(2026, 4, 8, 23, 30))).toBe(18);
  });

  it("treats a 29 February birthday as 1 March in non-leap years", () => {
    expect(ageInOslo("2008-02-29", Date.UTC(2026, 1, 28, 12))).toBe(17);
    expect(ageInOslo("2008-02-29", Date.UTC(2026, 2, 1, 12))).toBe(18);
  });

  it("rejects malformed birthdates", () => {
    expect(() => ageInOslo("17.04.1985")).toThrow(/INVALID_BIRTHDATE/);
  });
});

describe("assertAdult", () => {
  it("throws UNDER_18 the day before the 18th birthday only", () => {
    expect(() => assertAdult("2008-05-09", Date.UTC(2026, 4, 8, 12))).toThrow(/UNDER_18/);
    expect(() => assertAdult("2008-05-09", Date.UTC(2026, 4, 9, 12))).not.toThrow();
  });
});
