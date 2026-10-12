import { useAuthToken } from "@convex-dev/auth/react";
import type { ImageURISource } from "react-native";

// HTTP routes live on the deployment's .convex.site host.
const siteUrl =
  (process.env.EXPO_PUBLIC_CONVEX_SITE_URL as string | undefined) ??
  (process.env.EXPO_PUBLIC_CONVEX_URL as string | undefined)?.replace(/\.cloud$/, ".site") ??
  "";

/**
 * Image source for photo `index` of a chat message (HUB-20). Photos are
 * served by the backend's `/chat-image` route, which only answers members
 * of the hub, so the request carries the session token.
 */
export function useChatImageSource(): (messageId: string, index: number) => ImageURISource {
  const token = useAuthToken();
  return (messageId, index) => ({
    uri: `${siteUrl}/chat-image?message=${encodeURIComponent(messageId)}&i=${index}`,
    ...(token !== null && { headers: { Authorization: `Bearer ${token}` } }),
  });
}
