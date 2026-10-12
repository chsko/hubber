import { api } from "@hubber/backend/api";
import type { Id } from "@hubber/backend/dataModel";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "@/components/avatar";
import { HubIcon } from "@/components/hub-icon";
import { ComingSoon } from "@/components/screen";
import { StackHeader } from "@/components/stack-header";

const segments = ["chat", "events", "members"] as const;
type Segment = (typeof segments)[number];

/** Hub screen (docs/DESIGN.md §4): header plus Chat · Events · Members. */
export default function HubScreen() {
  const { t } = useTranslation();
  const { hubId } = useLocalSearchParams<{ hubId: Id<"hubs"> }>();
  const hub = useQuery(api.hubs.get, { hubId });
  const [segment, setSegment] = useState<Segment>("chat");

  if (hub === undefined) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator accessibilityLabel={t("common.loading")} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StackHeader
        action={
          <Pressable
            testID="invite"
            accessibilityRole="button"
            onPress={() => Alert.alert(t("hub.inviteSoonTitle"), t("hub.inviteSoonBody"))}
            className="mr-2 rounded-full bg-primarySoft px-4 py-2 active:opacity-80"
          >
            <Text className="font-sans-bold text-[14px] text-primaryStrong">{t("hub.invite")}</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerClassName="gap-5 px-5 pb-10">
        <View className="flex-row items-center gap-4">
          <HubIcon emoji={hub.emoji} iconUrl={hub.iconUrl} size={64} />
          <View className="flex-1 gap-0.5">
            <Text accessibilityRole="header" className="font-sans-extrabold text-[24px] text-text">
              {hub.name}
            </Text>
            <Text className="font-sans text-[14px] text-textMuted">
              {t(`hubTemplates.${hub.template}.name`)} ·{" "}
              {t("hubs.memberCount", { count: hub.memberCount })}
            </Text>
          </View>
        </View>

        <View accessibilityRole="tablist" className="flex-row rounded-full bg-surface p-1">
          {segments.map((s) => {
            const selected = s === segment;
            return (
              <Pressable
                key={s}
                testID={`segment-${s}`}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setSegment(s)}
                className={`flex-1 items-center rounded-full py-2 ${selected ? "bg-primarySoft" : ""}`}
              >
                <Text
                  className={`font-sans-semibold text-[14px] ${selected ? "text-primaryStrong" : "text-textMuted"}`}
                >
                  {t(`hub.${s}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {segment === "chat" ? (
          <>
            <View className="gap-2 rounded-2xl border border-border bg-surface p-4">
              <Text className="font-sans-bold text-[16px] text-text">
                {t("hub.welcomeTitle", { name: hub.name })}
              </Text>
              <Text className="font-sans text-[15px] leading-6 text-textMuted">
                {t(`hubTemplates.${hub.template}.welcome`)}
              </Text>
            </View>
            <ComingSoon>{t("hub.chatSoon")}</ComingSoon>
          </>
        ) : null}
        {segment === "events" ? <ComingSoon>{t("hub.eventsSoon")}</ComingSoon> : null}
        {segment === "members" ? <Members hubId={hub._id} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Members({ hubId }: { hubId: Id<"hubs"> }) {
  const { t } = useTranslation();
  const members = useQuery(api.hubs.members, { hubId });
  if (members === undefined) return <ActivityIndicator />;
  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-surface">
      {members.map((m, i) => (
        <View
          key={m.userId}
          className={`flex-row items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}
        >
          <Avatar name={m.name} photoUrl={m.photoUrl} size={40} />
          <Text numberOfLines={1} className="flex-1 font-sans-semibold text-[15px] text-text">
            {m.name ?? t("profile.noName")}
          </Text>
          {m.role !== "member" ? (
            <Text className="font-sans-semibold text-[13px] text-textMuted">
              {t(`hub.role.${m.role}`)}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
