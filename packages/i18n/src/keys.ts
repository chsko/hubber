export type Catalog = { [key: string]: string | Catalog };

/** Flattens a nested catalog into dot-separated keys ("tabs.home"). */
export function flattenKeys(catalog: Catalog, prefix = ""): string[] {
  return Object.entries(catalog).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : flattenKeys(value, path);
  });
}

/**
 * For each locale, the keys that some other locale has but it lacks.
 * Locales with nothing missing are left out, so an empty object means all catalogs match.
 */
export function findMissingKeys(catalogs: Record<string, Catalog>): Record<string, string[]> {
  const keys = Object.fromEntries(
    Object.entries(catalogs).map(([locale, catalog]) => [locale, new Set(flattenKeys(catalog))]),
  );
  const all = new Set(Object.values(keys).flatMap((set) => [...set]));
  const missing: Record<string, string[]> = {};
  for (const [locale, own] of Object.entries(keys)) {
    const lacking = [...all].filter((key) => !own.has(key)).sort();
    if (lacking.length > 0) missing[locale] = lacking;
  }
  return missing;
}
