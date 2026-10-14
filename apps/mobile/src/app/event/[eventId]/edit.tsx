import { api } from "@hubbr/backend/api";
import type { Id } from "@hubbr/backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import { EventForm } from "@/components/events/event-form";
import { NotAMember } from "@/components/not-a-member";

/** Edit an event (host or hub admin). */
export default function EditEvent() {
  const { t } = useTranslation();
  const { eventId } = useLocalSearchParams<{ eventId: Id<"events"> }>();
  const event = useQuery(api.events.get, { eventId });
  const update = useMutation(api.events.update);

  if (event === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator accessibilityLabel={t("common.loading")} />
      </View>
    );
  }
  if (event === null || !event.canManage) return <NotAMember />;

  return (
    <EventForm
      title={t("events.edit")}
      submitLabel={t("events.save")}
      initial={event}
      visibility={event.visibility}
      onSubmit={async (input) => {
        await update({ eventId, ...input });
        router.back();
      }}
    />
  );
}
