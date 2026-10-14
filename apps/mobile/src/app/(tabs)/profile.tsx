import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@hubbr/backend/api";
import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Pressable,
  Switch,
  Text,
  View,
} from "react-native";
import { Avatar } from "@/components/avatar";
import { LanguagePicker } from "@/components/language-picker";
import { Screen } from "@/components/screen";
import { VerifiedBadge } from "@/components/verified-badge";
import { useProfilePhoto } from "@/lib/profile-photo";
import { pushPermission, useEnablePush, useForgetDevice } from "@/lib/push";

export default function ProfileScreen() {
  const { t } = useTranslation();
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();
  const photo = useProfilePhoto();
  const forgetDevice = useForgetDevice();
  const setQuietHours = useMutation(api.push.setQuietHours);

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

      <BlockedPeople />

      <View className="gap-1 rounded-2xl border border-border bg-surface p-4">
        <Text className="font-sans-semibold text-xs uppercase tracking-widest text-textMuted">
          {t("profile.notifications")}
        </Text>
        <PushOff />
        <View className="flex-row items-center gap-3 pt-2">
          <View className="flex-1 gap-0.5">
            <Text className="font-sans-medium text-[15px] text-text">
              {t("profile.quietHours")}
            </Text>
            <Text className="font-sans text-[13px] text-textMuted">
              {t("profile.quietHoursBody")}
            </Text>
          </View>
          <Switch
            testID="quiet-hours"
            accessibilityLabel={t("profile.quietHours")}
            value={me?.quietHours ?? true}
            disabled={!me}
            onValueChange={(enabled) => void setQuietHours({ enabled })}
          />
        </View>
      </View>

      <Pressable
        testID="sign-out"
        accessibilityRole="button"
        onPress={() => void forgetDevice().then(() => signOut())}
        className="items-center rounded-2xl border border-border bg-surface px-4 py-3 active:opacity-60"
      >
        <Text className="font-sans-semibold text-[15px] text-danger">{t("profile.signOut")}</Text>
      </Pressable>

      <DeleteAccount onDeleted={() => void signOut()} />
    </Screen>
  );
}

/** People you've blocked (HUB-33), with unblock. Hidden when there are none. */
function BlockedPeople() {
  const { t } = useTranslation();
  const blocked = useQuery(api.moderation.blocked);
  const unblock = useMutation(api.moderation.unblock);
  if (!blocked || blocked.length === 0) return null;
  return (
    <View className="rounded-2xl border border-border bg-surface">
      <Text className="px-4 pt-4 font-sans-semibold text-xs uppercase tracking-widest text-textMuted">
        {t("block.listTitle")}
      </Text>
      {blocked.map((b) => (
        <View key={b.userId} className="flex-row items-center justify-between px-4 py-3">
          <Text numberOfLines={1} className="flex-1 font-sans-medium text-[15px] text-text">
            {b.name ?? t("chat.deletedUser")}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void unblock({ userId: b.userId })}
            className="active:opacity-60"
          >
            <Text className="font-sans-semibold text-[14px] text-primary">
              {t("block.unblock")}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/**
 * Delete account (HUB-13). Hubs with other members need a new owner first;
 * hubs with only you are closed. Asks once more before deleting.
 */
function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const { t } = useTranslation();
  const check = useQuery(api.account.deletionCheck);
  const deleteAccount = useMutation(api.account.deleteAccount);
  const forgetDevice = useForgetDevice();

  function start() {
    if (!check) return;
    const first = check.needOwner[0];
    if (first) {
      Alert.alert(
        t("deleteAccount.needOwnerTitle"),
        t("deleteAccount.needOwnerBody", {
          hubs: check.needOwner.map((h) => h.name).join(", "),
        }),
        [
          { text: t("common.close"), style: "cancel" },
          {
            text: t("deleteAccount.openHub", { name: first.name }),
            onPress: () => router.push({ pathname: "/hub/[hubId]", params: { hubId: first._id } }),
          },
        ],
      );
      return;
    }
    const closing =
      check.willClose.length > 0
        ? `\n\n${t("deleteAccount.willClose", { hubs: check.willClose.map((h) => h.name).join(", ") })}`
        : "";
    Alert.alert(t("deleteAccount.confirmTitle"), `${t("deleteAccount.confirmBody")}${closing}`, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("deleteAccount.confirm"),
        style: "destructive",
        onPress: () =>
          void forgetDevice()
            .then(() => deleteAccount({}))
            .then(onDeleted)
            .catch(() => Alert.alert(t("deleteAccount.failed"))),
      },
    ]);
  }

  return (
    <Pressable
      testID="delete-account"
      accessibilityRole="button"
      disabled={!check}
      onPress={start}
      className="items-center py-2 active:opacity-60"
    >
      <Text className="font-sans-semibold text-[14px] text-textMuted">
        {t("deleteAccount.button")}
      </Text>
    </Pressable>
  );
}

/** Shown while this phone won't get notifications, with a way to turn them on. */
function PushOff() {
  const { t } = useTranslation();
  const enablePush = useEnablePush();
  const [permission, setPermission] = useState<Awaited<ReturnType<typeof pushPermission>>>();
  const refresh = useCallback(() => void pushPermission().then(setPermission), []);

  // Coming back from the phone's settings may have changed it.
  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  if (permission !== "ask" && permission !== "settings") return null;

  function turnOn() {
    if (permission === "settings") void Linking.openSettings();
    else void enablePush().finally(refresh);
  }

  return (
    <View className="flex-row items-center gap-3 border-b border-border pb-3 pt-2">
      <Text className="flex-1 font-sans text-[14px] leading-5 text-textMuted">
        {t("profile.pushOff")}
      </Text>
      <Pressable
        testID="push-turn-on"
        accessibilityRole="button"
        onPress={turnOn}
        className="rounded-full bg-primarySoft px-4 py-2 active:opacity-80"
      >
        <Text className="font-sans-bold text-[14px] text-primaryStrong">
          {t("profile.pushTurnOn")}
        </Text>
      </Pressable>
    </View>
  );
}
