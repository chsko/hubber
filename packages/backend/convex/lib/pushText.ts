type Locale = "nb" | "en";

/**
 * Push notification texts, written on the server in the recipient's
 * language (users.locale, synced from the app). Kept short: the OS adds
 * the app name.
 */
const texts = {
  nb: {
    mention: (author: string) => `${author} nevnte deg`,
    reply: (author: string) => `${author} svarte deg`,
    bundle: (count: number) => (count === 1 ? "1 ny melding" : `${count} nye meldinger`),
    photo: "📷 Bilde",
  },
  en: {
    mention: (author: string) => `${author} mentioned you`,
    reply: (author: string) => `${author} replied to you`,
    bundle: (count: number) => (count === 1 ? "1 new message" : `${count} new messages`),
    photo: "📷 Photo",
  },
} as const;

export function pushText(locale: Locale | undefined) {
  return texts[locale ?? "nb"];
}
