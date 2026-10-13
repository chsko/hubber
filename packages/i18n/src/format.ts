import type { Locale } from "./index";

/** All dates and times in Hubber are shown in Norwegian time. */
export const timeZone = "Europe/Oslo";

/** Weeks start on Monday (ISO 8601), as Norwegian calendars do. */
export const weekStartsOn = 1;

const intlLocale: Record<Locale, string> = { nb: "nb-NO", en: "en-GB" };

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = cache.get(key);
  if (!f) {
    // 24-hour clock regardless of locale or device setting.
    f = new Intl.DateTimeFormat(intlLocale[locale], { timeZone, hourCycle: "h23", ...options });
    cache.set(key, f);
  }
  return f;
}

type DateInput = Date | number;

/** "12.10.2026" (nb) · "12/10/2026" (en) */
export function formatDate(date: DateInput, locale: Locale): string {
  return formatter(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

/** "mandag 12. oktober" (nb) · "Monday 12 October" (en) */
export function formatLongDate(date: DateInput, locale: Locale): string {
  return formatter(locale, { weekday: "long", day: "numeric", month: "long" }).format(date);
}

/** "18:05" */
export function formatTime(date: DateInput, locale: Locale): string {
  return formatter(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
}

/** "mandag 12. oktober kl. 18:05" (nb) · "Monday 12 October at 18:05" (en) */
export function formatDateTime(date: DateInput, locale: Locale): string {
  return formatter(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Calendar date in Oslo as { year, month (1-12), day }. */
export function osloDateParts(date: DateInput): { year: number; month: number; day: number } {
  const parts = formatter("en", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Day of the week in Oslo, Monday = 0 … Sunday = 6. */
export function osloWeekdayIndex(date: DateInput): number {
  const { year, month, day } = osloDateParts(date);
  // Date.UTC on the Oslo calendar date gives the right weekday without time-zone drift.
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 7 - weekStartsOn) % 7;
}

/** Weekday names in display order, starting on Monday: ["man.", "tir.", …] (nb). */
export function weekdayNames(locale: Locale, width: "short" | "long" = "short"): string[] {
  // 2024-01-01 was a Monday; noon UTC is the same calendar day in Oslo.
  return Array.from({ length: 7 }, (_, i) =>
    formatter(locale, { weekday: width }).format(Date.UTC(2024, 0, 1 + i, 12)),
  );
}

/** Hour and minute on the Oslo clock: { hour (0-23), minute }. */
export function osloTimeParts(date: DateInput): { hour: number; minute: number } {
  const parts = formatter("en", { hour: "numeric", minute: "numeric" }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { hour: get("hour"), minute: get("minute") };
}

type OsloDateTime = { year: number; month: number; day: number; hour: number; minute: number };

/** Oslo's offset from UTC in milliseconds at `instant` (+1h in winter, +2h in summer). */
function osloOffset(instant: number): number {
  const { year, month, day } = osloDateParts(instant);
  const { hour, minute } = osloTimeParts(instant);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  return asUtc - (instant - (instant % 60_000));
}

/**
 * The instant a wall-clock time in Oslo refers to, e.g. 13 Dec 17:00. In the
 * hour skipped when clocks go forward, the time is read with the winter
 * offset; in the hour repeated in autumn, the first one counts.
 */
export function osloToEpoch({ year, month, day, hour, minute }: OsloDateTime): number {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const hourMs = 3_600_000;
  // Oslo is UTC+2 in summer and UTC+1 in winter; keep the readings that land on this wall time.
  const matches = [asUtc - 2 * hourMs, asUtc - hourMs].filter((t) => osloOffset(t) === asUtc - t);
  return matches[0] ?? asUtc - hourMs;
}

/** "fre. 13. des." (nb) · "Fri 13 Dec" (en) */
export function formatShortDate(date: DateInput, locale: Locale): string {
  return formatter(locale, { weekday: "short", day: "numeric", month: "short" }).format(date);
}

/** "11. des. 26" (nb) · "11 Dec 26" (en) */
export function formatCompactDate(date: DateInput, locale: Locale): string {
  return formatter(locale, { day: "numeric", month: "short", year: "2-digit" }).format(date);
}
