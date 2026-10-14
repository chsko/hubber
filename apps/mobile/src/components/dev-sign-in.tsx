import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@hubbr/backend/api";
import { useQuery } from "convex/react";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { convexErrorCode } from "@/lib/errors";

/**
 * Dev-only stand-in for "Logg inn med Vipps" (HUB-9). Renders nothing unless
 * the backend has dev sign-in enabled, so production builds never show it.
 */
export function DevSignIn() {
  const { t } = useTranslation();
  const personas = useQuery(api.devSignIn.personas);
  const { signIn } = useAuthActions();
  const [pending, setPending] = useState<string | null>(null);

  if (personas === undefined || personas.length === 0) return null;

  async function signInAs(persona: string) {
    setPending(persona);
    try {
      await signIn("dev", { persona });
    } catch (error) {
      if (convexErrorCode(error) !== "UNDER_18") throw error;
      router.push("/under-18");
    } finally {
      setPending(null);
    }
  }

  return (
    <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
      <Text className="font-sans-semibold text-xs uppercase tracking-widest text-textMuted">
        {t("devSignIn.title")}
      </Text>
      {personas.map((p) => (
        <Pressable
          key={p.id}
          testID={`dev-sign-in-${p.id}`}
          accessibilityRole="button"
          disabled={pending !== null}
          onPress={() => void signInAs(p.id)}
          className="rounded-xl bg-primarySoft px-4 py-3 active:opacity-80 disabled:opacity-50"
        >
          <Text className="font-sans-semibold text-[15px] text-primaryStrong">
            {p.name} ({p.birthYear})
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
