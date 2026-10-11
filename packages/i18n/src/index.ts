// Message catalogs and formatting helpers arrive in HUB-5.
export const locales = ["nb", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "nb";
