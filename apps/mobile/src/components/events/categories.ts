import type { Doc } from "@hubber/backend/dataModel";

export type Category = NonNullable<Doc<"events">["category"]>;

/** Public event categories (HUB-29), in the order they're offered. Kept in step with the schema. */
export const categories: readonly Category[] = [
  "social",
  "outdoors",
  "sports",
  "culture",
  "food",
  "kids",
  "learning",
  "volunteering",
  "other",
];
