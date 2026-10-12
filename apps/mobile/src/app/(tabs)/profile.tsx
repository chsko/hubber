import { useAuthActions } from "@convex-dev/auth/react";
import { colors } from "@hubber/shared";
import { api } from "@hubber/backend/api";
import { useQuery } from "convex/react";
import { Check } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { DevSignIn } from "@/components/dev-sign-in";
import { ComingSoon, Screen } from "@/components/screen";
import { type LanguagePreference, setLanguagePreference, useLanguagePreference } from "@/lib/i18n";
import { useScheme } from "@/lib/use-scheme";

const languageOptions = [
  { value: "system", label: "profile.languageSystem" },
  { value: "nb", label: "profile.languageNb" },
  { value: "en", label: "profile.languageEn" },
] as const satisfies readonly { value: LanguagePreference; label: string }[];

export default function ProfileScreen() {
  const { t } = useTranslation();
  // Live query against Convex: proves the client is wired up.
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();
  const language = useLanguagePreference();
  const c = colors[useScheme()];

  return (
    <Screen title={t("tabs.profile")}>
      <View className="gap-1 rounded-2xl border border-border bg-surface p-4">
        <Text className="font-sans-semibold text-xs uppercase tracking-widest text-textMuted">
          {t("profile.account")}
        </Text>
        {me === undefined ? (
          <ActivityIndicator accessibilityLabel={t("common.loading")} />
        ) : (
          <Text testID="profile-status" className="font-sans-bold text-[17px] text-text">
            {me === null ? t("profile.signedOut") : (me.name ?? t("profile.noName"))}
          </Text>
        )}
        {me ? (
          <Pressable
            testID="sign-out"
            accessibilityRole="button"
            onPress={() => void signOut()}
            className="mt-2 self-start active:opacity-60"
          >
            <Text className="font-sans-semibold text-[15px] text-primary">
              {t("profile.signOut")}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {me === null ? <DevSignIn /> : null}

      <View accessibilityRole="radiogroup" className="rounded-2xl border border-border bg-surface">
        <Text className="px-4 pt-4 font-sans-semibold text-xs uppercase tracking-widest text-textMuted">
          {t("profile.language")}
        </Text>
        {languageOptions.map(({ value, label }) => {
          const selected = language === value;
          return (
            <Pressable
              key={value}
              testID={`language-${value}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setLanguagePreference(value)}
              className="flex-row items-center justify-between px-4 py-3 active:opacity-60"
            >
              <Text className="font-sans-medium text-[15px] text-text">{t(label)}</Text>
              {selected ? <Check color={c.primary} size={20} strokeWidth={2.4} /> : null}
            </Pressable>
          );
        })}
      </View>

      {me === null ? <ComingSoon>{t("profile.comingSoon")}</ComingSoon> : null}
    </Screen>
  );
}
