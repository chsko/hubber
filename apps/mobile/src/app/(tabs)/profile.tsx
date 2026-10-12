import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@hubber/backend/api";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Avatar } from "@/components/avatar";
import { LanguagePicker } from "@/components/language-picker";
import { Screen } from "@/components/screen";
import { VerifiedBadge } from "@/components/verified-badge";
import { useProfilePhoto } from "@/lib/profile-photo";

export default function ProfileScreen() {
  const { t } = useTranslation();
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();
  const photo = useProfilePhoto();

  async function pickPhoto() {
    try {
      await photo.pick();
    } catch {
      Alert.alert(t("profile.photoFailed"));
    }
  }

  return (
    <Screen title={t("tabs.profile")}>
      <View className="flex-row items-center gap-4 rounded-2xl border border-border bg-surface p-4">
        {me ? (
          <>
            <Pressable
              testID="profile-photo"
              accessibilityRole="button"
              accessibilityLabel={me.photoUrl ? t("profile.changePhoto") : t("profile.addPhoto")}
              disabled={photo.busy}
              onPress={() => void pickPhoto()}
              className="active:opacity-80"
            >
              <Avatar name={me.name} photoUrl={me.photoUrl} size={64} />
            </Pressable>
            <View className="flex-1 gap-1.5">
              <Text testID="profile-status" className="font-sans-bold text-[17px] text-text">
                {me.name ?? t("profile.noName")}
              </Text>
              {me.verified ? <VerifiedBadge /> : null}
              <View className="flex-row gap-4">
                {photo.busy ? (
                  <ActivityIndicator />
                ) : (
                  <Pressable accessibilityRole="button" onPress={() => void pickPhoto()}>
                    <Text className="font-sans-semibold text-[14px] text-primary">
                      {me.photoUrl ? t("profile.changePhoto") : t("profile.addPhoto")}
                    </Text>
                  </Pressable>
                )}
                {me.photoUrl && !photo.busy ? (
                  <Pressable accessibilityRole="button" onPress={() => void photo.remove()}>
                    <Text className="font-sans-semibold text-[14px] text-textMuted">
                      {t("profile.removePhoto")}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </>
        ) : (
          <ActivityIndicator accessibilityLabel={t("common.loading")} />
        )}
      </View>

      <LanguagePicker />

      <Pressable
        testID="sign-out"
        accessibilityRole="button"
        onPress={() => void signOut()}
        className="items-center rounded-2xl border border-border bg-surface px-4 py-3 active:opacity-60"
      >
        <Text className="font-sans-semibold text-[15px] text-danger">{t("profile.signOut")}</Text>
      </Pressable>
    </Screen>
  );
}
