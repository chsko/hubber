import en from "./locales/en.json";
import nb from "./locales/nb.json";

export const locales = ["nb", "en"] as const;
export type Locale = (typeof locales)[number];

/** The source language; `nb.json` defines the keys and their nesting. */
export const defaultLocale: Locale = "nb";

export type Messages = typeof nb;

/** Message catalogs, one per locale. `en` is typed against `nb`, so tsc also flags a missing key. */
export const messages: Record<Locale, Messages> = { nb, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/**
 * Picks the app language from the device's preferred languages (BCP 47 tags, best first).
 * Norwegian (nb, nn, no) maps to bokmål; anything we don't support falls back to English.
 */
export function resolveLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const language = tag.toLowerCase().split(/[-_]/)[0];
    if (language === "nb" || language === "nn" || language === "no") return "nb";
    if (language === "en") return "en";
  }
  return "en";
}

export { findMissingKeys, flattenKeys, type Catalog } from "./keys";
export {
  formatDate,
  formatDateTime,
  formatLongDate,
  formatShortDate,
  formatTime,
  osloDateParts,
  osloTimeParts,
  osloToEpoch,
  osloWeekdayIndex,
  timeZone,
  weekdayNames,
  weekStartsOn,
} from "./format";
