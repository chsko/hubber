import { api } from "@hubber/backend/api";
import { useMutation, useQuery } from "convex/react";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

/** This device's Expo push token once registered, so sign-out can forget it. */
let currentToken: string | null = null;

/** Expo push tokens need the EAS project id (set by `eas init`); without it, push is off. */
function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const eas = Constants.easConfig as { projectId?: string } | null | undefined;
  return extra?.eas?.projectId ?? eas?.projectId;
}

if (Platform.OS !== "web") {
  // Shown while the app is open too; the server decides how loud (quiet hours).
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
  });
}

async function getToken(): Promise<string | null> {
  const id = projectId();
  if (Platform.OS === "web" || !Device.isDevice || id === undefined) return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Hubber",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== Notifications.PermissionStatus.GRANTED) {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== Notifications.PermissionStatus.GRANTED) return null;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  return data;
}

/**
 * Push for a signed-in, onboarded user (HUB-22): asks for permission,
 * registers this device, opens the hub when a notification is tapped, and
 * keeps the app icon badge at the total unread count.
 */
export function usePush() {
  const register = useMutation(api.push.registerToken);
  const hubs = useQuery(api.hubs.mine);
  const unread = hubs?.reduce((sum, h) => sum + (h.status === "active" ? h.unread : 0), 0);

  useEffect(() => {
    getToken()
      .then(async (token) => {
        if (token === null) return;
        currentToken = token;
        await register({ token, platform: Platform.OS === "ios" ? "ios" : "android" });
      })
      .catch((error: unknown) => console.warn("Push registration failed", error));
  }, [register]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    function open(response: Notifications.NotificationResponse | null) {
      const url = response?.notification.request.content.data?.url;
      if (typeof url !== "string") return;
      if (url.startsWith("/hub/")) {
        router.push({ pathname: "/hub/[hubId]", params: { hubId: url.slice("/hub/".length) } });
      } else if (url.startsWith("/event/")) {
        const eventId = url.slice("/event/".length);
        router.push({ pathname: "/event/[eventId]", params: { eventId } });
      }
    }
    // A tap that launched the app, then taps while it runs.
    open(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" && unread !== undefined) {
      void Notifications.setBadgeCountAsync(unread);
    }
  }, [unread]);
}

/** Stops pushes to this device; call before signing out, while still authenticated. */
export function useForgetDevice() {
  const unregister = useMutation(api.push.unregisterToken);
  return async () => {
    const token = currentToken;
    if (token === null) return;
    currentToken = null;
    try {
      await unregister({ token });
      await Notifications.setBadgeCountAsync(0);
    } catch {
      // Signing out matters more than tidying up.
    }
  };
}
