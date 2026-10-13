import { api } from "@hubber/backend/api";
import type { Id } from "@hubber/backend/dataModel";
import { useMutation } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { EventForm } from "@/components/events/event-form";

/**
 * New event (HUB-23): in a hub (for its members, or public on its behalf),
 * or without one from Discover, which is always public (HUB-29).
 */
export default function NewEvent() {
  const { t } = useTranslation();
  const { hubId } = useLocalSearchParams<{ hubId?: Id<"hubs"> }>();
  const create = useMutation(api.events.create);
  return (
    <EventForm
      title={hubId ? t("events.new") : t("discover.new")}
      submitLabel={t("events.create")}
      initial={null}
      {...(hubId === undefined && { visibility: "public" as const })}
      onSubmit={async (input, visibility) => {
        const eventId = await create({ ...(hubId && { hubId }), visibility, ...input });
        router.replace({ pathname: "/event/[eventId]", params: { eventId } });
      }}
    />
  );
}
