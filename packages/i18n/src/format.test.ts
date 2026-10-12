import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatTime,
  osloDateParts,
  osloWeekdayIndex,
  weekdayNames,
} from "./format";
import { resolveLocale } from "./index";

// 2026-10-12 16:05 UTC = 18:05 in Oslo (CEST, UTC+2), a Monday.
const summer = Date.UTC(2026, 9, 12, 16, 5);
// 2026-01-04 23:30 UTC = 00:30 on Monday 5 January in Oslo (CET, UTC+1).
const winterMidnight = Date.UTC(2026, 0, 4, 23, 30);

describe("Norwegian formatting", () => {
  it("formats in Europe/Oslo with a 24-hour clock", () => {
    expect(formatTime(summer, "nb")).toBe("18:05");
    expect(formatTime(summer, "en")).toBe("18:05");
    expect(formatTime(winterMidnight, "nb")).toBe("00:30");
  });

  it("formats dates the Norwegian way", () => {
    expect(formatDate(summer, "nb")).toBe("12.10.2026");
    expect(formatDateTime(summer, "nb")).toBe("mandag 12. oktober kl. 18:05");
  });

  it("uses the Oslo calendar day, not UTC", () => {
    expect(osloDateParts(winterMidnight)).toEqual({ year: 2026, month: 1, day: 5 });
    expect(osloWeekdayIndex(winterMidnight)).toBe(0);
  });

  it("starts the week on Monday", () => {
    expect(osloWeekdayIndex(summer)).toBe(0);
    expect(weekdayNames("nb", "long")[0]).toBe("mandag");
    expect(weekdayNames("en", "long")).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
  });
});

describe("resolveLocale", () => {
  it("maps any Norwegian variant to bokmål", () => {
    expect(resolveLocale(["nb-NO"])).toBe("nb");
    expect(resolveLocale(["nn-NO"])).toBe("nb");
    expect(resolveLocale(["no"])).toBe("nb");
  });

  it("takes the first supported language in preference order", () => {
    expect(resolveLocale(["de-DE", "en-US", "nb-NO"])).toBe("en");
    expect(resolveLocale(["sv-SE", "nb-NO"])).toBe("nb");
  });

  it("falls back to English", () => {
    expect(resolveLocale(["pl-PL"])).toBe("en");
    expect(resolveLocale([])).toBe("en");
  });
});
