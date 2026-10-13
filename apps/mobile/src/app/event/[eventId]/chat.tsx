import { api } from "@hubber/backend/api";
import type { Id } from "@hubber/backend/dataModel";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, KeyboardAvoidingView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChatView } from "@/components/chat/chat-view";
import { NotAMember } from "@/components/not-a-member";
import { StackHeader } from "@/components/stack-header";

/** The event's own chat (HUB-25): same features as the hub chat. */
export default function EventChat() {
  const { t } = useTranslation();
  const { eventId } = useLocalSearchParams<{ eventId: Id<"events"> }>();
  const event = useQuery(api.events.get, { eventId });

  if (event === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator accessibilityLabel={t("common.loading")} />
      </View>
    );
  }
  if (event === null || event.conversationId === null) {
    return <NotAMember />;
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StackHeader title={event.title} />
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <ChatView conversationId={event.conversationId} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
