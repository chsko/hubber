import { api } from "@hubber/backend/api";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "@/components/avatar";
import { LanguagePicker } from "@/components/language-picker";
import { VerifiedBadge } from "@/components/verified-badge";
import { useLocale } from "@/lib/i18n";
import { useProfilePhoto } from "@/lib/profile-photo";

/** First run after sign-in (HUB-12): confirm the Vipps name, add a photo, pick a language. */
export default function Onboarding() {
  const { t } = useTranslation();
  const me = useQuery(api.users.me);
  const locale = useLocale();
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const photo = useProfilePhoto();
  const [saving, setSaving] = useState(false);

  if (!me) return null;
  const firstName = me.name?.split(" ")[0] ?? "";

  async function pickPhoto() {
    try {
      await photo.pick();
    } catch {
      Alert.alert(t("profile.photoFailed"));
    }
  }

  async function finish() {
    setSaving(true);
    try {
      await completeOnboarding({ locale });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="gap-6 px-5 pb-10 pt-8">
        <View className="gap-1">
          <Text accessibilityRole="header" className="font-sans-extrabold text-[28px] text-text">
            {t("onboarding.title", { name: firstName })}
          </Text>
          <Text className="font-sans text-[15px] leading-6 text-textMuted">
            {t("onboarding.subtitle")}
          </Text>
        </View>

        <View className="items-center gap-3 rounded-2xl border border-border bg-surface p-5">
          <Pressable
            testID="onboarding-photo"
            accessibilityRole="button"
            accessibilityLabel={me.photoUrl ? t("profile.changePhoto") : t("profile.addPhoto")}
            disabled={photo.busy}
            onPress={() => void pickPhoto()}
            className="active:opacity-80"
          >
            <Avatar name={me.name} photoUrl={me.photoUrl} size={96} />
          </Pressable>
          {photo.busy ? (
            <ActivityIndicator />
          ) : (
            <Pressable accessibilityRole="button" onPress={() => void pickPhoto()}>
              <Text className="font-sans-semibold text-[15px] text-primary">
                {me.photoUrl ? t("profile.changePhoto") : t("profile.addPhotoOptional")}
              </Text>
            </Pressable>
          )}
          <Text className="font-sans-bold text-[20px] text-text">{me.name}</Text>
          {me.verified ? <VerifiedBadge /> : null}
          <Text className="text-center font-sans text-[13px] leading-5 text-textMuted">
            {t("onboarding.nameFromVipps")}
          </Text>
        </View>

        <LanguagePicker />

        <Pressable
          testID="onboarding-done"
          accessibilityRole="button"
          disabled={saving || photo.busy}
          onPress={() => void finish()}
          className="items-center rounded-xl bg-primarySoft px-4 py-4 active:opacity-80 disabled:opacity-50"
        >
          <Text className="font-sans-bold text-[17px] text-primaryStrong">
            {t("onboarding.continue")}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
