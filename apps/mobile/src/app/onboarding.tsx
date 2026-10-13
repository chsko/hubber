import { api } from "@hubber/backend/api";
import { colors } from "@hubber/shared";
import { useMutation, useQuery } from "convex/react";
import { BellRing, Compass, type LucideIcon, Plus, Ticket } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "@/components/avatar";
import { LanguagePicker } from "@/components/language-picker";
import { VerifiedBadge } from "@/components/verified-badge";
import { type FirstStop, setFirstStop } from "@/lib/first-stop";
import { useLocale } from "@/lib/i18n";
import { hasPendingInvite } from "@/lib/invite-link";
import { askForPush, postponePush, pushPermission } from "@/lib/push";
import { useProfilePhoto } from "@/lib/profile-photo";
import { useScheme } from "@/lib/use-scheme";

type Step = "profile" | "notifications" | "start";

/**
 * First run after sign-in (HUB-12): confirm the Vipps name, add a photo,
 * pick a language; then why we'd like to send notifications (before the
 * system prompt), and where to start, unless an invite already says.
 */
export default function Onboarding() {
  const { t } = useTranslation();
  const me = useQuery(api.users.me);
  const locale = useLocale();
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const photo = useProfilePhoto();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<Step>("profile");

  if (!me) return null;
  const firstName = me.name?.split(" ")[0] ?? "";

  async function pickPhoto() {
    try {
      await photo.pick();
    } catch {
      Alert.alert(t("profile.photoFailed"));
    }
  }

  async function finish(stop: FirstStop | null) {
    setSaving(true);
    try {
      setFirstStop(stop);
      await completeOnboarding({ locale });
    } finally {
      setSaving(false);
    }
  }

  /** The step after `from`, skipping the ones that don't apply. */
  async function next(from: Step) {
    setSaving(true);
    try {
      if (from === "profile" && (await pushPermission()) === "ask") {
        setStep("notifications");
      } else if (!(await hasPendingInvite())) {
        setStep("start");
      } else {
        await finish(null);
      }
    } finally {
      setSaving(false);
    }
  }

  if (step === "notifications") {
    return (
      <NotificationsStep
        busy={saving}
        onTurnOn={() => void askForPush().finally(() => void next("notifications"))}
        onLater={() => void postponePush().finally(() => void next("notifications"))}
      />
    );
  }
  if (step === "start") return <StartStep busy={saving} onPick={(stop) => void finish(stop)} />;

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
          onPress={() => void next("profile")}
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

/** Why Hubbr asks for notifications, shown before the system prompt (which is hard to undo). */
function NotificationsStep({
  busy,
  onTurnOn,
  onLater,
}: {
  busy: boolean;
  onTurnOn: () => void;
  onLater: () => void;
}) {
  const { t } = useTranslation();
  const c = colors[useScheme()];
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="flex-grow justify-between gap-8 px-5 pb-10 pt-16">
        <View className="items-center gap-4">
          <View className="h-24 w-24 items-center justify-center rounded-full bg-primarySoft">
            <BellRing color={c.primary} size={44} strokeWidth={2} />
          </View>
          <Text
            accessibilityRole="header"
            className="text-center font-sans-extrabold text-[28px] text-text"
          >
            {t("onboarding.notificationsTitle")}
          </Text>
          <Text className="max-w-[340px] text-center font-sans text-[16px] leading-6 text-textMuted">
            {t("onboarding.notificationsBody")}
          </Text>
        </View>
        <View className="gap-2">
          <Pressable
            testID="onboarding-push-on"
            accessibilityRole="button"
            disabled={busy}
            onPress={onTurnOn}
            className="items-center rounded-xl bg-primary px-4 py-4 active:opacity-80 disabled:opacity-50"
          >
            <Text className="font-sans-bold text-[17px] text-bg">
              {t("onboarding.notificationsOn")}
            </Text>
          </Pressable>
          <Pressable
            testID="onboarding-push-later"
            accessibilityRole="button"
            disabled={busy}
            onPress={onLater}
            className="items-center px-4 py-3 active:opacity-60 disabled:opacity-50"
          >
            <Text className="font-sans-semibold text-[15px] text-textMuted">
              {t("onboarding.notificationsLater")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** "What would you like to do first?" for people who didn't come from an invite. */
function StartStep({ busy, onPick }: { busy: boolean; onPick: (stop: FirstStop | null) => void }) {
  const { t } = useTranslation();
  const c = colors[useScheme()];
  const choices: { stop: FirstStop; icon: LucideIcon; key: "create" | "join" | "discover" }[] = [
    { stop: "/hub/new", icon: Plus, key: "create" },
    { stop: "/hub/join", icon: Ticket, key: "join" },
    { stop: "/discover", icon: Compass, key: "discover" },
  ];
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="gap-6 px-5 pb-10 pt-8">
        <View className="gap-1">
          <Text accessibilityRole="header" className="font-sans-extrabold text-[28px] text-text">
            {t("onboarding.startTitle")}
          </Text>
          <Text className="font-sans text-[15px] leading-6 text-textMuted">
            {t("onboarding.startSubtitle")}
          </Text>
        </View>
        <View className="gap-3">
          {choices.map(({ stop, icon: Icon, key }) => (
            <Pressable
              key={key}
              testID={`onboarding-start-${key}`}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => onPick(stop)}
              className="flex-row items-center gap-4 rounded-2xl border border-border bg-surface p-4 active:opacity-70 disabled:opacity-50"
            >
              <View className="h-12 w-12 items-center justify-center rounded-full bg-primarySoft">
                <Icon color={c.primary} size={24} strokeWidth={2.2} />
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="font-sans-bold text-[16px] text-text">
                  {t(`onboarding.start.${key}.title`)}
                </Text>
                <Text className="font-sans text-[14px] leading-5 text-textMuted">
                  {t(`onboarding.start.${key}.body`)}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
        <Pressable
          testID="onboarding-start-skip"
          accessibilityRole="button"
          disabled={busy}
          onPress={() => onPick(null)}
          className="items-center px-4 py-3 active:opacity-60 disabled:opacity-50"
        >
          <Text className="font-sans-semibold text-[15px] text-textMuted">
            {t("onboarding.startSkip")}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
