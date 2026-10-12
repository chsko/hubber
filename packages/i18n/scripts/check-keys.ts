// Fails (exit 1) when a message key exists in one locale's catalog but not another's.
// Run with `pnpm i18n:check` (Node strips the types).
import { readdirSync, readFileSync } from "node:fs";
import type { Catalog } from "../src/keys.ts";
import { findMissingKeys } from "../src/keys.ts";

const dir = new URL("../src/locales/", import.meta.url);
const catalogs: Record<string, Catalog> = {};
for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
  catalogs[file.replace(/\.json$/, "")] = JSON.parse(
    readFileSync(new URL(file, dir), "utf8"),
  ) as Catalog;
}

const missing = Object.entries(findMissingKeys(catalogs));
if (missing.length === 0) {
  console.log(`i18n: ${Object.keys(catalogs).join(", ")} have the same keys.`);
} else {
  for (const [locale, keys] of missing) {
    console.error(`i18n: ${locale}.json is missing ${keys.length} key(s):`);
    for (const key of keys) console.error(`  - ${key}`);
  }
  process.exit(1);
}
