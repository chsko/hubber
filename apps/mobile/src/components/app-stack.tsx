import { api } from "@hubber/backend/api";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocale } from "@/lib/i18n";
import { takePendingInvite } from "@/lib/invite-link";
import { usePush } from "@/lib/push";

/**
 * The app's screens, gated on the account (HUB-12): signed out → welcome,
 * signed in but new → onboarding, otherwise the tabs.
 */
export function AppStack() {
  const { isLoading } = useConvexAuth();
  const current = useQuery(api.users.me);
  // Keep the last known answer while `me` reloads after signing in or out,
  // so the navigator isn't torn down in between.
  const [me, setMe] = useState(current);
  if (current !== undefined && current !== me) setMe(current);

  if (me === undefined || (isLoading && current === undefined)) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator />
      </View>
    );
  }

  const signedIn = me !== null;
  const onboarded = me?.onboarded === true;
  return (
    <>
      {me ? <LocaleSync stored={me.locale} /> : null}
      {onboarded ? <ResumeInvite /> : null}
      {onboarded ? <PushSetup /> : null}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn && onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="hub/new" />
          <Stack.Screen name="hub/join" />
          <Stack.Screen name="hub/[hubId]/index" />
          <Stack.Screen name="hub/[hubId]/invite" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="under-18" />
        </Stack.Protected>
        {/* Open to everyone: signed out, it saves the invite and sends you to sign in. */}
        <Stack.Screen name="i/[code]" />
      </Stack>
    </>
  );
}

/**
 * Keeps the account's language in step with the app's, so the server can
 * write notifications in it. The phone's choice wins; the account only has
 * a language once onboarding has set one.
 */
function LocaleSync({ stored }: { stored: "nb" | "en" | null }) {
  const locale = useLocale();
  const setLocale = useMutation(api.users.setLocale);
  useEffect(() => {
    if (stored !== null && stored !== locale) void setLocale({ locale });
  }, [stored, locale, setLocale]);
  return null;
}

/** After sign-in and onboarding, opens the invite that brought the person here, if any. */
function ResumeInvite() {
  useEffect(() => {
    void takePendingInvite().then((code) => {
      if (code !== null) router.push({ pathname: "/i/[code]", params: { code } });
    });
  }, []);
  return null;
}

/** Registers this device for push once the person is signed in and onboarded. */
function PushSetup() {
  usePush();
  return null;
}
