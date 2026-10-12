import { ConvexReactClient } from "convex/react";

// React Native types `process.env` as any; Expo inlines EXPO_PUBLIC_* at build time.
const url = process.env.EXPO_PUBLIC_CONVEX_URL as string | undefined;
if (!url) {
  throw new Error("EXPO_PUBLIC_CONVEX_URL is not set. Copy apps/mobile/.env.example to .env.");
}

export const convex = new ConvexReactClient(url, { unsavedChangesWarning: false });
