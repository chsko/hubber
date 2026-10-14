import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@hubbr/backend/api";
import { useMutation, useQuery } from "convex/react";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useCallback, useEffect } from "react";
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

/** Set by "Not now" on the onboarding explainer: no system prompt until they turn push on. */
const POSTPONED_KEY = "hubber.pushPostponed";

function pushAvailable(): boolean {
  return Platform.OS !== "web" && Device.isDevice && projectId() !== undefined;
}

async function ensureChannel() {
  // Android 13+ only shows the permission prompt once a channel exists.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Hubbr",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

/**
 * Where push stands on this device: allowed, can be asked for with the system
 * prompt, only turned on from the phone's settings, or not possible here.
 */
export async function pushPermission(): Promise<"granted" | "ask" | "settings" | "unavailable"> {
  if (!pushAvailable()) return "unavailable";
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === Notifications.PermissionStatus.GRANTED) return "granted";
  return canAskAgain ? "ask" : "settings";
}

/** "Not now": keep the system prompt back until the person turns push on themselves. */
export async function postponePush(): Promise<void> {
  await AsyncStorage.setItem(POSTPONED_KEY, "1").catch(() => undefined);
}

/** Shows the system prompt; true if push is allowed afterwards. */
export async function askForPush(): Promise<boolean> {
  await AsyncStorage.removeItem(POSTPONED_KEY).catch(() => undefined);
  if (!pushAvailable()) return false;
  await ensureChannel();
  const { status } = await Notifications.requestPermissionsAsync();
  return status === Notifications.PermissionStatus.GRANTED;
}

async function getToken(): Promise<string | null> {
  const id = projectId();
  if (!pushAvailable() || id === undefined) return null;
  await ensureChannel();
  const permission = await pushPermission();
  if (permission !== "granted") {
    const postponed = await AsyncStorage.getItem(POSTPONED_KEY).catch(() => null);
    if (permission !== "ask" || postponed !== null || !(await askForPush())) return null;
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  return data;
}

/** Registers this device's token with the server; returns whether it did. */
function useRegisterDevice() {
  const register = useMutation(api.push.registerToken);
  return useCallback(async () => {
    const token = await getToken();
    if (token === null) return false;
    currentToken = token;
    await register({ token, platform: Platform.OS === "ios" ? "ios" : "android" });
    return true;
  }, [register]);
}

/** Profile's "Turn on": asks, then registers this device. */
export function useEnablePush() {
  const registerDevice = useRegisterDevice();
  return async () => (await askForPush()) && (await registerDevice());
}

/**
 * Push for a signed-in, onboarded user (HUB-22): registers this device
 * (asking for permission unless they chose "Not now" in onboarding), opens
 * the hub when a notification is tapped, and keeps the app icon badge at the
 * total unread count.
 */
export function usePush() {
  const registerDevice = useRegisterDevice();
  const hubs = useQuery(api.hubs.mine);
  const unread = hubs?.reduce((sum, h) => sum + (h.status === "active" ? h.unread : 0), 0);

  useEffect(() => {
    registerDevice().catch((error: unknown) => console.warn("Push registration failed", error));
  }, [registerDevice]);

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
