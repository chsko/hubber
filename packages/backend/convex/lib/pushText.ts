type Locale = "nb" | "en";

const whenFormat = {
  nb: new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Oslo",
    hourCycle: "h23",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    hourCycle: "h23",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }),
};

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
    newEvent: (hub: string) => `Nytt arrangement i ${hub}`,
    changedEvent: (title: string) => `Endret: ${title}`,
    cancelledEvent: (title: string) => `Avlyst: ${title}`,
    when: (at: number) => whenFormat.nb.format(at),
  },
  en: {
    mention: (author: string) => `${author} mentioned you`,
    reply: (author: string) => `${author} replied to you`,
    bundle: (count: number) => (count === 1 ? "1 new message" : `${count} new messages`),
    photo: "📷 Photo",
    newEvent: (hub: string) => `New event in ${hub}`,
    changedEvent: (title: string) => `Changed: ${title}`,
    cancelledEvent: (title: string) => `Cancelled: ${title}`,
    when: (at: number) => whenFormat.en.format(at),
  },
} as const;

export function pushText(locale: Locale | undefined) {
  return texts[locale ?? "nb"];
}
