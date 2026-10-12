import { api } from "@hubber/backend/api";
import { useMutation } from "convex/react";
import { Linking } from "react-native";
import { siteUrl } from "./site-url";

/** The secret subscription link for calendar apps (HUB-27). */
export function feedUrl(token: string, protocol: "https" | "webcal" = "https"): string {
  const url = `${siteUrl}/calendar/${token}.ics`;
  return protocol === "webcal" ? url.replace(/^https?:/, "webcal:") : url;
}

/**
 * Opens one event as an .ics file; the phone offers to add it to the
 * calendar. Uses the person's feed link, making one if needed.
 */
export function useAddToCalendar() {
  const createFeed = useMutation(api.calendar.createFeed);
  return async (eventId: string) => {
    const token = await createFeed({});
    await Linking.openURL(`${siteUrl}/calendar/${token}/${eventId}.ics`);
  };
}
