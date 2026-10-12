import { api } from "@hubber/backend/api";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { HubIcon } from "@/components/hub-icon";
import { StackHeader } from "@/components/stack-header";
import { savePendingInvite } from "@/lib/invite-link";

/**
 * Join screen for an invite link (HUB-16): hub name, icon and member count,
 * then join (or ask to join). Opened signed out, it saves the invite and
 * sends the person to sign in; the app comes back here afterwards.
 */
export default function JoinHub() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const me = useQuery(api.users.me);
  const { isLoading } = useConvexAuth();
  const ready = me !== undefined && !isLoading;
  const canJoin = me?.onboarded === true;

  useEffect(() => {
    if (ready && !canJoin) {
      void savePendingInvite(code).then(() => router.replace(me ? "/onboarding" : "/welcome"));
    }
  }, [ready, canJoin, code, me]);

  if (!canJoin) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }
  return <JoinPreview code={code} />;
}

function JoinPreview({ code }: { code: string }) {
  const { t } = useTranslation();
  const preview = useQuery(api.invites.preview, { code });
  const redeem = useMutation(api.invites.redeem);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setJoining(true);
    setError(null);
    try {
      const result = await redeem({ code });
      if (!result.ok) {
        setError(result.reason === "RATE_LIMITED" ? t("join.rateLimited") : t("join.invalid"));
      } else if (result.status === "active") {
        router.replace({ pathname: "/hub/[hubId]", params: { hubId: result.hubId } });
      }
      // Pending: the preview updates live to "waiting for approval".
    } finally {
      setJoining(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StackHeader />
      <ScrollView contentContainerClassName="flex-grow justify-center gap-6 px-6 pb-16">
        {preview === undefined ? (
          <ActivityIndicator />
        ) : preview === null ? (
          <View className="gap-2">
            <Text
              accessibilityRole="header"
              className="text-center font-sans-extrabold text-[24px] text-text"
            >
              {t("join.invalidTitle")}
            </Text>
            <Text className="text-center font-sans text-[15px] leading-6 text-textMuted">
              {t("join.invalid")}
            </Text>
          </View>
        ) : (
          <>
            <View className="items-center gap-3">
              <HubIcon emoji={preview.emoji} iconUrl={preview.iconUrl} size={88} />
              <Text className="font-sans text-[15px] text-textMuted">{t("join.invitedTo")}</Text>
              <Text
                accessibilityRole="header"
                className="text-center font-sans-extrabold text-[26px] text-text"
              >
                {preview.name}
              </Text>
              <Text className="font-sans text-[14px] text-textMuted">
                {t(`hubTemplates.${preview.template}.name`)} ·{" "}
                {t("hubs.memberCount", { count: preview.memberCount })}
              </Text>
            </View>

            {preview.myStatus === "active" ? (
              <PrimaryButton
                label={t("join.open")}
                onPress={() =>
                  router.replace({ pathname: "/hub/[hubId]", params: { hubId: preview.hubId } })
                }
              />
            ) : preview.myStatus === "pending" ? (
              <View className="gap-1 rounded-2xl border border-border bg-surface p-4">
                <Text className="text-center font-sans-bold text-[16px] text-text">
                  {t("join.waitingTitle")}
                </Text>
                <Text className="text-center font-sans text-[14px] leading-5 text-textMuted">
                  {t("join.waitingBody")}
                </Text>
              </View>
            ) : (
              <View className="gap-2">
                <PrimaryButton
                  testID="join-hub"
                  label={preview.joinApproval ? t("join.ask") : t("join.join")}
                  busy={joining}
                  onPress={() => void join()}
                />
                {preview.joinApproval ? (
                  <Text className="text-center font-sans text-[13px] text-textMuted">
                    {t("join.approvalNote")}
                  </Text>
                ) : null}
              </View>
            )}
            {error ? (
              <Text className="text-center font-sans-semibold text-[14px] text-danger">
                {error}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PrimaryButton(props: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      disabled={props.busy}
      onPress={props.onPress}
      className="items-center rounded-xl bg-primarySoft px-4 py-4 active:opacity-80 disabled:opacity-50"
    >
      {props.busy ? (
        <ActivityIndicator />
      ) : (
        <Text className="font-sans-bold text-[17px] text-primaryStrong">{props.label}</Text>
      )}
    </Pressable>
  );
}
