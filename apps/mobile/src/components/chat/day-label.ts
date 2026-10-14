import { formatLongDate, type Locale, osloDateParts } from "@hubbr/i18n";
import type { TFunction } from "i18next";

const DAY = 24 * 60 * 60 * 1000;

/** Oslo calendar day as a comparable number, e.g. 20261012. */
export function osloDayKey(time: number): number {
  const { year, month, day } = osloDateParts(time);
  return year * 10000 + month * 100 + day;
}

/** "I dag" / "I går" / "mandag 12. oktober" for a chat date separator. */
export function dayLabel(time: number, now: number, locale: Locale, t: TFunction): string {
  const key = osloDayKey(time);
  if (key === osloDayKey(now)) return t("chat.today");
  // Noon minus a day stays on yesterday's date across DST changes.
  if (key === osloDayKey(now - DAY)) return t("chat.yesterday");
  return formatLongDate(time, locale);
}
