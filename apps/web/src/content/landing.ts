export type LandingContent = {
  metaTitle: string;
  metaDescription: string;
  switchLanguage: { label: string; href: string };
  headline: string;
  lead: string;
  promises: { title: string; body: string }[];
  stepsTitle: string;
  steps: string[];
  storesComingSoon: string;
  footer: string;
};

export const landing: Record<"nb" | "en", LandingContent> = {
  nb: {
    metaTitle: "Hubber – grupper og arrangementer, ingenting annet",
    metaDescription:
      "Chat, planlegg og samle klassen, familien eller vennegjengen – uten feed, uten reklame og uten algoritmer. Bare ekte personer, verifisert med Vipps.",
    switchLanguage: { label: "In English", href: "/en" },
    headline: "Gruppene og arrangementene dine. Ingenting annet.",
    lead: "Chat, planlegg og samle klassen, familien eller vennegjengen – uten feed, uten reklame og uten algoritmer.",
    promises: [
      {
        title: "Bare ekte personer",
        body: "Alle logger inn med Vipps. Ingen falske profiler, ingen roboter.",
      },
      {
        title: "Ingen feed, ingen reklame",
        body: "Du ser det som skjer i gruppene dine – i rekkefølge. Vi selger aldri data.",
      },
      {
        title: "Rolige varsler",
        body: "Du får beskjed om det som betyr noe. Resten venter til du åpner appen.",
      },
    ],
    stepsTitle: "Slik fungerer det",
    steps: [
      "Lag en hub for klassen, familien eller vennene.",
      "Del lenken – alle blir med med Vipps på sekunder.",
      "Chat, lag arrangementer og se hvem som kommer.",
    ],
    storesComingSoon: "Kommer snart til App Store og Google Play",
    footer: "Laget i Norge · Data lagret i EU",
  },
  en: {
    metaTitle: "Hubber – your groups and events, nothing else",
    metaDescription:
      "Chat, plan and gather your class, family or friends – no feed, no ads, no algorithms. Only real people, verified with Vipps.",
    switchLanguage: { label: "På norsk", href: "/" },
    headline: "Your groups and events. Nothing else.",
    lead: "Chat, plan and gather your class, family or friends – no feed, no ads and no algorithms.",
    promises: [
      {
        title: "Only real people",
        body: "Everyone signs in with Vipps. No fake profiles, no bots.",
      },
      {
        title: "No feed, no ads",
        body: "You see what happens in your groups, in order. We never sell data.",
      },
      {
        title: "Calm notifications",
        body: "You hear about what matters. Everything else waits until you open the app.",
      },
    ],
    stepsTitle: "How it works",
    steps: [
      "Create a hub for your class, family or friends.",
      "Share the link – everyone joins with Vipps in seconds.",
      "Chat, create events and see who's coming.",
    ],
    storesComingSoon: "Coming soon to the App Store and Google Play",
    footer: "Made in Norway · Data stored in the EU",
  },
};
