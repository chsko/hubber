import { api } from "@hubber/backend/api";
import type { Id } from "@hubber/backend/dataModel";
import { useMutation } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { EventForm } from "@/components/events/event-form";

/** New event in a hub (HUB-23). */
export default function NewEvent() {
  const { t } = useTranslation();
  const { hubId } = useLocalSearchParams<{ hubId: Id<"hubs"> }>();
  const create = useMutation(api.events.create);
  return (
    <EventForm
      title={t("events.new")}
      submitLabel={t("events.create")}
      initial={null}
      onSubmit={async (input) => {
        const eventId = await create({ hubId, ...input });
        router.replace({ pathname: "/event/[eventId]", params: { eventId } });
      }}
    />
  );
}
