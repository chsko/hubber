import { api } from "@hubber/backend/api";
import type { Id } from "@hubber/backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "@/components/avatar";
import { ChatView } from "@/components/chat/chat-view";
import { HubIcon } from "@/components/hub-icon";
import { ComingSoon } from "@/components/screen";
import { NotAMember } from "@/components/not-a-member";
import { StackHeader } from "@/components/stack-header";

const segments = ["chat", "events", "members"] as const;
type Segment = (typeof segments)[number];
type Template = "class" | "kindergarten" | "family" | "friends" | "other";

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
  if (hub === null) return <NotAMember />;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StackHeader
        action={
          <Pressable
            testID="invite"
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: "/hub/[hubId]/invite", params: { hubId: hub._id } })
            }
            className="mr-2 rounded-full bg-primarySoft px-4 py-2 active:opacity-80"
          >
            <Text className="font-sans-bold text-[14px] text-primaryStrong">{t("hub.invite")}</Text>
          </Pressable>
        }
      />
      <View className="gap-3 px-5 pb-2">
        <View className="flex-row items-center gap-3">
          <HubIcon emoji={hub.emoji} iconUrl={hub.iconUrl} size={44} />
          <View className="flex-1 gap-0.5">
            <Text accessibilityRole="header" className="font-sans-extrabold text-[20px] text-text">
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
      </View>

      {segment === "chat" ? (
        <KeyboardAvoidingView behavior="padding" className="flex-1">
          <HubChat hubId={hub._id} hubName={hub.name} template={hub.template} />
        </KeyboardAvoidingView>
      ) : (
        <ScrollView contentContainerClassName="gap-5 px-5 pb-10">
          {segment === "events" ? <ComingSoon>{t("hub.eventsSoon")}</ComingSoon> : null}
          {segment === "members" ? (
            <>
              {hub.myRole !== "member" ? <PendingRequests hubId={hub._id} /> : null}
              <Members hubId={hub._id} myRole={hub.myRole} />
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

type Role = "owner" | "admin" | "member";

/**
 * Members (HUB-17): name, photo and role. Admins tap someone for actions;
 * everyone except the owner can leave.
 */
function Members({ hubId, myRole }: { hubId: Id<"hubs">; myRole: Role }) {
  const { t } = useTranslation();
  const members = useQuery(api.hubs.members, { hubId });
  const setRole = useMutation(api.hubs.setRole);
  const removeMember = useMutation(api.hubs.removeMember);
  const transferOwnership = useMutation(api.hubs.transferOwnership);
  const leave = useMutation(api.hubs.leave);
  if (members === undefined) return <ActivityIndicator />;

  type Member = (typeof members)[number];

  function actionsFor(m: Member) {
    const name = m.name ?? t("profile.noName");
    const actions: { text: string; style?: "destructive"; onPress: () => void }[] = [];
    if (m.isMe || m.role === "owner" || myRole === "member") return actions;
    if (m.role === "member") {
      actions.push({
        text: t("members.makeAdmin"),
        onPress: () => void setRole({ hubId, userId: m.userId, role: "admin" }),
      });
    } else if (myRole === "owner") {
      actions.push({
        text: t("members.removeAdmin"),
        onPress: () => void setRole({ hubId, userId: m.userId, role: "member" }),
      });
    }
    if (myRole === "owner") {
      actions.push({
        text: t("members.makeOwner"),
        onPress: () =>
          Alert.alert(t("members.makeOwnerTitle", { name }), t("members.makeOwnerBody"), [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("members.makeOwner"),
              onPress: () => void transferOwnership({ hubId, userId: m.userId }),
            },
          ]),
      });
    }
    if (m.role === "member" || myRole === "owner") {
      actions.push({
        text: t("members.remove"),
        style: "destructive",
        onPress: () =>
          Alert.alert(t("members.removeTitle", { name }), undefined, [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("members.remove"),
              style: "destructive",
              onPress: () => void removeMember({ hubId, userId: m.userId }),
            },
          ]),
      });
    }
    return actions;
  }

  function confirmLeave() {
    Alert.alert(t("members.leaveTitle"), t("members.leaveBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("members.leave"),
        style: "destructive",
        onPress: () => void leave({ hubId }).then(() => router.replace("/hubs")),
      },
    ]);
  }

  return (
    <View className="gap-4">
      <View className="overflow-hidden rounded-2xl border border-border bg-surface">
        {members.map((m, i) => {
          const actions = actionsFor(m);
          return (
            <Pressable
              key={m.userId}
              testID={`member-${m.userId}`}
              accessibilityRole={actions.length > 0 ? "button" : undefined}
              disabled={actions.length === 0}
              onPress={() =>
                Alert.alert(m.name ?? t("profile.noName"), undefined, [
                  ...actions,
                  { text: t("common.cancel"), style: "cancel" },
                ])
              }
              className={`flex-row items-center gap-3 px-4 py-3 active:opacity-70 ${i > 0 ? "border-t border-border" : ""}`}
            >
              <Avatar name={m.name} photoUrl={m.photoUrl} size={40} />
              <Text numberOfLines={1} className="flex-1 font-sans-semibold text-[15px] text-text">
                {m.name ?? t("profile.noName")}
                {m.isMe ? (
                  <Text className="font-sans text-textMuted"> ({t("members.you")})</Text>
                ) : null}
              </Text>
              {m.role !== "member" ? (
                <Text className="font-sans-semibold text-[13px] text-textMuted">
                  {t(`hub.role.${m.role}`)}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {myRole === "owner" ? (
        <Text className="text-center font-sans text-[13px] leading-5 text-textMuted">
          {t("members.ownerCantLeave")}
        </Text>
      ) : (
        <Pressable
          testID="leave-hub"
          accessibilityRole="button"
          onPress={confirmLeave}
          className="items-center rounded-2xl border border-border bg-surface px-4 py-3 active:opacity-60"
        >
          <Text className="font-sans-semibold text-[15px] text-danger">{t("members.leave")}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Admins: people who asked to join (HUB-16), with approve and decline. */
function PendingRequests({ hubId }: { hubId: Id<"hubs"> }) {
  const { t } = useTranslation();
  const pending = useQuery(api.hubs.pending, { hubId });
  const approve = useMutation(api.hubs.approve);
  const decline = useMutation(api.hubs.decline);
  if (pending === undefined || pending.length === 0) return null;
  return (
    <View className="gap-2">
      <Text className="font-sans-semibold text-xs uppercase tracking-widest text-textMuted">
        {t("hub.pendingTitle", { count: pending.length })}
      </Text>
      <View className="overflow-hidden rounded-2xl border border-accent bg-surface">
        {pending.map((p, i) => (
          <View
            key={p.userId}
            className={`flex-row items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}
          >
            <Avatar name={p.name} photoUrl={p.photoUrl} size={40} />
            <Text numberOfLines={1} className="flex-1 font-sans-semibold text-[15px] text-text">
              {p.name ?? t("profile.noName")}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("hub.declineLabel", { name: p.name ?? "" })}
              onPress={() => void decline({ hubId, userId: p.userId })}
              className="rounded-full px-3 py-2 active:opacity-60"
            >
              <Text className="font-sans-semibold text-[14px] text-textMuted">
                {t("hub.decline")}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("hub.approveLabel", { name: p.name ?? "" })}
              onPress={() => void approve({ hubId, userId: p.userId })}
              className="rounded-full bg-primarySoft px-3 py-2 active:opacity-80"
            >
              <Text className="font-sans-bold text-[14px] text-primaryStrong">
                {t("hub.approve")}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

/** The hub's chat, opening with the template's welcome text (HUB-18). */
function HubChat({
  hubId,
  hubName,
  template,
}: {
  hubId: Id<"hubs">;
  hubName: string;
  template: Template;
}) {
  const { t } = useTranslation();
  const conversationId = useQuery(api.messages.hubConversation, { hubId });
  if (!conversationId) return <ActivityIndicator className="py-6" />;
  return (
    <ChatView
      conversationId={conversationId}
      hubId={hubId}
      header={
        <View className="mb-2 gap-2 rounded-2xl border border-border bg-surface p-4">
          <Text className="font-sans-bold text-[16px] text-text">
            {t("hub.welcomeTitle", { name: hubName })}
          </Text>
          <Text className="font-sans text-[15px] leading-6 text-textMuted">
            {t(`hubTemplates.${template}.welcome`)}
          </Text>
        </View>
      }
    />
  );
}
